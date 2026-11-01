// Browser-only. Face detection for the live try-on, run in a Web Worker when the browser allows it.
import type { Point } from './geometry';
import type { BlendshapeCategory } from './landmarks';

/** One camera frame and what FaceLandmarker found in it. */
export interface DetectedFrame {
  /** The exact image the landmarks belong to. Draw this, not the live video, so lens and eye match. */
  image: CanvasImageSource;
  width: number;
  height: number;
  /** The 478 normalized landmarks of the first face, or null when no face was found. */
  landmarks: Point[] | null;
  blendshapes: BlendshapeCategory[];
  /** Frees the frame (closes its ImageBitmap). Call once it has been drawn. */
  release(): void;
}

export interface FaceDetector {
  /** 'worker': detection never blocks the UI. 'main-thread': the fallback. */
  readonly mode: 'worker' | 'main-thread';
  /**
   * Detects on the video's current frame. Resolves to null when the previous frame is still
   * being processed: that frame is skipped rather than queued, so lag never builds up.
   * `timeMs` must increase strictly between calls.
   */
  detect(video: HTMLVideoElement, timeMs: number): Promise<DetectedFrame | null>;
  close(): void;
}

// Messages between the page and engine/face-worker.ts
export type WorkerRequest =
  | { type: 'init' }
  | { type: 'detect'; id: number; bitmap: ImageBitmap; timeMs: number }
  | { type: 'close' };

export type WorkerResponse =
  | { type: 'ready' }
  | { type: 'failed'; message: string }
  | {
      type: 'result';
      id: number;
      bitmap: ImageBitmap;
      landmarks: Point[] | null;
      blendshapes: BlendshapeCategory[];
      error?: string;
    };

const canUseWorker = () =>
  typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap === 'function';

/** FaceLandmarker in a Web Worker. Rejects if the worker cannot start or load the model. */
const createWorkerDetector = () =>
  new Promise<FaceDetector>((resolve, reject) => {
    const worker = new Worker(new URL('./face-worker.ts', import.meta.url), { type: 'module' });
    const pending = new Map<number, (response: Extract<WorkerResponse, { type: 'result' }> | null) => void>();
    let ready = false;
    let busy = false;
    let nextId = 0;

    const fail = (message: string) => {
      // Unblock anything in flight so the render loop does not stall forever
      for (const settle of pending.values()) settle(null);
      pending.clear();
      if (!ready) {
        worker.terminate();
        reject(new Error(message));
      } else {
        console.error('Face detection worker failed:', message);
      }
    };

    worker.onerror = event => {
      event.preventDefault();
      fail(event.message || 'worker error');
    };
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      if (message.type === 'ready') {
        ready = true;
        resolve(detector);
      } else if (message.type === 'failed') {
        fail(message.message);
      } else {
        pending.get(message.id)?.(message);
        pending.delete(message.id);
      }
    };

    const detector: FaceDetector = {
      mode: 'worker',
      async detect(video, timeMs) {
        if (busy) return null;
        busy = true;
        try {
          const bitmap = await createImageBitmap(video);
          const id = nextId++;
          const response = await new Promise<Extract<WorkerResponse, { type: 'result' }> | null>(settle => {
            pending.set(id, settle);
            worker.postMessage({ type: 'detect', id, bitmap, timeMs } satisfies WorkerRequest, [bitmap]);
          });
          if (!response) return null;
          if (response.error) console.error('Face detection failed on this frame:', response.error);
          const frame = response.bitmap;
          return {
            image: frame,
            width: frame.width,
            height: frame.height,
            landmarks: response.landmarks,
            blendshapes: response.blendshapes,
            release: () => frame.close(),
          };
        } finally {
          busy = false;
        }
      },
      close() {
        for (const settle of pending.values()) settle(null);
        pending.clear();
        worker.postMessage({ type: 'close' } satisfies WorkerRequest);
      },
    };

    worker.postMessage({ type: 'init' } satisfies WorkerRequest);
  });

/** FaceLandmarker on the main thread: the fallback. MediaPipe is only downloaded if this is needed. */
const createMainThreadDetector = async (): Promise<FaceDetector> => {
  const { createFaceLandmarker } = await import('./face-landmarker');
  const landmarker = await createFaceLandmarker('VIDEO');
  return {
    mode: 'main-thread',
    async detect(video, timeMs) {
      let result;
      try {
        result = landmarker.detectForVideo(video, timeMs);
      } catch (e) {
        console.error('Face detection failed on this frame:', e);
      }
      return {
        image: video,
        width: video.videoWidth,
        height: video.videoHeight,
        landmarks: result?.faceLandmarks[0] ?? null,
        blendshapes: result?.faceBlendshapes[0]?.categories ?? [],
        release: () => {},
      };
    },
    close: () => landmarker.close(),
  };
};

/** Creates the face detector: in a Web Worker when possible, otherwise on the main thread. */
export const createFaceDetector = async (): Promise<FaceDetector> => {
  if (canUseWorker()) {
    try {
      return await createWorkerDetector();
    } catch (e) {
      console.warn('Face detection worker unavailable, running on the main thread instead:', e);
    }
  }
  return createMainThreadDetector();
};

/**
 * Calls `callback` once for every new frame the video presents. Uses requestVideoFrameCallback
 * where available, otherwise requestAnimationFrame and skips ticks where the frame has not changed.
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

/**
 * Asks the camera for continuous autofocus, exposure and white balance where it supports them
 * (phones often start in a fixed mode), and returns what it actually delivers.
 */
export const tuneCamera = async (track: MediaStreamTrack) => {
  // These modes are in the Media Capture spec but not yet in TypeScript's DOM types
  const capabilities = (track.getCapabilities?.() ?? {}) as Record<string, unknown>;
  const wanted: Record<string, string> = {};
  for (const mode of ['focusMode', 'exposureMode', 'whiteBalanceMode']) {
    const supported = capabilities[mode];
    if (Array.isArray(supported) && supported.includes('continuous')) wanted[mode] = 'continuous';
  }
  if (Object.keys(wanted).length) {
    try {
      await track.applyConstraints({ advanced: [wanted as MediaTrackConstraintSet] });
    } catch (e) {
      console.warn('Camera tuning not applied:', e);
    }
  }
  return track.getSettings();
};
