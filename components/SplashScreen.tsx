
import React from 'react';
import { APP_LOGO } from '../constants';

interface SplashScreenProps {
  showConnect?: boolean;
  onConnect?: () => void;
}

const SplashScreen: React.FC<SplashScreenProps> = ({ showConnect, onConnect }) => {
  return (
    <div className="fixed inset-0 bg-luxury-black flex flex-col items-center justify-center z-[200]">
      <div className="relative mb-12">
        <div className="flex flex-col items-center gap-6 animate-in zoom-in duration-1000">
          <img 
            src={APP_LOGO} 
            alt="BETO Logo" 
            className="w-48 h-48 object-contain drop-shadow-[0_0_25px_rgba(212,175,55,0.15)]"
          />
        </div>
        {!showConnect && (
           <div className="absolute top-0 -left-full h-full w-32 bg-gradient-to-r from-transparent via-white/10 to-transparent skew-x-[-25deg] animate-[shimmer_2s_infinite]"></div>
        )}
      </div>
      
      <p className="text-luxury-gold/60 text-[10px] tracking-[0.5em] uppercase font-light animate-in fade-in duration-1000 delay-500">
        LUXURY LENSES
      </p>
      
      {showConnect && (
        <button 
          onClick={onConnect}
          className="mt-12 gold-gradient text-luxury-black font-bold py-4 px-10 rounded-xl uppercase tracking-widest shadow-[0_0_20px_rgba(212,175,55,0.3)] animate-in fade-in slide-in-from-bottom-4 active:scale-95 transition-transform"
        >
          ابدأ التجربة
        </button>
      )}

      <style>{`
        @keyframes shimmer {
          0% { left: -100%; }
          100% { left: 200%; }
        }
      `}</style>
    </div>
  );
};

export default SplashScreen;
