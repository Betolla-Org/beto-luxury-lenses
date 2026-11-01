export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const getDistance = (p1: Point, p2: Point) => Math.hypot(p1.x - p2.x, p1.y - p2.y);

export const lerp = (start: number, end: number, factor: number) => start + (end - start) * factor;

/** Even-odd ray casting test. */
export const pointInPolygon = (p: Point, polygon: Point[]) => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
};

export const clamp =(value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Smooths a closed polygon into a curve through all its points (uniform Catmull-Rom), adding `subdivisions - 1` points between each pair. Turns a 16-point eye
 * outline into a round lid edge instead of visible straight segments.
 */
export const smoothClosedCurve = (points: Point[], subdivisions = 4): Point[] => {
  const n = points.length;
  if (n < 3 || subdivisions < 2) return points;
  const out: Point[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];
    for (let s = 0; s < subdivisions; s++) {
      const t = s / subdivisions;
      const t2 = t * t;
      const t3 = t2 * t;
      const at = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: at(p0.x, p1.x, p2.x, p3.x), y: at(p0.y, p1.y, p2.y, p3.y) });
    }
  }
  return out;
};

/**
 * Where a source of `srcW x srcH` lands inside a `dstW x dstH` box under `object-fit: cover`.
 * The rect extends past the box (negative x or y) on the cropped axis.
 */
export const coverRect = (srcW: number, srcH: number, dstW: number, dstH: number): Rect => {
  const scale = Math.max(dstW / srcW, dstH / srcH);
  const width = srcW * scale;
  const height = srcH * scale;
  return { x: (dstW - width) / 2, y: (dstH - height) / 2, width, height };
};

/**
 * Maps a normalized MediaPipe landmark (0-1) to canvas pixels, matching a
 * mirrored video drawn with `object-fit: cover`.
 */
export const mapLandmark = (
  lm: Point,
  videoWidth: number,
  videoHeight: number,
  canvasWidth: number,
  canvasHeight: number
): Point => {
  const rect = coverRect(videoWidth, videoHeight, canvasWidth, canvasHeight);
  return {
    x: (1 - lm.x) * rect.width + rect.x,
    y: lm.y * rect.height + rect.y,
  };
};
