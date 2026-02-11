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
      fetchBookings();
    }
  }, [filters, user]);

  const fetchRooms = async () => {
    try {
      const query = new URLSearchParams(filters).toString();
      const res = await fetch(`http://localhost:4000/api/rooms?${query}`);
      if (res.status === 401) return handleLogout();
      const data = await res.json();
      setRooms(data);
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
    <div className="min-h-screen bg-[#0a0a0c] text-slate-200 flex">
      {/* Sidebar */}
      <aside className="w-72 glass border-r border-white/10 p-6 flex flex-col gap-8">
        <div className="flex items-center gap-3 text-indigo-400">
          <CalendarIcon size={32} />
          <h1 className="text-xl font-bold tracking-tight text-white">CRAS</h1>
        </div>

        <RoomFilter filters={filters} setFilters={setFilters} />

        <div className="mt-auto pt-6 border-t border-white/10">
          <div className="flex items-center justify-between">
            <div className="overflow-hidden">
              <p className="text-sm font-medium text-white truncate">{user.name}</p>
              <p className="text-[10px] text-indigo-400 uppercase tracking-widest font-bold">{user.role}</p>
            </div>
            <button onClick={handleLogout} className="p-2.5 hover:bg-white/5 rounded-xl text-slate-400 hover:text-white transition-colors border border-transparent hover:border-white/10">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-8 overflow-y-auto">
        <header className="flex justify-between items-center mb-10">
          <div>
            <h2 className="text-3xl font-bold text-white mb-2">Room Schedule</h2>
            <p className="text-slate-400">Manage and book campus rooms in real-time.</p>
          </div>
          <div className="flex gap-4">
             <button 
              onClick={() => setIsHistoryOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-medium transition-all"
             >
               <History size={18} />
               History
             </button>
          </div>
        </header>

        <section className="glass rounded-3xl p-6 shadow-2xl overflow-hidden">
          <Calendar 
            bookings={bookings} 
            rooms={rooms} 
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
