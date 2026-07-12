import React, { useState } from 'react';
import { 
  Zap, 
  Calendar as CalendarIcon, 
  Users, 
  ShieldAlert, 
  Home, 
  Layers, 
  TrendingUp, 
  Activity, 
  Download, 
  Database,
  ChevronDown,
  LayoutGrid
} from 'lucide-react';

export const AdminTabBar = ({ activeTab, setActiveTab, promotions = [], users = [] }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const pendingPromotionsCount = promotions.filter(p => p.status === 'PENDING').length;
  const unapprovedUsersCount = users.filter(u => !u.is_approved).length;

  const tabOptions = [
    { id: 'quick', label: 'Quick Book', icon: <Zap size={16} />, category: 'Operations' },
    { id: 'bookings', label: 'Bookings', icon: <CalendarIcon size={16} />, category: 'Operations' },
    { 
      id: 'promotions', 
      label: 'Requests', 
      icon: <Users size={16} />, 
      category: 'Operations',
      badge: pendingPromotionsCount > 0 ? (
        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${activeTab === 'promotions' ? 'bg-white text-primary' : 'bg-primary text-white'}`}>
          {pendingPromotionsCount}
        </span>
      ) : null
    },
    { id: 'timetable', label: 'Timetable Overrides', icon: <Database size={16} />, category: 'Operations' },
    { id: 'room-grid', label: 'Room Grid', icon: <LayoutGrid size={16} />, category: 'Operations' },
    
    { 
      id: 'users', 
      label: 'Users', 
      icon: <ShieldAlert size={16} />, 
      category: 'Registry',
      badge: unapprovedUsersCount > 0 ? (
        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full animate-pulse ${activeTab === 'users' ? 'bg-white text-tertiary shadow-tertiary' : 'bg-tertiary text-white shadow-tertiary'}`}>
          {unapprovedUsersCount}
        </span>
      ) : null
    },
    { id: 'rooms', label: 'Rooms', icon: <Home size={16} />, category: 'Registry' },
    { id: 'departments', label: 'Departments', icon: <Layers size={16} />, category: 'Registry' },
    
    { id: 'analytics', label: 'Analytics', icon: <TrendingUp size={16} />, category: 'System' },
    { id: 'audit', label: 'Audit Log', icon: <Activity size={16} />, category: 'System' },
    { id: 'uploads', label: 'CSV Uploads', icon: <Download size={16} />, category: 'System' }
  ];

  const getTabLabel = (tabId) => {
    const option = tabOptions.find(o => o.id === tabId);
    return option || { label: 'Bookings', icon: <CalendarIcon size={16} /> };
  };

  const categories = ['Operations', 'Registry', 'System'];

  return (
    <>
      {/* Left Sub-Sidebar (Desktop view) */}
      <div className="hidden md:flex w-64 flex-col shrink-0 gap-6 border-r border-border/10 pr-6 overflow-y-auto no-scrollbar">
        <div className="flex flex-col gap-6">
          {categories.map(cat => (
            <div key={cat} className="space-y-2">
              <span className="text-[10px] font-black tracking-widest text-text-secondary uppercase opacity-45 px-3">{cat}</span>
              <div className="flex flex-col gap-1 font-display">
                {tabOptions.filter(opt => opt.category === cat).map(opt => (
                  <button 
                    key={opt.id}
                    onClick={() => setActiveTab(opt.id)}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl text-xs font-bold transition-all text-left ${activeTab === opt.id ? 'bg-primary text-white shadow-ambient' : 'text-text-secondary hover:text-text-primary hover:bg-tonal-secondary/10'}`}
                  >
                    <div className="flex items-center gap-3">
                      {opt.icon}
                      <span>{opt.label}</span>
                    </div>
                    {opt.badge}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Custom Mobile Dropdown Selector */}
      <div className="md:hidden w-full relative z-50 font-display">
        <label className="text-[10px] font-black text-text-secondary uppercase tracking-[0.2em] px-1 mb-1.5 block">Active Section</label>
        <button 
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="w-full flex items-center justify-between bg-tonal-secondary/10 border border-border/10 rounded-2xl px-4 py-3.5 text-sm font-bold text-text-primary focus:outline-none transition-all active:scale-98"
        >
          <div className="flex items-center gap-2.5">
            {getTabLabel(activeTab).icon}
            <span>{getTabLabel(activeTab).label}</span>
          </div>
          <ChevronDown size={16} className={`transition-transform duration-200 ${isMobileMenuOpen ? 'rotate-180' : ''}`} />
        </button>

        {isMobileMenuOpen && (
          <>
            {/* Click-away backdrop */}
            <div className="fixed inset-0 z-40" onClick={() => setIsMobileMenuOpen(false)} />
            <div className="absolute top-full left-0 right-0 mt-2 bg-surface-low border border-border/15 backdrop-blur-md rounded-2xl shadow-xl z-50 overflow-hidden py-1.5 animate-in fade-in slide-in-from-top-2 duration-150 max-h-[60vh] overflow-y-auto">
              {tabOptions.map(opt => (
                <button
                  key={opt.id}
                  onClick={() => {
                    setActiveTab(opt.id);
                    setIsMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-xs font-bold transition-all text-left ${activeTab === opt.id ? 'bg-primary/10 text-primary' : 'text-text-secondary hover:text-text-primary hover:bg-black/5 dark:hover:bg-white/5'}`}
                >
                  {opt.icon}
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
};

export default AdminTabBar;
