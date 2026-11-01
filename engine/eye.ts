import { EyeIndices } from './landmarks';
import { OneEuroFilter } from './filters';
import { Point, getDistance } from './geometry';

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
  /** The visible eye opening. The eyelids always cover part of the iris, so the lens is clipped to this. */
  outline: Point[];
}

/**
 * Lid gap divided by eye width. Scale-invariant, so it works at any distance
 * from the camera.
 */
export const eyeOpenness = (lidTop: Point, lidBottom: Point, cornerInner: Point, cornerOuter: Point) => {
  const width = getDistance(cornerInner, cornerOuter);
  return width > 0 ? getDistance(lidTop, lidBottom) / width : 0;
};

/** Measures an eye from MediaPipe FaceMesh landmarks (needs refineLandmarks for the iris). */
export const measureMediaPipeEye = (
  landmarks: Point[],
  indices: EyeIndices,
  project: (lm: Point) => Point
): EyeMeasurement | null => {
  const { iris, lids, corners, outline } = indices;
  const ids = [iris.center, iris.top, iris.bottom, iris.left, iris.right, lids.top, lids.bottom, corners.inner, corners.outer, ...outline];
  if (ids.some(i => !landmarks[i])) return null;

  const p = (i: number) => project(landmarks[i]);
  const ring = [p(iris.top), p(iris.right), p(iris.bottom), p(iris.left)];
  const center = p(iris.center);
  return {
    // The four iris-edge points jitter less than the single center point, so average all five
    center: {
      x: (center.x + ring.reduce((s, q) => s + q.x, 0)) / 5,
      y: (center.y + ring.reduce((s, q) => s + q.y, 0)) / 5,
    },
    irisDiameter: (getDistance(ring[3], ring[1]) + getDistance(ring[0], ring[2])) / 2,
    openness: eyeOpenness(p(lids.top), p(lids.bottom), p(corners.inner), p(corners.outer)),
    outline: outline.map(p),
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

/** Blink detector with hysteresis so the lens does not flicker around the threshold. */
export class BlinkDetector {
  private closed = false;

  constructor(
    private readonly closeBelow = 0.16,
    private readonly openAbove = 0.2
  ) {}

  update(openness: number): boolean {
    if (this.closed && openness > this.openAbove) this.closed = false;
    else if (!this.closed && openness < this.closeBelow) this.closed = true;
    return this.closed;
  }

  reset() {
    this.closed = false;
  }
}

export interface EyeTrackerOptions {
  /** Lens diameter relative to the measured iris diameter. */
  irisScale?: number;
  positionMinCutoff?: number;
  positionBeta?: number;
  radiusMinCutoff?: number;
  radiusBeta?: number;
}

export interface EyeState {
  x: number;
  y: number;
  /** Lens radius in canvas pixels. */
  radius: number;
  /** Eye opening to clip the lens to (unsmoothed, so it always matches the eyelids in the frame). */
  outline: Point[];
}

/**
 * Turns per-frame eye measurements into a stable lens position and radius.
 * Returns null while the eye is closed or was not measured.
 */
export class EyeTracker {
  private readonly fx: OneEuroFilter;
  private readonly fy: OneEuroFilter;
  private readonly fr: OneEuroFilter;
  private readonly blink = new BlinkDetector();
  private readonly irisScale: number;

  constructor(options: EyeTrackerOptions = {}) {
    // 1.0 = exactly the measured iris; anything bigger spills onto the white of the eye
    this.irisScale = options.irisScale ?? 1.0;
    this.fx = new OneEuroFilter(options.positionMinCutoff ?? 1.5, options.positionBeta ?? 0.01);
    this.fy = new OneEuroFilter(options.positionMinCutoff ?? 1.5, options.positionBeta ?? 0.01);
    // Iris size barely changes, so smooth it much harder than position.
    this.fr = new OneEuroFilter(options.radiusMinCutoff ?? 0.5, options.radiusBeta ?? 0.001);
  }

  /**
   * @param measurement this frame's reading, or null if the eye was not found
   * @param sizeAdjustment user multiplier on the lens size
   */
  update(measurement: EyeMeasurement | null, sizeAdjustment: number, timeMs: number): EyeState | null {
    if (!measurement) {
      this.reset();
      return null;
    }
    if (this.blink.update(measurement.openness)) return null;

    return {
      x: this.fx.filter(measurement.center.x, timeMs),
      y: this.fy.filter(measurement.center.y, timeMs),
      radius: (this.fr.filter(measurement.irisDiameter * this.irisScale, timeMs) * sizeAdjustment) / 2,
      outline: measurement.outline,
    };
  }

  /** Call when the face is lost so the next lock snaps into place instead of gliding in. */
  reset() {
    this.fx.reset();
    this.fy.reset();
    this.fr.reset();
    this.blink.reset();
  }
}
