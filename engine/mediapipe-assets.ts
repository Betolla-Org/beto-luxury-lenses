// Where FaceLandmarker loads its runtime and model from. No imports, so tests can check it in Node.

/** Must match the exact @mediapipe/tasks-vision version in package.json (a test checks this). */
export const TASKS_VISION_VERSION = '1.1.1';

/** The WASM runtime, from the same package version as the JS bundle. */
export const TASKS_VISION_WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VISION_VERSION}/wasm`;

/** Face landmarker model (478 landmarks incl. iris, plus blendshapes), pinned to model version 1. */
export const FACE_LANDMARKER_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
