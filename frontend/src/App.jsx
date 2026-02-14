import React, { useState, useEffect, useCallback } from 'react';
import Calendar from './components/Calendar';
import RoomFilter from './components/RoomFilter';
import BookingModal from './components/BookingModal';
import HistoryModal from './components/HistoryModal';
import Login from './components/Login';
import Signup from './components/Signup';
import { LogOut, Calendar as CalendarIcon, History, Menu, X as CloseIcon } from 'lucide-react';
import { api } from './utils/api';

function App() {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('user');
    return saved && saved !== 'undefined' ? JSON.parse(saved) : null;
  });
  const [rooms, setRooms] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [availability, setAvailability] = useState([]);
  const [filters, setFilters] = useState({ capacity: '', ac: false, projector: false });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  }, []);

  const fetchRooms = useCallback(async () => {
    try {
      const query = new URLSearchParams(filters).toString();
      const res = await api.get(`/rooms?${query}`);
      if (res.status === 401) return handleLogout();
      const data = await res.json();
      if (Array.isArray(data)) {
        setRooms(data);
      } else {
        console.error('Expected array of rooms, got:', data);
      }
    } catch (err) {
      console.error('Fetch rooms failed', err);
    }
  }, [filters, handleLogout]);

  const fetchBookings = useCallback(async () => {
    try {
      const res = await api.get('/bookings');
      if (res.status === 401) return handleLogout();
      const data = await res.json();
      setBookings(data);
    } catch (err) {
      console.error('Fetch bookings failed', err);
    }
  }, [handleLogout]);

  const fetchAvailability = useCallback(async () => {
    try {
      const res = await api.get('/availability');
      if (res.status === 401) return handleLogout();
      const data = await res.json();
      setAvailability(data);
    } catch (err) {
      console.error('Fetch availability failed', err);
    }
  }, [handleLogout]);

  useEffect(() => {
    if (user) {
      fetchRooms();
    }
  }, [user, fetchRooms]);

  useEffect(() => {
    if (user) {
      fetchBookings();
      fetchAvailability();
    }
  }, [user, fetchBookings, fetchAvailability]);

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
        onLogin={(userData) => setUser(userData)} 
        onShowSignup={() => setIsSigningUp(true)} 
      />
    );
  }

  return (
    <div className="h-screen bg-bg-primary text-text-primary flex overflow-hidden relative">
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
            <h1 className="text-xl font-bold tracking-tight text-slate-900">CRAS</h1>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="p-2 lg:hidden text-slate-400 hover:text-slate-900">
             <CloseIcon size={24} />
          </button>
        </div>

        <RoomFilter filters={filters} setFilters={setFilters} />

        <div className="mt-auto pt-6 border-t border-black/5">
          <div className="flex items-center justify-between">
            <div className="overflow-hidden">
              <p className="text-sm font-medium text-slate-900 truncate">{user.name}</p>
              <p className="text-[10px] text-indigo-600 uppercase tracking-widest font-bold">{user.role}</p>
            </div>
            <button onClick={handleLogout} className="p-2.5 hover:bg-black/5 rounded-xl text-slate-500 hover:text-slate-900 transition-colors border border-transparent hover:border-black/5">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-4 lg:p-6 overflow-y-auto flex flex-col w-full">
        <header className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-4">
            <button 
                onClick={() => setIsSidebarOpen(true)}
                className="p-2 lg:hidden bg-white border border-black/5 rounded-xl text-slate-600 shadow-sm"
            >
                <Menu size={24} />
            </button>
            <div>
              <h2 className="text-xl lg:text-2xl font-bold text-slate-900 mb-0.5">Room Schedule</h2>
              <p className="text-slate-500 text-[10px] lg:text-xs">Manage and book campus rooms in real-time.</p>
            </div>
          </div>
          <div className="flex gap-2 lg:gap-4">
             <button 
              onClick={() => setIsHistoryOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-black/5 hover:bg-black/10 border border-black/5 rounded-xl text-xs font-medium transition-all"
             >
               <History size={16} />
               <span className="hidden sm:inline">History</span>
             </button>
          </div>
        </header>

        <section className="glass rounded-2xl p-4 shadow-lg flex-1 flex flex-col overflow-hidden">
          <Calendar 
            bookings={bookings} 
            rooms={rooms} 
            availability={availability}
            filters={filters}
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
          rooms={rooms} 
          bookings={bookings}
          availability={availability}
          onClose={() => setIsModalOpen(false)} 
          onSuccess={() => {
            setIsModalOpen(false);
            fetchBookings();
          }}
        />
      )}

      {isHistoryOpen && (
        <HistoryModal 
          bookings={bookings} 
          onClose={() => setIsHistoryOpen(false)} 
          onSuccess={fetchBookings}
        />
      )}
    </div>
  );
}

export default App;
