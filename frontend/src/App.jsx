import React, { useState, useContext } from 'react';
import Calendar from './components/Calendar';
import RoomFilter from './components/RoomFilter';
import BookingModal from './components/BookingModal';
import HistoryModal from './components/HistoryModal';
import Login from './components/Login';
import Signup from './components/Signup';
import { LogOut, Calendar as CalendarIcon, History, Menu, X as CloseIcon, Sun, Moon, LayoutGrid, Maximize2 } from 'lucide-react';
import { AppContext } from './context/AppContext';

function App() {
  const { user, theme, setTheme, viewMode, setViewMode, backendError, handleLogout } = useContext(AppContext);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  if (backendError) {
    return (
      <div className="h-screen flex items-center justify-center bg-bg-primary p-4">
        <div className="glass p-8 rounded-3xl max-w-md text-center space-y-4 border border-red-100">
          <div className="text-red-500 text-4xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-slate-900">Connection Error</h2>
          <p className="text-slate-600">{backendError}</p>
          <button 
            type="button"
            onClick={() => window.location.reload()} 
            className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition-all"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  if (!user) {
    if (isSigningUp) {
      return (
        <Signup 
          onSignupSuccess={() => setIsSigningUp(false)} 
          onBackToLogin={() => setIsSigningUp(false)} 
        />
      );
    }
    return (
      <Login 
        onShowSignup={() => setIsSigningUp(true)} 
      />
    );
  }

  return (
    <div className="w-full h-screen bg-bg-primary text-text-primary flex overflow-hidden relative">
      {/* Sidebar Overlay for Mobile */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 w-72 glass border-r border-black/5 p-6 flex flex-col gap-8 z-50 transition-transform duration-300 transform lg:relative lg:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between text-indigo-600">
          <div className="flex items-center gap-3">
            <CalendarIcon size={32} />
            <h1 className="text-xl font-bold tracking-tight text-text-primary">CRAS</h1>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="p-2 lg:hidden text-text-secondary hover:text-text-primary">
             <CloseIcon size={24} />
          </button>
        </div>

        <RoomFilter />

        <div className="mt-auto pt-6 border-t border-black/5">
          <div className="flex items-center justify-between">
            <div className="overflow-hidden">
              <p className="text-sm font-medium text-text-primary truncate">{user.name}</p>
              <p className="text-[10px] text-accent uppercase tracking-widest font-bold">{user.role}</p>
            </div>
            <button onClick={handleLogout} className="p-2.5 hover:bg-black/5 dark:hover:bg-white/5 rounded-xl text-text-secondary hover:text-text-primary transition-colors border border-transparent hover:border-border">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-2 lg:p-4 overflow-hidden flex flex-col w-full">
        <header className="flex justify-between items-center mb-4 px-2">
          <div className="flex items-center gap-4">
            <button 
                onClick={() => setIsSidebarOpen(true)}
                className="p-2 lg:hidden bg-bg-secondary border border-border rounded-xl text-text-secondary shadow-sm"
            >
                <Menu size={24} />
            </button>
            <div>
              <h2 className="text-xl lg:text-2xl font-bold text-text-primary mb-0.5">Room Schedule</h2>
              <p className="text-text-secondary text-[10px] lg:text-xs">Manage and book campus rooms in real-time.</p>
            </div>
          </div>
          <div className="flex gap-2 lg:gap-4">
             <button 
              onClick={() => setTheme(prev => prev === 'light' ? 'dark' : 'light')}
              className="p-2.5 bg-bg-secondary border border-border rounded-xl text-text-secondary hover:text-text-primary transition-all shadow-sm"
              title="Toggle Theme"
             >
               {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
             </button>

             <div className="flex bg-bg-secondary rounded-xl p-1 border border-border shadow-sm">
               <button 
                onClick={() => setViewMode('week')}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${viewMode === 'week' ? 'bg-accent text-white shadow-sm' : 'text-text-secondary hover:text-text-primary'}`}
               >
                 <LayoutGrid size={14} /> Week
               </button>
               <button 
                onClick={() => setViewMode('day')}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${viewMode === 'day' ? 'bg-accent text-white shadow-sm' : 'text-text-secondary hover:text-text-primary'}`}
               >
                 <Maximize2 size={14} /> Day
               </button>
             </div>

             <button 
              onClick={() => setIsHistoryOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-bg-secondary hover:bg-bg-primary border border-border rounded-xl text-xs font-medium text-text-secondary hover:text-text-primary transition-all shadow-sm"
             >
               <History size={16} />
               <span className="hidden sm:inline">{user?.role === 'admin' ? 'History' : 'My Bookings'}</span>
             </button>
          </div>
        </header>

        <section className="glass rounded-2xl p-4 shadow-lg flex-1 flex flex-col overflow-hidden w-full">
          <Calendar 
            onSlotClick={(slot) => {
              setSelectedSlot(slot);
              setIsModalOpen(true);
            }} 
          />
        </section>
      </main>

      {isModalOpen && (
        <BookingModal 
          slot={selectedSlot} 
          onClose={() => setIsModalOpen(false)} 
          onSuccess={() => {
            setIsModalOpen(false);
          }}
        />
      )}

      {isHistoryOpen && (
        <HistoryModal 
          onClose={() => setIsHistoryOpen(false)} 
        />
      )}
    </div>
  );
}

export default App;
