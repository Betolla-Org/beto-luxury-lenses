import { Point, getDistance, pointInPolygon } from './geometry';
import type { EyeMeasurement } from './eye';

/** An RGBA pixel block (e.g. canvas ImageData) and where its top-left pixel sits in canvas coordinates. */
export interface PixelPatch {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  x: number;
  y: number;
}

export interface Circle {
  x: number;
  y: number;
  r: number;
}

export interface IrisRefinement extends Circle {
  /** Edge points that survived outlier rejection (the fit's support). */
  points: Point[];
}

// Ray layout: only the sides of the iris, because the eyelids cover its top and bottom
const SIDE_SPREAD = (50 * Math.PI) / 180; // rays within ±50° of horizontal, on both sides
const RAYS_PER_SIDE = 13;
// Search band around the landmark radius, as a fraction of it
const SEARCH_MIN = 0.55;
const SEARCH_MAX = 1.45;
/** Weakest dark-to-light step (in 0-255 luminance per sample) accepted as the iris edge. */
const MIN_EDGE_STRENGTH = 6;
const MIN_POINTS = 10;
const MIN_POINTS_PER_SIDE = 3;
// Sanity limits against the landmark estimate
const MAX_RADIUS_CHANGE = 0.25;
const MAX_CENTER_SHIFT = 0.35;

/** Bilinear luminance (Rec. 601) at a canvas point, or NaN outside the patch. */
const luminanceAt = (patch: PixelPatch, cx: number, cy: number) => {
  const x = cx - patch.x - 0.5;
  const y = cy - patch.y - 0.5;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  if (x0 < 0 || y0 < 0 || x0 + 1 >= patch.width || y0 + 1 >= patch.height) return NaN;
  const fx = x - x0;
  const fy = y - y0;
  const lum = (px: number, py: number) => {
    const i = (py * patch.width + px) * 4;
    return 0.299 * patch.data[i] + 0.587 * patch.data[i + 1] + 0.114 * patch.data[i + 2];
  };
  const top = lum(x0, y0) * (1 - fx) + lum(x0 + 1, y0) * fx;
  const bottom = lum(x0, y0 + 1) * (1 - fx) + lum(x0 + 1, y0 + 1) * fx;
  return top * (1 - fy) + bottom * fy;
};

/** Algebraic (Kåsa) least-squares circle fit. */
export const fitCircle = (points: Point[]): Circle | null => {
  const n = points.length;
  if (n < 3) return null;
  // Center the data for numerical stability
  const mx = points.reduce((s, p) => s + p.x, 0) / n;
  const my = points.reduce((s, p) => s + p.y, 0) / n;
  let suu = 0, svv = 0, suv = 0, suuu = 0, svvv = 0, suvv = 0, svuu = 0;
  for (const p of points) {
    const u = p.x - mx;
    const v = p.y - my;
    suu += u * u;
    svv += v * v;
    suv += u * v;
    suuu += u * u * u;
    svvv += v * v * v;
    suvv += u * v * v;
    svuu += v * u * u;
  }
  // Solve [suu suv; suv svv] [uc vc] = 0.5 [suuu + suvv; svvv + svuu]
  const det = suu * svv - suv * suv;
  if (Math.abs(det) < 1e-9) return null;
  const bu = 0.5 * (suuu + suvv);
  const bv = 0.5 * (svvv + svuu);
  const uc = (bu * svv - bv * suv) / det;
  const vc = (suu * bv - suv * bu) / det;
  const r = Math.sqrt(uc * uc + vc * vc + (suu + svv) / n);
  return { x: uc + mx, y: vc + my, r };
};

/** Fits a circle, drops points far off it (median absolute deviation), and fits again. */
const robustFit = (points: Point[]): { circle: Circle; inliers: Point[] } | null => {
  const first = fitCircle(points);
  if (!first) return null;
  const residuals = points.map(p => Math.abs(getDistance(p, first) - first.r));
  const sorted = [...residuals].sort((a, b) => a - b);
  const mad = sorted[Math.floor(sorted.length / 2)];
  const limit = Math.max(1, 2.5 * 1.4826 * mad);
  const inliers = points.filter((_, i) => residuals[i] <= limit);
  const second = fitCircle(inliers);
  return second ? { circle: second, inliers } : null;
};

/**
 * Finds the limbus (iris edge) in the pixels around a landmark estimate and fits a circle to it.
 *
 * Rays go out sideways from the estimated center; on each, the strongest dark-to-light step inside
 * the eye opening is the edge between the iris and the white of the eye. Returns null when the
 * evidence is weak or disagrees too much with the estimate, so callers keep the landmark values.
 */
export const refineIris = (patch: PixelPatch, guess: Circle, outline: Point[]): IrisRefinement | null => {
  if (guess.r < 3 || outline.length < 3) return null;
  const step = Math.max(0.5, guess.r / 40);
  const edges: Point[] = [];
  const perSide = [0, 0];

  for (const [side, base] of [0, Math.PI].entries()) {
    for (let k = 0; k < RAYS_PER_SIDE; k++) {
      const angle = base + SIDE_SPREAD * ((2 * k) / (RAYS_PER_SIDE - 1) - 1);
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);

      // Sample luminance along the ray, stopping where it leaves the eye opening
      const samples: number[] = [];
      for (let s = guess.r * SEARCH_MIN; s <= guess.r * SEARCH_MAX; s += step) {
        const p = { x: guess.x + dx * s, y: guess.y + dy * s };
        if (!pointInPolygon(p, outline)) break;
        const l = luminanceAt(patch, p.x, p.y);
        if (Number.isNaN(l)) break;
        samples.push(l);
      }
      if (samples.length < 5) continue;

      // Smooth (1-2-1), then take the strongest outward increase in brightness
      const smooth = samples.map((v, i) => (samples[Math.max(0, i - 1)] + 2 * v + samples[Math.min(samples.length - 1, i + 1)]) / 4);
      let best = -1;
      let bestGradient = MIN_EDGE_STRENGTH;
      for (let i = 1; i < smooth.length - 1; i++) {
        const g = (smooth[i + 1] - smooth[i - 1]) / 2;
        if (g > bestGradient) {
          bestGradient = g;
          best = i;
        }
      }
      if (best < 0) continue;

      // Sub-sample peak position from a parabola through the neighbouring gradients
      const g = (i: number) => (smooth[Math.min(smooth.length - 1, i + 1)] - smooth[Math.max(0, i - 1)]) / 2;
      const gl = g(best - 1);
      const gr = g(best + 1);
      const denom = gl - 2 * bestGradient + gr;
      const offset = denom < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (gl - gr)) / denom)) : 0;
      const s = guess.r * SEARCH_MIN + (best + offset) * step;
      edges.push({ x: guess.x + dx * s, y: guess.y + dy * s });
      perSide[side]++;
    }
  }

  if (edges.length < MIN_POINTS || perSide[0] < MIN_POINTS_PER_SIDE || perSide[1] < MIN_POINTS_PER_SIDE) return null;
  const fit = robustFit(edges);
  if (!fit || fit.inliers.length < MIN_POINTS) return null;
  const { circle } = fit;
  if (Math.abs(circle.r - guess.r) > guess.r * MAX_RADIUS_CHANGE) return null;
  if (getDistance(circle, guess) > guess.r * MAX_CENTER_SHIFT) return null;
  return { ...circle, points: fit.inliers };
};

/** How far to move from the landmark estimate toward the pixel fit (1 = trust the pixels fully). */
const REFINE_WEIGHT = 0.7;

/**
 * Applies a pixel refinement to a measurement: the center always, the size only while the iris
 * looks round (a circle fit cannot measure a foreshortened, elliptical iris).
 */
export const applyIrisRefinement = (m: EyeMeasurement, refined: Circle | null, weight = REFINE_WEIGHT): EyeMeasurement => {
  if (!refined) return m;
  const center = {
    x: m.center.x + (refined.x - m.center.x) * weight,
    y: m.center.y + (refined.y - m.center.y) * weight,
  };
  const shape = m.irisShape;
  const aspect = shape ? Math.min(shape.width, shape.height) / Math.max(shape.width, shape.height) : 1;
  if (aspect < 0.9) return { ...m, center };

  const major = shape ? Math.max(shape.width, shape.height) : m.irisDiameter;
  const k = 1 + ((2 * refined.r) / major - 1) * weight;
  return {
    ...m,
    center,
    irisDiameter: m.irisDiameter * k,
    irisShape: shape && { ...shape, width: shape.width * k, height: shape.height * k },
  };
};
