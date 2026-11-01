import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { FACE_LANDMARKER_MODEL_URL, TASKS_VISION_WASM_URL } from './mediapipe-assets';

export type { FaceLandmarker, FaceLandmarkerResult } from '@mediapipe/tasks-vision';

const MIN_CONFIDENCE = 0.6;

/**
 * Creates a MediaPipe FaceLandmarker for one face, with blendshapes (used for blink detection).
 * Tries the GPU first and falls back to the CPU on devices without usable WebGL.
 *
 * - 'VIDEO': call `detectForVideo(video, timestampMs)` once per video frame, timestamps strictly increasing.
 * - 'IMAGE': call `detect(image)` on still photos.
 */
export const createFaceLandmarker = async (runningMode: 'VIDEO' | 'IMAGE' = 'VIDEO'): Promise<FaceLandmarker> => {
  const fileset = await FilesetResolver.forVisionTasks(TASKS_VISION_WASM_URL);
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

/**
 * Calls `callback` once for every new frame the video presents, so detection and drawing
 * both work on that exact frame. Uses requestVideoFrameCallback where available, otherwise
 * requestAnimationFrame and skips ticks where the frame has not changed.
 * Returns a function that stops the loop.
 */
export const onVideoFrames = (video: HTMLVideoElement, callback: (timeMs: number) => void): (() => void) => {
  let stopped = false;

  if (typeof video.requestVideoFrameCallback === 'function') {
    let handle = 0;
    const tick = (now: number) => {
      if (stopped) return;
      callback(now);
      handle = video.requestVideoFrameCallback(tick);
    };
    handle = video.requestVideoFrameCallback(tick);
    return () => {
      stopped = true;
      video.cancelVideoFrameCallback(handle);
    };
  }

  let handle = 0;
  let lastFrameTime = -1;
  const tick = (now: number) => {
    if (stopped) return;
    if (video.readyState >= 2 && video.currentTime !== lastFrameTime) {
      lastFrameTime = video.currentTime;
      callback(now);
    }
    handle = requestAnimationFrame(tick);
  };
  handle = requestAnimationFrame(tick);
  return () => {
    stopped = true;
    cancelAnimationFrame(handle);
  };
};
