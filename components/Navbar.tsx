
import React from 'react';
import { AppView } from '../types';

interface NavbarProps {
  currentView: AppView;
  setView: (view: AppView) => void;
}

const Navbar: React.FC<NavbarProps> = ({ currentView, setView }) => {
  const navItems: { label: string; icon: string; view: AppView }[] = [
    { label: 'HOME', icon: 'home', view: 'HOME' },
    { label: 'ADMIN', icon: 'settings', view: 'DASHBOARD' },
    { label: 'PROFILE', icon: 'person', view: 'PROFILE' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto h-20 bg-luxury-surface/95 backdrop-blur-xl border-t border-white/10 px-6 flex items-center justify-around z-40">
      {navItems.map((item) => (
        <button
          key={item.label}
          onClick={() => setView(item.view)}
          className={`flex flex-col items-center gap-1 transition-colors ${
            currentView === item.view ? 'text-luxury-gold' : 'text-white/40'
          }`}
        >
          <span className={`material-symbols-outlined text-[24px] ${currentView === item.view ? 'fill-[1]' : ''}`}>
            {item.icon}
          </span>
          <span className="text-[9px] font-bold tracking-widest">{item.label}</span>
        </button>
      ))}
    </nav>
  );
};

export default Navbar;
