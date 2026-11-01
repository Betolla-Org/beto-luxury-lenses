import { Point } from './geometry';
import { lensStyle } from './lens-style';

export interface LensRenderOptions {
  /** Overall lens opacity (0-1). */
  opacity?: number;
  /** Pupil hole as a fraction of the radius. */
  pupilRatio?: number;
  /** Eye opening polygon; when given, nothing is painted over the eyelids. */
  clip?: Point[];
  /**
   * Realistic mode (needs `clip`): soft edge along the eyelids, upper-lid shadow, and
   * the eye's own iris texture kept under the tint instead of a flat painted disk.
   */
  realistic?: boolean;
  /** Semi-axis across the lens's x axis, for an elliptical lens (head turned); defaults to the radius. */
  radiusY?: number;
  /** Rotation of the lens's x axis in radians (head roll). */
  rotation?: number;
}

// How the realistic mode mixes the lens in. Tuned with dev/lens-fit.html.
const TINT_STRENGTH = 0.85; // 'color' blend: lens hue/saturation on the eye's own brightness (keeps texture)
const COVER_STRENGTH = 0.4; // plain paint on top, so light lenses still show on dark eyes
const LID_SHADOW = 0.35; // darkness right under the upper lid
const FEATHER_RATIO = 0.06; // edge softness, relative to the lens radius

let scratch: HTMLCanvasElement | null = null;
const getScratch = (size: number) => {
  scratch ??= document.createElement('canvas');
  if (scratch.width < size || scratch.height < size) scratch.width = scratch.height = Math.ceil(size);
  return scratch;
};

const tracePolygon = (ctx: CanvasRenderingContext2D, points: Point[], dx = 0, dy = 0) => {
  ctx.beginPath();
  ctx.moveTo(points[0].x + dx, points[0].y + dy);
  for (const p of points.slice(1)) ctx.lineTo(p.x + dx, p.y + dy);
  ctx.closePath();
};

/**
 * Paints the lens recipe (limbal ring, colored donut, glare) at full strength, as a circle of
 * radius `r` squashed to `ry` across and rotated by `rotation`: how a round iris looks on a turned head.
 */
const paintLens = (
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  hexColor: string,
  pupilRatio: number,
  ry = r,
  rotation = 0
) => {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotation);
  ctx.scale(1, ry / r);
  paintRoundLens(ctx, 0, 0, r, hexColor, pupilRatio);
  ctx.restore();
};

const paintRoundLens = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, hexColor: string, pupilRatio: number) => {
  const style = lensStyle(hexColor, pupilRatio);
  const outer = r * style.body.outerRatio;
  const pupil = r * style.pupilRatio;

  // 1. Outer limbal ring for definition and depth
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.strokeStyle = style.ring.color;
  ctx.lineWidth = r * style.ring.widthRatio;
  ctx.stroke();

  // 2. Main color as a donut, leaving the pupil clear
  const gradient = ctx.createRadialGradient(x, y, r * style.body.gradientInnerRatio, x, y, outer);
  for (const stop of style.body.stops) gradient.addColorStop(stop.offset, stop.color);
  ctx.beginPath();
  ctx.arc(x, y, outer, 0, Math.PI * 2);
  ctx.arc(x, y, pupil, 0, Math.PI * 2, true);
  ctx.fillStyle = gradient;
  ctx.fill();

  // 3. Subtle glare for realism
  const gx = x + r * style.glare.offsetRatio;
  const gy = y + r * style.glare.offsetRatio;
  const glare = ctx.createRadialGradient(gx, gy, 0, gx, gy, r * style.glare.radiusRatio);
  glare.addColorStop(0, style.glare.color);
  glare.addColorStop(1, style.glare.fade);
  ctx.fillStyle = glare;
  ctx.beginPath();
  ctx.arc(x, y, outer, 0, Math.PI * 2);
  ctx.arc(x, y, pupil, 0, Math.PI * 2, true);
  ctx.fill();
};

/** Draws a tinted contact lens centered on (x, y); `r` is its radius, or its x semi-axis when elliptical. */
export const drawLens = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  hexColor: string,
  { opacity = 0.65, pupilRatio = 0.25, clip, realistic = false, radiusY = r, rotation = 0 }: LensRenderOptions = {}
) => {
  if (r <= 0 || radiusY <= 0) return;
  const hasClip = !!clip && clip.length >= 3;

  if (!realistic || !hasClip) {
    ctx.save();
    if (hasClip) {
      tracePolygon(ctx, clip!);
      ctx.clip();
    }
    ctx.globalAlpha = opacity;
    ctx.globalCompositeOperation = 'source-over';
    paintLens(ctx, x, y, r, hexColor, pupilRatio, radiusY, rotation);
    ctx.restore();
    return;
  }

  // Realistic: build the lens on a scratch canvas, shape it to the eye opening, then blend it in.
  const extent = Math.max(r, radiusY);
  const pad = Math.ceil(extent * 0.2) + 2;
  const size = 2 * (extent + pad);
  const canvas = getScratch(size);
  const s = canvas.getContext('2d')!;
  const ox = extent + pad - x; // eye -> scratch offset
  const oy = extent + pad - y;
  s.save();
  s.clearRect(0, 0, size, size);
  paintLens(s, x + ox, y + oy, r, hexColor, pupilRatio, radiusY, rotation);

  // Upper-lid shadow: the lid shades the top of the iris
  const lidTop = Math.min(...clip!.map(p => p.y)) + oy;
  const shadow = s.createLinearGradient(0, lidTop, 0, lidTop + extent * 0.7);
  shadow.addColorStop(0, `rgba(0, 0, 0, ${LID_SHADOW})`);
  shadow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  s.globalCompositeOperation = 'source-atop';
  s.fillStyle = shadow;
  s.fillRect(0, 0, size, size);

  // Keep only what lies inside the eye opening, with a feathered edge
  s.globalCompositeOperation = 'destination-in';
  s.filter = `blur(${Math.max(0.5, extent * FEATHER_RATIO)}px)`;
  tracePolygon(s, clip!, ox, oy);
  s.fillStyle = '#000';
  s.fill();
  s.restore();

  const dx = x - extent - pad;
  const dy = y - extent - pad;
  ctx.save();
  ctx.globalCompositeOperation = 'color';
  ctx.globalAlpha = opacity * TINT_STRENGTH / 0.65;
  ctx.drawImage(canvas, 0, 0, size, size, dx, dy, size, size);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = opacity * COVER_STRENGTH / 0.65;
  ctx.drawImage(canvas, 0, 0, size, size, dx, dy, size, size);
  ctx.restore();
};
