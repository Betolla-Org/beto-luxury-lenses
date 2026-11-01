import { EyeIndices } from './landmarks';
import { OneEuroFilter } from './filters';
import { Point, clamp, getDistance, smoothClosedCurve } from './geometry';

/**
 * Average human iris width relative to the eye opening (corner to corner),
 * used when a tracker gives eye outlines but no iris points (ML Kit).
 */
export const IRIS_TO_EYE_WIDTH = 0.42;

/** One frame's raw reading of an eye, in canvas/view pixels. */
export interface EyeMeasurement {
  center: Point;
  irisDiameter: number;
  /** Lid gap / eye width: roughly 0.25-0.35 open, under 0.15 closed. */
  openness: number;
  /**
   * Blink score from FaceLandmarker's eyeBlink blendshape (0 open, 1 closed), when available.
   * More reliable than `openness`: it is not fooled by squinting or by looking down.
   */
  blink?: number;
  /** The visible eye opening. The eyelids always cover part of the iris, so the lens is clipped to this. */
  outline: Point[];
  /**
   * The iris as an ellipse, when the tracker gives iris edge points (MediaPipe): `width` between the
   * left and right iris points, `height` between the top and bottom ones, `angle` of the left-right
   * axis in radians. Turning the head shrinks one of them, which is what makes the lens an ellipse.
   */
  irisShape?: { width: number; height: number; angle: number };
}

/** Folds an axis angle into (-pi/2, pi/2]: an axis has no direction, so a and a + pi are the same. */
export const axisAngle = (a: number) => {
  let r = a % Math.PI;
  if (r <= -Math.PI / 2) r += Math.PI;
  else if (r > Math.PI / 2) r -= Math.PI;
  return r;
};

/**
 * Lid gap divided by eye width. Scale-invariant, so it works at any distance
 * from the camera.
 */
export const eyeOpenness = (lidTop: Point, lidBottom: Point, cornerInner: Point, cornerOuter: Point) => {
  const width = getDistance(cornerInner, cornerOuter);
  return width > 0 ? getDistance(lidTop, lidBottom) / width : 0;
};

/**
 * Measures an eye from MediaPipe's 478 face landmarks (FaceLandmarker, or FaceMesh with refineLandmarks).
 * Pass FaceLandmarker's blendshape scores (see `blendshapeScores`) to drive blink detection with them.
 */
export const measureMediaPipeEye = (
  landmarks: Point[],
  indices: EyeIndices,
  project: (lm: Point) => Point,
  blendshapes?: Record<string, number>
): EyeMeasurement | null => {
  const { iris, lids, corners, outline } = indices;
  const ids = [iris.center, iris.top, iris.bottom, iris.left, iris.right, lids.top, lids.bottom, corners.inner, corners.outer, ...outline];
  if (ids.some(i => !landmarks[i])) return null;

  const p = (i: number) => project(landmarks[i]);
  const [top, right, bottom, left] = [p(iris.top), p(iris.right), p(iris.bottom), p(iris.left)];
  const ring = [top, right, bottom, left];
  const center = p(iris.center);
  const width = getDistance(left, right);
  const height = getDistance(top, bottom);
  return {
    // The four iris-edge points jitter less than the single center point, so average all five
    center: {
      x: (center.x + ring.reduce((s, q) => s + q.x, 0)) / 5,
      y: (center.y + ring.reduce((s, q) => s + q.y, 0)) / 5,
    },
    irisDiameter: (width + height) / 2,
    openness: eyeOpenness(p(lids.top), p(lids.bottom), p(corners.inner), p(corners.outer)),
    outline: outline.map(p),
    blink: blendshapes?.[indices.blinkBlendshape],
    irisShape: { width, height, angle: axisAngle(Math.atan2(right.y - left.y, right.x - left.x)) },
  };
};

/**
 * Measures an eye from a closed outline polygon (e.g. ML Kit's LEFT_EYE / RIGHT_EYE contour).
 * The iris is assumed centered in the opening, which holds while the user looks at the screen.
 */
export const measureContourEye = (contour: Point[]): EyeMeasurement | null => {
  if (contour.length < 3) return null;

  // Eye width = the two outline points farthest apart (the corners), so head tilt does not matter
  let width = 0;
  for (let i = 0; i < contour.length; i++) {
    for (let j = i + 1; j < contour.length; j++) {
      width = Math.max(width, getDistance(contour[i], contour[j]));
    }
  }
  if (width === 0) return null;

  // Shoelace area and centroid
  let area2 = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < contour.length; i++) {
    const a = contour[i];
    const b = contour[(i + 1) % contour.length];
    const cross = a.x * b.y - b.x * a.y;
    area2 += cross;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
  }
  const area = Math.abs(area2) / 2;
  const center = area2 !== 0
    ? { x: cx / (3 * area2), y: cy / (3 * area2) }
    : { x: contour.reduce((s, p) => s + p.x, 0) / contour.length, y: contour.reduce((s, p) => s + p.y, 0) / contour.length };

  // For an ellipse, area = (pi / 4) * width * height, so height / width = 4 * area / (pi * width^2)
  return {
    center,
    irisDiameter: width * IRIS_TO_EYE_WIDTH,
    openness: (4 * area) / (Math.PI * width * width),
    outline: contour,
  };
};

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

/**
 * How visible the lens should be (0-1) for how open the eye is, so it fades out and back in
 * through a blink like a real lens disappearing under the lid, instead of switching off.
 * Uses the blendshape blink score when the tracker gives one, otherwise the lid-gap openness.
 */
export const eyeVisibility = (m: Pick<EyeMeasurement, 'openness' | 'blink'>) =>
  m.blink !== undefined
    ? // Blendshape: about 0-0.3 open, up to ~0.5 looking down (barely dims), 0.75+ closed
      1 - smoothstep(0.45, 0.75, m.blink)
    : // Lid gap / eye width: roughly 0.25-0.35 open, under 0.14 closed
      smoothstep(0.14, 0.22, m.openness);

/** Below this visibility the eye counts as closed and no lens is drawn. */
const MIN_VISIBILITY = 0.04;

export interface EyeTrackerOptions {
  /** Lens diameter relative to the measured iris diameter. */
  irisScale?: number;
  positionMinCutoff?: number;
  positionBeta?: number;
  radiusMinCutoff?: number;
  radiusBeta?: number;
  /**
   * Note: position is filtered in units of the iris radius, so `positionBeta` means the same at any
   * face distance or screen density (speed is measured in iris radii per second).
   */
  /** Points per outline segment when smoothing the eye opening into a curve (1 = keep the polygon). */
  outlineSubdivisions?: number;
}

export interface EyeState {
  x: number;
  y: number;
  /** Lens radius in canvas pixels: the larger semi-axis, i.e. the iris's true size. */
  radius: number;
  /** Semi-axis along the eye's left-right iris axis (the direction given by `rotation`). */
  radiusX: number;
  /** Semi-axis across it. */
  radiusY: number;
  /** Angle of the left-right iris axis in radians (follows head roll). */
  rotation: number;
  /** Eye opening to clip the lens to, lightly smoothed in time and rounded into a curve. */
  outline: Point[];
  /** 0-1 multiplier on the lens opacity: fades during blinks and right after the face is lost. */
  opacity: number;
}

// The iris ellipse: treat near-round as round (landmark jitter), and never squash past this
const ROUND_DEAD_ZONE = 0.06;
const MIN_ASPECT = 0.6;

/** Per-vertex One Euro filters for the eye outline: just enough to stop the lid edge shimmering. */
class OutlineFilter {
  private filters: { x: OneEuroFilter; y: OneEuroFilter }[] = [];

  filter(points: Point[], timeMs: number): Point[] {
    // A tracker that changes its point count (ML Kit can) starts fresh
    if (this.filters.length !== points.length) {
      this.filters = points.map(() => ({ x: new OneEuroFilter(4, 0.05), y: new OneEuroFilter(4, 0.05) }));
    }
    return points.map((p, i) => ({ x: this.filters[i].x.filter(p.x, timeMs), y: this.filters[i].y.filter(p.y, timeMs) }));
  }

  reset() {
    this.filters = [];
  }
}

/**
 * The iris's real diameter in this frame. Turning the head foreshortens one axis of the iris
 * but not the other, so the larger axis is the true size.
 */
export const trueIrisDiameter = (m: EyeMeasurement) =>
  m.irisShape ? Math.max(m.irisShape.width, m.irisShape.height) : m.irisDiameter;

// Position smoothing, in iris radii (see EyeTrackerOptions). Tuned with `npm run eval`: against the
// old pixel-unit filter (beta 0.01) this cut the lag while moving from 15% to 4% of the iris radius
// with the same smoothing at rest.
const POSITION_MIN_CUTOFF = 1.5;
const POSITION_BETA = 6;

/**
 * Turns per-frame eye measurements into a stable lens position, size and shape.
 * Returns null while the eye is closed or was not measured.
 */
export class EyeTracker {
  private readonly fx: OneEuroFilter;
  private readonly fy: OneEuroFilter;
  private readonly fr: OneEuroFilter;
  private readonly fAspect = new OneEuroFilter(1, 0.01);
  private readonly fAngle = new OneEuroFilter(1, 0.05);
  private readonly outlineFilter = new OutlineFilter();
  private readonly irisScale: number;
  private readonly outlineSubdivisions: number;

  constructor(options: EyeTrackerOptions = {}) {
    // 1.0 = exactly the measured iris; anything bigger spills onto the white of the eye
    this.irisScale = options.irisScale ?? 1.0;
    this.outlineSubdivisions = options.outlineSubdivisions ?? 4;
    this.fx = new OneEuroFilter(options.positionMinCutoff ?? POSITION_MIN_CUTOFF, options.positionBeta ?? POSITION_BETA);
    this.fy = new OneEuroFilter(options.positionMinCutoff ?? POSITION_MIN_CUTOFF, options.positionBeta ?? POSITION_BETA);
    // Iris size barely changes, so smooth it much harder than position.
    this.fr = new OneEuroFilter(options.radiusMinCutoff ?? 0.5, options.radiusBeta ?? 0.001);
  }

  /**
   * @param measurement this frame's reading, or null if the eye was not found
   * @param sizeAdjustment user multiplier on the lens size
   * @param sharedDiameter an already smoothed iris diameter to use instead of this eye's own (see FaceTracker)
   */
  update(measurement: EyeMeasurement | null, sizeAdjustment: number, timeMs: number, sharedDiameter?: number): EyeState | null {
    if (!measurement) {
      this.reset();
      return null;
    }
    const opacity = eyeVisibility(measurement);
    if (opacity < MIN_VISIBILITY) return null;

    const diameter = sharedDiameter ?? this.fr.filter(trueIrisDiameter(measurement), timeMs);
    const radius = (diameter * this.irisScale * sizeAdjustment) / 2;
    // Filter position in iris radii, so the filter behaves the same near or far and on any screen
    const unit = Math.max(diameter / 2, 1);

    // aspect = width / height: under 1 the iris looks narrow (head turned), over 1 short (head tilted up/down)
    let aspect = 1;
    let rotation = 0;
    const shape = measurement.irisShape;
    if (shape && shape.width > 0 && shape.height > 0) {
      const smoothed = this.fAspect.filter(shape.width / shape.height, timeMs);
      aspect = Math.abs(smoothed - 1) < ROUND_DEAD_ZONE ? 1 : Math.min(1 / MIN_ASPECT, Math.max(MIN_ASPECT, smoothed));
      rotation = this.fAngle.filter(shape.angle, timeMs);
    }

    return {
      x: this.fx.filter(measurement.center.x / unit, timeMs) * unit,
      y: this.fy.filter(measurement.center.y / unit, timeMs) * unit,
      radius,
      radiusX: aspect < 1 ? radius * aspect : radius,
      radiusY: aspect > 1 ? radius / aspect : radius,
      rotation,
      outline: smoothClosedCurve(this.outlineFilter.filter(measurement.outline, timeMs), this.outlineSubdivisions),
      opacity,
    };
  }

  /** Call when the face is lost so the next lock snaps into place instead of gliding in. */
  reset() {
    this.fx.reset();
    this.fy.reset();
    this.fr.reset();
    this.fAspect.reset();
    this.fAngle.reset();
    this.outlineFilter.reset();
  }
}

/** Frames in a row a size reading may disagree with the smoothed size before it is believed. */
const OUTLIER_FRAMES = 5;
/** A size reading this far (relative) from the smoothed size counts as a glitch. */
const OUTLIER_RATIO = 0.25;
/** How long the last lenses stay (fading out) after the face is lost: one dropped frame should not flash. */
export const LOST_FACE_HOLD_MS = 150;

type FaceState = { right: EyeState | null; left: EyeState | null };

/**
 * Tracks both eyes of one face with a single shared iris size.
 *
 * Someone's two irises are the same size (about 11.7 mm), so averaging both readings halves the
 * noise, keeps the two lenses matched, and lets one eye carry the size while the other blinks.
 * One-off glitches (a bad landmark, a hand passing) are ignored; a reading that stays different
 * for 5 frames is a real change of distance and is snapped to.
 */
export class FaceTracker {
  readonly right: EyeTracker;
  readonly left: EyeTracker;
  private readonly size: OneEuroFilter;
  private smoothed: number | null = null;
  private outliers = 0;
  private last: FaceState | null = null;
  private lastSeenMs = 0;

  constructor(options: EyeTrackerOptions = {}) {
    this.right = new EyeTracker(options);
    this.left = new EyeTracker(options);
    this.size = new OneEuroFilter(options.radiusMinCutoff ?? 0.5, options.radiusBeta ?? 0.001);
  }

  update(
    right: EyeMeasurement | null,
    left: EyeMeasurement | null,
    sizeAdjustment: number,
    timeMs: number
  ): FaceState {
    const readings = [right, left]
      .filter((m): m is EyeMeasurement => !!m)
      .map(trueIrisDiameter)
      .filter(d => d > 0);
    if (readings.length) {
      const reading = readings.reduce((s, d) => s + d, 0) / readings.length;
      const isOutlier = this.smoothed !== null && Math.abs(reading - this.smoothed) > this.smoothed * OUTLIER_RATIO;
      this.outliers = isOutlier ? this.outliers + 1 : 0;
      if (!isOutlier || this.outliers >= OUTLIER_FRAMES) {
        if (isOutlier) this.size.reset(); // a real jump: snap to it instead of gliding
        this.smoothed = this.size.filter(reading, timeMs);
        this.outliers = 0;
      }
    }
    const shared = this.smoothed ?? undefined;
    this.last = {
      right: this.right.update(right, sizeAdjustment, timeMs, shared),
      left: this.left.update(left, sizeAdjustment, timeMs, shared),
    };
    this.lastSeenMs = timeMs;
    return this.last;
  }

  /**
   * Call on frames where no face was found. For `holdMs` the last lenses stay where they were,
   * fading out, so a single missed detection does not flash them off; after that everything resets
   * and the next lock snaps into place instead of gliding in.
   */
  lose(timeMs: number, holdMs = LOST_FACE_HOLD_MS): FaceState {
    const elapsed = timeMs - this.lastSeenMs;
    if (!this.last || elapsed > holdMs) {
      this.reset();
      return { right: null, left: null };
    }
    const fade = 1 - elapsed / holdMs;
    const dim = (eye: EyeState | null) => eye && { ...eye, opacity: eye.opacity * fade };
    return { right: dim(this.last.right), left: dim(this.last.left) };
  }

  /** Forget everything, e.g. when the camera restarts. */
  reset() {
    this.last = null;
    this.right.reset();
    this.left.reset();
    this.size.reset();
    this.smoothed = null;
    this.outliers = 0;
  }
}
