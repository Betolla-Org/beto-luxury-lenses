import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { TASKS_VISION_VERSION } from './mediapipe-assets';
import {
  BlinkDetector,
  EyeTracker,
  LEFT_EYE,
  blendshapeScores,
  IRIS_TO_EYE_WIDTH,
  OneEuroFilter,
  Point,
  RIGHT_EYE,
  coverRect,
  eyeOpenness,
  lensFitScore,
  lensStyle,
  mapLandmark,
  pointInPolygon,
  measureContourEye,
  measureMediaPipeEye,
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

  it('builds the lens palette from the base color', () => {
    const s = lensStyle('#808080');
    expect(s.ring.color).toBe('rgba(68, 68, 68, 0.5)');
    expect(s.body.stops.map(x => x.color)).toEqual([
      'rgba(178, 178, 178, 0.8)',
      'rgba(128, 128, 128, 0.9)',
      'rgba(68, 68, 68, 0.8)',
    ]);
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

  it('prefers the blendshape blink score over the lid gap when given', () => {
    const b = new BlinkDetector();
    // Lid gap says closed (e.g. looking down), blendshape says open: stays open
    expect(b.update(0.1, 0.3)).toBe(false);
    expect(b.update(0.3, 0.8)).toBe(true);
    expect(b.update(0.3, 0.5)).toBe(true); // still closed inside the band
    expect(b.update(0.3, 0.2)).toBe(false);
  });
});

describe('blendshapes', () => {
  it('builds a name -> score lookup', () => {
    expect(blendshapeScores([{ categoryName: 'eyeBlinkLeft', score: 0.7 }])).toEqual({ eyeBlinkLeft: 0.7 });
    expect(blendshapeScores(undefined)).toEqual({});
  });

  it('maps each eye to its own blink blendshape', () => {
    expect(RIGHT_EYE.blinkBlendshape).toBe('eyeBlinkRight');
    expect(LEFT_EYE.blinkBlendshape).toBe('eyeBlinkLeft');
  });
});

describe('MediaPipe assets', () => {
  it('loads the WASM runtime from the same version as the npm package', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));
    expect(pkg.dependencies['@mediapipe/tasks-vision']).toBe(TASKS_VISION_VERSION);
  });
});

describe('lensFitScore', () => {
  // Eye opening 40 wide, 16 tall: the lids cut the top and bottom off a 12px-radius iris
  const outline = Array.from({ length: 24 }, (_, i) => {
    const a = (i / 24) * Math.PI * 2;
    return { x: 20 * Math.cos(a), y: 8 * Math.sin(a) };
  });
  const iris = { x: 0, y: 0, r: 12 };

  it('is perfect for an iris-sized lens clipped to the eye', () => {
    expect(lensFitScore(iris, iris, outline, true)).toBeGreaterThan(0.99);
  });

  it('drops when the lens paints over the eyelids', () => {
    expect(lensFitScore(iris, iris, outline, false)).toBeLessThan(0.8);
  });

  it('drops for an oversized, off-center lens', () => {
    expect(lensFitScore({ x: 3, y: 0, r: 12 * 1.15 }, iris, outline, true)).toBeLessThan(0.85);
  });
});

describe('pointInPolygon', () => {
  const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
  it('tells inside from outside', () => {
    expect(pointInPolygon({ x: 5, y: 5 }, square)).toBe(true);
    expect(pointInPolygon({ x: 15, y: 5 }, square)).toBe(false);
  });
});

describe('measureContourEye', () => {
  // Ellipse outline 40px wide, `height` tall, centered at (100, 60)
  const ellipse = (height: number, n = 16): Point[] =>
    Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2;
      return { x: 100 + 20 * Math.cos(a), y: 60 + (height / 2) * Math.sin(a) };
    });

  it('finds the center, width-based iris size and openness of an eye outline', () => {
    const m = measureContourEye(ellipse(12))!;
    expect(m.center.x).toBeCloseTo(100);
    expect(m.center.y).toBeCloseTo(60);
    expect(m.irisDiameter).toBeCloseTo(40 * IRIS_TO_EYE_WIDTH, 0);
    expect(m.openness).toBeCloseTo(12 / 40, 1);
  });

  it('reads a nearly flat outline as closed', () => {
    expect(measureContourEye(ellipse(2))!.openness).toBeLessThan(0.16);
  });

  it('rejects degenerate outlines', () => {
    expect(measureContourEye([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBeNull();
  });
});

describe('EyeTracker', () => {
  const buildFace = (lidGap: number): Point[] => {
    const lm: Point[] = [];
    const set = (i: number, x: number, y: number) => (lm[i] = { x, y });
    const { iris, lids, corners, outline } = RIGHT_EYE;
    outline.forEach((idx, k) => {
      const a = (k / outline.length) * Math.PI * 2;
      set(idx, 50 + 15 * Math.cos(a), 50 + (lidGap / 2) * Math.sin(a));
    });
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
  const measure = (lm: Point[]) => measureMediaPipeEye(lm, RIGHT_EYE, identity);

  it('places the lens on the iris, sizes it to the iris and carries the eye outline', () => {
    const eye = new EyeTracker().update(measure(buildFace(10)), 1.2, 0)!;
    expect({ x: eye.x, y: eye.y, radius: eye.radius }).toEqual({ x: 50, y: 50, radius: 6 });
    expect(eye.outline).toHaveLength(RIGHT_EYE.outline.length);
  });

  it('hides the lens while the eye is closed', () => {
    expect(new EyeTracker().update(measure(buildFace(1)), 1, 0)).toBeNull();
  });

  it('uses the blendshape blink score from FaceLandmarker', () => {
    const scores = (blink: number) => ({ eyeBlinkRight: blink, eyeBlinkLeft: 0 });
    const lm = buildFace(10);
    expect(measureMediaPipeEye(lm, RIGHT_EYE, identity, scores(0.9))!.blink).toBe(0.9);
    expect(new EyeTracker().update(measureMediaPipeEye(lm, RIGHT_EYE, identity, scores(0.9)), 1, 0)).toBeNull();
    expect(new EyeTracker().update(measureMediaPipeEye(lm, RIGHT_EYE, identity, scores(0.1)), 1, 0)).not.toBeNull();
  });

  it('returns null when landmarks are missing', () => {
    expect(measure([])).toBeNull();
    expect(new EyeTracker().update(null, 1, 0)).toBeNull();
  });
});
