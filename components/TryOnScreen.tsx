
import React, { useState, useRef, useEffect } from 'react';
import { Lens } from '../types';
import { LENSES } from '../constants';
import {
  EyeMeasurement,
  EyeState,
  FaceTracker,
  OneEuroFilter,
  QUALITY_LANDMARKS,
  QualityIssue,
  QualityMonitor,
  applyIrisRefinement,
  blendshapeScores,
  headYaw,
  lensLighting,
  meanLuminance,
  refineIris,
  trueIrisDiameter,
  LEFT_EYE,
  RIGHT_EYE,
  Point,
  clamp,
  coverRect,
  mapLandmark,
  measureMediaPipeEye,
} from '../engine';
import { DetectedFrame, FaceDetector, addWatermark, createFaceDetector, drawLens, onVideoFrames, shareImage, tuneCamera } from '../engine/web';

// --- CONFIGURATION ---
const LENS_OPACITY = 0.65; // 35% transparent (65% opaque) so color shows properly
const MIN_SIZE = 0.8;
const MAX_SIZE = 1.3;
/** Canvas pixels per CSS pixel: sharp on high-density screens, capped so phones keep their frame rate. */
const MAX_PIXEL_RATIO = 2;
/** Longest side of a captured photo. */
const MAX_CAPTURE_SIDE = 4096;

/**
 * With ?trace in the URL, every tracked frame is recorded in window.__betoTrace: the raw
 * (refined, unsmoothed) iris and the lens drawn, per eye. scripts/eval-engine.mjs reads it to
 * measure jitter and lag. Off by default, so it costs nothing.
 */
const TRACE = typeof location !== 'undefined' && new URLSearchParams(location.search).has('trace');
const TRACE_LIMIT = 5000;
type TracePoint = { x: number; y: number; r: number } | null;
const recordTrace = (timeMs: number, raw: (EyeMeasurement | null)[], lens: (EyeState | null)[]) => {
  const w = window as unknown as { __betoTrace?: { t: number; raw: TracePoint[]; lens: TracePoint[] }[] };
  const trace = (w.__betoTrace ??= []);
  if (trace.length >= TRACE_LIMIT) return;
  trace.push({
    t: timeMs,
    raw: raw.map(m => m && { x: m.center.x, y: m.center.y, r: trueIrisDiameter(m) / 2 }),
    lens: lens.map(e => e && { x: e.x, y: e.y, r: e.radius }),
  });
};

/** What to tell the user when the shot hurts tracking (engine/quality.ts). */
const HINTS: Record<QualityIssue, { icon: string; text: string }> = {
  MORE_LIGHT: { icon: 'light_mode', text: 'Find more light' },
  MOVE_CLOSER: { icon: 'zoom_in', text: 'Move a little closer' },
  MOVE_BACK: { icon: 'zoom_out', text: 'Move back a little' },
  FACE_CAMERA: { icon: 'face', text: 'Face the camera' },
};

interface TryOnScreenProps {
  lens: Lens;
  onBack: () => void;
  /** Lenses offered in the swatch strip. Defaults to the built-in catalogue. */
  lenses?: Lens[];
}

const TryOnScreen: React.FC<TryOnScreenProps> = ({ lens: initialLens, onBack, lenses = LENSES }) => {
  const [currentLens, setCurrentLens] = useState<Lens>(initialLens);
  const currentLensRef = useRef(initialLens); // Ref to hold the latest lens for the animation loop
  const [cameraState, setCameraState] = useState<'LOADING' | 'READY' | 'ERROR' | 'PERMISSION_DENIED'>('LOADING');
  const [trackingStatus, setTrackingStatus] = useState<'SEARCHING' | 'LOCKED'>('SEARCHING');
  const [hint, setHint] = useState<QualityIssue | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [sizeAdjustment, setSizeAdjustment] = useState(1.0);
  const [showInstruction, setShowInstruction] = useState(false);

  // Keep the ref in sync with the state to avoid stale closures in the render loop
  useEffect(() => {
    currentLensRef.current = currentLens;
  }, [currentLens]);

  // --- REFS ---
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Logic Refs
  // FaceLandmarker needs strictly increasing timestamps
  const lastDetectTimeRef = useRef(0);
  // Set by the shutter; the next rendered frame is then also rendered at full camera resolution
  const captureRequestedRef = useRef(false);

  // Smoothing, shared iris size and blink state for both eyes, kept outside React so the render loop never re-renders
  const faceTracker = useRef(new FaceTracker());
  // Light around the eyes, smoothed over seconds: drives the lens pupil, glare and cover (engine/lighting.ts)
  const luminanceFilter = useRef(new OneEuroFilter(0.3, 0));
  const lightingRef = useRef(lensLighting(128));
  const qualityMonitor = useRef(new QualityMonitor());
  // The render loop is started once, so it reads the size through a ref, not the stale state
  const sizeAdjustmentRef = useRef(sizeAdjustment);
  useEffect(() => {
    sizeAdjustmentRef.current = sizeAdjustment;
  }, [sizeAdjustment]);

  const handleSizeChange = (delta: number) => {
    setSizeAdjustment(prev => clamp(prev + delta, MIN_SIZE, MAX_SIZE));
  };

  // --- INITIALIZATION ---
  useEffect(() => {
    // Local, not a ref: under StrictMode the first mount's async setup must see its own cancellation
    let cancelled = false;
    let stream: MediaStream | null = null;
    let detector: FaceDetector | null = null;
    let stopFrames: (() => void) | null = null;

    const startApp = async () => {
      const video = videoRef.current;
      if (!video || !navigator.mediaDevices?.getUserMedia) {
        setCameraState('ERROR');
        return;
      }

      // Load the model (in a worker when possible) while the user answers the camera prompt
      const detectorPromise = createFaceDetector();
      detectorPromise.then(d => (cancelled ? d.close() : (detector = d)), () => {});

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          // 1080p where the camera has it: more pixels across the iris and sharper photos
          video: { facingMode: 'user', width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
        });
        if (cancelled) return;
        video.srcObject = stream;
        await video.play();
        const settings = await tuneCamera(stream.getVideoTracks()[0]);
        console.info('Camera:', settings.width, 'x', settings.height, '@', settings.frameRate, 'fps');
      } catch (e: any) {
        if (cancelled) return;
        console.error('Camera Error:', e);
        setCameraState(e?.name === 'NotAllowedError' ? 'PERMISSION_DENIED' : 'ERROR');
        return;
      }

      let ready: FaceDetector;
      try {
        ready = await detectorPromise;
      } catch (e) {
        if (!cancelled) {
          console.error('Face tracking failed to load:', e);
          setCameraState('ERROR');
        }
        return;
      }
      if (cancelled) return;
      console.info('Face tracking runs on the', ready.mode);
      setCameraState('READY');
      stopFrames = onVideoFrames(video, timeMs => {
        const detectTime = Math.max(timeMs, lastDetectTimeRef.current + 1);
        lastDetectTimeRef.current = detectTime;
        ready.detect(video, detectTime).then(frame => {
          if (!frame) return; // still busy with an earlier frame: skipped
          try {
            if (!cancelled) renderFrame(frame, detectTime);
          } finally {
            frame.release();
          }
        }, e => console.error('Face detection failed:', e));
      });
    };

    startApp();

    return () => {
      cancelled = true;
      stopFrames?.();
      stream?.getTracks().forEach(track => track.stop());
      detector?.close();
    };
  }, []);

    // --- CAPTURE LOGIC ---
  useEffect(() => {
    if (countdown === null) return;
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    } else {
      captureFrame();
      setCountdown(null);
    }
  }, [countdown]);

  const startCaptureSequence = () => {
    if (countdown !== null || showInstruction) return;
    setShowInstruction(true);
  };
  
  const beginCountdown = () => {
    setShowInstruction(false);
    setCountdown(3);
  };

  // The photo is taken from the next frame the render loop draws (see captureAtFullResolution)
  const captureFrame = () => {
    captureRequestedRef.current = true;
  };

  const handleShare = () => {
    if (generatedImage) shareImage(generatedImage);
  };

  // --- RENDER LOOP ---
  /**
   * Sharpens the landmark measurements with the frame's own pixels: finds each iris edge
   * (engine/iris.ts), and measures the light around the eyes. Must run after the video frame
   * is drawn and before any lens is. Reads one pixel block covering both eyes, because every
   * canvas readback stalls the GPU.
   */
  const readPixels = (ctx: CanvasRenderingContext2D, eyes: (EyeMeasurement | null)[]) => {
    const found = eyes.filter((m): m is EyeMeasurement => !!m);
    if (!found.length) return { eyes };
    const reach = (m: EyeMeasurement) => Math.ceil(m.irisDiameter * 0.8) + 2;
    const x0 = Math.max(0, Math.floor(Math.min(...found.map(m => m.center.x - reach(m)))));
    const y0 = Math.max(0, Math.floor(Math.min(...found.map(m => m.center.y - reach(m)))));
    const x1 = Math.min(ctx.canvas.width, Math.ceil(Math.max(...found.map(m => m.center.x + reach(m)))));
    const y1 = Math.min(ctx.canvas.height, Math.ceil(Math.max(...found.map(m => m.center.y + reach(m)))));
    if (x1 - x0 < 8 || y1 - y0 < 8) return { eyes };
    const image = ctx.getImageData(x0, y0, x1 - x0, y1 - y0);
    const patch = { data: image.data, width: image.width, height: image.height, x: x0, y: y0 };
    return {
      eyes: eyes.map(m => m && applyIrisRefinement(m, refineIris(patch, { x: m.center.x, y: m.center.y, r: m.irisDiameter / 2 }, m.outline))),
      luminance: meanLuminance(patch),
    };
  };

  const paintLenses = (ctx: CanvasRenderingContext2D, eyes: (EyeState | null)[]) => {
      const color = currentLensRef.current.color;
      const light = lightingRef.current;
      for (const eye of eyes) {
          if (!eye) continue;
          drawLens(ctx, eye.x, eye.y, eye.radiusX, color, {
              opacity: LENS_OPACITY * eye.opacity,
              clip: eye.outline,
              realistic: true,
              radiusY: eye.radiusY,
              rotation: eye.rotation,
              pupilRatio: light.pupilRatio,
              glare: light.glare,
              cover: light.cover,
          });
      }
  };

  const trackFace = (
    ctx: CanvasRenderingContext2D,
    landmarks: Point[],
    blendshapes: Record<string, number>,
    timeMs: number,
    vW: number, vH: number, canvasW: number, canvasH: number
  ) => {
      const project = (lm: Point) => mapLandmark(lm, vW, vH, canvasW, canvasH);

      // Measure both eyes before painting anything, so the pixel reads only see the camera image
      const pixels = readPixels(ctx, [
          measureMediaPipeEye(landmarks, RIGHT_EYE, project, blendshapes),
          measureMediaPipeEye(landmarks, LEFT_EYE, project, blendshapes),
      ]);
      const [right, left] = pixels.eyes;
      if (pixels.luminance !== undefined) {
          lightingRef.current = lensLighting(luminanceFilter.current.filter(pixels.luminance, timeMs));
      }
      const eyes = faceTracker.current.update(right, left, sizeAdjustmentRef.current, timeMs);

      // Hints: enough light and iris detail, whole face in view, facing the camera?
      const measured = [right, left].filter((m): m is EyeMeasurement => !!m);
      const canvasPerVideoPixel = coverRect(vW, vH, canvasW, canvasH).width / vW;
      const { noseTip, cheekRight, cheekLeft, forehead, chin } = QUALITY_LANDMARKS;
      const outside = (p: Point) => p.x < 0 || p.y < 0 || p.x > canvasW || p.y > canvasH;
      const issue = qualityMonitor.current.update({
          luminance: pixels.luminance,
          irisPixels: measured.length
              ? measured.reduce((sum, m) => sum + trueIrisDiameter(m), 0) / measured.length / canvasPerVideoPixel
              : undefined,
          faceCropped: [cheekRight, cheekLeft, forehead, chin].some(i => landmarks[i] && outside(project(landmarks[i]))),
          yaw: landmarks[noseTip] && landmarks[cheekRight] && landmarks[cheekLeft]
              ? headYaw(landmarks[noseTip], landmarks[cheekRight], landmarks[cheekLeft])
              : undefined,
      }, timeMs);
      setHint(issue);
      if (TRACE) recordTrace(timeMs, [right, left], [eyes.right, eyes.left]);
      return [eyes.right, eyes.left];
  };

  /**
   * Renders the frame again at the camera's own resolution (when that is sharper than the screen
   * canvas) with the same lenses, and turns it into the watermarked photo.
   */
  const captureAtFullResolution = (frame: DetectedFrame, eyes: (EyeState | null)[], canvasW: number, canvasH: number) => {
    const canvasPerVideoPixel = coverRect(frame.width, frame.height, canvasW, canvasH).width / frame.width;
    const scale = Math.min(Math.max(1, 1 / canvasPerVideoPixel), MAX_CAPTURE_SIDE / Math.max(canvasW, canvasH));
    const photo = document.createElement('canvas');
    photo.width = Math.round(canvasW * scale);
    photo.height = Math.round(canvasH * scale);
    const ctx = photo.getContext('2d');
    if (!ctx) return;
    drawMirrored(ctx, frame, photo.width, photo.height);
    // Scale the lens geometry rather than the context, so the lens is painted at full detail too
    paintLenses(ctx, eyes.map(eye => eye && {
      ...eye,
      x: eye.x * scale,
      y: eye.y * scale,
      radius: eye.radius * scale,
      radiusX: eye.radiusX * scale,
      radiusY: eye.radiusY * scale,
      outline: eye.outline.map(p => ({ x: p.x * scale, y: p.y * scale })),
    }));
    const name = currentLensRef.current.name;
    addWatermark(photo.toDataURL('image/jpeg', 0.95), name).then(final => setGeneratedImage(final));
  };

  /** Draws the frame mirrored (selfie view) with object-fit: cover into a w x h canvas. */
  const drawMirrored = (ctx: CanvasRenderingContext2D, frame: DetectedFrame, w: number, h: number) => {
    const draw = coverRect(frame.width, frame.height, w, h);
    ctx.save();
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(frame.image, draw.x, draw.y, draw.width, draw.height);
    ctx.restore();
  };

  /**
   * Draws one detected frame: the exact image the face was found in, then its lenses, so the
   * lens can never trail the eye, and the trackers get exactly one sample per detection.
   */
  const renderFrame = (frame: DetectedFrame, timeMs: number) => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !container || !ctx || !frame.width || !frame.height) return;

    // Canvas pixels follow the screen's pixel density (capped). Resizing reallocates the buffer,
    // so only do it when the size actually changed.
    const pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    const canvasW = Math.round(container.clientWidth * pixelRatio);
    const canvasH = Math.round(container.clientHeight * pixelRatio);
    if (canvas.width !== canvasW) canvas.width = canvasW;
    if (canvas.height !== canvasH) canvas.height = canvasH;

    drawMirrored(ctx, frame, canvasW, canvasH);

    // setState with an unchanged string is a no-op, so this only re-renders on a status change
    let eyes: (EyeState | null)[];
    if (frame.landmarks) {
      setTrackingStatus('LOCKED');
      eyes = trackFace(ctx, frame.landmarks, blendshapeScores(frame.blendshapes), timeMs, frame.width, frame.height, canvasW, canvasH);
    } else {
      // Keep the last lenses briefly (fading) so one missed detection does not flash them off
      const held = faceTracker.current.lose(timeMs);
      eyes = [held.right, held.left];
      if (!held.right && !held.left) {
        qualityMonitor.current.reset();
        setHint(null);
        setTrackingStatus('SEARCHING');
      }
    }
    paintLenses(ctx, eyes);

    if (captureRequestedRef.current) {
      captureRequestedRef.current = false;
      captureAtFullResolution(frame, eyes, canvasW, canvasH);
    }
  };

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col overflow-hidden">
      
      <div className="relative flex-1 bg-neutral-900 overflow-hidden" ref={containerRef}>
        <video ref={videoRef} autoPlay playsInline muted className="absolute opacity-0 pointer-events-none w-1 h-1" />
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block z-10" />

        {cameraState === 'LOADING' && (
           <div className="absolute inset-0 flex flex-col items-center justify-center z-20 bg-black text-luxury-gold">
               <span className="material-symbols-outlined text-5xl animate-spin mb-4">settings_suggest</span>
               <p className="text-xs font-bold tracking-widest">INITIALIZING AI VISION...</p>
           </div>
        )}
        {cameraState === 'PERMISSION_DENIED' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-50 bg-luxury-black/95 text-center p-8 animate-in fade-in">
                <span className="material-symbols-outlined text-6xl text-red-500/80 mb-6">videocam_off</span>
                <h2 className="text-luxury-gold text-2xl font-serif font-bold mb-3">Camera Access Needed</h2>
                <p className="text-white/60 text-sm mb-8 leading-relaxed max-w-xs mx-auto">
                    BETO requires camera access. Please enable permissions and try again.
                </p>
                <button onClick={() => window.location.reload()} className="gold-gradient text-luxury-black font-bold py-4 px-10 rounded-xl uppercase tracking-widest shadow-lg hover:scale-105 transition-transform">Try Again</button>
                <button onClick={onBack} className="mt-6 text-white/40 text-xs font-bold uppercase tracking-widest hover:text-white">Return Home</button>
            </div>
        )}
        {cameraState === 'READY' && trackingStatus === 'SEARCHING' && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
                <div className="border-2 border-white/20 w-48 h-64 rounded-[50%] animate-pulse relative">
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 -mt-8 text-white/50 text-xs font-bold uppercase tracking-widest">Position Face</div>
                </div>
            </div>
        )}
        {showInstruction && (
            <div className="absolute inset-0 z-[55] flex flex-col items-center justify-center bg-luxury-black/90 backdrop-blur-md p-8 text-center animate-in fade-in">
                <span className="material-symbols-outlined text-7xl text-luxury-gold mb-6">
                    center_focus_strong
                </span>
                <h2 className="text-white text-2xl font-serif font-bold mb-4">
                    استعد لالتقاط الصورة!
                </h2>
                <p className="text-white/70 text-base leading-relaxed max-w-xs mx-auto mb-8">
                    يرجى تثبيت الوجه وتوسيع العينين للحصول على أفضل نتيجة.
                </p>
                <button 
                    onClick={beginCountdown}
                    className="gold-gradient text-luxury-black font-bold py-4 px-12 rounded-xl uppercase tracking-widest shadow-lg shadow-luxury-gold/20 hover:scale-105 transition-transform"
                >
                    موافق، لنبدأ
                </button>
            </div>
        )}
        {countdown !== null && countdown > 0 && (
          <div className="absolute inset-0 flex items-center justify-center z-50 bg-black/20 backdrop-blur-[2px]">
            <div className="text-[120px] font-black text-white drop-shadow-[0_0_20px_rgba(212,175,55,0.8)] animate-bounce font-serif">{countdown}</div>
          </div>
        )}
      </div>

      <div className="absolute top-0 left-0 right-0 p-4 z-40 flex justify-between items-center bg-gradient-to-b from-black/80 to-transparent h-24 pointer-events-none">
        <button onClick={onBack} className="pointer-events-auto w-10 h-10 rounded-full bg-white/10 backdrop-blur border border-white/20 flex items-center justify-center text-white"><span className="material-symbols-outlined">arrow_back</span></button>
        <div className="text-center">
            <h3 className="text-luxury-gold font-serif font-bold tracking-widest text-lg drop-shadow-md">{currentLens.name}</h3>
            <div className="flex items-center justify-center gap-2">
                <div className={`w-2 h-2 rounded-full ${trackingStatus === 'LOCKED' ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`}></div>
                <p className="text-white/50 text-[10px] uppercase">{trackingStatus === 'LOCKED' ? 'LIVE TRACKING' : 'SEARCHING...'}</p>
            </div>
            {hint && trackingStatus === 'LOCKED' && (
                <div role="status" className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-black/50 backdrop-blur border border-luxury-gold/40 px-3 py-1 text-luxury-gold text-[11px] font-bold tracking-wider">
                    <span className="material-symbols-outlined text-[14px] leading-none">{HINTS[hint].icon}</span>
                    {HINTS[hint].text}
                </div>
            )}
        </div>
        <div className="w-10 h-10"></div>
      </div>

      {/* --- Size Adjustment Controls --- */}
      <div className="absolute right-4 top-1/2 -translate-y-1/2 z-40 flex flex-col items-center gap-4">
        <button onClick={() => handleSizeChange(0.02)} className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-md border border-white/20 text-white text-xl font-bold flex items-center justify-center active:scale-95 transition-transform">+</button>
        <div className="w-1 h-8 bg-white/10 rounded-full">
            <div className="h-full bg-luxury-gold rounded-full" style={{transform: `scaleY(${(sizeAdjustment - 0.8) / (1.3 - 0.8)})`, transformOrigin: 'bottom'}}></div>
        </div>
        <button onClick={() => handleSizeChange(-0.02)} className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-md border border-white/20 text-white text-2xl font-bold flex items-center justify-center active:scale-95 transition-transform">-</button>
      </div>

      <div className="absolute bottom-36 left-0 right-0 z-40 flex justify-center pointer-events-none">
          <button onClick={startCaptureSequence} disabled={countdown !== null || showInstruction || trackingStatus !== 'LOCKED'} className="pointer-events-auto w-20 h-20 rounded-full border-[4px] border-white/30 bg-white/10 backdrop-blur-sm flex items-center justify-center relative active:scale-95 transition-all hover:bg-white/20 disabled:opacity-50 disabled:scale-100">
              <div className="w-16 h-16 bg-white rounded-full border-[3px] border-black shadow-lg flex items-center justify-center">
                 <span className="material-symbols-outlined text-black text-3xl">photo_camera</span>
              </div>
          </button>
      </div>

      <div className="bg-luxury-surface border-t border-white/10 p-5 z-40 relative">
          <div className="flex justify-between items-end mb-3">
             <p className="text-white/40 text-[10px] uppercase font-bold tracking-widest">COLLECTION: {currentLens.collection}</p>
             <p className="text-luxury-gold text-xs font-serif">{currentLens.name}</p>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
              {lenses.map(l => (
                  <button key={l.id} onClick={() => setCurrentLens(l)} className={`w-14 h-14 shrink-0 rounded-full border-2 p-0.5 relative transition-all ${currentLens.id === l.id ? 'border-luxury-gold scale-110' : 'border-transparent opacity-50'}`}>
                      <div className="w-full h-full rounded-full overflow-hidden relative shadow-lg" style={{ backgroundColor: l.color }}>
                          <div className="absolute inset-0 bg-gradient-to-br from-white/30 via-transparent to-black/20"></div>
                      </div>
                  </button>
              ))}
          </div>
      </div>
      
      {generatedImage && (
        <div className="fixed inset-0 z-[60] bg-black/95 backdrop-blur-xl flex flex-col items-center justify-center p-6 animate-in fade-in duration-300">
           <div className="w-full max-w-sm bg-luxury-surface rounded-[2rem] overflow-hidden shadow-2xl border border-luxury-gold/30 flex flex-col max-h-[90vh]">
              <div className="relative flex-1 overflow-hidden bg-black">
                <img src={generatedImage} alt="Result" className="w-full h-full object-contain" />
              </div>
              
              <div className="p-5 flex flex-col gap-3 bg-luxury-surface border-t border-white/5">
                <button onClick={handleShare} className="w-full gold-gradient text-luxury-black font-black py-4 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-luxury-gold/20 active:scale-95 transition-transform">
                  <span className="material-symbols-outlined">share</span>
                  <span className="tracking-widest text-sm">مشاركة الصورة</span>
                </button>
                <button onClick={() => setGeneratedImage(null)} className="w-full py-4 rounded-xl border border-white/10 text-white/60 uppercase text-xs font-bold hover:bg-white/5 hover:text-white transition-colors">إغلاق / التقاط صورة أخرى</button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default TryOnScreen;
