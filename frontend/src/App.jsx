import React, { useState, useContext } from 'react';
import Calendar from './components/Calendar';
import RoomFilter from './components/RoomFilter';
import BookingModal from './components/BookingModal';
import HistoryModal from './components/HistoryModal';
import AdminDashboard from './components/AdminDashboard';
import FacultyDashboard from './components/FacultyDashboard';
import Contact from './components/Contact';
import Login from './components/Login';
import Signup from './components/Signup';
import PromotionModal from './components/PromotionModal';
import { AppContext } from './context/AppContext';
import toast from 'react-hot-toast';
import { LogOut, Calendar as CalendarIcon, History, Menu, X as CloseIcon, Sun, Moon, LayoutGrid, Maximize2, Shield, MessageSquare } from 'lucide-react';

function App() {
  const { user, theme, setTheme, viewMode, setViewMode, backendError, handleLogout, incomingTransfers, pendingTransferCount } = useContext(AppContext);
  
  const [currentPage, setCurrentPage] = useState('calendar');
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    return localStorage.getItem('sidebarCollapsed') === 'true';
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isPromotionOpen, setIsPromotionOpen] = useState(false);

  React.useEffect(() => {
    if (user?.role === 'admin') {
      setCurrentPage('admin');
    } else if (user?.role === 'FACULTY') {
      setCurrentPage('faculty');
    } else if (user) {
      setCurrentPage('calendar');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const toggleSidebar = () => {
    const newState = !isSidebarCollapsed;
    setIsSidebarCollapsed(newState);
    localStorage.setItem('sidebarCollapsed', newState);
  };

  // eslint-disable-next-line no-unused-vars
  const NavButton = ({ id, icon: Icon, label, color = 'bg-indigo-600', textColor = 'text-white' }) => (
    <button 
      onClick={() => { setCurrentPage(id); setIsSidebarOpen(false); }}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all ${currentPage === id ? `${color} ${textColor} shadow-lg ${color}/20` : 'text-text-secondary hover:text-text-primary hover:bg-black/5 dark:hover:bg-white/5'}`}
    >
      <Icon size={20} />
      <span>{label}</span>
    </button>
  );

  if (backendError) {
    // ... same ...
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
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <aside className={`fixed inset-y-0 left-0 glass border-r border-black/5 px-6 py-3 sm:py-4 flex flex-col gap-8 z-50 transition-all duration-300 transform lg:relative lg:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} ${isSidebarCollapsed ? 'lg:w-20 lg:px-4' : 'lg:w-72 lg:px-6'}`}>
        <div className={`flex items-center text-indigo-600 ${isSidebarCollapsed ? 'justify-center w-full' : 'justify-between w-full'}`}>
          <div className="flex items-center gap-3 overflow-hidden">
            <button 
              onClick={() => window.innerWidth >= 1024 ? toggleSidebar() : setIsSidebarOpen(false)}
              className="p-1 hover:opacity-80 transition-opacity flex items-center gap-3 shrink-0"
              title={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
            >
              <Menu size={32} className="shrink-0" />
              {!isSidebarCollapsed && <h1 className="text-xl font-bold tracking-tight text-text-primary whitespace-nowrap">CRAS</h1>}
            </button>
          </div>
          {!isSidebarCollapsed && (
            <button 
              onClick={() => setIsSidebarOpen(false)}
              className="p-2 lg:hidden text-text-secondary hover:text-text-primary ml-auto"
              title="Close Sidebar"
            >
              <CloseIcon size={24} />
            </button>
          )}
        </div>

        <div className={`transition-opacity duration-200 ${isSidebarCollapsed ? 'lg:opacity-0 lg:hidden' : 'opacity-100'} flex-1 flex flex-col gap-6`}>
          <div className="space-y-4">
            <div className="flex flex-col gap-1">
              {user?.role !== 'admin' && (
                <>
                  <NavButton id="calendar" icon={CalendarIcon} label="Calendar" />
                  <NavButton id="contact" icon={MessageSquare} label="Support" color="bg-bg-secondary" textColor="text-text-primary" />
                </>
              )}
              {user?.role === 'admin' && (
                <NavButton id="admin" icon={Shield} label="Admin Console" color="bg-accent" />
              )}
              {user?.role === 'FACULTY' && (
                <NavButton id="faculty" icon={Shield} label="Faculty Portal" color="bg-indigo-600" />
              )}
              {user?.role === 'VIEWER' && (
                <button 
                  onClick={() => setIsPromotionOpen(true)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold bg-amber-500/10 text-amber-600 border border-amber-500/20 hover:bg-amber-500/20 transition-all shadow-sm mt-2"
                >
                  <Shield size={20} />
                  <span>Request Access</span>
                </button>
              )}
            </div>

            {currentPage === 'calendar' && (
              <div className="pt-4 border-t border-black/5">
                <RoomFilter />
              </div>
            )}
          </div>
        </div>

        {user?.role !== 'VIEWER' && (
          <div className={`lg:hidden py-4 border-t border-black/5 ${isSidebarCollapsed ? 'hidden' : 'block'}`}>
             <button 
              onClick={() => {
                setIsHistoryOpen(true);
                setIsSidebarOpen(false);
              }} 
              className="flex items-center gap-3 w-full px-4 py-3 bg-indigo-50/50 dark:bg-indigo-900/10 text-indigo-600 rounded-xl font-bold transition-all active:scale-[0.98] relative"
             >
               <History size={20} />
               <span>{user?.role === 'admin' ? 'History' : 'My Bookings'}</span>
               {user?.role !== 'admin' && pendingTransferCount > 0 && (
                 <span className="absolute right-4 top-1/2 -translate-y-1/2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-xs font-bold border-2 border-bg-primary">
                    {pendingTransferCount}
                 </span>
               )}
             </button>
          </div>
        )}

        <div className="mt-auto pt-6 border-t border-black/5">
          <div className={`flex items-center ${isSidebarCollapsed ? 'lg:justify-center justify-between' : 'justify-between'}`}>
            <div className={`overflow-hidden ${isSidebarCollapsed ? 'lg:hidden block' : 'block'}`}>
              <p className="text-sm font-medium text-text-primary truncate">{user.name}</p>
              <p className="text-[10px] text-accent uppercase tracking-widest font-bold">{user.role}</p>
            </div>
            <button onClick={handleLogout} className="p-2.5 hover:bg-black/5 dark:hover:bg-white/5 rounded-xl text-text-secondary hover:text-text-primary transition-colors border border-transparent hover:border-border" title="Logout">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 p-0 flex flex-col w-full overflow-hidden">
        <header className="flex flex-row justify-between items-center p-3 sm:p-4 gap-3 border-b border-border bg-bg-secondary/50 backdrop-blur-md">
          <div className="flex items-center gap-1 sm:gap-2">
            <button 
                onClick={() => setIsSidebarOpen(true)}
                className="lg:hidden p-2 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-xl text-indigo-600 transition-colors"
                title="Open Sidebar"
            >
              <Menu size={24} />
            </button>
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

               {currentPage === 'calendar' && user?.role !== 'VIEWER' && (
                   <button 
                   onClick={() => setIsHistoryOpen(true)}
                   className="hidden sm:flex items-center gap-1.5 px-2.5 py-2 bg-bg-secondary hover:bg-bg-primary border border-border rounded-xl text-[10px] sm:text-xs font-bold text-text-secondary hover:text-text-primary transition-all shadow-sm relative"
                  >
                    <History size={14} />
                    <span>{user?.role === 'admin' ? 'History' : 'Bookings'}</span>
                    {user?.role !== 'admin' && pendingTransferCount > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-[10px] font-bold border-2 border-bg-primary animate-in zoom-in duration-200">
                        {pendingTransferCount}
                      </span>
                    )}
                  </button>
               )}
             </div>

             {currentPage === 'calendar' && (
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
             )}
          </div>
        </header>

        <section className="flex-1 flex flex-col overflow-hidden w-full p-2 sm:p-4">
          <div className="glass rounded-2xl p-2 sm:p-4 shadow-lg flex-1 flex flex-col overflow-hidden w-full">
            {currentPage === 'calendar' && (
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
            )}
            {currentPage === 'admin' && <AdminDashboard />}
            {currentPage === 'faculty' && <FacultyDashboard />}
            {currentPage === 'contact' && <Contact />}
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

      {isPromotionOpen && (
        <PromotionModal 
          onClose={() => setIsPromotionOpen(false)} 
        />
      )}
    </div>
  );
}

export default App;
