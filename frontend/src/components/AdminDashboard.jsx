import { useState, useEffect, useContext, useMemo } from 'react';
import { 
  Shield, 
  Users, 
  Calendar as CalendarIcon, 
  Download, 
  Search, 
  Check, 
  X, 
  Clock,
  ArrowRight,
  Zap,
  ChevronDown,
  User as UserIcon,
  Filter,
  UserPlus,
  Trash2,
  Edit,
  Mail,
  ShieldAlert
} from 'lucide-react';
import { AppContext } from '../context/AppContext';
import api from '../utils/api';
import toast from 'react-hot-toast';


function AdminDashboard() {
  const { user } = useContext(AppContext);
  const [activeTab, setActiveTab] = useState('bookings'); // 'bookings' | 'promotions' | 'users'
  const [bookings, setBookings] = useState([]);
  const [promotions, setPromotions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRange, setFilterRange] = useState('day'); // 'day' | 'week'
  const [quickBookForm, setQuickBookForm] = useState({
    date: new Date().toISOString().split('T')[0],
    slot: '8',
    purpose: 'Admin Override',
    target_user_id: null,
    roomFilter: 'all'
  });
  const [users, setUsers] = useState([]);
  const [roomStatuses, setRoomStatuses] = useState([]);
  const [submitting, setSubmitting] = useState(null); // booking_id being submitted
  const [userDropdownOpen, setUserDropdownOpen] = useState(null); // room_id
  const [userSearch, setUserSearch] = useState('');
  
  // User CRUD states
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [userForm, setUserForm] = useState({ name: '', email: '', role: 'VIEWER', password: '' });

  useEffect(() => {
    fetchData();
  }, [filterRange]); // Refetch bookings when range changes.

  useEffect(() => {
    if (activeTab === 'quick' || activeTab === 'users') {
      fetchUsers();
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'quick') {
      fetchRoomStatuses();
    }
  }, [activeTab, quickBookForm.date, quickBookForm.slot]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const now = new Date();
      let startDate, endDate;
      if (filterRange === 'day') {
        startDate = new Date(now.setHours(0,0,0,0)).toISOString();
        endDate = new Date(now.setHours(23,59,59,999)).toISOString();
      } else {
        const monday = new Date(now);
        monday.setDate(now.getDate() - (now.getDay() || 7) + 1);
        startDate = new Date(monday.setHours(0,0,0,0)).toISOString();
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        endDate = new Date(sunday.setHours(23,59,59,999)).toISOString();
      }

      // Fetch both for accurate badges and smooth tab switching
      const [bookingsRes, promotionsRes] = await Promise.all([
        api.get(`/bookings/admin/all?start_date=${startDate}&end_date=${endDate}`),
        api.get('/promotions')
      ]);

      const [bookingsData, promotionsData] = await Promise.all([
        bookingsRes.json(),
        promotionsRes.json()
      ]);

      if (Array.isArray(bookingsData)) setBookings(bookingsData);
      if (Array.isArray(promotionsData)) setPromotions(promotionsData);
    } catch (err) {
      console.error('Failed to fetch admin data', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await api.get('/auth/users');
      const data = await res.json();
      if (Array.isArray(data)) setUsers(data);
    } catch (err) {
      console.error('Failed to fetch users', err);
    }
  };

  const fetchRoomStatuses = async () => {
    try {
      const res = await api.get(`/rooms/admin/status?date=${quickBookForm.date}&slot=${quickBookForm.slot}`);
      const data = await res.json();
      if (Array.isArray(data)) setRoomStatuses(data);
    } catch (err) {
      console.error('Failed to fetch room statuses', err);
    }
  };

  const handlePromotion = async (id, status) => {
    const comment = prompt(`Add a comment for ${status.toLowerCase()}:`);
    try {
      await api.patch(`/promotions/${id}`, { status, admin_comment: comment });
      fetchData();
    } catch (err) {
      alert('Action failed');
    }
  };

  const exportCSV = () => {
    const data = activeTab === 'bookings' ? bookings : promotions;
    if (data.length === 0) return;

    const headers = Object.keys(data[0]).join(',');
    const rows = data.map(row => 
      Object.values(row).map(val => `"${val}"`).join(',')
    ).join('\n');

    const csvContent = "data:text/csv;charset=utf-8," + headers + "\n" + rows;
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${activeTab}_export_${new Date().toISOString()}.csv`);
    document.body.appendChild(link);
    link.click();
  };
  
  const handleQuickBookSubmit = async (room_name, target_user_id) => {
    if (!target_user_id) {
      toast.error('Please select a user first');
      return;
    }
    setSubmitting(room_name);
    try {
      const res = await api.post('/bookings/admin/quick', {
        room_name,
        target_user_id,
        date: quickBookForm.date,
        slot: parseInt(quickBookForm.slot),
        purpose: quickBookForm.purpose || 'Admin Override'
      });
      if (res.ok) {
        toast.success(`Room ${room_name} booked successfully!`);
        fetchRoomStatuses();
        fetchData();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Booking failed');
      }
    } catch (err) {
      toast.error('Network error');
    } finally {
      setSubmitting(null);
    }
  };

  const handleUserSubmit = async (e) => {
    e.preventDefault();
    try {
      let res;
      if (editingUser) {
        res = await api.patch(`/auth/users/${editingUser.id}`, userForm);
      } else {
        res = await api.post('/auth/users', userForm);
      }
      
      if (res.ok) {
        toast.success(editingUser ? 'User updated' : 'User created');
        setIsUserModalOpen(false);
        setEditingUser(null);
        setUserForm({ name: '', email: '', role: 'VIEWER', password: '' });
        fetchUsers();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Operation failed');
      }
    } catch (err) {
      toast.error('Network error');
    }
  };

  const deleteUser = async (id) => {
    if (!confirm('Are you sure you want to delete this user? This cannot be undone.')) return;
    try {
      const res = await api.delete(`/auth/users/${id}`);
      if (res.ok) {
        toast.success('User deleted');
        fetchUsers();
      } else {
        toast.error('Failed to delete user');
      }
    } catch (err) {
      toast.error('Network error');
    }
  };

  const openEditModal = (u) => {
    setEditingUser(u);
    setUserForm({ name: u.name, email: u.email, role: u.role, password: '' });
    setIsUserModalOpen(true);
  };

  const filteredUsers = useMemo(() => {
    return users.filter(u => 
      u.name.toLowerCase().includes(userSearch.toLowerCase()) || 
      u.email.toLowerCase().includes(userSearch.toLowerCase())
    );
  }, [users, userSearch]);

  const filteredData = activeTab === 'bookings' 
    ? bookings.filter(b => 
        b.user_name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
        b.room_name?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : activeTab === 'promotions' 
    ? promotions.filter(p => 
        p.user_name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
        p.user_email?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : activeTab === 'quick'
    ? [] // Searching handled within quick tab component
    : users.filter(u => 
        u.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        u.email.toLowerCase().includes(searchTerm.toLowerCase())
      );

  if (user?.role !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <Shield size={48} className="text-red-500 mb-4 opacity-20" />
        <h2 className="text-xl font-bold text-text-primary">Restricted Area</h2>
        <p className="text-text-secondary">Administrator access required.</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto w-full h-full flex flex-col overflow-hidden">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-accent p-2 rounded-lg shadow-sm">
              <Shield size={24} className="text-white" />
            </div>
            <h1 className="text-3xl font-black text-text-primary tracking-tight">Admin Console</h1>
          </div>
          <p className="text-text-secondary font-medium">Manage allocations and elevation requests.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 sm:flex-none">
            <input 
              type="text" 
              placeholder={`Search ${activeTab}...`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full sm:w-64 bg-bg-secondary border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-accent pl-10 transition-all font-medium"
            />
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-secondary/40" size={16} />
          </div>
          <button 
            onClick={exportCSV}
            className="flex items-center gap-2 bg-text-primary text-bg-primary px-5 py-2.5 rounded-xl font-bold text-sm hover:opacity-90 transition-all active:scale-95 shadow-sm"
          >
            <Download size={16} />
            Export
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col gap-6 min-h-0">
        {/* Tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="bg-bg-secondary p-1.5 rounded-2xl flex flex-wrap gap-1.5 w-full sm:w-fit border border-border shadow-sm">
            <button 
              onClick={() => setActiveTab('bookings')}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-sm font-black transition-all ${activeTab === 'bookings' ? 'bg-bg-primary text-text-primary shadow-sm border border-border' : 'text-text-secondary hover:text-text-primary'}`}
            >
              <CalendarIcon size={16} />
              <span className="whitespace-nowrap">Bookings</span>
            </button>
            <button 
              onClick={() => setActiveTab('promotions')}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-sm font-black transition-all ${activeTab === 'promotions' ? 'bg-bg-primary text-text-primary shadow-sm border border-border' : 'text-text-secondary hover:text-text-primary'}`}
            >
              <Users size={16} />
              <span className="whitespace-nowrap">Requests</span>
              {promotions.filter(p => p.status === 'PENDING').length > 0 && (
                <span className="bg-accent text-white text-[10px] px-1.5 rounded-full">
                  {promotions.filter(p => p.status === 'PENDING').length}
                </span>
              )}
            </button>
            <button 
              onClick={() => setActiveTab('quick')}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-sm font-black transition-all ${activeTab === 'quick' ? 'bg-bg-primary text-text-primary shadow-sm border border-border' : 'text-text-secondary hover:text-text-primary'}`}
            >
              <Zap size={16} />
              <span className="whitespace-nowrap">Quick Book</span>
            </button>
            <button 
              onClick={() => setActiveTab('users')}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-sm font-black transition-all ${activeTab === 'users' ? 'bg-bg-primary text-text-primary shadow-sm border border-border' : 'text-text-secondary hover:text-text-primary'}`}
            >
              <ShieldAlert size={16} />
              <span className="whitespace-nowrap">Users</span>
            </button>
          </div>

          {activeTab === 'bookings' && (
            <div className="flex items-center gap-2 bg-bg-secondary/50 p-1 rounded-xl w-fit border border-border">
              <button 
                onClick={() => setFilterRange('day')}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${filterRange === 'day' ? 'bg-accent text-white shadow-sm' : 'text-text-secondary hover:text-text-primary'}`}
              >
                Today
              </button>
              <button 
                onClick={() => setFilterRange('week')}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${filterRange === 'week' ? 'bg-accent text-white shadow-sm' : 'text-text-secondary hover:text-text-primary'}`}
              >
                This Week
              </button>
            </div>
          )}

          {activeTab === 'users' && (
            <button 
              onClick={() => {
                setEditingUser(null);
                setUserForm({ name: '', email: '', role: 'VIEWER', password: '' });
                setIsUserModalOpen(true);
              }}
              className="flex items-center gap-2 bg-accent text-white px-6 py-2.5 rounded-xl font-black text-sm hover:opacity-90 transition-all active:scale-95 shadow-lg shadow-accent/20"
            >
              <UserPlus size={18} />
              Add New User
            </button>
          )}
        </div>

        <div className="flex-1 bg-bg-secondary/30 border border-border rounded-2xl overflow-hidden shadow-sm backdrop-blur-sm flex flex-col min-h-0">
          {loading ? (
            <div className="p-20 flex justify-center items-center">
              <div className="animate-spin rounded-full h-10 w-10 border-4 border-accent border-t-transparent shadow-sm"></div>
            </div>
          ) : activeTab === 'quick' ? (
            <div className="flex-1 flex flex-col min-h-0 bg-bg-primary/50">
               {/* Discovery Header */}
               <div className="p-4 sm:p-6 border-b border-border bg-bg-secondary/20">
                 <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                   <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full sm:w-auto">
                     <div className="space-y-1">
                       <label className="text-[10px] font-black text-text-secondary uppercase tracking-[0.2em] px-1">Date</label>
                       <input 
                         type="date"
                         value={quickBookForm.date}
                         onChange={(e) => setQuickBookForm({...quickBookForm, date: e.target.value})}
                         className="w-full bg-bg-primary border border-border rounded-xl px-4 py-2 text-sm font-bold focus:outline-none focus:border-accent"
                       />
                     </div>
                     <div className="space-y-1">
                       <label className="text-[10px] font-black text-text-secondary uppercase tracking-[0.2em] px-1">Slot</label>
                       <select 
                         value={quickBookForm.slot}
                         onChange={(e) => setQuickBookForm({...quickBookForm, slot: e.target.value})}
                         className="w-full bg-bg-primary border border-border rounded-xl px-4 py-2 text-sm font-bold focus:outline-none focus:border-accent appearance-none"
                       >
                         {Array.from({length: 12}, (_, i) => i + 8).map(h => (
                           <option key={h} value={h}>{h.toString().padStart(2, '0')}:00 - {(h+1).toString().padStart(2, '0')}:00</option>
                         ))}
                       </select>
                     </div>
                     <div className="space-y-1">
                       <label className="text-[10px] font-black text-text-secondary uppercase tracking-[0.2em] px-1">Room Jump</label>
                       <select 
                         value={quickBookForm.roomFilter}
                         onChange={(e) => setQuickBookForm({...quickBookForm, roomFilter: e.target.value})}
                         className="w-full bg-bg-primary border border-border rounded-xl px-4 py-2 text-sm font-bold focus:outline-none focus:border-accent appearance-none min-w-[120px]"
                       >
                         <option value="all">All Rooms</option>
                         {roomStatuses.map(r => (
                           <option key={r.room_id} value={r.room_name}>{r.room_name}</option>
                         ))}
                       </select>
                     </div>
                   </div>
                   <div className="hidden sm:flex bg-accent/5 px-4 py-2 rounded-xl border border-accent/10 items-center gap-3">
                     <Zap size={14} className="text-accent" />
                     <span className="text-[10px] font-black text-accent uppercase tracking-widest italic">Rapid Discovery</span>
                   </div>
                 </div>
               </div>

               {/* Discovery Table */}
               <div className="flex-1 overflow-auto no-scrollbar">
                  <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 z-10 bg-bg-secondary/90 backdrop-blur-md">
                      <tr className="border-b border-border/50">
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-text-secondary opacity-50">Room</th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-text-secondary opacity-50">Status</th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-text-secondary opacity-50">Member (Recipient)</th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-text-secondary opacity-50 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30">
                      {roomStatuses
                        .filter(r => quickBookForm.roomFilter === 'all' || r.room_name === quickBookForm.roomFilter)
                        .map(room => (
                        <tr key={room.room_id} className="hover:bg-bg-primary/30 transition-colors group">
                           <td className="px-6 py-4">
                              <div className="flex flex-col">
                                <span className="text-sm font-black text-text-primary tracking-tight">{room.room_name}</span>
                                <span className="text-[10px] text-text-secondary font-bold uppercase tracking-widest opacity-50">{room.building} • Floor {room.floor}</span>
                              </div>
                           </td>
                           <td className="px-6 py-4">
                              {room.booking_id ? (
                                <div className="flex flex-col">
                                   <span className="text-[10px] font-black uppercase text-red-500 bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20 w-fit mb-1">Booked</span>
                                   <span className="text-[10px] text-text-secondary font-medium italic truncate max-w-[120px]">"{room.purpose}" by {room.booked_by_name}</span>
                                </div>
                              ) : (
                                <span className="text-[10px] font-black uppercase text-green-500 bg-green-500/10 px-2 py-0.5 rounded border border-green-500/20 w-fit">Available</span>
                              )}
                           </td>
                           <td className="px-6 py-4">
                              <div className="relative">
                                 <button 
                                   onClick={() => setUserDropdownOpen(userDropdownOpen === room.room_id ? null : room.room_id)}
                                   className="w-full max-w-[240px] flex items-center justify-between gap-3 bg-bg-primary border border-border rounded-xl px-4 py-2.5 text-sm font-bold hover:border-accent/50 transition-all"
                                 >
                                   <div className="flex items-center gap-2 truncate">
                                      <UserIcon size={14} className="text-text-secondary opacity-40" />
                                      <span className="truncate">
                                        {users.find(u => u.id === quickBookForm[`target_${room.room_id}`])?.name || 'Select User...'}
                                      </span>
                                   </div>
                                   <ChevronDown size={14} className={`text-text-secondary opacity-30 transition-transform ${userDropdownOpen === room.room_id ? 'rotate-180' : ''}`} />
                                 </button>

                                 {userDropdownOpen === room.room_id && (
                                   <div className="fixed sm:absolute z-[100] mt-2 w-full max-w-[240px] bg-bg-primary border border-border rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                                      <div className="p-3 border-b border-border bg-bg-secondary/30">
                                        <div className="relative">
                                          <input 
                                            autoFocus
                                            type="text"
                                            placeholder="Search members..."
                                            value={userSearch}
                                            onChange={(e) => setUserSearch(e.target.value)}
                                            className="w-full bg-bg-primary border border-border rounded-xl px-3 py-1.5 text-xs font-bold focus:outline-none focus:border-accent pl-8"
                                          />
                                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-secondary/40" size={12} />
                                        </div>
                                      </div>
                                      <div className="max-h-[200px] overflow-auto no-scrollbar">
                                        {filteredUsers.length === 0 ? (
                                          <div className="p-4 text-center text-xs text-text-secondary font-bold uppercase tracking-widest">No users found</div>
                                        ) : (
                                          filteredUsers.map(u => (
                                            <button 
                                              key={u.id}
                                              onClick={() => {
                                                setQuickBookForm({...quickBookForm, [`target_${room.room_id}`]: u.id});
                                                setUserDropdownOpen(null);
                                                setUserSearch('');
                                              }}
                                              className="w-full text-left px-4 py-3 hover:bg-bg-secondary transition-colors flex flex-col gap-0.5"
                                            >
                                              <span className="text-sm font-black text-text-primary">{u.name}</span>
                                              <span className="text-[10px] text-text-secondary opacity-60">{u.email}</span>
                                            </button>
                                          ))
                                        )}
                                      </div>
                                   </div>
                                 )}
                              </div>
                           </td>
                           <td className="px-6 py-4 text-right">
                              <button 
                                disabled={submitting === room.room_name || room.booking_id}
                                onClick={() => handleQuickBookSubmit(room.room_name, quickBookForm[`target_${room.room_id}`])}
                                className={`px-6 py-2.5 rounded-xl text-xs font-black transition-all shadow-lg active:scale-95 disabled:opacity-30 disabled:active:scale-100 ${
                                  room.booking_id 
                                    ? 'bg-text-secondary/10 text-text-secondary shadow-none cursor-not-allowed' 
                                    : 'bg-accent text-white shadow-accent/20 hover:opacity-90'
                                }`}
                              >
                                {submitting === room.room_name ? (
                                   <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : room.booking_id ? (
                                  'Booked'
                                ) : (
                                  'Book Now'
                                )}
                              </button>
                           </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
               </div>
            </div>
          ) : (
            <div className="flex-1 overflow-auto no-scrollbar">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border/50 bg-bg-secondary/50">
                    {activeTab === 'bookings' ? (
                      <>
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-text-secondary opacity-50">Member</th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-text-secondary opacity-50">Room</th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-text-secondary opacity-50">Time Slot</th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-text-secondary opacity-50">Status</th>
                      </>
                    ) : activeTab === 'promotions' ? (
                      <>
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-text-secondary opacity-50">User</th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-text-secondary opacity-50">Reason</th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-text-secondary opacity-50">Requested</th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-text-secondary opacity-50">Action</th>
                      </>
                    ) : (
                      <>
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-text-secondary opacity-50">Name</th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-text-secondary opacity-50">Email</th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-text-secondary opacity-50">Role</th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-text-secondary opacity-50">Joined</th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-text-secondary opacity-50 text-right">Actions</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {filteredData.map(item => (
                    <tr key={item.id} className="hover:bg-bg-primary/30 transition-colors group">
                      {activeTab === 'bookings' ? (
                        <>
                          <td className="px-6 py-4">
                             <div className="flex flex-col">
                               <span className="text-sm font-bold text-text-primary">{item.user_name}</span>
                               <span className="text-[10px] text-text-secondary opacity-60">ID: {item.user_id}</span>
                             </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-sm font-black text-accent bg-accent/5 px-2 py-1 rounded-lg border border-accent/10">{item.room_name}</span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2 text-text-primary">
                              <Clock size={14} className="text-text-secondary opacity-40" />
                              <span className="text-xs font-bold whitespace-nowrap">
                                {new Date(item.start_time).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                              </span>
                              <ArrowRight size={12} className="text-text-secondary opacity-20" />
                              <span className="text-xs font-black bg-bg-secondary px-1.5 py-0.5 rounded border border-border">
                                {new Date(item.start_time).getHours().toString().padStart(2, '0')}:00
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-tighter shadow-sm border ${
                              item.status === 'ACTIVE' 
                                ? 'bg-green-500/10 text-green-500 border-green-500/20' 
                                : 'bg-red-500/10 text-red-500 border-red-500/20'
                            }`}>
                              {item.status}
                            </span>
                          </td>
                        </>
                      ) : activeTab === 'promotions' ? (
                        <>
                          <td className="px-6 py-4">
                            <div className="flex flex-col">
                              <span className="text-sm font-bold text-text-primary">{item.user_name}</span>
                              <span className="text-xs text-text-secondary opacity-70">{item.user_email}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 max-w-xs">
                            <p className="text-xs text-text-primary font-medium line-clamp-2 italic opacity-80">"{item.reason}"</p>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-[10px] font-bold text-text-secondary uppercase">
                              {new Date(item.created_at).toLocaleDateString()}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            {item.status === 'PENDING' ? (
                              <div className="flex gap-2">
                                <button 
                                  onClick={() => handlePromotion(item.id, 'APPROVED')}
                                  className="p-2 bg-green-500 text-white rounded-lg hover:opacity-80 active:scale-95 transition-all shadow-sm"
                                  title="Approve"
                                >
                                  <Check size={16} />
                                </button>
                                <button 
                                  onClick={() => handlePromotion(item.id, 'REJECTED')}
                                  className="p-2 bg-red-500 text-white rounded-lg hover:opacity-80 active:scale-95 transition-all shadow-sm"
                                  title="Reject"
                                >
                                  <X size={16} />
                                </button>
                              </div>
                            ) : (
                              <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-lg border ${
                                item.status === 'APPROVED' ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20'
                              }`}>
                                {item.status}
                              </span>
                            )}
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-6 py-4">
                            <span className="text-sm font-black text-text-primary">{item.name}</span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2 text-text-secondary">
                               <Mail size={12} className="opacity-40" />
                               <span className="text-xs font-medium">{item.email}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border ${
                              item.role === 'admin' 
                                ? 'bg-red-500/10 text-red-500 border-red-500/20' 
                                : item.role === 'STUDENT_REP' 
                                ? 'bg-blue-500/10 text-blue-500 border-blue-500/20'
                                : 'bg-bg-secondary text-text-secondary border-border'
                            }`}>
                              {item.role}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-[10px] font-bold text-text-secondary opacity-50 uppercase">
                              {new Date(item.created_at).toLocaleDateString()}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex justify-end gap-2">
                               <button 
                                 onClick={() => openEditModal(item)}
                                 className="p-2 bg-bg-primary border border-border text-text-secondary rounded-lg hover:text-accent hover:border-accent/50 transition-all shadow-sm"
                               >
                                 <Edit size={14} />
                               </button>
                               <button 
                                 onClick={() => deleteUser(item.id)}
                                 className="p-2 bg-bg-primary border border-border text-text-secondary rounded-lg hover:text-red-500 hover:border-red-500/50 transition-all shadow-sm"
                               >
                                 <Trash2 size={14} />
                               </button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* User CRUD Modal */}
      {isUserModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
           <div className="bg-bg-primary w-full max-w-md rounded-[2rem] shadow-2xl border border-border overflow-hidden animate-in fade-in zoom-in duration-200">
              <div className="p-6 border-b border-border flex justify-between items-center bg-bg-secondary/30">
                 <div className="flex items-center gap-3">
                    <div className="bg-accent/10 p-2 rounded-xl">
                       <UserIcon className="text-accent" size={24} />
                    </div>
                    <h2 className="text-xl font-black text-text-primary capitalize">{editingUser ? 'Edit User' : 'Add New User'}</h2>
                 </div>
                 <button onClick={() => setIsUserModalOpen(false)} className="p-2 hover:bg-bg-secondary rounded-xl transition-colors">
                    <X size={20} className="text-text-secondary" />
                 </button>
              </div>

              <form onSubmit={handleUserSubmit} className="p-6 space-y-5">
                 <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-text-secondary uppercase tracking-widest px-1">Full Name</label>
                    <input 
                      required
                      type="text"
                      value={userForm.name}
                      onChange={(e) => setUserForm({...userForm, name: e.target.value})}
                      className="w-full bg-bg-secondary border border-border rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-accent"
                    />
                 </div>
                 <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-text-secondary uppercase tracking-widest px-1">Email Address</label>
                    <input 
                      required
                      type="email"
                      value={userForm.email}
                      onChange={(e) => setUserForm({...userForm, email: e.target.value})}
                      className="w-full bg-bg-secondary border border-border rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-accent"
                    />
                 </div>
                 <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-text-secondary uppercase tracking-widest px-1">Assign Role</label>
                    <select 
                      value={userForm.role}
                      onChange={(e) => setUserForm({...userForm, role: e.target.value})}
                      className="w-full bg-bg-secondary border border-border rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-accent appearance-none"
                    >
                       <option value="VIEWER">VIEWER (Read Only)</option>
                       <option value="STUDENT_REP">STUDENT_REP (Can Book)</option>
                       <option value="admin">ADMIN (Full Control)</option>
                    </select>
                 </div>
                 {!editingUser && (
                   <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-text-secondary uppercase tracking-widest px-1">Initial Password</label>
                      <input 
                        required
                        type="password"
                        placeholder="••••••••"
                        value={userForm.password}
                        onChange={(e) => setUserForm({...userForm, password: e.target.value})}
                        className="w-full bg-bg-secondary border border-border rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-accent"
                      />
                   </div>
                 )}
                 <button 
                   type="submit"
                   className="w-full bg-accent text-white py-4 rounded-xl font-black shadow-lg shadow-accent/20 hover:opacity-90 active:scale-[0.98] transition-all mt-4"
                 >
                   {editingUser ? 'Update User Details' : 'Create Access Account'}
                 </button>
              </form>
           </div>
        </div>
      )}
    </div>
  );
}

export default AdminDashboard;
