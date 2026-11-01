import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { FACE_LANDMARKER_MODEL_URL, TASKS_VISION_WASM_URL } from './mediapipe-assets';

export type { FaceLandmarker, FaceLandmarkerResult } from '@mediapipe/tasks-vision';

const MIN_CONFIDENCE = 0.6;

/**
 * Creates a MediaPipe FaceLandmarker for one face, with blendshapes (used for blink detection).
 * Tries the GPU first and falls back to the CPU on devices without usable WebGL.
 * Works on the main thread and in a Web Worker (see ./face-worker.ts).
 *
 * - 'VIDEO': call `detectForVideo(frame, timestampMs)` once per video frame, timestamps strictly increasing.
 * - 'IMAGE': call `detect(image)` on still photos.
 */
export const createFaceLandmarker = async (
  runningMode: 'VIDEO' | 'IMAGE' = 'VIDEO',
  { inModuleWorker = false } = {}
): Promise<FaceLandmarker> => {
  // A module worker cannot run the classic WASM loader script; MediaPipe ships an ES module build of it
  const fileset = await FilesetResolver.forVisionTasks(TASKS_VISION_WASM_URL, inModuleWorker);
  const create = (delegate: 'GPU' | 'CPU') =>
    FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: FACE_LANDMARKER_MODEL_URL, delegate },
      runningMode,
      numFaces: 1,
      outputFaceBlendshapes: true,
      minFaceDetectionConfidence: MIN_CONFIDENCE,
      minFacePresenceConfidence: MIN_CONFIDENCE,
      minTrackingConfidence: MIN_CONFIDENCE,
    });

  try {
    return await create('GPU');
  } catch (e) {
    console.warn('FaceLandmarker: GPU delegate unavailable, falling back to CPU', e);
    return create('CPU');
  }
};
