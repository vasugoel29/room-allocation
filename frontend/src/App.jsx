import React, { useState, useContext, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate, NavLink } from 'react-router-dom';
import Calendar from './components/ui/Calendar';
import RoomFilter from './components/ui/RoomFilter';
import BookingModal from './components/modals/BookingModal';
import PWAInstallOverlay from './components/ui/PWAInstallOverlay';
import { getRoleLabel } from './utils/roleUtils';
import { AppContext } from './context/AppContext';
import { useWindowSize } from './hooks/useWindowSize';
import { LogOut, Calendar as CalendarIcon, History, Menu, X as CloseIcon, Sun, Moon, LayoutGrid, Maximize2, Shield, ShieldAlert, MessageSquare, Search, GraduationCap, User, Clock } from 'lucide-react';
import BottomNav from './components/ui/BottomNav';
import FloatingActions from './components/ui/FloatingActions';
import NotificationBell from './components/ui/NotificationBell';
import { P, can, canAny, canSeeCalendar, isAdmin } from './utils/permissions';
import { BOOKING_RULES } from '../../shared/bookingRules.js';

// Lazy-loaded pages for bundle splitting
const AdminDashboard = React.lazy(() => import('./pages/AdminDashboard'));
const AdminTimetable = React.lazy(() => import('./pages/AdminTimetable'));
const FacultyDashboard = React.lazy(() => import('./pages/FacultyDashboard'));
const Timetable = React.lazy(() => import('./pages/Timetable'));
const Bookings = React.lazy(() => import('./pages/Bookings'));
const Login = React.lazy(() => import('./pages/Login'));
const Profile = React.lazy(() => import('./pages/Profile'));
const MobileHistory = React.lazy(() => import('./pages/MobileHistory'));
const MobileBooking = React.lazy(() => import('./pages/MobileBooking'));

const FormLoadingFallback = () => (
  <div className="h-screen w-full flex items-center justify-center bg-surface-lowest p-6">
    <div className="max-w-md w-full bg-surface-low rounded-[2.5rem] p-8 sm:p-10 shadow-ambient space-y-6 animate-pulse">
      <div className="flex flex-col items-center space-y-3">
        <div className="w-16 h-16 rounded-2xl bg-surface-highest/20" />
        <div className="h-6 w-36 bg-surface-highest/25 rounded-lg" />
        <div className="h-3.5 w-48 bg-surface-highest/10 rounded-md" />
      </div>
      <div className="space-y-4 pt-4">
        <div className="space-y-2">
          <div className="h-3.5 w-16 bg-surface-highest/15 rounded-md" />
          <div className="h-12 w-full bg-surface-highest/10 rounded-xl" />
        </div>
        <div className="space-y-2">
          <div className="h-3.5 w-16 bg-surface-highest/15 rounded-md" />
          <div className="h-12 w-full bg-surface-highest/10 rounded-xl" />
        </div>
        <div className="h-12 w-full bg-primary/20 rounded-xl mt-6" />
      </div>
    </div>
  </div>
);

const DashboardLoadingFallback = () => (
  <div className="w-full h-full space-y-6 animate-pulse">
    {/* Page Header Skeleton */}
    <div className="flex justify-between items-center pb-4 border-b border-border/10">
      <div className="space-y-2">
        <div className="h-6 w-48 bg-surface-highest/20 rounded-lg" />
        <div className="h-3.5 w-32 bg-surface-highest/10 rounded-md" />
      </div>
      <div className="h-10 w-24 bg-surface-highest/20 rounded-xl" />
    </div>

    {/* Metric Cards Grid Skeleton */}
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {[1, 2, 3].map((i) => (
        <div key={i} className="glass p-5 rounded-2xl space-y-3 bg-surface-highest/5">
          <div className="flex justify-between items-center">
            <div className="h-4 w-24 bg-surface-highest/15 rounded-md" />
            <div className="w-8 h-8 rounded-xl bg-surface-highest/15" />
          </div>
          <div className="h-8 w-16 bg-surface-highest/25 rounded-lg" />
          <div className="h-3 w-36 bg-surface-highest/10 rounded-md" />
        </div>
      ))}
    </div>

    {/* Large Content Block & Secondary List Skeleton */}
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 glass p-6 rounded-2xl h-80 bg-surface-highest/5 flex flex-col justify-between">
        <div className="space-y-2">
          <div className="h-5 w-40 bg-surface-highest/20 rounded-lg" />
          <div className="h-3.5 w-60 bg-surface-highest/10 rounded-md" />
        </div>
        <div className="w-full flex items-end gap-3 h-48 px-2">
          {[60, 40, 80, 50, 70, 30, 90, 45, 65, 85].map((height, idx) => (
            <div 
              key={idx} 
              className="flex-1 bg-surface-highest/15 rounded-t-lg" 
              style={{ height: `${height}%` }} 
            />
          ))}
        </div>
      </div>
      <div className="glass p-6 rounded-2xl h-80 bg-surface-highest/5 space-y-4">
        <div className="h-5 w-32 bg-surface-highest/20 rounded-lg" />
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3 py-2 border-b border-border/5">
              <div className="w-10 h-10 rounded-xl bg-surface-highest/15 shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-3/4 bg-surface-highest/15 rounded-md" />
                <div className="h-2.5 w-1/2 bg-surface-highest/10 rounded-sm" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);

// Route guard: the user must hold one of `perms` (none listed = any signed-in user).
const ProtectedRoute = ({ user, children, perms = [] }) => {
  if (!user) return <Navigate to="/login" replace />;
  if (perms.length > 0 && !canAny(user, ...perms)) return <Navigate to={homeFor(user)} replace />;
  return children;
};

/** Where a person lands: their most specific area they're allowed into. */
const homeFor = (user) => {
  if (isAdmin(user)) return '/admin';
  if (can(user, P.FACULTY_PORTAL)) return '/faculty';
  if (canSeeCalendar(user)) return '/calendar';
  if (can(user, P.TIMETABLE)) return '/timetable';
  return '/profile';
};


const NavButton = ({ id, label, icon, to, setIsSidebarOpen, isSidebarCollapsed, pendingTransferCount }) => {
  const IconComponent = icon;
  const location = useLocation();
  const targetPath = to || `/${id}`;
  const isActive = targetPath.includes('?')
    ? (location.pathname === targetPath.split('?')[0] && location.search === '?' + targetPath.split('?')[1])
    : (location.pathname === targetPath && !location.search);

  return (
    <NavLink 
      to={targetPath}
      onClick={() => setIsSidebarOpen(false)}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all ${isActive ? `bg-primary-accent text-white shadow-ambient` : 'text-text-secondary hover:text-text-primary hover:bg-black/5 dark:hover:bg-white/5'}`}
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

const ThemeToggle = ({ theme, setTheme, className = "" }) => (
  <button 
    onClick={() => setTheme(prev => prev === 'light' ? 'dark' : 'light')}
    className={`p-2.5 hover:bg-tonal-secondary rounded-xl text-text-secondary hover:text-text-primary transition-all active:scale-95 ${className}`}
    title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
  >
    {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
  </button>
);

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

  if (backendError) {
    return (
      <div className={`h-screen w-full flex items-center justify-center bg-surface-lowest p-6 ${theme === 'dark' ? 'dark' : ''}`}>
        <div className="max-w-md w-full bg-surface-low rounded-[2.5rem] p-8 sm:p-10 shadow-ambient text-center space-y-6 animate-in fade-in zoom-in duration-300">
          <div className="inline-flex p-4 bg-red-500/10 rounded-2xl text-red-500 mb-2">
            <ShieldAlert size={48} />
          </div>
          <h2 className="text-2xl font-bold text-text-primary capitalize font-display tracking-tight">Connection Error</h2>
          <p className="text-text-secondary font-medium">{backendError}</p>
          <button 
            type="button"
            onClick={() => window.location.reload()} 
            className="w-full bg-primary text-white py-4 rounded-xl font-bold capitalize tracking-widest text-[11px] hover:bg-primary/90 transition-all shadow-lg active:scale-95 font-display"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  const toggleSidebar = () => {
    const newState = !isSidebarCollapsed;
    setIsSidebarCollapsed(newState);
    localStorage.setItem('sidebarCollapsed', newState);
  };

  const getNavigationTabs = () => {
    const tabs = [];

    if (isAdmin(user)) tabs.push({ id: 'admin', icon: Shield, label: 'Admin Console' });
    if (can(user, P.FACULTY_PORTAL)) tabs.push({ id: 'faculty', icon: GraduationCap, label: 'Faculty Portal' });
    if (canSeeCalendar(user)) tabs.push({ id: 'calendar', icon: CalendarIcon, label: 'Rooms' });
    if (canAny(user, P.BOOKINGS, P.ADMIN)) tabs.push({ id: 'bookings', icon: History, label: 'Bookings' });
    if (can(user, P.TIMETABLE)) tabs.push({ id: 'timetable', icon: Clock, label: 'Timetable' });
    tabs.push({ id: 'profile', icon: User, label: 'Profile' });
    return tabs;
  };




  return (
    <div className={`h-screen w-full flex flex-col transition-colors duration-400 font-body ${theme === 'dark' ? 'dark' : ''} bg-surface-lowest`}>
      <Suspense fallback={<FormLoadingFallback />}>
        <Routes>
        {/* Auth Routes */}
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />

        {/* Global Main Layout Wrap */}
        <Route path="/*" element={
          !user ? <Navigate to="/login" replace /> : (
            <div className="flex h-full w-full overflow-hidden">
              {/* Mobile Drawer Overlay */}
              {isSidebarOpen && !isDesktop && (
                <div 
                  className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[75] animate-in fade-in duration-300"
                  onClick={() => setIsSidebarOpen(false)}
                />
              )}

              <aside className={`fixed inset-y-0 left-0 bg-surface-lowest sm:bg-surface-low border-r border-border/20 lg:border-none lg:bg-transparent lg:glass px-6 py-3 sm:py-4 flex flex-col gap-6 z-[80] shadow-2xl transition-all duration-300 transform lg:relative lg:translate-x-0 ${isSidebarOpen ? 'translate-x-[0px]' : '-translate-x-full'} ${isSidebarCollapsed ? 'lg:w-20 lg:px-4' : 'lg:w-72 lg:px-6'} ${isSidebarOpen ? 'w-[80%] max-w-sm' : ''}`}>
                <div className={`flex items-center text-primary-accent ${isSidebarCollapsed ? 'justify-center w-full' : 'justify-between w-full'} relative`}>
                  <div className="flex items-center gap-3 overflow-hidden">
                    <button 
                      onClick={() => window.innerWidth >= 1024 ? toggleSidebar() : setIsSidebarOpen(false)}
                      className="p-1 hover:opacity-80 transition-opacity flex items-center gap-3 shrink-0"
                      title={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
                    >
                      <Menu size={32} className="shrink-0" />
                      {!isSidebarCollapsed && <h1 className="text-lg font-extrabold tracking-tighter text-text-primary whitespace-nowrap font-display capitalize leading-tight pr-8 lg:pr-0">ROOM ALLOCATION</h1>}
                    </button>
                  </div>
                  {!isSidebarCollapsed && (
                    <button onClick={() => setIsSidebarOpen(false)} className="absolute right-0 top-1/2 -translate-y-1/2 p-2 lg:hidden text-text-secondary hover:text-text-primary"><CloseIcon size={24} /></button>
                  )}
                </div>

                <div className={`transition-opacity duration-200 ${isSidebarCollapsed ? 'lg:opacity-0 lg:hidden' : 'opacity-100'} flex-1 min-h-0 flex flex-col gap-8 overflow-y-auto no-scrollbar pb-6`}>
                  <div className="space-y-1">
                    <p className="px-4 text-[10px] font-extrabold text-text-secondary capitalize tracking-[0.2em] mb-4 opacity-50 font-display">Navigation</p>
                    <div className="flex flex-col gap-1">
                      {getNavigationTabs().map(tab => (
                        <NavButton 
                          key={tab.id} 
                          id={tab.id} 
                          icon={tab.icon} 
                          label={tab.label} 
                          to={tab.id === 'calendar' ? '/calendar' : `/${tab.id}`}
                          setIsSidebarOpen={setIsSidebarOpen}
                          isSidebarCollapsed={isSidebarCollapsed}
                          pendingTransferCount={pendingTransferCount}
                        />
                      ))}
                    </div>
                  </div>

                  {location.pathname === '/calendar' && (
                    <div className="space-y-4 pt-4">
                      <p className="px-4 text-[10px] font-extrabold text-text-secondary capitalize tracking-[0.2em] mb-2 opacity-50 font-display">Discovery</p>
                      <RoomFilter />
                    </div>
                  )}
                </div>

                <div className="mt-auto pt-6 border-t border-border/20 shrink-0">
                  <div className={`flex items-center ${isSidebarCollapsed ? 'lg:flex-col lg:gap-2' : 'justify-between'}`}>
                    <div className={`overflow-hidden ${isSidebarCollapsed ? 'hidden' : 'block'}`}>
                      <p className="text-sm font-black text-text-primary truncate">{user?.name}</p>
                      <p className="text-[9px] text-primary-accent capitalize tracking-widest font-black opacity-60">{getRoleLabel(user?.role)}</p>
                    </div>
                    <div className={`flex items-center gap-1 ${isSidebarCollapsed ? 'flex-col' : ''}`}>
                      <ThemeToggle theme={theme} setTheme={setTheme} />
                      <button onClick={logout} className="p-2.5 hover:bg-red-500/10 rounded-xl text-text-secondary hover:text-red-500 transition-colors" title="Logout"><LogOut size={18} /></button>
                    </div>
                  </div>
                </div>
              </aside>

              <main className="flex-1 p-0 flex flex-col w-full overflow-hidden">
                {/* relative z-50: backdrop-blur makes the header a stacking context; keep the inbox panel above page and sticky headers. */}
                <header className="relative z-50 flex flex-row justify-between items-center p-3 sm:p-4 gap-3 bg-surface-low/50 backdrop-blur-md">
                  <div className="flex items-center gap-1 sm:gap-2">
                    <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden p-2 hover:bg-white/10 rounded-xl text-primary-accent transition-colors"><Menu size={24} /></button>
                    <h2 className="text-xl lg:text-2xl font-extrabold tracking-tight text-primary-accent leading-tight capitalize font-display">
                      {(location.pathname.split('/')[1] || 'Schedule').replace(/-/g, ' ')}
                    </h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <ThemeToggle theme={theme} setTheme={setTheme} />
                    <NotificationBell />
                    {location.pathname === '/calendar' && (
                      <div className="flex bg-surface-highest/10 rounded-xl p-1 font-display">
                        <button onClick={() => setViewMode('day')} className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-extrabold capitalize transition-all flex items-center gap-1.5 ${viewMode === 'day' ? 'bg-primary-accent text-white shadow-ambient' : 'text-text-secondary hover:text-text-primary'}`}><Maximize2 size={12} /> Day</button>
                        <button onClick={() => setViewMode('week')} className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-extrabold capitalize transition-all flex items-center gap-1.5 ${viewMode === 'week' ? 'bg-primary-accent text-white shadow-ambient' : 'text-text-secondary hover:text-text-primary'}`}><LayoutGrid size={12} /> Week</button>
                      </div>
                    )}
                  </div>
                </header>

                <section className="flex-1 flex flex-col overflow-hidden w-full p-2 sm:p-4 pb-20 lg:pb-0">
                  <div className="glass rounded-2xl p-2 sm:p-4 shadow-ambient flex-1 flex flex-col overflow-hidden w-full">
                    <Suspense fallback={<DashboardLoadingFallback />}>
                      <Routes>
                      <Route path="/calendar" element={<ProtectedRoute user={user} perms={[P.CALENDAR, P.BOOKINGS, P.BOOKINGS_DIRECT, P.ADMIN]}><Calendar onSlotClick={(slot) => { setSelectedSlot(slot); setIsModalOpen(true); }} /></ProtectedRoute>} />
                      <Route path="/admin" element={<ProtectedRoute user={user} perms={[P.ADMIN]}><AdminDashboard /></ProtectedRoute>} />
                      <Route path="/admin/timetable" element={<Navigate to="/admin?tab=timetable" replace />} />
                      <Route path="/faculty" element={<ProtectedRoute user={user} perms={[P.FACULTY_PORTAL]}><FacultyDashboard /></ProtectedRoute>} />
                      <Route path="/profile" element={<ProtectedRoute user={user}><Profile /></ProtectedRoute>} />
                      <Route path="/timetable" element={<ProtectedRoute user={user} perms={[P.TIMETABLE]}><Timetable /></ProtectedRoute>} />
                      <Route path="/bookings" element={<ProtectedRoute user={user} perms={[P.BOOKINGS, P.BOOKINGS_DIRECT, P.ADMIN]}><Bookings /></ProtectedRoute>} />
                      {/* Same roles as /bookings: viewers can't reach the booking flow by URL (FE-24). */}
                      <Route path="/history" element={<ProtectedRoute user={user} perms={[P.BOOKINGS, P.BOOKINGS_DIRECT, P.ADMIN]}>{!isDesktop ? <MobileHistory onBack={() => navigate('/calendar')} /> : <Navigate to="/bookings" />}</ProtectedRoute>} />
                      <Route path="/book-a-slot" element={<ProtectedRoute user={user} perms={[P.BOOKINGS, P.BOOKINGS_DIRECT, P.ADMIN]}>{!isDesktop ? <MobileBooking onBack={() => navigate('/calendar')} /> : <Navigate to="/calendar" />}</ProtectedRoute>} />
                      <Route path="/" element={<Navigate to={homeFor(user)} replace />} />
                      <Route path="*" element={<Navigate to={homeFor(user)} replace />} />
                      </Routes>
                    </Suspense>
                  </div>
                </section>
                <BottomNav user={user} tabs={getNavigationTabs()} pendingTransferCount={pendingTransferCount} setIsSidebarOpen={setIsSidebarOpen} />
              </main>

              {location.pathname === '/calendar' && (
                <FloatingActions 
                  onSearchClick={() => setIsSidebarOpen(prev => !prev)}
                  onCreateBookingClick={() => {
                    if (!isDesktop) navigate('/book-a-slot');
                    else {
                      const now = new Date();
                      let targetDate = new Date(now);
                      let hour = now.getHours();
                      if (hour < BOOKING_RULES.OPEN_HOUR) hour = BOOKING_RULES.OPEN_HOUR; else if (hour >= BOOKING_RULES.CLOSE_HOUR - 1) { hour = BOOKING_RULES.OPEN_HOUR; targetDate.setDate(targetDate.getDate() + 1); }
                      setSelectedSlot({ day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][targetDate.getDay()], hour, date: targetDate });
                      setIsModalOpen(true);
                    }
                  }}
                />
              )}

              {isModalOpen && <BookingModal slot={selectedSlot} onClose={() => setIsModalOpen(false)} onSuccess={() => setIsModalOpen(false)} />}
            </div>
          )
        } />
      </Routes>
      </Suspense>
    </div>
  );
}

export default App;
