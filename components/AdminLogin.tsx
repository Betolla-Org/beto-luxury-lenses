
import React, { useState } from 'react';
import { APP_LOGO } from '../constants';

interface AdminLoginProps {
  onAuthenticated: () => void;
  onBack: () => void;
}

const AdminLogin: React.FC<AdminLoginProps> = ({ onAuthenticated, onBack }) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // الرمز السري هو 2025
    if (pin === '2025') {
      onAuthenticated();
    } else {
      setError(true);
      setPin('');
      setTimeout(() => setError(false), 2000);
    }
  };

  return (
    <div className="min-h-screen bg-luxury-black flex flex-col items-center justify-center px-8 text-center">
      <div className="mb-12 flex flex-col items-center">
        <img 
          src={APP_LOGO} 
          alt="BETO" 
          className="w-32 h-32 object-contain mb-6 drop-shadow-[0_0_15px_rgba(212,175,55,0.2)]" 
        />
        <p className="text-white/40 text-[10px] uppercase tracking-[0.4em]">Private Access Only</p>
      </div>

      <form onSubmit={handleSubmit} className="w-full space-y-8">
        <div className="space-y-4">
          <p className="text-white/60 text-xs font-bold uppercase tracking-widest">Enter Secure PIN</p>
          <input 
            type="password"
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            className={`w-full bg-luxury-surface border-2 rounded-2xl py-5 text-center text-3xl tracking-[1em] focus:outline-none transition-all ${
              error ? 'border-red-500 animate-shake' : 'border-white/5 focus:border-luxury-gold'
            }`}
            placeholder="****"
            autoFocus
          />
          {error && <p className="text-red-500 text-[10px] font-bold uppercase">Invalid Access Code</p>}
        </div>

        <button 
          type="submit"
          className="w-full gold-gradient text-luxury-black font-black py-5 rounded-2xl uppercase tracking-[0.2em] shadow-xl shadow-luxury-gold/20"
        >
          Unlock Dashboard
        </button>

        <button 
          type="button"
          onClick={onBack}
          className="text-white/40 text-[10px] font-bold uppercase tracking-widest hover:text-white"
        >
          Return to Home
        </button>
      </form>

      <div className="mt-20">
        <span className="material-symbols-outlined text-luxury-gold/20 text-5xl">lock</span>
      </div>
    </div>
  );
};

export default AdminLogin;
