import React, { useEffect } from 'react';
import { useNotification } from '../context/NotificationContext';
import { X, CheckCircle, AlertCircle, Info, Bell } from 'lucide-react';

const Notification = () => {
  const { notification, hideNotification } = useNotification();

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        hideNotification();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [notification, hideNotification]);

  if (!notification) return null;

  const { message, type } = notification;

  const typeConfig = {
    success: {
      icon: <CheckCircle className="text-emerald-500" size={20} />,
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/20',
      accent: 'bg-emerald-500'
    },
    error: {
      icon: <AlertCircle className="text-rose-500" size={20} />,
      bg: 'bg-rose-500/10',
      border: 'border-rose-500/20',
      accent: 'bg-rose-500'
    },
    info: {
      icon: <Info className="text-indigo-500" size={20} />,
      bg: 'bg-indigo-500/10',
      border: 'border-indigo-500/20',
      accent: 'bg-indigo-500'
    },
    default: {
      icon: <Bell className="text-slate-500" size={20} />,
      bg: 'bg-slate-500/10',
      border: 'border-slate-500/20',
      accent: 'bg-slate-500'
    }
  };

  const config = typeConfig[type] || typeConfig.default;

  return (
    <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[9999] w-[calc(100%-3rem)] max-w-md animate-in fade-in slide-in-from-top-4 duration-300">
      <div className={`glass overflow-hidden rounded-2xl shadow-2xl border ${config.border} flex items-stretch min-h-[64px]`}>
        <div className={`w-1.5 ${config.accent}`} />
        <div className="flex-1 flex items-center gap-4 p-4">
          <div className={`shrink-0 p-2 rounded-xl ${config.bg}`}>
            {config.icon}
          </div>
          <p className="flex-1 text-sm font-semibold tracking-tight leading-snug">
            {message}
          </p>
          <button 
            onClick={hideNotification}
            className="shrink-0 p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg text-text-secondary hover:text-text-primary transition-all"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default Notification;
