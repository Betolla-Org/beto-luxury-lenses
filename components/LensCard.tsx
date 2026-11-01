
import React from 'react';
import { Lens } from '../types';

interface LensCardProps {
  lens: Lens;
  onClick: () => void;
}

const LensCard: React.FC<LensCardProps> = ({ lens, onClick }) => {
  return (
    <div 
      className="flex flex-col gap-3 group cursor-pointer" 
      onClick={onClick}
    >
      <div className="relative aspect-[4/5] rounded-2xl overflow-hidden border border-luxury-border bg-luxury-surface group-hover:border-luxury-gold/50 transition-all duration-300">
        <img 
          src={lens.imageUrl} 
          alt={lens.name} 
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
        />
        <div className="absolute top-3 right-3">
          <button className="w-8 h-8 rounded-full bg-black/40 backdrop-blur-md border border-white/10 flex items-center justify-center text-white/80 hover:text-luxury-gold transition-colors">
            <span className="material-symbols-outlined text-[18px]">favorite</span>
          </button>
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-4">
           <span className="text-white text-[10px] uppercase font-bold tracking-[0.2em] bg-luxury-gold/80 px-4 py-1.5 rounded-full text-luxury-black">تجربة الآن</span>
        </div>
      </div>
      
      <div className="px-1 text-center">
        <h4 className="text-luxury-gold font-serif text-base font-bold leading-tight">{lens.name}</h4>
        <p className="text-white/30 text-[9px] uppercase tracking-widest font-medium">CODE: {lens.code}</p>
      </div>
    </div>
  );
};

export default LensCard;
