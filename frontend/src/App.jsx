import React, { useState, useContext } from 'react';
import Calendar from './components/Calendar';
import RoomFilter from './components/RoomFilter';
import BookingModal from './components/BookingModal';
import HistoryModal from './components/HistoryModal';
import Login from './components/Login';
import Signup from './components/Signup';
import { AppContext } from './context/AppContext';
import toast from 'react-hot-toast';
import { LogOut, Calendar as CalendarIcon, History, Menu, X as CloseIcon, Sun, Moon, LayoutGrid, Maximize2 } from 'lucide-react';

function App() {
  const { user, theme, setTheme, viewMode, setViewMode, backendError, handleLogout } = useContext(AppContext);
  
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    return localStorage.getItem('sidebarCollapsed') === 'true';
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  const toggleSidebar = () => {
    const newState = !isSidebarCollapsed;
    setIsSidebarCollapsed(newState);
    localStorage.setItem('sidebarCollapsed', newState);
  };

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
      <aside className={`fixed inset-y-0 left-0 glass border-r border-black/5 px-6 py-3 sm:py-4 flex flex-col gap-8 z-50 transition-all duration-300 transform lg:relative lg:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} ${isSidebarCollapsed ? 'lg:w-20 lg:px-4' : 'lg:w-72 lg:px-6'}`}>
        <button 
          onClick={() => window.innerWidth >= 1024 ? toggleSidebar() : setIsSidebarOpen(false)}
          className={`flex items-center text-indigo-600 hover:opacity-80 transition-opacity ${isSidebarCollapsed ? 'justify-center w-full' : 'justify-start w-full'}`}
          title={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          <div className="flex items-center gap-3 overflow-hidden">
            <Menu size={32} className="shrink-0" />
            {!isSidebarCollapsed && <h1 className="text-xl font-bold tracking-tight text-text-primary whitespace-nowrap">CRAS</h1>}
          </div>
          {!isSidebarCollapsed && (
            <div className="p-2 lg:hidden text-text-secondary hover:text-text-primary ml-auto">
              <CloseIcon size={24} />
            </div>
          )}
        </button>

        <div className={`transition-opacity duration-200 ${isSidebarCollapsed ? 'opacity-0 lg:hidden' : 'opacity-100'}`}>
          <RoomFilter />
        </div>

        {user?.role !== 'VIEWER' && !isSidebarCollapsed && (
          <div className="lg:hidden py-4 border-t border-black/5">
             <button 
              onClick={() => {
                setIsHistoryOpen(true);
                setIsSidebarOpen(false);
              }} 
              className="flex items-center gap-3 w-full px-4 py-3 bg-indigo-50/50 dark:bg-indigo-900/10 text-indigo-600 rounded-xl font-bold transition-all active:scale-[0.98]"
             >
               <History size={20} />
               <span>{user?.role === 'admin' ? 'History' : 'My Bookings'}</span>
             </button>
          </div>
        )}

        <div className="mt-auto pt-6 border-t border-black/5">
          <div className={`flex items-center ${isSidebarCollapsed ? 'justify-center' : 'justify-between'}`}>
            {!isSidebarCollapsed && (
              <div className="overflow-hidden">
                <p className="text-sm font-medium text-text-primary truncate">{user.name}</p>
                <p className="text-[10px] text-accent uppercase tracking-widest font-bold">{user.role}</p>
              </div>
            )}
            <button onClick={handleLogout} className="p-2.5 hover:bg-black/5 dark:hover:bg-white/5 rounded-xl text-text-secondary hover:text-text-primary transition-colors border border-transparent hover:border-border" title="Logout">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-0 flex flex-col w-full overflow-hidden">
        <header className="flex flex-row justify-between items-center p-3 sm:p-4 gap-3 border-b border-border bg-bg-secondary/50 backdrop-blur-md">
          <div className="flex items-center gap-1 sm:gap-2">
            <h2 className="text-xl lg:text-2xl font-black tracking-tighter text-indigo-600 leading-tight">CRAS</h2>
          </div>
          <div className="flex items-center gap-2">
             <div className="flex gap-1.5 sm:gap-2">
               <button 
                onClick={() => setTheme(prev => prev === 'light' ? 'dark' : 'light')}
                className="p-2 bg-bg-secondary border border-border rounded-xl text-text-secondary hover:text-text-primary transition-all shadow-sm"
                title="Toggle Theme"
               >
                 {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
               </button>

               {user?.role !== 'VIEWER' && (
                 <button 
                  onClick={() => setIsHistoryOpen(true)}
                  className="hidden sm:flex items-center gap-1.5 px-2.5 py-2 bg-bg-secondary hover:bg-bg-primary border border-border rounded-xl text-[10px] sm:text-xs font-bold text-text-secondary hover:text-text-primary transition-all shadow-sm"
                 >
                   <History size={14} />
                   <span>{user?.role === 'admin' ? 'History' : 'Bookings'}</span>
                 </button>
               )}
             </div>

             <div className="flex bg-bg-secondary rounded-xl p-1 border border-border shadow-sm">
               <button 
                onClick={() => setViewMode('day')}
                className={`px-3 py-1.5 rounded-lg text-[10px] sm:text-xs font-medium transition-all flex items-center gap-1.5 ${viewMode === 'day' ? 'bg-accent text-white shadow-sm' : 'text-text-secondary hover:text-text-primary'}`}
               >
                 <Maximize2 size={12} /> Day
               </button>
               <button 
                onClick={() => setViewMode('week')}
                className={`px-3 py-1.5 rounded-lg text-[10px] sm:text-xs font-medium transition-all flex items-center gap-1.5 ${viewMode === 'week' ? 'bg-accent text-white shadow-sm' : 'text-text-secondary hover:text-text-primary'}`}
               >
                 <LayoutGrid size={12} /> Week
               </button>
             </div>
          </div>
        </header>

        <section className="flex-1 flex flex-col overflow-hidden w-full p-2 sm:p-4">
          <div className="glass rounded-2xl p-2 sm:p-4 shadow-lg flex-1 flex flex-col overflow-hidden w-full">
          <Calendar 
            onSlotClick={(slot) => {
              if (user?.role === 'VIEWER') {
                toast.error('Access Denied: Viewers cannot create or edit bookings.');
                return;
              }
              setSelectedSlot(slot);
              setIsModalOpen(true);
            }} 
          />
          </div>
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
