
import React from 'react';
import { Lens, CollectionName } from '../types';
import { COLLECTIONS } from '../constants';

interface CollectionScreenProps {
  collectionName: CollectionName;
  lenses: Lens[];
  onSelectLens: (lens: Lens) => void;
  onBack: () => void;
}

const CollectionScreen: React.FC<CollectionScreenProps> = ({ collectionName, lenses, onSelectLens, onBack }) => {
  const collection = COLLECTIONS.find(c => c.name === collectionName);
  const collectionLenses = lenses.filter(l => l.collection === collectionName);

  if (!collection) return null;

  return (
    <div className="pb-24 bg-luxury-black min-h-screen">
      {/* --- Header --- */}
      <header className="sticky top-0 z-50 bg-luxury-black/90 backdrop-blur-xl h-20 px-6 flex items-center justify-between border-b border-white/5">
        <button onClick={onBack} className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white hover:bg-white/10 transition-colors">
          <span className="material-symbols-outlined text-[20px]">arrow_back</span>
        </button>
        <div className="text-center">
            <h1 className="text-luxury-gold text-2xl font-serif font-bold tracking-[0.2em]">{collection.name}</h1>
            <div className="h-0.5 w-8 bg-luxury-gold mx-auto mt-1 opacity-50"></div>
        </div>
        <div className="w-10"></div>
      </header>

      <div className="p-6">
        <p className="text-white/50 text-center text-sm mb-8 font-light leading-relaxed px-4">{collection.description}</p>
        
        {/* --- Lenses Grid --- */}
        <div className="grid grid-cols-2 gap-5">
          {collectionLenses.map((lens) => (
            <div 
              key={lens.id} 
              onClick={() => onSelectLens(lens)} 
              className="group cursor-pointer flex flex-col gap-3"
            >
              {/* Swatch Container */}
              <div className="relative aspect-[3/4] rounded-2xl overflow-hidden bg-luxury-surface border border-white/5 group-hover:border-luxury-gold/40 transition-all duration-500 shadow-lg flex items-center justify-center p-4">
                  <div className="w-24 h-24 rounded-full transition-transform group-hover:scale-110" style={{ backgroundColor: lens.color }}>
                    <div className="w-full h-full rounded-full bg-gradient-to-br from-white/30 via-transparent to-black/20 ring-1 ring-inset ring-black/10"></div>
                  </div>
                  
                  {/* Button Overlay */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="bg-white/10 backdrop-blur px-4 py-2 rounded-full text-white text-xs font-bold uppercase tracking-widest border border-white/20">
                      Try On
                    </span>
                  </div>
              </div>

              {/* Info */}
              <div className="text-center">
                <h3 className="text-white font-serif text-lg tracking-wide group-hover:text-luxury-gold transition-colors">{lens.name}</h3>
                <p className="text-white/30 text-[10px] uppercase font-bold tracking-widest bg-white/5 inline-block px-2 py-0.5 rounded mt-1">{lens.code}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CollectionScreen;
