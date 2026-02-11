import React, { useState, useEffect } from 'react';
import Calendar from './components/Calendar';
import RoomFilter from './components/RoomFilter';
import BookingModal from './components/BookingModal';
import HistoryModal from './components/HistoryModal';
import Login from './components/Login';
import Signup from './components/Signup';
import { LogOut, Calendar as CalendarIcon, History } from 'lucide-react';

function App() {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('user');
    return saved && saved !== 'undefined' ? JSON.parse(saved) : null;
  });
  const [rooms, setRooms] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [filters, setFilters] = useState({ capacity: '', ac: false, projector: false });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [isSigningUp, setIsSigningUp] = useState(false);

  useEffect(() => {
    if (user) {
      fetchRooms();
    }
  }, [filters, user]);

  useEffect(() => {
    if (user) {
      fetchBookings();
    }
  }, [user]);

  const fetchRooms = async () => {
    try {
      const query = new URLSearchParams(filters).toString();
      const res = await fetch(`http://localhost:4000/api/rooms?${query}`);
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
  };

  const fetchBookings = async () => {
    try {
      const res = await fetch('http://localhost:4000/api/bookings');
      if (res.status === 401) return handleLogout();
      const data = await res.json();
      setBookings(data);
    } catch (err) {
      console.error('Fetch bookings failed', err);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

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
    <div className="h-screen bg-bg-primary text-text-primary flex overflow-hidden">
      {/* Sidebar */}
      <aside className="w-72 glass border-r border-black/5 p-6 flex flex-col gap-8">
        <div className="flex items-center gap-3 text-indigo-600">
          <CalendarIcon size={32} />
          <h1 className="text-xl font-bold tracking-tight text-slate-900">CRAS</h1>
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
      <main className="flex-1 p-6 overflow-hidden flex flex-col">
        <header className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 mb-0.5">Room Schedule</h2>
            <p className="text-slate-500 text-xs">Manage and book campus rooms in real-time.</p>
          </div>
          <div className="flex gap-4">
             <button 
              onClick={() => setIsHistoryOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-black/5 hover:bg-black/10 border border-black/5 rounded-xl text-xs font-medium transition-all"
             >
               <History size={16} />
               History
             </button>
          </div>
        </header>

        <section className="glass rounded-2xl p-4 shadow-lg overflow-hidden flex-1">
          <Calendar 
            bookings={bookings} 
            rooms={rooms} 
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
        />
      )}
    </div>
  );
}

export default App;
