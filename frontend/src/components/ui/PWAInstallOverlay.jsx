import React, { useContext, useEffect, useState } from 'react';
import { AppContext } from '../../context/AppContext';
import { Download, X, Sparkles, Smartphone, Zap } from 'lucide-react';
import toast from 'react-hot-toast';

const PWAInstallOverlay = () => {
  const { deferredPrompt, clearInstallPrompt } = useContext(AppContext);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Check if the prompt was dismissed recently (within 5 days)
    const lastPromptDate = localStorage.getItem('pwaPromptLastDate');
    const now = new Date().getTime();
    const fiveDaysInMs = 5 * 24 * 60 * 60 * 1000;

    if (deferredPrompt && (!lastPromptDate || now - parseInt(lastPromptDate) > fiveDaysInMs)) {
      // Small delay to ensure the app is loaded and feels natural
      const timer = setTimeout(() => setIsVisible(true), 3000);
      return () => clearTimeout(timer);
    }
  }, [deferredPrompt]);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    
    setIsVisible(false);
    deferredPrompt.prompt();
    
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`PWA: User choice outcome: ${outcome}`);
    
    if (outcome === 'accepted') {
      toast.success('Awesome! CRAS is installing...');
    }
    
    clearInstallPrompt();
  };

  const handleDismiss = () => {
    setIsVisible(false);
    localStorage.setItem('pwaPromptLastDate', new Date().getTime().toString());
    toast.success('No problem! You can install it later from your browser settings.', { 
      icon: '📱',
      duration: 3000
    });
  };

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center p-6 sm:p-4 animate-in fade-in duration-500">
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-md"
        onClick={handleDismiss}
      />
      
      <div className="relative glass w-full max-w-sm rounded-[2.5rem] border border-white/20 p-8 shadow-2xl animate-in slide-in-from-bottom-10 sm:zoom-in-95 duration-500 overflow-hidden">
        {/* Decorative elements */}
        <div className="absolute -top-20 -right-20 w-40 h-40 bg-accent/10 rounded-full blur-3xl opacity-60" />
        <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-accent/20 rounded-full blur-3xl" />

        <div className="relative space-y-6">
          <div className="flex justify-between items-start">
            <div className="w-16 h-16 bg-gradient-to-tr from-accent to-accent/60 rounded-3xl flex items-center justify-center text-white shadow-xl shadow-accent/20 rotate-3">
              <Smartphone size={32} strokeWidth={2.5} />
            </div>
            <button 
              onClick={handleDismiss}
              className="p-2 text-text-secondary/50 hover:text-text-primary transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-black text-text-primary tracking-tight">Level Up CRAS!</h2>
              <Sparkles size={18} className="text-yellow-500 animate-pulse" />
            </div>
            <p className="text-xs font-bold text-text-secondary uppercase tracking-widest leading-relaxed">
              Install the app for a faster, full-screen experience and instant notifications.
            </p>
          </div>

          <div className="space-y-3 pt-2">
             <div className="flex items-center gap-3 text-[11px] font-black text-text-primary/70 uppercase tracking-tighter">
                <div className="w-6 h-6 rounded-lg bg-accent/10 flex items-center justify-center text-accent">
                   <Zap size={14} />
                </div>
                <span>Lightning Fast Access</span>
             </div>
             <div className="flex items-center gap-3 text-[11px] font-black text-text-primary/70 uppercase tracking-tighter">
                <div className="w-6 h-6 rounded-lg bg-accent/10 flex items-center justify-center text-accent">
                   <Download size={14} />
                </div>
                <span>Works Offline-ready</span>
             </div>
          </div>

          <div className="flex flex-col gap-3 pt-4">
            <button 
              onClick={handleInstall}
              className="w-full bg-accent text-white font-black py-4 rounded-2xl shadow-lg shadow-accent/20 active:scale-95 transition-all flex items-center justify-center gap-3 text-sm"
            >
              <Download size={18} />
              Install App
            </button>
            <button 
              onClick={handleDismiss}
              className="w-full bg-bg-secondary/50 border border-border text-text-secondary font-black py-3 rounded-2xl active:scale-95 transition-all text-[11px] uppercase tracking-widest"
            >
              Maybe Later
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PWAInstallOverlay;
