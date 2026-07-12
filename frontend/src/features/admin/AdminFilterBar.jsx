import React from 'react';
import { Search, Download, UserPlus, Home, Layers } from 'lucide-react';

export const AdminFilterBar = ({
  activeTab,
  searchTerm,
  setSearchTerm,
  filterRange,
  setFilterRange,
  exportCSV,
  openUserModal,
  openRoomModal,
  openDeptModal
}) => {
  if (activeTab === 'timetable') return null;

  const headerTitle = activeTab === 'promotions' 
    ? 'Promotion Requests' 
    : activeTab === 'quick' 
      ? 'Quick Allocation' 
      : activeTab === 'uploads' 
        ? 'CSV Data Uploads' 
        : activeTab === 'audit' 
          ? 'System Audit Log' 
          : `${activeTab} Management`;

  const showSearch = ['bookings', 'promotions', 'users', 'rooms', 'departments'].includes(activeTab);

  return (
    <div className="p-4 sm:p-6 border-b border-border/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface-low/60 backdrop-blur-sm shrink-0">
      <div>
        <h2 className="text-xl font-extrabold text-text-primary capitalize tracking-tight font-display">
          {headerTitle}
        </h2>
      </div>
      
      <div className="flex flex-wrap items-center gap-3">
        {/* Contextual search input */}
        {showSearch && (
          <div className="relative flex-1 sm:flex-none">
            <input 
              type="text" 
              placeholder={`Search ${activeTab}...`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full sm:w-56 bg-bg-primary/50 border border-border/20 rounded-xl px-4 py-2 text-xs focus:outline-none focus:border-primary transition-all font-bold placeholder:text-text-secondary/30 pl-9 text-text-primary"
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary/40" size={14} />
          </div>
        )}

        {/* Action buttons */}
        {activeTab === 'bookings' && (
          <>
            <div className="flex items-center gap-1.5 bg-tonal-secondary/10 p-1 rounded-xl font-display font-bold text-[10px] ring-1 ring-border/15">
              <button 
                onClick={() => setFilterRange('day')}
                className={`px-3 py-1 rounded-lg capitalize font-extrabold transition-all tracking-widest ${filterRange === 'day' ? 'bg-primary text-white shadow-ambient' : 'text-text-secondary hover:text-text-primary'}`}
              >
                Today
              </button>
              <button 
                onClick={() => setFilterRange('week')}
                className={`px-3 py-1 rounded-lg capitalize font-extrabold transition-all tracking-widest ${filterRange === 'week' ? 'bg-primary text-white shadow-ambient' : 'text-text-secondary hover:text-text-primary'}`}
              >
                Week
              </button>
            </div>
            <button 
              onClick={exportCSV}
              className="flex items-center gap-2 bg-text-primary text-surface-low px-4 py-2 rounded-xl font-extrabold text-[10px] capitalize tracking-widest hover:opacity-90 transition-all active:scale-95 shadow-ambient"
            >
              <Download size={14} />
              Export
            </button>
          </>
        )}

        {activeTab === 'promotions' && (
          <button 
            onClick={exportCSV}
            className="flex items-center gap-2 bg-text-primary text-surface-low px-4 py-2 rounded-xl font-extrabold text-[10px] capitalize tracking-widest hover:opacity-90 transition-all active:scale-95 shadow-ambient"
          >
            <Download size={14} />
            Export
          </button>
        )}

        {activeTab === 'users' && (
          <button 
            onClick={() => openUserModal()}
            className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl font-extrabold text-[10px] capitalize tracking-widest hover:opacity-90 transition-all active:scale-95 shadow-ambient"
          >
            <UserPlus size={14} />
            Add User
          </button>
        )}

        {activeTab === 'rooms' && (
          <button 
            onClick={() => openRoomModal()}
            className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl font-extrabold text-[10px] capitalize tracking-widest hover:opacity-90 transition-all active:scale-95 shadow-ambient"
          >
            <Home size={14} />
            Add Room
          </button>
        )}

        {activeTab === 'departments' && (
          <button 
            onClick={() => openDeptModal()}
            className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl font-extrabold text-[10px] capitalize tracking-widest hover:opacity-90 transition-all active:scale-95 shadow-ambient"
          >
            <Layers size={14} />
            Add Dept
          </button>
        )}
      </div>
    </div>
  );
};

export default AdminFilterBar;
