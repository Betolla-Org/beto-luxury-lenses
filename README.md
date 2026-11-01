# BETO Luxury Lenses

A mobile-first web app for BETO, a luxury contact lens brand: browse the collections and try lenses on live through the front camera.

## Stack

- React 19 + TypeScript, built with Vite
- MediaPipe FaceMesh (loaded from CDN in `index.html`) for iris tracking
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
  TryOnScreen.tsx    Camera, FaceMesh setup and the render loop
engine/              Framework-free AR helpers (unit tested)
  landmarks.ts       FaceMesh indices for each eye (iris, lids, corners)
  geometry.ts        Distances, object-fit: cover math, landmark to canvas mapping
  filters.ts         One Euro filter for jitter-free, low-lag smoothing
  eye.ts             EyeTracker: blink detection + smoothed lens position/size
  color.ts           Hex parsing and color shifting
  lens-renderer.ts   Draws the tinted lens on a canvas
  capture.ts         Watermarking, share sheet and download fallback
```

### How the try-on engine works

1. MediaPipe FaceMesh (with `refineLandmarks`) returns 478 normalized landmarks per frame.
2. Each frame the mirrored video is drawn with `object-fit: cover` math (`coverRect`), and landmarks are mapped through the same rect so lenses line up with the eyes.
3. One `EyeTracker` per eye measures the iris diameter, hides the lens while that eye is closed (lid gap / eye width, with hysteresis), and smooths position and size with a One Euro filter.
4. `drawLens` paints a limbal ring, a colored donut that leaves the pupil clear, and a glare highlight.

Tuning knobs live in `EyeTrackerOptions` (`irisScale`, filter cutoffs) and `LENS_OPACITY` in `TryOnScreen.tsx`.

## Contributing

Work on a branch and open a pull request against `main`. CI runs `typecheck`, `test` and `build` on every PR.
