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

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

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
