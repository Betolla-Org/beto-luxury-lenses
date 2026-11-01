// MediaPipe face landmark indices (478-point mesh: FaceLandmarker, or FaceMesh with refineLandmarks, includes the iris points 468-477).
// "Right"/"left" are the subject's own eyes, matching MediaPipe's FACEMESH_RIGHT_EYE / FACEMESH_LEFT_EYE.

export interface EyeIndices {
  iris: { center: number; top: number; bottom: number; left: number; right: number };
  lids: { top: number; bottom: number };
  corners: { inner: number; outer: number };
  /** The eye opening (lid margin) in drawing order; the lens is clipped to it. */
  outline: number[];
  /** FaceLandmarker blendshape that scores this eye's blink (named for the subject's own eye, on unmirrored input). */
  blinkBlendshape: 'eyeBlinkRight' | 'eyeBlinkLeft';
}

export const RIGHT_EYE: EyeIndices = {
  iris: { center: 468, top: 470, bottom: 472, left: 471, right: 469 },
  lids: { top: 159, bottom: 145 },
  corners: { inner: 133, outer: 33 },
  outline: [33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7],
  blinkBlendshape: 'eyeBlinkRight',
};

export const LEFT_EYE: EyeIndices = {
  iris: { center: 473, top: 475, bottom: 477, left: 474, right: 476 },
  lids: { top: 386, bottom: 374 },
  corners: { inner: 362, outer: 263 },
  outline: [362, 398, 384, 385, 386, 387, 388, 466, 263, 249, 390, 373, 374, 380, 381, 382],
  blinkBlendshape: 'eyeBlinkLeft',
};

/** A FaceLandmarker blendshape category (only the fields the engine reads). */
export interface BlendshapeCategory {
  categoryName: string;
  score: number;
}

/** Turns FaceLandmarker's blendshape list into a name -> score (0-1) lookup. */
export const blendshapeScores = (categories: BlendshapeCategory[] | undefined): Record<string, number> => {
  const scores: Record<string, number> = {};
  for (const c of categories ?? []) scores[c.categoryName] = c.score;
  return scores;
};
