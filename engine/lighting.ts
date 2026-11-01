import { clamp, lerp } from './geometry';
import type { PixelPatch } from './iris';

/** Mean luminance (Rec. 601, 0-255) of a pixel patch, sampling every `step`-th pixel. */
export const meanLuminance = (patch: PixelPatch, step = 2) => {
  let sum = 0;
  let count = 0;
  for (let y = 0; y < patch.height; y += step) {
    for (let x = 0; x < patch.width; x += step) {
      const i = (y * patch.width + x) * 4;
      sum += 0.299 * patch.data[i] + 0.587 * patch.data[i + 1] + 0.114 * patch.data[i + 2];
      count++;
    }
  }
  return count ? sum / count : 0;
};

/** How the lens adapts to the light around the eyes. */
export interface LensLighting {
  /** Pupil hole as a fraction of the lens radius: pupils widen in the dark. */
  pupilRatio: number;
  /** Multiplier on the painted-on cover color: a light lens must not glow in a dim room. */
  cover: number;
  /** Multiplier on the glare highlight: little light, little reflection. */
  glare: number;
}

// Eye-area luminance treated as "dim" and "bright" (0-255)
const DIM = 40;
const BRIGHT = 160;

/** Maps the (smoothed) luminance around the eyes to lens adjustments. */
export const lensLighting = (luminance: number): LensLighting => {
  const t = clamp((luminance - DIM) / (BRIGHT - DIM), 0, 1);
  return {
    pupilRatio: lerp(0.32, 0.22, t),
    cover: lerp(0.55, 1.1, t),
    glare: lerp(0.4, 1, t),
  };
};
