# BETO Luxury Lenses

A mobile-first web app for BETO, a luxury contact lens brand: browse the collections and try lenses on live through the front camera.

## Stack

- React 19 + TypeScript, built with Vite
- MediaPipe Tasks `FaceLandmarker` (`@mediapipe/tasks-vision`, pinned) for iris tracking and blink blendshapes
- Tailwind (CDN) for styling
- Vitest for tests

## Getting started

Requires Node 20+ (22 recommended, see `.nvmrc`).

```bash
npm install
cp .env.example .env.local   # optional, only GEMINI_API_KEY lives here
npm run dev                  # http://localhost:3000
```

The try-on screen needs camera access, which browsers only grant on `localhost` or HTTPS. To test on a phone, use an HTTPS tunnel or deploy a preview.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server on port 3000 |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Run the unit tests once |
| `npm run check` | Typecheck, test and build (what CI runs) |

## Project layout

```
App.tsx              View routing and custom-lens state
constants.tsx        Lens catalogue, collections and image URLs
types.ts             Shared types
components/          Screens and UI pieces
  TryOnScreen.tsx    Camera, FaceLandmarker setup and the per-frame render
engine/              AR helpers shared by web and mobile (unit tested)
  index.ts           Platform-free core (safe to import from React Native)
  landmarks.ts       Face-mesh indices for each eye (iris, lids, corners, eye-opening outline) + blendshapes
  geometry.ts        Distances, point-in-polygon, object-fit: cover math, landmark mapping
  filters.ts         One Euro filter for jitter-free, low-lag smoothing
  eye.ts             Measure an eye (MediaPipe or ML Kit outline) + EyeTracker smoothing/blinks
  lens-style.ts      The lens look (colors, ring, pupil, glare) used by both renderers
  fit.ts             Lens fit score: overlap of painted lens vs visible iris
  web.ts             Browser-only exports:
  face-landmarker.ts   creates FaceLandmarker (GPU, CPU fallback) and the per-video-frame loop
  mediapipe-assets.ts  pinned WASM and model URLs
  lens-renderer.ts     draws the lens on a canvas (clipped, realistic blending)
  capture.ts           watermarking, share sheet and download fallback
mobile/              Expo React Native app, see mobile/README.md
dev/lens-fit.html    Dev-only page: old vs new lens fit on face photos
```

### How the try-on engine works

1. `onVideoFrames` (`requestVideoFrameCallback`, with a `requestAnimationFrame` fallback) fires once per new camera frame. FaceLandmarker runs on that frame and returns 478 normalized landmarks plus blendshapes, and the same frame is then drawn, so the lens never trails the eye and the smoothing filters get exactly one sample per detection.
2. The mirrored video is drawn with `object-fit: cover` math (`coverRect`), and landmarks are mapped through the same rect so lenses line up with the eyes.
3. `measureMediaPipeEye` reads the iris (center averaged over 5 points, diameter from the iris edge) and the eye-opening outline. One `EyeTracker` per eye hides the lens while that eye is closed (the `eyeBlink` blendshape, with hysteresis; lid gap / eye width when no blendshapes are available, as on mobile) and smooths position and size with a One Euro filter.
4. `drawLens` paints a limbal ring, a colored donut that leaves the pupil clear, and a glare highlight, sized to the iris and **clipped to the eye opening** so nothing lands on the eyelids. In realistic mode the edge is feathered, the upper lid casts a shadow, and the tint is blended so the eye's own iris texture shows through.

Tuning knobs live in `EyeTrackerOptions` (`irisScale`, filter cutoffs), the constants at the top of `engine/lens-renderer.ts`, and `LENS_OPACITY` in `TryOnScreen.tsx`.

### Checking lens fit

Run `npm run dev` and open http://localhost:3000/dev/lens-fit.html. It runs the real FaceLandmarker on face photos (put them in `dev/fixtures/`, which is gitignored, or pick files on the page) and shows the old engine, the new clipped lens, realistic mode and the original photo side by side with a fit score.

## Deployment

Hosted on Netlify. [netlify.toml](netlify.toml) sets the build (`npm run build` → `dist`, Node 22), the SPA fallback, and headers (camera allowed for this origin only, long caching for `/assets`). Netlify serves over HTTPS, which the camera requires.

## Contributing

Work on a branch and open a pull request against `main`. CI runs `typecheck`, `test` and `build` on every PR.
