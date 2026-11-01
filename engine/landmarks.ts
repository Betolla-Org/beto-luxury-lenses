// MediaPipe FaceMesh indices (refineLandmarks: true adds the iris points 468-477).
// "Right"/"left" are the subject's own eyes, matching MediaPipe's FACEMESH_RIGHT_EYE / FACEMESH_LEFT_EYE.

export interface EyeIndices {
  iris: { center: number; top: number; bottom: number; left: number; right: number };
  lids: { top: number; bottom: number };
  corners: { inner: number; outer: number };
  /** The eye opening (lid margin) in drawing order; the lens is clipped to it. */
  outline: number[];
}

export const RIGHT_EYE: EyeIndices = {
  iris: { center: 468, top: 470, bottom: 472, left: 471, right: 469 },
  lids: { top: 159, bottom: 145 },
  corners: { inner: 133, outer: 33 },
  outline: [33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7],
};

export const LEFT_EYE: EyeIndices = {
  iris: { center: 473, top: 475, bottom: 477, left: 474, right: 476 },
  lids: { top: 386, bottom: 374 },
  corners: { inner: 362, outer: 263 },
  outline: [362, 398, 384, 385, 386, 387, 388, 466, 263, 249, 390, 373, 374, 380, 381, 382],
};
