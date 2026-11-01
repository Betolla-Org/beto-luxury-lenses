
import React from 'react';
import { APP_LOGO } from '../constants';

const Header: React.FC = () => {
  return (
    <header className="sticky top-0 z-50 bg-luxury-black/95 backdrop-blur-md border-b border-white/5 h-16 px-6 flex items-center justify-between">
      <button className="text-luxury-gold/80">
        <span className="material-symbols-outlined text-[28px]">menu</span>
      </button>
      
      <div className="flex items-center justify-center">
        <img src={APP_LOGO} alt="BETO" className="h-10 w-auto object-contain drop-shadow-md" />
      </div>

      <div className="flex items-center gap-2">
        <button className="text-luxury-gold/80 relative">
          <span className="material-symbols-outlined text-[26px]">shopping_bag</span>
          <span className="absolute top-0 right-0 w-2 h-2 bg-luxury-gold rounded-full border border-luxury-black"></span>
        </button>
      </div>
    </header>
  );
};

export default Header;
