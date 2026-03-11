import { useState, useEffect, useContext } from 'react';
import { 
  Shield, 
  Users, 
  Calendar as CalendarIcon, 
  Download, 
  Search, 
  Check, 
  X, 
  Clock,
  ArrowRight
} from 'lucide-react';
import { AppContext } from '../context/AppContext';
import api from '../utils/api';


function AdminDashboard() {
  const { user } = useContext(AppContext);
  const [activeTab, setActiveTab] = useState('bookings'); // 'bookings' | 'promotions'
  const [bookings, setBookings] = useState([]);
  const [promotions, setPromotions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRange, setFilterRange] = useState('day'); // 'day' | 'week'

  useEffect(() => {
    fetchData();
  }, [filterRange]); // Refetch bookings when range changes.

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

  const filteredData = activeTab === 'bookings' 
    ? bookings.filter(b => 
        b.user_name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
        b.room_name?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : promotions.filter(p => 
        p.user_name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
        p.user_email?.toLowerCase().includes(searchTerm.toLowerCase())
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
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-12">
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

      <div className="flex-1 flex flex-col gap-8 min-h-0">
        {/* Tabs */}
        <div className="bg-bg-secondary p-1.5 rounded-2xl flex gap-1.5 w-fit border border-border shadow-sm">
          <button 
            onClick={() => setActiveTab('bookings')}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-black transition-all ${activeTab === 'bookings' ? 'bg-bg-primary text-text-primary shadow-sm border border-border' : 'text-text-secondary hover:text-text-primary'}`}
          >
            <CalendarIcon size={16} />
            All Bookings
          </button>
          <button 
            onClick={() => setActiveTab('promotions')}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-black transition-all ${activeTab === 'promotions' ? 'bg-bg-primary text-text-primary shadow-sm border border-border' : 'text-text-secondary hover:text-text-primary'}`}
          >
            <Users size={16} />
            Access Requests
            {promotions.filter(p => p.status === 'PENDING').length > 0 && (
              <span className="bg-accent text-white text-[10px] px-1.5 rounded-full">
                {promotions.filter(p => p.status === 'PENDING').length}
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

        <div className="flex-1 bg-bg-secondary/30 border border-border rounded-2xl overflow-hidden shadow-sm backdrop-blur-sm flex flex-col min-h-0">
          {loading ? (
            <div className="p-20 flex justify-center items-center">
              <div className="animate-spin rounded-full h-10 w-10 border-4 border-accent border-t-transparent shadow-sm"></div>
            </div>
          ) : filteredData.length === 0 ? (
            <div className="p-20 text-center flex flex-col items-center gap-4">
              <div className="bg-bg-secondary p-4 rounded-full border border-border">
                <Search size={32} className="text-text-secondary/30" />
              </div>
              <p className="text-text-secondary font-medium">No records found matching your selection.</p>
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
                    ) : (
                      <>
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-text-secondary opacity-50">User</th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-text-secondary opacity-50">Reason</th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-text-secondary opacity-50">Requested</th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-text-secondary opacity-50">Action</th>
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
                      ) : (
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
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default AdminDashboard;
