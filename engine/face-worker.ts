/// <reference lib="webworker" />
// Runs MediaPipe FaceLandmarker off the main thread (see createFaceDetector in ./face-detector).
// Each frame arrives as an ImageBitmap and is sent back with its results, so the main thread
// draws exactly the image the landmarks belong to.
import type { FaceLandmarker } from '@mediapipe/tasks-vision';
import { createFaceLandmarker } from './face-landmarker';
import type { WorkerRequest, WorkerResponse } from './face-detector';

const scope = self as unknown as DedicatedWorkerGlobalScope;
let landmarker: FaceLandmarker | null = null;

const reply = (message: WorkerResponse, transfer: Transferable[] = []) => scope.postMessage(message, transfer);

scope.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;

  if (message.type === 'init') {
    try {
      landmarker = await createFaceLandmarker('VIDEO', { inModuleWorker: true });
      reply({ type: 'ready' });
    } catch (e) {
      reply({ type: 'failed', message: String((e as Error)?.message ?? e) });
    }
    return;
  }

  if (message.type === 'detect') {
    const { id, bitmap, timeMs } = message;
    try {
      const result = landmarker!.detectForVideo(bitmap, timeMs);
      reply(
        {
          type: 'result',
          id,
          bitmap,
          landmarks: result.faceLandmarks[0]?.map(({ x, y }) => ({ x, y })) ?? null,
          blendshapes: result.faceBlendshapes[0]?.categories.map(({ categoryName, score }) => ({ categoryName, score })) ?? [],
        },
        [bitmap]
      );
    } catch (e) {
      reply({ type: 'result', id, bitmap, landmarks: null, blendshapes: [], error: String((e as Error)?.message ?? e) }, [bitmap]);
    }
    return;
  }

  if (message.type === 'close') {
    landmarker?.close();
    landmarker = null;
    scope.close();
  }
};
