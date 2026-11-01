import { describe, expect, it } from 'vitest';
import {
  BlinkDetector,
  EyeTracker,
  OneEuroFilter,
  Point,
  RIGHT_EYE,
  coverRect,
  eyeOpenness,
  mapLandmark,
  parseHex,
  shiftColor,
} from '.';

describe('geometry', () => {
  it('covers a wider box by cropping top and bottom', () => {
    expect(coverRect(100, 100, 200, 100)).toEqual({ x: 0, y: -50, width: 200, height: 200 });
  });

  it('covers a taller box by cropping the sides', () => {
    // 1280x720 video in a 400x800 portrait canvas
    const r = coverRect(1280, 720, 400, 800);
    expect(r.height).toBe(800);
    expect(r.x).toBeCloseTo((400 - r.width) / 2);
  });

  it('mirrors landmarks horizontally', () => {
    expect(mapLandmark({ x: 0, y: 0 }, 100, 100, 100, 100)).toEqual({ x: 100, y: 0 });
    expect(mapLandmark({ x: 0.5, y: 0.5 }, 1280, 720, 400, 800)).toEqual({ x: 200, y: 400 });
  });
});

describe('color', () => {
  it('parses long, short and invalid hex', () => {
    expect(parseHex('#D4AF37')).toEqual({ r: 212, g: 175, b: 55 });
    expect(parseHex('fff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseHex('not-a-color')).toEqual({ r: 0, g: 0, b: 0 });
  });

  it('clamps shifted channels', () => {
    expect(shiftColor({ r: 10, g: 128, b: 250 }, -60)).toEqual({ r: 0, g: 68, b: 190 });
    expect(shiftColor({ r: 10, g: 128, b: 250 }, 50)).toEqual({ r: 60, g: 178, b: 255 });
  });
});

describe('OneEuroFilter', () => {
  it('passes the first sample through and converges on a constant', () => {
    const f = new OneEuroFilter(1, 0);
    expect(f.filter(10, 0)).toBe(10);
    let v = 0;
    for (let t = 1; t <= 120; t++) v = f.filter(20, t * 16);
    expect(v).toBeCloseTo(20, 1);
  });

  it('damps jitter around a still point', () => {
    const f = new OneEuroFilter(1, 0);
    const out: number[] = [];
    for (let t = 0; t < 60; t++) out.push(f.filter(100 + (t % 2 ? 2 : -2), t * 16));
    const tail = out.slice(30);
    expect(Math.max(...tail) - Math.min(...tail)).toBeLessThan(1);
  });

  it('snaps to the next value after reset', () => {
    const f = new OneEuroFilter();
    f.filter(0, 0);
    f.reset();
    expect(f.filter(500, 16)).toBe(500);
  });
});

describe('blink detection', () => {
  it('is independent of face distance', () => {
    const near = eyeOpenness({ x: 0, y: -15 }, { x: 0, y: 15 }, { x: -50, y: 0 }, { x: 50, y: 0 });
    const far = eyeOpenness({ x: 0, y: -3 }, { x: 0, y: 3 }, { x: -10, y: 0 }, { x: 10, y: 0 });
    expect(near).toBeCloseTo(far);
  });

  it('uses hysteresis between closing and reopening', () => {
    const b = new BlinkDetector(0.16, 0.2);
    expect(b.update(0.3)).toBe(false);
    expect(b.update(0.1)).toBe(true);
    expect(b.update(0.18)).toBe(true); // still closed inside the band
    expect(b.update(0.25)).toBe(false);
  });
});

describe('EyeTracker', () => {
  const buildFace = (lidGap: number): Point[] => {
    const lm: Point[] = [];
    const set = (i: number, x: number, y: number) => (lm[i] = { x, y });
    const { iris, lids, corners } = RIGHT_EYE;
    set(iris.center, 50, 50);
    set(iris.top, 50, 45);
    set(iris.bottom, 50, 55);
    set(iris.left, 45, 50);
    set(iris.right, 55, 50);
    set(lids.top, 50, 50 - lidGap / 2);
    set(lids.bottom, 50, 50 + lidGap / 2);
    set(corners.inner, 35, 50);
    set(corners.outer, 65, 50);
    return lm;
  };
  const identity = (p: Point) => p;

  it('places the lens on the iris and scales it', () => {
    const eye = new EyeTracker(RIGHT_EYE, { irisScale: 1 }).update(buildFace(10), identity, 1.2, 0);
    expect(eye).toEqual({ x: 50, y: 50, radius: 6 });
  });

  it('hides the lens while the eye is closed', () => {
    expect(new EyeTracker(RIGHT_EYE).update(buildFace(1), identity, 1, 0)).toBeNull();
  });

  it('returns null when landmarks are missing', () => {
    expect(new EyeTracker(RIGHT_EYE).update([], identity, 1, 0)).toBeNull();
  });
});
