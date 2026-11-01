import { EyeIndices } from './landmarks';
import { OneEuroFilter } from './filters';
import { Point, getDistance } from './geometry';

/**
 * Lid gap divided by eye width. Scale-invariant, so it works at any distance
 * from the camera. Roughly 0.25-0.35 when open, under 0.15 when closed.
 */
export const eyeOpenness = (lidTop: Point, lidBottom: Point, cornerInner: Point, cornerOuter: Point) => {
  const width = getDistance(cornerInner, cornerOuter);
  return width > 0 ? getDistance(lidTop, lidBottom) / width : 0;
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
}

/**
 * Turns raw landmarks for one eye into a stable lens position and radius.
 * Returns null while the eye is closed or its landmarks are missing.
 */
export class EyeTracker {
  private readonly fx: OneEuroFilter;
  private readonly fy: OneEuroFilter;
  private readonly fr: OneEuroFilter;
  private readonly blink = new BlinkDetector();
  private readonly irisScale: number;

  constructor(private readonly indices: EyeIndices, options: EyeTrackerOptions = {}) {
    this.irisScale = options.irisScale ?? 1.15;
    this.fx = new OneEuroFilter(options.positionMinCutoff ?? 1.5, options.positionBeta ?? 0.01);
    this.fy = new OneEuroFilter(options.positionMinCutoff ?? 1.5, options.positionBeta ?? 0.01);
    // Iris size barely changes, so smooth it much harder than position.
    this.fr = new OneEuroFilter(options.radiusMinCutoff ?? 0.5, options.radiusBeta ?? 0.001);
  }

  /**
   * @param landmarks normalized FaceMesh landmarks
   * @param project maps a normalized landmark to canvas pixels
   * @param sizeAdjustment user multiplier on the lens size
   */
  update(
    landmarks: Point[],
    project: (lm: Point) => Point,
    sizeAdjustment: number,
    timeMs: number
  ): EyeState | null {
    const { iris, lids, corners } = this.indices;
    const ids = [iris.center, iris.top, iris.bottom, iris.left, iris.right, lids.top, lids.bottom, corners.inner, corners.outer];
    if (ids.some(i => !landmarks[i])) {
      this.reset();
      return null;
    }

    const p = (i: number) => project(landmarks[i]);
    const openness = eyeOpenness(p(lids.top), p(lids.bottom), p(corners.inner), p(corners.outer));
    if (this.blink.update(openness)) return null;

    const center = p(iris.center);
    const diameter = (getDistance(p(iris.left), p(iris.right)) + getDistance(p(iris.top), p(iris.bottom))) / 2;

    return {
      x: this.fx.filter(center.x, timeMs),
      y: this.fy.filter(center.y, timeMs),
      radius: (this.fr.filter(diameter * this.irisScale, timeMs) * sizeAdjustment) / 2,
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
