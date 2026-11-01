
import React, { useState, useRef, useEffect } from 'react';
import { Lens } from '../types';
import { LENSES } from '../constants';
import {
  EyeTracker,
  blendshapeScores,
  LEFT_EYE,
  RIGHT_EYE,
  Point,
  clamp,
  coverRect,
  mapLandmark,
  measureMediaPipeEye,
} from '../engine';
import { FaceLandmarker, addWatermark, createFaceLandmarker, drawLens, onVideoFrames, shareImage } from '../engine/web';

// --- CONFIGURATION ---
const LENS_OPACITY = 0.65; // 35% transparent (65% opaque) so color shows properly
const MIN_SIZE = 0.8;
const MAX_SIZE = 1.3;

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

  // Per-eye smoothing + blink state, kept outside React so the render loop never re-renders
  const eyeTrackers = useRef({
    right: new EyeTracker(),
    left: new EyeTracker(),
  });
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
    let landmarker: FaceLandmarker | null = null;
    let stopFrames: (() => void) | null = null;

    const startApp = async () => {
      const video = videoRef.current;
      if (!video || !navigator.mediaDevices?.getUserMedia) {
        setCameraState('ERROR');
        return;
      }

      // Load the model while the user answers the camera prompt
      const landmarkerPromise = createFaceLandmarker('VIDEO');
      landmarkerPromise.then(l => (cancelled ? l.close() : (landmarker = l)), () => {});

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        });
        if (cancelled) return;
        video.srcObject = stream;
        await video.play();
      } catch (e: any) {
        if (cancelled) return;
        console.error('Camera Error:', e);
        setCameraState(e?.name === 'NotAllowedError' ? 'PERMISSION_DENIED' : 'ERROR');
        return;
      }

      let ready: FaceLandmarker;
      try {
        ready = await landmarkerPromise;
      } catch (e) {
        if (!cancelled) {
          console.error('Face tracking failed to load:', e);
          setCameraState('ERROR');
        }
        return;
      }
      if (cancelled) return;
      setCameraState('READY');
      stopFrames = onVideoFrames(video, timeMs => renderFrame(ready, timeMs));
    };

    startApp();

    return () => {
      cancelled = true;
      stopFrames?.();
      stream?.getTracks().forEach(track => track.stop());
      landmarker?.close();
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

  const captureFrame = () => {
    if (!canvasRef.current) return;
    const dataUrl = canvasRef.current.toDataURL('image/jpeg', 0.95);
    addWatermark(dataUrl, currentLens.name).then(final => setGeneratedImage(final));
  };

  const handleShare = () => {
    if (generatedImage) shareImage(generatedImage);
  };

  // --- RENDER LOOP ---
  const drawLenses = (
    ctx: CanvasRenderingContext2D,
    landmarks: Point[],
    blendshapes: Record<string, number>,
    timeMs: number,
    vW: number, vH: number, canvasW: number, canvasH: number
  ) => {
      const project = (lm: Point) => mapLandmark(lm, vW, vH, canvasW, canvasH);
      const color = currentLensRef.current.color;

      const eyes = [
          { tracker: eyeTrackers.current.right, indices: RIGHT_EYE },
          { tracker: eyeTrackers.current.left, indices: LEFT_EYE },
      ];
      for (const { tracker, indices } of eyes) {
          const eye = tracker.update(measureMediaPipeEye(landmarks, indices, project, blendshapes), sizeAdjustmentRef.current, timeMs);
          if (eye) drawLens(ctx, eye.x, eye.y, eye.radius, color, { opacity: LENS_OPACITY, clip: eye.outline, realistic: true });
      }
  };

  /**
   * Runs once per new camera frame: detect on the frame, then draw that same frame and its lenses.
   * The lens can never trail the eye, and the trackers get exactly one sample per detection.
   */
  const renderFrame = (landmarker: FaceLandmarker, timeMs: number) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    const container = containerRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !video || !container || !ctx) return;
    const vW = video.videoWidth;
    const vH = video.videoHeight;
    if (!vW || !vH) return;

    // Resizing a canvas reallocates its buffer, so only do it when the container actually changed
    const canvasW = container.clientWidth;
    const canvasH = container.clientHeight;
    if (canvas.width !== canvasW) canvas.width = canvasW;
    if (canvas.height !== canvasH) canvas.height = canvasH;

    const detectTime = Math.max(timeMs, lastDetectTimeRef.current + 1);
    lastDetectTimeRef.current = detectTime;
    let result;
    try {
      result = landmarker.detectForVideo(video, detectTime);
    } catch (e) {
      console.error('Face detection failed on this frame:', e);
    }

    const draw = coverRect(vW, vH, canvasW, canvasH);
    ctx.save();
    ctx.translate(canvasW, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, draw.x, draw.y, draw.width, draw.height);
    ctx.restore();

    // setState with an unchanged string is a no-op, so this only re-renders on a status change
    const face = result?.faceLandmarks[0];
    if (face) {
      setTrackingStatus('LOCKED');
      const blendshapes = blendshapeScores(result?.faceBlendshapes[0]?.categories);
      drawLenses(ctx, face, blendshapes, detectTime, vW, vH, canvasW, canvasH);
    } else {
      // Reset so the next lock snaps into place instead of gliding in
      eyeTrackers.current.right.reset();
      eyeTrackers.current.left.reset();
      setTrackingStatus('SEARCHING');
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
