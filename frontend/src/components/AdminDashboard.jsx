import { useState, useEffect, useContext } from 'react';
import { 
  Shield, 
  Users, 
  Calendar as CalendarIcon, 
  Download, 
  Search, 
  Zap, 
  UserPlus,
  ShieldAlert,
  X,
  User as UserIcon
} from 'lucide-react';
import { AppContext } from '../context/AppContext';
import api from '../utils/api';
import toast from 'react-hot-toast';

// Modular Components
import AdminBookings from '../features/admin/AdminBookings';
import AdminRequests from '../features/admin/AdminRequests';
import AdminUsers from '../features/admin/AdminUsers';
import AdminQuickBook from '../features/admin/AdminQuickBook';

function AdminDashboard() {
  const { user } = useContext(AppContext);
  const [activeTab, setActiveTab] = useState('bookings'); // 'bookings' | 'promotions' | 'users' | 'quick'
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
  const [submitting, setSubmitting] = useState(null); // room_name being submitted
  
  // User CRUD states
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [userForm, setUserForm] = useState({ name: '', email: '', role: 'VIEWER', password: '', branch: '', year: 1, section: 1, departmentName: '' });
  const [departments, setDepartments] = useState([]);

  useEffect(() => {
    fetchData();
    fetchDepartments();
  }, [filterRange]);

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
      const day = now.getDay();
      const hour = now.getHours();

      let startDate, endDate;
      if (filterRange === 'day') {
        const targetDate = new Date(now);
        if (day === 0) targetDate.setDate(now.getDate() + 1);
        else if (day === 6) targetDate.setDate(now.getDate() + 2);
        else if (hour >= 18) {
          if (day === 5) targetDate.setDate(now.getDate() + 3);
          else targetDate.setDate(now.getDate() + 1);
        }
        startDate = new Date(targetDate.setHours(0,0,0,0)).toISOString();
        endDate = new Date(targetDate.setHours(23,59,59,999)).toISOString();
      } else {
        const currentDay = now.getDay() || 7;
        const offset = currentDay >= 6 ? 7 : 0;
        const monday = new Date(now);
        monday.setDate(now.getDate() - (now.getDay() || 7) + 1 + offset);
        startDate = new Date(monday.setHours(0,0,0,0)).toISOString();
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        endDate = new Date(sunday.setHours(23,59,59,999)).toISOString();
      }

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

  const fetchDepartments = async () => {
    try {
      const res = await api.get('/departments');
      if (res.ok) {
        const data = await res.json();
        setDepartments(data);
      }
    } catch (err) {
      console.error('Failed to fetch departments', err);
    }
  };

  const handlePromotion = async (id, status) => {
    const comment = prompt(`Add a comment for ${status.toLowerCase()}:`);
    try {
      await api.patch(`/promotions/${id}`, { status, admin_comment: comment });
      fetchData();
    } catch (err) {
      console.error(err);
      toast.error('Action failed');
    }
  };

  const handleCancelBooking = async (bookingId) => {
    if (!window.confirm('Are you sure you want to cancel this booking?')) return;
    try {
      const res = await api.patch(`/bookings/${bookingId}/cancel`);
      if (res.ok) {
        toast.success('Booking cancelled successfully');
        fetchData();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to cancel booking');
      }
    } catch (err) {
      console.error(err);
      toast.error('Network error');
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
      console.error(err);
      toast.error('Network error');
    } finally {
      setSubmitting(null);
    }
  };

  const handleApproveUser = async (id) => {
    try {
      const res = await api.patch(`/auth/approve-user/${id}`);
      if (res.ok) {
        toast.success('User approved!');
        fetchUsers();
      } else {
        toast.error('Approval failed');
      }
    } catch (err) {
      console.error(err);
      toast.error('Network error');
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
        setUserForm({ name: '', email: '', role: 'VIEWER', password: '', branch: '', year: 1, section: 1, departmentName: '' });
        fetchUsers();
        fetchDepartments();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Operation failed');
      }
    } catch (err) {
      console.error(err);
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
      console.error(err);
      toast.error('Network error');
    }
  };

  const openEditModal = (u) => {
    setEditingUser(u);
    setUserForm({ 
      name: u.name, 
      email: u.email, 
      role: u.role, 
      password: '',
      branch: u.branch || '',
      year: u.year || 1,
      section: u.section || 1,
      departmentName: u.department_name || ''
    });
    setIsUserModalOpen(true);
  };

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
              {users.filter(u => !u.is_approved).length > 0 && (
                <span className="bg-red-500 text-white text-[10px] px-1.5 rounded-full animate-pulse">
                  {users.filter(u => !u.is_approved).length}
                </span>
              )}
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
                setUserForm({ name: '', email: '', role: 'VIEWER', password: '', branch: '', year: 1, section: 1, departmentName: '' });
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
          ) : (
            <>
              {activeTab === 'bookings' && (
                <AdminBookings 
                  bookings={bookings} 
                  searchTerm={searchTerm} 
                  onCancel={handleCancelBooking} 
                />
              )}
              {activeTab === 'promotions' && (
                <AdminRequests 
                  promotions={promotions} 
                  searchTerm={searchTerm} 
                  handlePromotionAction={handlePromotion} 
                />
              )}
              {activeTab === 'quick' && (
                <AdminQuickBook 
                  roomStatuses={roomStatuses}
                  users={users}
                  quickBookForm={quickBookForm}
                  setQuickBookForm={setQuickBookForm}
                  submitting={submitting}
                  onSubmit={handleQuickBookSubmit}
                />
              )}
              {activeTab === 'users' && (
                <AdminUsers 
                  users={users} 
                  searchTerm={searchTerm} 
                  onEdit={openEditModal} 
                  onDelete={deleteUser} 
                  onApprove={handleApproveUser}
                />
              )}
            </>
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
                        <option value="VIEWER">VIEWER (Student)</option>
                        <option value="STUDENT_REP">STUDENT_REP (Student Lead)</option>
                        <option value="FACULTY">FACULTY (Staff)</option>
                        <option value="admin">ADMIN (Root)</option>
                    </select>
                 </div>

                 <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-text-secondary uppercase tracking-widest px-1">Department</label>
                    <div className="relative">
                      <input 
                        required
                        list="admin-dept-list"
                        type="text"
                        placeholder="Select or type department"
                        value={userForm.departmentName || ''}
                        onChange={(e) => setUserForm({...userForm, departmentName: e.target.value})}
                        className="w-full bg-bg-secondary border border-border rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-accent"
                      />
                      <datalist id="admin-dept-list">
                        {departments.map(d => <option key={d.id} value={d.name} />)}
                      </datalist>
                    </div>
                 </div>
                 
                 {(userForm.role === 'STUDENT_REP' || userForm.role === 'VIEWER') && (
                   <div className="space-y-4 pt-2 border-t border-border/50">
                     <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-text-secondary uppercase tracking-widest px-1">Branch</label>
                        <input 
                          type="text"
                          placeholder="e.g. CSE, IT, ECE"
                          value={userForm.branch || ''}
                          onChange={(e) => setUserForm({...userForm, branch: e.target.value})}
                          className="w-full bg-bg-secondary border border-border rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-accent"
                        />
                     </div>

                     <div className="grid grid-cols-2 gap-4">
                       <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-text-secondary uppercase tracking-widest px-1">Year</label>
                          <select 
                            value={userForm.year || 1}
                            onChange={(e) => setUserForm({...userForm, year: parseInt(e.target.value)})}
                            className="w-full bg-bg-secondary border border-border rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-accent appearance-none"
                          >
                             {[1, 2, 3, 4].map(y => (
                               <option key={y} value={y}>{y} Year</option>
                             ))}
                          </select>
                       </div>
                       <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-text-secondary uppercase tracking-widest px-1">Section</label>
                          <select 
                            value={userForm.section || 1}
                            onChange={(e) => setUserForm({...userForm, section: parseInt(e.target.value)})}
                            className="w-full bg-bg-secondary border border-border rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-accent appearance-none"
                          >
                             {[1, 2, 3, 4, 5, 6].map(s => (
                               <option key={s} value={s}>Section {s}</option>
                             ))}
                          </select>
                       </div>
                     </div>
                   </div>
                 )}

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
