import React, { useState, useContext, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate, NavLink } from 'react-router-dom';
import Calendar from './components/ui/Calendar';
import RoomFilter from './components/ui/RoomFilter';
import BookingModal from './components/modals/BookingModal';
import AdminDashboard from './pages/AdminDashboard';
import AdminTimetable from './pages/AdminTimetable';
import FacultyDashboard from './pages/FacultyDashboard';
import Timetable from './pages/Timetable';
import Bookings from './pages/Bookings';
import Login from './pages/Login';
import Signup from './pages/Signup';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import PromotionModal from './components/modals/PromotionModal';
import PWAInstallOverlay from './components/ui/PWAInstallOverlay';
import { getRoleLabel } from './utils/roleUtils';
import Profile from './pages/Profile';
import MobileHistory from './pages/MobileHistory';
import MobileBooking from './pages/MobileBooking';
import PromotionRequest from './pages/PromotionRequest';
import { AppContext } from './context/AppContext';
import { useWindowSize } from './hooks/useWindowSize';
import { LogOut, Calendar as CalendarIcon, History, Menu, X as CloseIcon, Sun, Moon, LayoutGrid, Maximize2, Shield, ShieldAlert, MessageSquare, Search, GraduationCap, User, Clock } from 'lucide-react';
import BottomNav from './components/ui/BottomNav';
import FloatingActions from './components/ui/FloatingActions';

function App() {
  const { user, viewMode, setViewMode, backendError, logout, theme, setTheme, pendingTransferCount } = useContext(AppContext);
  const { isDesktop } = useWindowSize();
  const location = useLocation();
  const navigate = useNavigate();
  
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    return localStorage.getItem('sidebarCollapsed') === 'true';
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [isPromotionOpen, setIsPromotionOpen] = useState(false);



  const toggleSidebar = () => {
    const newState = !isSidebarCollapsed;
    setIsSidebarCollapsed(newState);
    localStorage.setItem('sidebarCollapsed', newState);
  };

  const NavButton = ({ id, label, icon: IconComponent, to }) => {
    return (
      <NavLink 
        to={to || `/${id}`}
        onClick={() => setIsSidebarOpen(false)}
        className={({ isActive }) => `w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all ${isActive ? `bg-primary-accent text-white shadow-ambient` : 'text-text-secondary hover:text-text-primary hover:bg-black/5 dark:hover:bg-white/5'}`}
      >
        <div className="relative">
          <IconComponent size={20} />
          {(id === 'bookings' || id === 'history') && pendingTransferCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-tertiary rounded-full shadow-tertiary animate-pulse" />
          )}
        </div>
        {!isSidebarCollapsed && <span>{label}</span>}
      </NavLink>
    );
  };

  const getNavigationTabs = () => {
    if (user?.role === 'ADMIN') {
      return [
        { id: 'admin', icon: Shield, label: 'Admin Console' },
        { id: 'calendar', icon: CalendarIcon, label: 'Rooms' },
        { id: 'admin/timetable', icon: Clock, label: 'Timetable' },
        { id: 'profile', icon: User, label: 'Profile' },
      ];
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
        { id: 'promotion', icon: GraduationCap, label: 'Apply to Book Rooms' },
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

// Protected Route Component
const ProtectedRoute = ({ user, children, roles = [] }) => {
  if (!user) return <Navigate to="/login" replace />;
  if (roles.length > 0 && !roles.includes(user.role)) {
    return <Navigate to="/calendar" replace />;
  }
  return children;
};

function App() {
  const { user, viewMode, setViewMode, backendError, logout, theme, setTheme, pendingTransferCount } = useContext(AppContext);
    return (
      <div className="h-screen w-full flex items-center justify-center bg-surface-lowest p-6">
        <div className="max-w-md w-full bg-surface-low rounded-[2.5rem] p-8 sm:p-10 shadow-ambient text-center space-y-6 animate-in fade-in zoom-in duration-300">
          <div className="inline-flex p-4 bg-red-500/10 rounded-2xl text-red-500 mb-2">
            <ShieldAlert size={48} />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 uppercase font-display tracking-tight">Connection Error</h2>
          <p className="text-slate-600 font-medium">{backendError}</p>
          <button 
            type="button"
            onClick={() => window.location.reload()} 
            className="w-full bg-accent text-white py-4 rounded-xl font-bold uppercase tracking-widest text-[11px] hover:bg-accent/90 transition-all shadow-lg active:scale-95 font-display"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }
  const ThemeToggle = ({ className = "" }) => (
    <button 
      onClick={() => setTheme(prev => prev === 'light' ? 'dark' : 'light')}
      className={`p-2.5 hover:bg-tonal-secondary rounded-xl text-text-secondary hover:text-text-primary transition-all active:scale-95 ${className}`}
      title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
    >
      {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
    </button>
  );

  return (
    <div className={`h-screen w-full flex flex-col transition-colors duration-400 font-body ${theme === 'dark' ? 'dark' : ''} bg-surface-lowest`}>
      <Routes>
        {/* Auth Routes */}
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login onShowSignup={() => navigate('/signup')} />} />
        <Route path="/signup" element={user ? <Navigate to="/" replace /> : <Signup onSignupSuccess={() => navigate('/')} onBackToLogin={() => navigate('/login')} />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* Global Main Layout Wrap */}
        <Route path="/*" element={
          !user ? <Navigate to="/login" replace /> : (
            <div className="flex h-full w-full overflow-hidden">
              {/* Mobile Drawer Overlay */}
              {isSidebarOpen && !isDesktop && (
                <div 
                  className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 animate-in fade-in duration-300"
                  onClick={() => setIsSidebarOpen(false)}
                />
              )}

              <aside className={`fixed inset-y-0 left-0 glass px-6 py-3 sm:py-4 flex flex-col gap-6 z-50 transition-all duration-300 transform lg:relative lg:translate-x-0 ${isSidebarOpen ? 'translate-x-[0px]' : '-translate-x-full'} ${isSidebarCollapsed ? 'lg:w-20 lg:px-4' : 'lg:w-72 lg:px-6'} ${isSidebarOpen ? 'w-[75%] sm:w-72' : ''}`}>
                <div className={`flex items-center text-primary-accent ${isSidebarCollapsed ? 'justify-center w-full' : 'justify-between w-full'} relative`}>
                  <div className="flex items-center gap-3 overflow-hidden">
                    <button 
                      onClick={() => window.innerWidth >= 1024 ? toggleSidebar() : setIsSidebarOpen(false)}
                      className="p-1 hover:opacity-80 transition-opacity flex items-center gap-3 shrink-0"
                      title={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
                    >
                      <Menu size={32} className="shrink-0" />
                      {!isSidebarCollapsed && <h1 className="text-lg font-extrabold tracking-tighter text-text-primary whitespace-nowrap font-display uppercase leading-tight pr-8 lg:pr-0">ROOM ALLOCATION</h1>}
                    </button>
                  </div>
                  {!isSidebarCollapsed && (
                    <button onClick={() => setIsSidebarOpen(false)} className="absolute right-0 top-1/2 -translate-y-1/2 p-2 lg:hidden text-text-secondary hover:text-text-primary"><CloseIcon size={24} /></button>
                  )}
                </div>

                <div className={`transition-opacity duration-200 ${isSidebarCollapsed ? 'lg:opacity-0 lg:hidden' : 'opacity-100'} flex-1 flex flex-col gap-8`}>
                  <div className="space-y-1">
                    <p className="px-4 text-[10px] font-extrabold text-text-secondary uppercase tracking-[0.2em] mb-4 opacity-50 font-display">Navigation</p>
                    <div className="flex flex-col gap-1">
                      {getNavigationTabs().map(tab => (
                        <NavButton key={tab.id} id={tab.id} icon={tab.icon} label={tab.label} to={tab.id === 'calendar' ? '/calendar' : `/${tab.id}`} />
                      ))}
                    </div>
                  </div>

                  {(location.pathname === '/calendar' || location.pathname === '/admin') && (
                    <div className="space-y-4 pt-4">
                      <p className="px-4 text-[10px] font-extrabold text-text-secondary uppercase tracking-[0.2em] mb-2 opacity-50 font-display">Discovery</p>
                      <RoomFilter />
                    </div>
                  )}
                </div>

                <div className="mt-auto pt-6 border-t border-border/20">
                  <div className={`flex items-center ${isSidebarCollapsed ? 'lg:flex-col lg:gap-2' : 'justify-between'}`}>
                    <div className={`overflow-hidden ${isSidebarCollapsed ? 'hidden' : 'block'}`}>
                      <p className="text-sm font-black text-text-primary truncate">{user?.name}</p>
                      <p className="text-[9px] text-primary-accent uppercase tracking-widest font-black opacity-60">{getRoleLabel(user?.role)}</p>
                    </div>
                    <div className={`flex items-center gap-1 ${isSidebarCollapsed ? 'flex-col' : ''}`}>
                      <ThemeToggle />
                      <button onClick={logout} className="p-2.5 hover:bg-red-500/10 rounded-xl text-text-secondary hover:text-red-500 transition-colors" title="Logout"><LogOut size={18} /></button>
                    </div>
                  </div>
                </div>
              </aside>

              <main className="flex-1 p-0 flex flex-col w-full overflow-hidden">
                <header className="flex flex-row justify-between items-center p-3 sm:p-4 gap-3 bg-surface-low/50 backdrop-blur-md">
                  <div className="flex items-center gap-1 sm:gap-2">
                    <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden p-2 hover:bg-white/10 rounded-xl text-primary-accent transition-colors"><Menu size={24} /></button>
                    <h2 className="text-xl lg:text-2xl font-extrabold tracking-tight text-primary-accent leading-tight uppercase font-display">
                      {location.pathname.split('/')[1] || 'Schedule'}
                    </h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <ThemeToggle className="lg:hidden" />
                    {location.pathname === '/calendar' && (
                      <div className="flex bg-surface-highest/10 rounded-xl p-1 font-display">
                        <button onClick={() => setViewMode('day')} className={`px-3 py-1.5 rounded-lg text-xs font-extrabold uppercase transition-all flex items-center gap-1.5 ${viewMode === 'day' ? 'bg-primary-accent text-white shadow-ambient' : 'text-text-secondary hover:text-text-primary'}`}><Maximize2 size={12} /> Day</button>
                        <button onClick={() => setViewMode('week')} className={`px-3 py-1.5 rounded-lg text-xs font-extrabold uppercase transition-all flex items-center gap-1.5 ${viewMode === 'week' ? 'bg-primary-accent text-white shadow-ambient' : 'text-text-secondary hover:text-text-primary'}`}><LayoutGrid size={12} /> Week</button>
                      </div>
                    )}
                  </div>
                </header>

                <section className="flex-1 flex flex-col overflow-hidden w-full p-2 sm:p-4 pb-20 lg:pb-0">
                  <div className="glass rounded-2xl p-2 sm:p-4 shadow-ambient flex-1 flex flex-col overflow-hidden w-full">
                    <Routes>
                      <Route path="/calendar" element={<ProtectedRoute user={user}><Calendar onSlotClick={(slot) => { setSelectedSlot(slot); setIsModalOpen(true); }} /></ProtectedRoute>} />
                      <Route path="/admin" element={<ProtectedRoute user={user} roles={['ADMIN']}><AdminDashboard /></ProtectedRoute>} />
                      <Route path="/admin/timetable" element={<ProtectedRoute user={user} roles={['ADMIN']}><AdminTimetable /></ProtectedRoute>} />
                      <Route path="/faculty" element={<ProtectedRoute user={user} roles={['FACULTY']}><FacultyDashboard /></ProtectedRoute>} />
                      <Route path="/profile" element={<ProtectedRoute user={user}><Profile /></ProtectedRoute>} />
                      <Route path="/timetable" element={<ProtectedRoute user={user}><Timetable /></ProtectedRoute>} />
                      <Route path="/bookings" element={<ProtectedRoute user={user} roles={['STUDENT_REP', 'FACULTY', 'ADMIN']}><Bookings /></ProtectedRoute>} />
                      <Route path="/promotion" element={<ProtectedRoute user={user}><PromotionRequest /></ProtectedRoute>} />
                      <Route path="/history" element={!isDesktop ? <MobileHistory onBack={() => navigate('/calendar')} /> : <Navigate to="/bookings" />} />
                      <Route path="/booking-mobile" element={!isDesktop ? <MobileBooking onBack={() => navigate('/calendar')} /> : <Navigate to="/calendar" />} />
                      <Route path="/" element={
                        user?.role === 'ADMIN' ? <Navigate to="/admin" replace /> :
                        user?.role === 'FACULTY' ? <Navigate to="/faculty" replace /> :
                        <Navigate to="/calendar" replace />
                      } />
                      <Route path="*" element={<Navigate to="/calendar" replace />} />
                    </Routes>
                  </div>
                </section>
                <BottomNav user={user} tabs={getNavigationTabs()} pendingTransferCount={pendingTransferCount} setIsSidebarOpen={setIsSidebarOpen} />
              </main>

              {location.pathname === '/calendar' && (
                <FloatingActions 
                  onSearchClick={() => setIsSidebarOpen(prev => !prev)}
                  onCreateBookingClick={() => {
                    if (!isDesktop) navigate('/booking-mobile');
                    else {
                      const now = new Date();
                      let targetDate = new Date(now);
                      let hour = now.getHours();
                      if (hour < 8) hour = 8; else if (hour >= 18) { hour = 8; targetDate.setDate(targetDate.getDate() + 1); }
                      setSelectedSlot({ day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][targetDate.getDay()], hour, date: targetDate });
                      setIsModalOpen(true);
                    }
                  }}
                />
              )}

              {isModalOpen && <BookingModal slot={selectedSlot} onClose={() => setIsModalOpen(false)} onSuccess={() => setIsModalOpen(false)} />}
              {isPromotionOpen && <PromotionModal onClose={() => setIsPromotionOpen(false)} />}
            </div>
          )
        } />
      </Routes>
    </div>
  );
}

export default App;
