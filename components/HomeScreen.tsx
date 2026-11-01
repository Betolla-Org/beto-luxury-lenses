
import React from 'react';
import { COLLECTIONS, HERO_IMAGE, COLLECTION_IMAGES, LENSES } from '../constants';
import { CollectionName, Lens } from '../types';
import Header from './Header';

interface HomeScreenProps {
  onSelectCollection: (collectionName: CollectionName) => void;
  onSelectLens: (lens: Lens) => void;
}

const HomeScreen: React.FC<HomeScreenProps> = ({ onSelectCollection, onSelectLens }) => {
  // Select top 5 lenses for the "Trending" section
  const trendingLenses = LENSES.slice(0, 5);

  return (
    <div className="pb-24 bg-luxury-black min-h-screen font-sans">
      <Header />

      {/* --- Cinematic Hero Section --- */}
      <div className="relative w-full h-[65vh] mb-10 overflow-hidden group">
        {/* Main Background Image */}
        <img 
          src={HERO_IMAGE} 
          className="w-full h-full object-cover opacity-90 transition-transform duration-[3s] group-hover:scale-105"
          alt="BETO Hero"
        />
        
        {/* Luxury Overlay Gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-luxury-black via-black/20 to-transparent flex flex-col items-center justify-end pb-12 text-center px-4">
            
            <div className="mb-6 animate-in slide-in-from-bottom-6 duration-1000">
                <h1 className="text-7xl font-serif font-black text-luxury-gold tracking-[0.15em] drop-shadow-2xl">BETO</h1>
                <p className="text-[10px] text-white/80 tracking-[0.8em] uppercase mt-2 font-light">The Art of Vision</p>
            </div>
            
            {/* Divider */}
            <div className="h-px w-24 bg-gradient-to-r from-transparent via-luxury-gold to-transparent mb-6 opacity-80"></div>
            
            {/* Arabic Slogan */}
            <h2 className="text-white font-serif text-3xl font-medium drop-shadow-lg leading-relaxed animate-in slide-in-from-bottom-8 duration-1000 delay-100 mb-8">
              الجمال في <span className="text-luxury-gold/90 italic">التفاصيل</span>
            </h2>

            {/* CTA Button */}
            <button 
              onClick={() => onSelectCollection('MERAL')}
              className="gold-gradient text-luxury-black px-8 py-3 rounded-full font-bold uppercase tracking-widest text-xs shadow-[0_0_20px_rgba(212,175,55,0.4)] hover:scale-105 transition-transform animate-in fade-in duration-1000 delay-300"
            >
              اكتشف المجموعة
            </button>
        </div>
      </div>

      {/* --- Trending Section (Horizontal Scroll) --- */}
      <div className="px-0 mb-12">
         <div className="px-5 flex items-center justify-between mb-4">
            <h3 className="text-luxury-gold font-serif text-lg tracking-widest">TRENDING NOW</h3>
            <span className="text-white/40 text-[10px] font-bold">الأكثر طلباً</span>
         </div>
         
         <div className="flex overflow-x-auto px-5 gap-4 pb-4 scrollbar-hide snap-x">
            {trendingLenses.map((lens) => (
               <div 
                  key={lens.id} 
                  onClick={() => onSelectLens(lens)}
                  className="snap-start shrink-0 w-32 flex flex-col items-center gap-2 group cursor-pointer"
               >
                  <div className="w-full aspect-[3/4] rounded-xl overflow-hidden border border-white/10 relative p-2 bg-luxury-surface flex items-center justify-center">
                    <div className="w-20 h-20 rounded-full transition-transform group-hover:scale-110" style={{ backgroundColor: lens.color }}>
                        <div className="w-full h-full rounded-full bg-gradient-to-br from-white/30 via-transparent to-black/20"></div>
                    </div>
                    <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors"></div>
                  </div>
                  <div className="text-center">
                     <p className="text-white text-xs font-serif truncate w-full">{lens.name}</p>
                     <p className="text-luxury-gold/60 text-[9px] uppercase tracking-wider">{lens.collection}</p>
                  </div>
               </div>
            ))}
         </div>
      </div>

      {/* --- Vertical Collections List --- */}
      <div className="px-5 space-y-12">
        <div className="flex items-center gap-4 px-2 opacity-60">
           <span className="h-px flex-1 bg-luxury-gold"></span>
           <span className="text-white text-[10px] uppercase tracking-[0.3em] font-light">مجموعاتنا الحصرية</span>
           <span className="h-px flex-1 bg-luxury-gold"></span>
        </div>

        <div className="flex flex-col gap-10">
        {COLLECTIONS.map((collection, index) => (
          <div 
            key={collection.name} 
            onClick={() => onSelectCollection(collection.name)}
            className="group relative cursor-pointer"
          >
            {/* Card Container */}
            <div className="relative aspect-[4/5] rounded-[2rem] overflow-hidden border border-white/5 shadow-2xl transition-all duration-500 group-hover:shadow-[0_10px_40px_rgba(212,175,55,0.1)]">
                <img 
                  src={COLLECTION_IMAGES[collection.name]} 
                  alt={collection.name} 
                  className="w-full h-full object-cover transition-transform duration-[1.5s] group-hover:scale-110 grayscale-[20%] group-hover:grayscale-0"
                />
                
                {/* Dark Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/10 opacity-80 group-hover:opacity-60 transition-opacity duration-500"></div>

                {/* Content */}
                <div className="absolute inset-0 flex flex-col justify-between p-8">
                    {/* Index Number */}
                    <div className="self-end text-white/10 text-6xl font-serif font-black tracking-tighter">
                       0{index + 1}
                    </div>

                    {/* Text Content */}
                    <div className="transform translate-y-4 group-hover:translate-y-0 transition-transform duration-500">
                        <h3 className="text-4xl font-serif font-bold text-white tracking-widest mb-1 drop-shadow-md">
                          {collection.name}
                        </h3>
                        <p className="text-luxury-gold text-sm tracking-wider uppercase mb-4 opacity-80 group-hover:opacity-100">
                           COLLECTION
                        </p>
                        <p className="text-white/80 text-sm font-light leading-relaxed max-w-[80%]">
                          {collection.description}
                        </p>
                    </div>
                </div>
                
                {/* Interactive Button */}
                <div className="absolute bottom-8 right-8 w-14 h-14 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white transition-all duration-300 group-hover:bg-luxury-gold group-hover:text-black group-hover:scale-110">
                   <span className="material-symbols-outlined text-2xl">arrow_forward</span>
                </div>
            </div>
          </div>
        ))}
        </div>
      </div>
    </div>
  );
};

export default HomeScreen;
