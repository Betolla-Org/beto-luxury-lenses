import { Point, getDistance } from './geometry';

/** Something about the shot that hurts tracking, most important first. */
export type QualityIssue = 'MORE_LIGHT' | 'MOVE_CLOSER' | 'MOVE_BACK' | 'FACE_CAMERA';

export interface QualityReading {
  /** Mean luminance around the eyes (0-255). */
  luminance?: number;
  /** Iris diameter in camera (video) pixels: how much real detail the tracker has to work with. */
  irisPixels?: number;
  /** True when part of the face lies outside the camera frame. */
  faceCropped?: boolean;
  /** Head yaw, -1 (fully turned one way) to 1 (the other); 0 is facing the camera. */
  yaw?: number;
}

// Thresholds
const MIN_LUMINANCE = 45;
const MIN_IRIS_PIXELS = 14;
const MAX_IRIS_PIXELS = 70;
const MAX_YAW = 0.35;

/** All issues present in one reading, most important first. */
export const qualityIssues = (r: QualityReading): QualityIssue[] => {
  const issues: QualityIssue[] = [];
  if (r.luminance !== undefined && r.luminance < MIN_LUMINANCE) issues.push('MORE_LIGHT');
  if (r.irisPixels !== undefined && r.irisPixels < MIN_IRIS_PIXELS) issues.push('MOVE_CLOSER');
  if (r.faceCropped || (r.irisPixels !== undefined && r.irisPixels > MAX_IRIS_PIXELS)) issues.push('MOVE_BACK');
  if (r.yaw !== undefined && Math.abs(r.yaw) > MAX_YAW) issues.push('FACE_CAMERA');
  return issues;
};

/**
 * Head yaw from three face landmarks: how far the nose tip sits from the middle of the two
 * cheek edges. Works on normalized or pixel coordinates.
 */
export const headYaw = (noseTip: Point, cheekA: Point, cheekB: Point) => {
  const a = getDistance(noseTip, cheekA);
  const b = getDistance(noseTip, cheekB);
  return a + b > 0 ? (a - b) / (a + b) : 0;
};

/** MediaPipe face landmark indices used for the quality checks. */
export const QUALITY_LANDMARKS = { noseTip: 1, cheekRight: 234, cheekLeft: 454, forehead: 10, chin: 152 };

/**
 * Turns per-frame quality readings into a steady hint for the user: an issue must last
 * `showAfterMs` before it is shown and be gone for `hideAfterMs` before it is cleared,
 * so hints never flicker.
 */
export class QualityMonitor {
  private shown: QualityIssue | null = null;
  private candidate: QualityIssue | null = null;
  private candidateSince = 0;

  constructor(
    private readonly showAfterMs = 800,
    private readonly hideAfterMs = 500
  ) {}

  update(reading: QualityReading, timeMs: number): QualityIssue | null {
    const top = qualityIssues(reading)[0] ?? null;
    if (top !== this.candidate) {
      this.candidate = top;
      this.candidateSince = timeMs;
    }
    const wait = top === null ? this.hideAfterMs : this.showAfterMs;
    if (top !== this.shown && timeMs - this.candidateSince >= wait) this.shown = top;
    return this.shown;
  }

  reset() {
    this.shown = null;
    this.candidate = null;
    this.candidateSince = 0;
  }
}
