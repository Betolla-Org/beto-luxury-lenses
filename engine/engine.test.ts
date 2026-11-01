import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { TASKS_VISION_VERSION } from './mediapipe-assets';
import {
  EyeMeasurement,
  LOST_FACE_HOLD_MS,
  QualityMonitor,
  eyeVisibility,
  headYaw,
  lensLighting,
  meanLuminance,
  qualityIssues,
  EyeTracker,
  FaceTracker,
  applyIrisRefinement,
  axisAngle,
  fitCircle,
  refineIris,
  smoothClosedCurve,
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

  it('fades the lens out as the lids close (lid gap)', () => {
    expect(eyeVisibility({ openness: 0.3 })).toBe(1);
    expect(eyeVisibility({ openness: 0.1 })).toBe(0);
    const half = eyeVisibility({ openness: 0.18 });
    expect(half).toBeGreaterThan(0.2);
    expect(half).toBeLessThan(0.8);
  });

  it('prefers the blendshape blink score over the lid gap when given', () => {
    // Lid gap says closed (e.g. looking down), blendshape says open: stays visible
    expect(eyeVisibility({ openness: 0.1, blink: 0.3 })).toBe(1);
    // Looking down raises the score to ~0.5: barely dims
    expect(eyeVisibility({ openness: 0.3, blink: 0.5 })).toBeGreaterThan(0.9);
    expect(eyeVisibility({ openness: 0.3, blink: 0.85 })).toBe(0);
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
    // The outline is rounded into a curve: 4 points per original segment by default
    expect(eye.outline).toHaveLength(RIGHT_EYE.outline.length * 4);
  });

  it('hides the lens while the eye is closed', () => {
    expect(new EyeTracker().update(measure(buildFace(1)), 1, 0)).toBeNull();
  });

  it('uses the blendshape blink score from FaceLandmarker', () => {
    const scores = (blink: number) => ({ eyeBlinkRight: blink, eyeBlinkLeft: 0 });
    const lm = buildFace(10);
    expect(measureMediaPipeEye(lm, RIGHT_EYE, identity, scores(0.9))!.blink).toBe(0.9);
    expect(new EyeTracker().update(measureMediaPipeEye(lm, RIGHT_EYE, identity, scores(0.9)), 1, 0)).toBeNull();
    expect(new EyeTracker().update(measureMediaPipeEye(lm, RIGHT_EYE, identity, scores(0.1)), 1, 0)!.opacity).toBe(1);
    const fading = new EyeTracker().update(measureMediaPipeEye(lm, RIGHT_EYE, identity, scores(0.6)), 1, 0)!;
    expect(fading.opacity).toBeGreaterThan(0);
    expect(fading.opacity).toBeLessThan(1);
  });

  it('returns null when landmarks are missing', () => {
    expect(measure([])).toBeNull();
    expect(new EyeTracker().update(null, 1, 0)).toBeNull();
  });
});

describe('smoothClosedCurve', () => {
  it('passes through the original points and adds points between them', () => {
    const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    const curve = smoothClosedCurve(square, 4);
    expect(curve).toHaveLength(16);
    expect(curve[0]).toEqual({ x: 0, y: 0 });
    expect(curve[4]).toEqual({ x: 10, y: 0 });
  });

  it('leaves tiny polygons alone', () => {
    const line = [{ x: 0, y: 0 }, { x: 1, y: 1 }];
    expect(smoothClosedCurve(line)).toBe(line);
  });
});

describe('iris ellipse', () => {
  const eye = (width: number, height: number, angle = 0): EyeMeasurement => ({
    center: { x: 50, y: 50 },
    irisDiameter: (width + height) / 2,
    openness: 0.3,
    outline: [{ x: 30, y: 50 }, { x: 50, y: 40 }, { x: 70, y: 50 }, { x: 50, y: 60 }],
    irisShape: { width, height, angle },
  });

  it('folds axis angles so left-to-right and right-to-left mean the same', () => {
    expect(axisAngle(Math.PI)).toBeCloseTo(0);
    expect(axisAngle(Math.PI + 0.1)).toBeCloseTo(0.1);
    expect(axisAngle(-0.1)).toBeCloseTo(-0.1);
  });

  it('becomes an ellipse when the iris looks narrow, sized by its larger axis', () => {
    const state = new EyeTracker().update(eye(7, 10, 0.2), 1, 0)!;
    expect(state.radius).toBeCloseTo(5);
    expect(state.radiusY).toBeCloseTo(5);
    expect(state.radiusX).toBeCloseTo(3.5);
    expect(state.rotation).toBeCloseTo(0.2);
  });

  it('stays round for small aspect jitter', () => {
    const state = new EyeTracker().update(eye(9.7, 10), 1, 0)!;
    expect(state.radiusX).toBe(state.radiusY);
  });
});

describe('FaceTracker', () => {
  const eye = (diameter: number): EyeMeasurement => ({
    center: { x: 50, y: 50 },
    irisDiameter: diameter,
    openness: 0.3,
    outline: [{ x: 30, y: 50 }, { x: 50, y: 40 }, { x: 70, y: 50 }, { x: 50, y: 60 }],
  });

  it('gives both eyes the same size: the average of the two readings', () => {
    const { right, left } = new FaceTracker().update(eye(10), eye(12), 1, 0);
    expect(right!.radius).toBeCloseTo(5.5);
    expect(left!.radius).toBeCloseTo(5.5);
  });

  it('lets one open eye carry the size while the other is not measured', () => {
    const { right, left } = new FaceTracker().update(eye(10), null, 1, 0);
    expect(right!.radius).toBeCloseTo(5);
    expect(left).toBeNull();
  });

  it('ignores a one-frame size glitch but follows a change that persists', () => {
    const face = new FaceTracker();
    face.update(eye(10), eye(10), 1, 0);
    expect(face.update(eye(20), eye(20), 1, 33).right!.radius).toBeCloseTo(5); // glitch: ignored
    let r = 0;
    for (let i = 2; i <= 6; i++) r = face.update(eye(20), eye(20), 1, i * 33).right!.radius;
    expect(r).toBeCloseTo(10); // persisted for 5 frames: snapped to
  });
});

describe('iris pixel refinement', () => {
  // A synthetic eye: bright sclera, dark iris (r = 14) and darker pupil, centered at (50, 50)
  const W = 100;
  const H = 100;
  const makeEye = (iris: { x: number; y: number; r: number } | null) => {
    const data = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const d = iris ? Math.hypot(x + 0.5 - iris.x, y + 0.5 - iris.y) : Infinity;
        const v = d < 5 ? 20 : iris && d < iris.r ? 70 : 210;
        const i = (y * W + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = v;
        data[i + 3] = 255;
      }
    }
    return { data, width: W, height: H, x: 0, y: 0 };
  };
  const outline = Array.from({ length: 32 }, (_, k) => {
    const a = (k / 32) * Math.PI * 2;
    return { x: 50 + 40 * Math.cos(a), y: 50 + 18 * Math.sin(a) };
  });

  it('fits a circle exactly to points on a circle', () => {
    const points = Array.from({ length: 12 }, (_, k) => ({ x: 3 + 7 * Math.cos(k), y: -2 + 7 * Math.sin(k) }));
    const c = fitCircle(points)!;
    expect(c.x).toBeCloseTo(3);
    expect(c.y).toBeCloseTo(-2);
    expect(c.r).toBeCloseTo(7);
  });

  it('pulls an off-center, undersized landmark estimate onto the real iris edge', () => {
    const refined = refineIris(makeEye({ x: 50, y: 50, r: 14 }), { x: 52, y: 49, r: 12 }, outline)!;
    expect(refined).not.toBeNull();
    expect(refined.x).toBeCloseTo(50, 0);
    expect(refined.y).toBeCloseTo(50, 0);
    expect(refined.r).toBeCloseTo(14, 0);
  });

  it('gives up when there is no iris edge to find', () => {
    expect(refineIris(makeEye(null), { x: 50, y: 50, r: 12 }, outline)).toBeNull();
  });

  it('moves the center toward the fit, and the size only while the iris looks round', () => {
    const base = {
      center: { x: 52, y: 49 },
      irisDiameter: 24,
      openness: 0.3,
      outline,
    };
    const round = applyIrisRefinement({ ...base, irisShape: { width: 24, height: 24, angle: 0 } }, { x: 50, y: 50, r: 14 }, 1);
    expect(round.center).toEqual({ x: 50, y: 50 });
    expect(round.irisShape!.width).toBeCloseTo(28);

    const turned = applyIrisRefinement({ ...base, irisShape: { width: 16, height: 24, angle: 0 } }, { x: 50, y: 50, r: 14 }, 1);
    expect(turned.center).toEqual({ x: 50, y: 50 });
    expect(turned.irisShape!.width).toBe(16);
    expect(applyIrisRefinement(base, null)).toBe(base);
  });
});

describe('lost face hold', () => {
  const eye = (): EyeMeasurement => ({
    center: { x: 50, y: 50 },
    irisDiameter: 10,
    openness: 0.3,
    outline: [{ x: 30, y: 50 }, { x: 50, y: 40 }, { x: 70, y: 50 }, { x: 50, y: 60 }],
  });

  it('keeps the last lenses briefly, fading, then lets go', () => {
    const face = new FaceTracker();
    face.update(eye(), eye(), 1, 1000);
    const held = face.lose(1000 + LOST_FACE_HOLD_MS / 2);
    expect(held.right!.x).toBe(50);
    expect(held.right!.opacity).toBeCloseTo(0.5);
    expect(face.lose(1000 + LOST_FACE_HOLD_MS + 1)).toEqual({ right: null, left: null });
  });

  it('holds nothing before any face was seen', () => {
    expect(new FaceTracker().lose(0)).toEqual({ right: null, left: null });
  });
});

describe('lighting', () => {
  const flat = (v: number) => {
    const data = new Uint8ClampedArray(10 * 10 * 4).fill(v);
    return { data, width: 10, height: 10, x: 0, y: 0 };
  };

  it('measures mean luminance', () => {
    expect(meanLuminance(flat(100))).toBeCloseTo(100);
  });

  it('widens the pupil and tones the lens down in dim light', () => {
    const dim = lensLighting(20);
    const bright = lensLighting(200);
    expect(dim.pupilRatio).toBeGreaterThan(bright.pupilRatio);
    expect(dim.cover).toBeLessThan(bright.cover);
    expect(dim.glare).toBeLessThan(bright.glare);
  });
});

describe('quality hints', () => {
  it('orders issues by importance', () => {
    expect(qualityIssues({ luminance: 20, irisPixels: 8, yaw: 0.5 })).toEqual(['MORE_LIGHT', 'MOVE_CLOSER', 'FACE_CAMERA']);
    expect(qualityIssues({ luminance: 120, irisPixels: 30, yaw: 0 })).toEqual([]);
    expect(qualityIssues({ faceCropped: true })).toEqual(['MOVE_BACK']);
  });

  it('measures head yaw from the nose and cheeks', () => {
    expect(headYaw({ x: 0, y: 0 }, { x: -1, y: 0 }, { x: 1, y: 0 })).toBe(0);
    expect(Math.abs(headYaw({ x: 0.6, y: 0 }, { x: -1, y: 0 }, { x: 1, y: 0 }))).toBeGreaterThan(0.35);
  });

  it('only shows a hint that persists, and only clears it once it is gone for a while', () => {
    const q = new QualityMonitor(800, 500);
    const dark = { luminance: 10 };
    const fine = { luminance: 150 };
    expect(q.update(dark, 0)).toBeNull();
    expect(q.update(dark, 500)).toBeNull();
    expect(q.update(dark, 800)).toBe('MORE_LIGHT');
    expect(q.update(fine, 900)).toBe('MORE_LIGHT'); // not cleared yet
    expect(q.update(dark, 1000)).toBe('MORE_LIGHT'); // a flicker back does not restart anything
    expect(q.update(fine, 1100)).toBe('MORE_LIGHT');
    expect(q.update(fine, 1600)).toBeNull();
  });
});
