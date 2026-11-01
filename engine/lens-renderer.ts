import { parseHex, rgba, shiftColor } from './color';

export interface LensRenderOptions {
  /** Overall lens opacity (0-1). */
  opacity?: number;
  /** Pupil hole as a fraction of the radius. */
  pupilRatio?: number;
}

/** Draws a tinted contact lens (limbal ring, colored donut, glare) centered on (x, y). */
export const drawLens = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  hexColor: string,
  { opacity = 0.65, pupilRatio = 0.25 }: LensRenderOptions = {}
) => {
  if (r <= 0) return;

  const base = parseHex(hexColor);
  const dark = shiftColor(base, -60);
  const light = shiftColor(base, 50);

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.globalCompositeOperation = 'source-over';

  // 1. Outer limbal ring for definition and depth
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.strokeStyle = rgba(dark, 0.5);
  ctx.lineWidth = r * 0.15;
  ctx.stroke();

  // 2. Main color as a donut, leaving the pupil clear
  const gradient = ctx.createRadialGradient(x, y, r * 0.2, x, y, r * 0.9);
  gradient.addColorStop(0, rgba(light, 0.8));
  gradient.addColorStop(0.5, rgba(base, 0.9));
  gradient.addColorStop(1, rgba(dark, 0.8));

  ctx.beginPath();
  ctx.arc(x, y, r * 0.9, 0, Math.PI * 2);
  ctx.arc(x, y, r * pupilRatio, 0, Math.PI * 2, true);
  ctx.fillStyle = gradient;
  ctx.fill();

  // 3. Subtle glare for realism
  const gx = x - r * 0.3;
  const gy = y - r * 0.3;
  const glare = ctx.createRadialGradient(gx, gy, 0, gx, gy, r * 0.5);
  glare.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
  glare.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = glare;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.9, 0, Math.PI * 2);
  ctx.arc(x, y, r * pupilRatio, 0, Math.PI * 2, true);
  ctx.fill();

  ctx.restore();
};
