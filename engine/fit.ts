import { Point, getDistance, pointInPolygon } from './geometry';

export interface Disk {
  x: number;
  y: number;
  r: number;
}

/**
 * How well a painted lens matches the visible iris, as intersection-over-union (0-1).
 *
 * - visible iris = iris disk ∩ eye opening (the lids hide the rest)
 * - painted lens = lens disk, ∩ eye opening when the renderer clips to it
 *
 * Paint on the eyelids or the white of the eye and uncovered iris both lower the score.
 * Computed by sampling a grid over the iris and lens disks.
 */
export const lensFitScore = (lens: Disk, iris: Disk, outline: Point[], clipped: boolean, samples = 80) => {
  const minX = Math.min(lens.x - lens.r, iris.x - iris.r);
  const maxX = Math.max(lens.x + lens.r, iris.x + iris.r);
  const minY = Math.min(lens.y - lens.r, iris.y - iris.r);
  const maxY = Math.max(lens.y + lens.r, iris.y + iris.r);
  const stepX = (maxX - minX) / samples;
  const stepY = (maxY - minY) / samples;

  let both = 0;
  let either = 0;
  for (let i = 0; i < samples; i++) {
    for (let j = 0; j < samples; j++) {
      const p = { x: minX + (i + 0.5) * stepX, y: minY + (j + 0.5) * stepY };
      const inEye = pointInPolygon(p, outline);
      const isIris = inEye && getDistance(p, iris) <= iris.r;
      const isLens = getDistance(p, lens) <= lens.r && (!clipped || inEye);
      if (isIris && isLens) both++;
      if (isIris || isLens) either++;
    }
  }
  return either === 0 ? 0 : both / either;
};
