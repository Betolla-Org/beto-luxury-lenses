import { RefObject, useEffect, useMemo, useRef, useState } from 'react';
import type { CameraOutput, CameraRef } from 'react-native-vision-camera';
import {
  createFaceDetectorOutput,
  transformFacesToPreviewCoordinates,
  type Face,
} from 'react-native-vision-camera-face-detector';
import { EyeState, EyeTracker, measureContourEye } from '../../../engine';

const EYES = ['LEFT_EYE', 'RIGHT_EYE'] as const;

/**
 * Detects the face with ML Kit and turns its eye outlines into smoothed lens
 * positions in Camera-view coordinates (engine/EyeTracker: One Euro smoothing + blink hiding).
 *
 * Returns the camera output to attach to `<Camera outputs>` (created once, so the
 * session is never reconfigured on re-render) and the eyes to draw.
 */
export function useEyeTracking(cameraRef: RefObject<CameraRef | null>, sizeAdjustment: number) {
  const [eyes, setEyes] = useState<EyeState[]>([]);
  const [faceFound, setFaceFound] = useState(false);

  const trackers = useRef({ LEFT_EYE: new EyeTracker(), RIGHT_EYE: new EyeTracker() });
  const sizeRef = useRef(sizeAdjustment);
  useEffect(() => {
    sizeRef.current = sizeAdjustment;
  }, [sizeAdjustment]);

  const output: CameraOutput = useMemo(() => {
    const lose = () => {
      trackers.current.LEFT_EYE.reset();
      trackers.current.RIGHT_EYE.reset();
      setEyes(prev => (prev.length ? [] : prev));
      setFaceFound(false);
    };

    return createFaceDetectorOutput({
      performanceMode: 'fast',
      runContours: true,
      cameraFacing: 'front',
      // Must match the <Camera mirrorMode> so preview coordinates line up
      mirrorMode: 'auto',
      autoMode: true,
      onFacesDetected(faces: Face[]) {
        const camera = cameraRef.current;
        if (faces.length === 0 || camera?.preview == null) return lose();

        const [face] = transformFacesToPreviewCoordinates(faces.slice(0, 1), camera);
        const now = performance.now();
        const next: EyeState[] = [];
        for (const key of EYES) {
          const eye = trackers.current[key].update(measureContourEye(face.contours?.[key] ?? []), sizeRef.current, now);
          if (eye) next.push(eye);
        }
        setEyes(next);
        setFaceFound(true);
      },
      onError(error: Error) {
        console.warn('Face detection failed:', error);
        lose();
      },
    });
    // The output must be created once; everything it reads is held in refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { output, eyes, faceFound };
}
