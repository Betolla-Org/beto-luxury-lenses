
import React, { useState, useMemo, useEffect } from 'react';
import HomeScreen from './components/HomeScreen';
import TryOnScreen from './components/TryOnScreen';
import Dashboard from './components/Dashboard';
import AdminLogin from './components/AdminLogin';
import SplashScreen from './components/SplashScreen';
import CollectionScreen from './components/CollectionScreen';
import { AppView, Lens, CollectionName } from './types';
import Navbar from './components/Navbar';
import { LENSES } from './constants';

const App: React.FC = () => {
  const [view, setView] = useState<AppView>('SPLASH');
  const [selectedLens, setSelectedLens] = useState<Lens | null>(null);
  const [selectedCollection, setSelectedCollection] = useState<CollectionName | null>(null);
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  
  const [customLenses, setCustomLenses] = useState<Lens[]>(() => {
    const saved = localStorage.getItem('beto_custom_lenses');
    return saved ? JSON.parse(saved) : [];
  });

  // Transition from Splash
  useEffect(() => {
    if (view === 'SPLASH') {
      const timer = setTimeout(() => setView('HOME'), 2500);
      return () => clearTimeout(timer);
    }
  }, [view]);

  useEffect(() => {
    localStorage.setItem('beto_custom_lenses', JSON.stringify(customLenses));
  }, [customLenses]);

  const allLenses = useMemo(() => [...LENSES, ...customLenses], [customLenses]);

  const handleSelectCollection = (collectionName: CollectionName) => {
    setSelectedCollection(collectionName);
    setView('COLLECTION');
  };

  const handleSelectLens = (lens: Lens) => {
    setSelectedLens(lens);
    setView('TRY_ON');
  };

  const handleAddLens = (newLens: Lens) => {
    setCustomLenses(prev => [newLens, ...prev]);
    setView('DASHBOARD');
  };

  const handleBack = () => {
    if (view === 'COLLECTION') {
      setView('HOME');
    } else if (view === 'TRY_ON') {
      setView('COLLECTION');
    } else {
      setView('HOME');
    }
  };

  const handleAdminAttempt = () => {
    if (isAdminAuthenticated) {
      setView('DASHBOARD');
    } else {
      setView('PROFILE');
    }
  };

  const renderContent = () => {
    switch (view) {
      case 'SPLASH':
        return <SplashScreen />;
      case 'HOME':
        return <HomeScreen onSelectCollection={handleSelectCollection} onSelectLens={handleSelectLens} />;
      case 'COLLECTION':
        return selectedCollection && <CollectionScreen collectionName={selectedCollection} onSelectLens={handleSelectLens} onBack={handleBack} lenses={allLenses} />;
      case 'TRY_ON':
        return selectedLens && <TryOnScreen lens={selectedLens} onBack={handleBack} lenses={allLenses} />;
      case 'PROFILE':
        return !isAdminAuthenticated 
          ? <AdminLogin onAuthenticated={() => { setIsAdminAuthenticated(true); setView('DASHBOARD'); }} onBack={() => setView('HOME')} />
          : <Dashboard onAddLens={handleAddLens} onBack={() => setView('HOME')} onLogout={() => setIsAdminAuthenticated(false)} />;
      case 'DASHBOARD':
        return isAdminAuthenticated 
          ? <Dashboard onAddLens={handleAddLens} onBack={() => setView('HOME')} onLogout={() => setIsAdminAuthenticated(false)} />
          : <AdminLogin onAuthenticated={() => { setIsAdminAuthenticated(true); setView('DASHBOARD'); }} onBack={() => setView('HOME')} />
      default:
        return <HomeScreen onSelectCollection={handleSelectCollection} onSelectLens={handleSelectLens} />;
    }
  }

  const showNavbar = ['HOME', 'PROFILE', 'DASHBOARD'].includes(view) && (view === 'DASHBOARD' ? isAdminAuthenticated : true);

  return (
    <div className="min-h-screen bg-luxury-black text-white font-sans overflow-x-hidden max-w-md mx-auto shadow-2xl relative border-x border-white/5">
      {renderContent()}

      {showNavbar && (
        <Navbar currentView={view} setView={(v) => {
          if (v === 'DASHBOARD' || v === 'PROFILE') {
            handleAdminAttempt();
          } else {
            setView(v);
          }
        }} />
      )}
    </div>
  );
};

export default App;
