import { parseHex, rgba, shiftColor } from './color';

/**
 * Everything needed to paint a lens, independent of the drawing API, so the
 * web canvas and React Native Skia renderers produce the same look.
 * Radii are fractions of the lens radius.
 */
export interface LensStyle {
  ring: { color: string; widthRatio: number };
  body: {
    outerRatio: number;
    gradientInnerRatio: number;
    stops: { offset: number; color: string }[];
  };
  pupilRatio: number;
  glare: { offsetRatio: number; radiusRatio: number; color: string; fade: string };
}

export const lensStyle = (hexColor: string, pupilRatio = 0.25): LensStyle => {
  const base = parseHex(hexColor);
  const dark = shiftColor(base, -60);
  const light = shiftColor(base, 50);
  return {
    ring: { color: rgba(dark, 0.5), widthRatio: 0.15 },
    body: {
      outerRatio: 0.9,
      gradientInnerRatio: 0.2,
      stops: [
        { offset: 0, color: rgba(light, 0.8) },
        { offset: 0.5, color: rgba(base, 0.9) },
        { offset: 1, color: rgba(dark, 0.8) },
      ],
    },
    pupilRatio,
    glare: { offsetRatio: -0.3, radiusRatio: 0.5, color: 'rgba(255, 255, 255, 0.4)', fade: 'rgba(255, 255, 255, 0)' },
  };
};
