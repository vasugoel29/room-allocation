import React, { useState, useContext } from 'react';
import Calendar from './components/ui/Calendar';
import RoomFilter from './components/ui/RoomFilter';
import BookingModal from './components/modals/BookingModal';
import AdminDashboard from './pages/AdminDashboard';
import FacultyDashboard from './pages/FacultyDashboard';
import Timetable from './pages/Timetable';
import Bookings from './pages/Bookings';
import Login from './pages/Login';
import Signup from './pages/Signup';
import PromotionModal from './components/modals/PromotionModal';
import Profile from './pages/Profile';
import MobileHistory from './pages/MobileHistory';
import MobileBooking from './pages/MobileBooking';
import PromotionRequest from './pages/PromotionRequest';
import { AppContext } from './context/AppContext';
import toast from 'react-hot-toast';
import { LogOut, Calendar as CalendarIcon, History, Menu, X as CloseIcon, Sun, Moon, LayoutGrid, Maximize2, Shield, MessageSquare, Search, GraduationCap, User, Clock } from 'lucide-react';
import BottomNav from './components/ui/BottomNav';
import FloatingActions from './components/ui/FloatingActions';
import PWAInstallOverlay from './components/ui/PWAInstallOverlay';

function App() {
  const { user, viewMode, setViewMode, backendError, logout, pendingTransferCount } = useContext(AppContext);
  
  const [currentPage, setCurrentPage] = useState('calendar');
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    return localStorage.getItem('sidebarCollapsed') === 'true';
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);
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

  const NavButton = ({ id, label, color = 'bg-accent', textColor = 'text-white', onClick, ...props }) => {
    const IconComponent = props.icon;
    const isActive = currentPage === id;
    return (
      <button 
        onClick={() => { 
          if (onClick) {
            onClick();
          } else {
            setCurrentPage(id); 
          }
          setIsSidebarOpen(false); 
        }}
        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all ${isActive ? `bg-primary-accent text-white shadow-ambient` : 'text-text-secondary hover:text-text-primary hover:bg-black/5 dark:hover:bg-white/5'}`}
      >
        <div className="relative">
          <IconComponent size={20} />
          {(id === 'bookings' || id === 'history') && pendingTransferCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-tertiary rounded-full shadow-tertiary animate-pulse" />
          )}
        </div>
        {!isSidebarCollapsed && <span>{label}</span>}
      </button>
    );
  };

  const getNavigationTabs = () => {
    if (user?.role === 'admin') {
      return [{ id: 'admin', icon: Shield, label: 'Admin Console' }];
    }
    if (user?.role === 'FACULTY') {
      return [
        { id: 'faculty', icon: GraduationCap, label: 'Faculty Portal' },
        { id: 'calendar', icon: CalendarIcon, label: 'Rooms' },
        { id: 'timetable', icon: Clock, label: 'Timetable' },
        { id: 'profile', icon: User, label: 'Profile' },
      ];
    }
    if (user?.role === 'VIEWER') {
      return [
        { id: 'calendar', icon: CalendarIcon, label: 'Rooms' },
        { id: 'timetable', icon: Clock, label: 'Timetable' },
        { id: 'promotion', icon: GraduationCap, label: 'Get Rep Access' },
        { id: 'profile', icon: User, label: 'Profile' },
      ];
    }
    // Default: STUDENT_REP or others
    return [
      { id: 'calendar', icon: CalendarIcon, label: 'Rooms' },
      { id: 'bookings', icon: History, label: 'Bookings' },
      { id: 'timetable', icon: Clock, label: 'Timetable' },
      { id: 'profile', icon: User, label: 'Profile' },
    ];
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
            className="w-full bg-accent text-white py-3 rounded-xl font-black uppercase tracking-widest text-[10px] hover:bg-accent/80 transition-all shadow-lg active:scale-95"
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
    <div className="w-full h-screen bg-surface-lowest text-text-primary flex overflow-hidden relative">
      <PWAInstallOverlay />
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <aside className={`fixed inset-y-0 left-0 glass px-6 py-3 sm:py-4 flex flex-col gap-6 z-50 transition-all duration-300 transform lg:relative lg:translate-x-0 ${isSidebarOpen ? 'translate-x-[0px]' : '-translate-x-full'} ${isSidebarCollapsed ? 'lg:w-20 lg:px-4' : 'lg:w-72 lg:px-6'} ${isSidebarOpen ? 'w-[75%] sm:w-72' : ''}`}>
        <div className={`flex items-center text-primary-accent ${isSidebarCollapsed ? 'justify-center w-full' : 'justify-between w-full'}`}>
          <div className="flex items-center gap-3 overflow-hidden">
            <button 
              onClick={() => window.innerWidth >= 1024 ? toggleSidebar() : setIsSidebarOpen(false)}
              className="p-1 hover:opacity-80 transition-opacity flex items-center gap-3 shrink-0"
              title={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
            >
              <Menu size={32} className="shrink-0" />
              {!isSidebarCollapsed && <h1 className="text-xl font-extrabold tracking-tight text-text-primary whitespace-nowrap font-display uppercase leading-tight">ROOM ALLOCATION</h1>}
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

        <div className={`transition-opacity duration-200 ${isSidebarCollapsed ? 'lg:opacity-0 lg:hidden' : 'opacity-100'} flex-1 flex flex-col gap-8`}>
          <div className="space-y-1">
            <p className="px-4 text-[10px] font-extrabold text-text-secondary uppercase tracking-[0.2em] mb-4 opacity-50 font-display">Navigation</p>
                <div className="flex flex-col gap-1">
                  {getNavigationTabs().map(tab => (
                    <NavButton 
                      key={tab.id}
                      id={tab.id} 
                      icon={tab.icon} 
                      label={tab.label} 
                    />
                  ))}
                </div>

          </div>

          {(currentPage === 'calendar' || currentPage === 'admin') && (
            <div className="space-y-4 pt-4">
              <p className="px-4 text-[10px] font-extrabold text-text-secondary uppercase tracking-[0.2em] mb-2 opacity-50 font-display">Discovery</p>
              <RoomFilter />
            </div>
          )}
        </div>

        <div className="mt-auto pt-6">
          <div className={`flex items-center ${isSidebarCollapsed ? 'lg:justify-center justify-between' : 'justify-between'}`}>
            <div className={`overflow-hidden ${isSidebarCollapsed ? 'lg:hidden block' : 'block'}`}>
              <p className="text-sm font-medium text-text-primary truncate">{user.name}</p>
              <p className="text-[10px] text-primary-accent uppercase tracking-widest font-extrabold">{user.role}</p>
            </div>
            <button onClick={logout} className="p-2.5 hover:bg-tonal-secondary rounded-xl text-text-secondary hover:text-text-primary transition-colors" title="Logout">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 p-0 flex flex-col w-full overflow-hidden">
        <header className="flex flex-row justify-between items-center p-3 sm:p-4 gap-3 bg-surface-low/50 backdrop-blur-md">
          <div className="flex items-center gap-1 sm:gap-2">
            <button 
                onClick={() => setIsSidebarOpen(true)}
                className="lg:hidden p-2 hover:bg-white/10 rounded-xl text-primary-accent transition-colors"
                title="Open Sidebar"
            >
              <Menu size={24} />
            </button>
            <h2 className="text-xl lg:text-2xl font-extrabold tracking-tight text-primary-accent leading-tight uppercase font-display">SCHEDULE</h2>
          </div>
          <div className="flex items-center gap-2">
              {currentPage === 'calendar' && (
               <div className="flex bg-surface-highest/10 rounded-xl p-1 font-display">
                 <button 
                  onClick={() => setViewMode('day')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-extrabold uppercase transition-all flex items-center gap-1.5 ${viewMode === 'day' ? 'bg-primary-accent text-white shadow-ambient' : 'text-text-secondary hover:text-text-primary'}`}
                 >
                   <Maximize2 size={12} /> Day
                 </button>
                 <button 
                  onClick={() => setViewMode('week')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-extrabold uppercase transition-all flex items-center gap-1.5 ${viewMode === 'week' ? 'bg-primary-accent text-white shadow-ambient' : 'text-text-secondary hover:text-text-primary'}`}
                 >
                   <LayoutGrid size={12} /> Week
                 </button>
               </div>
             )}
          </div>
        </header>

        <section className={`flex-1 flex flex-col overflow-hidden w-full p-2 sm:p-4 ${currentPage === 'calendar' ? 'pb-20 lg:pb-0' : 'pb-20 lg:pb-0'}`}>
          <div className="glass rounded-2xl p-2 sm:p-4 shadow-ambient flex-1 flex flex-col overflow-hidden w-full">
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
            {currentPage === 'profile' && <Profile />}
            {currentPage === 'timetable' && <Timetable />}
            {currentPage === 'bookings' && <Bookings />}
            {currentPage === 'promotion' && <PromotionRequest />}
            {currentPage === 'history' && window.innerWidth < 1024 && <MobileHistory onBack={() => setCurrentPage('calendar')} />}

            {currentPage === 'booking-mobile' && window.innerWidth < 1024 && <MobileBooking onBack={() => setCurrentPage('calendar')} />}
          </div>
        </section>
      </main>
      <BottomNav 
        currentPage={currentPage}
        setCurrentPage={(id) => {
          if (id === 'history' || id === 'bookings') {
            if (window.innerWidth < 1024) setCurrentPage('history');
            else setCurrentPage('bookings');
          } else {
            setCurrentPage(id);
          }
        }}
        user={user}
        tabs={getNavigationTabs()}
        pendingTransferCount={pendingTransferCount}
        setIsSidebarOpen={setIsSidebarOpen}
      />


      {currentPage === 'calendar' && (
        <FloatingActions 
          onSearchClick={() => {
            setIsSidebarOpen(prev => !prev);
          }}
          onCreateBookingClick={() => {
            if (window.innerWidth < 1024) {
              setCurrentPage('booking-mobile');
            } else {
              const now = new Date();
              let targetDate = new Date(now);
              let hour = now.getHours();
              
              if (hour < 8) hour = 8;
              else if (hour >= 18) {
                hour = 8;
                targetDate.setDate(targetDate.getDate() + 1);
              }

              const day = targetDate.getDay();
              if (day === 0) targetDate.setDate(targetDate.getDate() + 1);
              else if (day === 6) targetDate.setDate(targetDate.getDate() + 2);
              
              const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][targetDate.getDay()];
              
              setSelectedSlot({ day: dayName, hour, date: targetDate });
              setIsModalOpen(true);
            }
          }}
        />
      )}

      {isModalOpen && (
        <BookingModal 
          slot={selectedSlot} 
          onClose={() => setIsModalOpen(false)} 
          onSuccess={() => setIsModalOpen(false)}
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
