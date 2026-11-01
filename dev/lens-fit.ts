// Dev-only page (not part of the production build): npm run dev, then open /dev/lens-fit.html
import {
  EyeIndices,
  LEFT_EYE,
  Point,
  RIGHT_EYE,
  applyIrisRefinement,
  getDistance,
  lensFitScore,
  measureMediaPipeEye,
  refineIris,
  smoothClosedCurve,
} from '../engine';
import { drawLens } from '../engine/web';
import { createFaceLandmarker } from '../engine/face-landmarker';

// Put face photos in dev/fixtures/ (gitignored) and list them here, or pick files on the page.
const PHOTOS = ['./fixtures/burst-face.jpg', './fixtures/hero.jpg'];
const COLOR = '#85A0AF';
const OPACITY = 0.65;

interface Result { old: number; next: number }

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${src}`));
    img.src = src;
  });

const createDetector = () => {
  const landmarker = createFaceLandmarker('IMAGE');
  return async (img: HTMLImageElement): Promise<Point[] | null> => (await landmarker).detect(img).faceLandmarks[0] ?? null;
};

/** The engine before this change: center from landmark 468 only, 1.15x the iris, no eyelid clipping. */
const oldLens = (lm: Point[], eye: EyeIndices, project: (p: Point) => Point) => {
  const p = (i: number) => project(lm[i]);
  const d = (getDistance(p(eye.iris.left), p(eye.iris.right)) + getDistance(p(eye.iris.top), p(eye.iris.bottom))) / 2;
  const c = p(eye.iris.center);
  return { x: c.x, y: c.y, r: (d * 1.15) / 2 };
};

const crop = (source: HTMLCanvasElement, center: Point, half: number) => {
  const out = document.createElement('canvas');
  out.width = out.height = 360;
  out.getContext('2d')!.drawImage(source, center.x - half, center.y - half, half * 2, half * 2, 0, 0, 360, 360);
  return out;
};

const figure = (canvas: HTMLCanvasElement, caption: string) => {
  const f = document.createElement('figure');
  const c = document.createElement('figcaption');
  c.innerHTML = caption;
  f.append(canvas, c);
  return f;
};

/** The whole photo as a pixel patch for refineIris. */
const pickPatch = (canvas: HTMLCanvasElement) => {
  const image = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
  return { data: image.data, width: image.width, height: image.height, x: 0, y: 0 };
};

const detect = createDetector();

async function run(photos: string[]) {
  const status = document.getElementById('status')!;
  const out = document.getElementById('out')!;
  out.innerHTML = '';
  const results: Result[] = [];

  for (const [n, src] of photos.entries()) {
    status.textContent = `Analysing photo ${n + 1} of ${photos.length}…`;
    let img: HTMLImageElement;
    try {
      img = await loadImage(src);
    } catch (e) {
      out.insertAdjacentHTML('beforeend', `<p class="old">${(e as Error).message}</p>`);
      continue;
    }
    const lm = await detect(img);
    const section = document.createElement('div');
    section.className = 'photo';
    section.innerHTML = `<h2>Photo ${n + 1}</h2>`;
    out.append(section);
    if (!lm) {
      section.insertAdjacentHTML('beforeend', '<p class="old">No face found</p>');
      continue;
    }

    const W = img.naturalWidth;
    const H = img.naturalHeight;
    const project = (p: Point) => ({ x: p.x * W, y: p.y * H });
    const base = document.createElement('canvas');
    base.width = W;
    base.height = H;
    base.getContext('2d')!.drawImage(img, 0, 0);

    const rows = document.createElement('div');
    rows.className = 'rows';
    section.append(rows);

    for (const [name, eye] of [['Right eye', RIGHT_EYE], ['Left eye', LEFT_EYE]] as const) {
      const m = measureMediaPipeEye(lm, eye, project);
      if (!m) continue;
      const iris = { x: m.center.x, y: m.center.y, r: m.irisDiameter / 2 };
      const old = oldLens(lm, eye, project);
      const score = { old: lensFitScore(old, iris, m.outline, false), next: lensFitScore(iris, iris, m.outline, true) };
      results.push(score);

      const before = document.createElement('canvas');
      before.width = W;
      before.height = H;
      const bctx = before.getContext('2d')!;
      bctx.drawImage(base, 0, 0);
      drawLens(bctx, old.x, old.y, old.r, COLOR, { opacity: OPACITY });

      const after = document.createElement('canvas');
      after.width = W;
      after.height = H;
      const actx = after.getContext('2d')!;
      actx.drawImage(base, 0, 0);
      drawLens(actx, iris.x, iris.y, iris.r, COLOR, { opacity: OPACITY, clip: m.outline });

      // The live pipeline: pixel-refined iris, elliptical lens, outline rounded into a curve
      const refined = refineIris(pickPatch(base), iris, m.outline);
      const live = applyIrisRefinement(m, refined);
      const shape = live.irisShape!;
      const real = document.createElement('canvas');
      real.width = W;
      real.height = H;
      const rctx = real.getContext('2d')!;
      rctx.drawImage(base, 0, 0);
      drawLens(rctx, live.center.x, live.center.y, shape.width / 2, COLOR, {
        opacity: OPACITY,
        clip: smoothClosedCurve(m.outline),
        realistic: true,
        radiusY: shape.height / 2,
        rotation: shape.angle,
      });
      const moved = getDistance(live.center, m.center);
      const refineNote = refined
        ? `pixel refinement moved the center ${moved.toFixed(1)}px, ${refined.points.length} edge points`
        : 'pixel refinement found no clear edge (landmarks kept)';

      const half = iris.r * 3.2;
      rows.append(
        figure(crop(before, m.center, half), `${name} · <span class="old">old engine: ${(score.old * 100).toFixed(0)}% fit</span>`),
        figure(crop(after, m.center, half), `${name} · <span class="new">new, clipped: ${(score.next * 100).toFixed(0)}% fit</span>`),
        figure(crop(real, m.center, half), `${name} · <span class="new">live pipeline (realistic)</span> · ${refineNote}`),
        figure(crop(base, m.center, half), `${name} · original photo`)
      );
    }
  }

  const avg = (k: keyof Result) => (results.reduce((s, r) => s + r[k], 0) / Math.max(1, results.length)) * 100;
  document.getElementById('summary')!.innerHTML = results.length
    ? `Average fit over ${results.length} eyes: old <b class="old">${avg('old').toFixed(0)}%</b> → new <b class="new">${avg('next').toFixed(0)}%</b>`
    : 'No eyes measured.';
  status.textContent = 'Done';
  (window as any).__lensFit = { results, old: avg('old'), next: avg('next') };
}

const start = (photos: string[]) =>
  run(photos).catch(e => {
    document.getElementById('status')!.textContent = `Error: ${(e as Error).message}`;
    console.error(e);
  });

document.getElementById('pick')!.addEventListener('change', e => {
  const files = [...((e.target as HTMLInputElement).files ?? [])];
  if (files.length) start(files.map(f => URL.createObjectURL(f)));
});

start(PHOTOS);
