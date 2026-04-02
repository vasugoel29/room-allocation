import { useState, useContext } from 'react';
import { 
  Shield, 
  Users, 
  Calendar as CalendarIcon, 
  Download, 
  Search, 
  Zap, 
  UserPlus,
  ShieldAlert,
  Database,
  Activity,
  TrendingUp
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AppContext } from '../context/AppContext';
import toast from 'react-hot-toast';
import { getTodayRange, getWeekRange, formatRangeToISO } from '../utils/dateHelpers';

// Modular Components
import AdminBookings from '../features/admin/AdminBookings';
import AdminRequests from '../features/admin/AdminRequests';
import AdminUsers from '../features/admin/AdminUsers';
import AdminQuickBook from '../features/admin/AdminQuickBook';
import AdminUserModal from '../components/modals/AdminUserModal';
import AdminPromotionActionModal from '../components/modals/AdminPromotionActionModal';
import ConfirmModal from '../components/modals/ConfirmModal';
import AdminAuditLog from '../features/admin/AdminAuditLog';
import AdminAnalytics from '../features/admin/AdminAnalytics';

// Services & Hooks
import adminService from '../services/adminService';
import { bookingService } from '../services/bookingService';
import { useAdminData } from '../hooks/useAdminData';
import { useAdminUsers } from '../hooks/useAdminUsers';
import { useAdminQuickBook } from '../hooks/useAdminQuickBook';

function AdminDashboard() {
  const { user } = useContext(AppContext);
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('bookings'); // 'bookings' | 'promotions' | 'users' | 'quick' | 'audit' | 'analytics'
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRange, setFilterRange] = useState('day'); // 'day' | 'week'
  
  const { bookings, promotions, bookingsMeta, loading, fetchData } = useAdminData(filterRange);
  const { 
    users, usersMeta, departments, isUserModalOpen, editingUser, 
    fetchUsers, handleApproveUser, handleDeleteUser,
    openUserModal, closeUserModal 
  } = useAdminUsers(activeTab);
  
  const { 
    quickBookForm, roomStatuses, submitting, 
    updateQuickBookForm, handleQuickBookSubmit
  } = useAdminQuickBook(activeTab, fetchData);
  
  // Promotion comment state
  const [isPromotionModalOpen, setIsPromotionModalOpen] = useState(false);
  const [selectedPromotionId, setSelectedPromotionId] = useState(null);
  const [promotionStatus, setPromotionStatus] = useState('');

  // Confirmation modal state
  const [confirmConfig, setConfirmConfig] = useState({ 
    isOpen: false, title: '', message: '', action: null 
  });

  const handlePromotion = (id, status) => {
    setSelectedPromotionId(id);
    setPromotionStatus(status);
    setIsPromotionModalOpen(true);
  };

  const handleCancelBooking = (bookingId) => {
    setConfirmConfig({
      isOpen: true,
      title: 'Cancel Booking',
      message: 'Are you sure you want to cancel this booking?',
      confirmText: 'Cancel Booking',
      confirmType: 'danger',
      action: async () => {
        try {
          await bookingService.cancelBooking(bookingId);
          toast.success('Booking cancelled successfully');
          fetchData();
        } catch (err) {
          console.error(err);
          toast.error(err.message || 'Failed to cancel booking');
        }
      }
    });
  };

  const exportCSV = async () => {
    try {
      const type = activeTab === 'bookings' ? 'bookings' : 'promotions';
      let params = {};
      
      if (activeTab === 'bookings') {
        const now = new Date();
        const range = filterRange === 'day' ? getTodayRange(now) : getWeekRange(now);
        params = formatRangeToISO(range);
      }

      const blob = await adminService.exportCSV(type, params);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${activeTab}_export_${new Date().toISOString()}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed', err);
      toast.error('Export failed');
    }
  };
  
  const deleteUser = (id) => {
    setConfirmConfig({
      isOpen: true,
      title: 'Delete User',
      message: 'Are you sure you want to delete this user? This cannot be undone.',
      confirmText: 'Delete User',
      confirmType: 'danger',
      action: () => handleDeleteUser(id)
    });
  };

  if (user?.role !== 'ADMIN') {
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
            <div className="bg-primary p-3 rounded-2xl shadow-ambient">
              <Shield size={24} className="text-white" />
            </div>
            <h1 className="text-3xl font-extrabold text-text-primary tracking-tight font-display uppercase">Admin Console</h1>
          </div>
          <p className="text-text-secondary font-bold uppercase text-[10px] tracking-widest opacity-40 font-display">Manage allocations and elevation requests.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 sm:flex-none">
            <input 
              type="text" 
              placeholder={`Search ${activeTab}...`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full sm:w-64 bg-tonal-secondary/10 rounded-2xl px-4 py-3.5 text-sm focus:outline-none focus:bg-tonal-secondary/20 transition-all font-bold placeholder:text-text-secondary/30 pl-11 font-body text-text-primary"
            />
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary/40" size={18} />
          </div>
          <button 
            onClick={exportCSV}
            className="flex items-center gap-2 bg-text-primary text-surface-low px-5 py-2.5 rounded-xl font-extrabold text-[10px] uppercase tracking-widest hover:opacity-90 transition-all active:scale-95 shadow-ambient"
          >
            <Download size={16} />
            Export
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col gap-6 min-h-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="bg-tonal-secondary/10 p-1.5 rounded-[1.5rem] flex flex-wrap gap-1.5 w-full sm:w-fit font-display">
            <button 
              onClick={() => setActiveTab('bookings')}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-xs font-extrabold uppercase tracking-tight transition-all ${activeTab === 'bookings' ? 'bg-surface-low text-primary shadow-ambient' : 'text-text-secondary hover:text-text-primary'}`}
            >
              <CalendarIcon size={16} />
              <span className="whitespace-nowrap">Bookings</span>
            </button>
            <button 
              onClick={() => setActiveTab('promotions')}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-xs font-extrabold uppercase tracking-tight transition-all ${activeTab === 'promotions' ? 'bg-surface-low text-primary shadow-ambient' : 'text-text-secondary hover:text-text-primary'}`}
            >
              <Users size={16} />
              <span className="whitespace-nowrap">Requests</span>
              {promotions.filter(p => p.status === 'PENDING').length > 0 && (
                <span className="bg-primary text-white text-[10px] px-1.5 rounded-full">
                  {promotions.filter(p => p.status === 'PENDING').length}
                </span>
              )}
            </button>
            <button 
              onClick={() => setActiveTab('quick')}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-xs font-extrabold uppercase tracking-tight transition-all ${activeTab === 'quick' ? 'bg-surface-low text-primary shadow-ambient' : 'text-text-secondary hover:text-text-primary'}`}
            >
              <Zap size={16} />
              <span className="whitespace-nowrap">Quick Book</span>
            </button>
            <button 
              onClick={() => setActiveTab('users')}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-xs font-extrabold uppercase tracking-tight transition-all ${activeTab === 'users' ? 'bg-surface-low text-primary shadow-ambient' : 'text-text-secondary hover:text-text-primary'}`}
            >
              <ShieldAlert size={16} />
              <span className="whitespace-nowrap">Users</span>
              {users.filter(u => !u.is_approved).length > 0 && (
                <span className="bg-tertiary text-white text-[10px] px-1.5 rounded-full shadow-tertiary animate-pulse">
                  {users.filter(u => !u.is_approved).length}
                </span>
              )}
            </button>
            <button 
              onClick={() => setActiveTab('audit')}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-xs font-extrabold uppercase tracking-tight transition-all ${activeTab === 'audit' ? 'bg-surface-low text-primary shadow-ambient' : 'text-text-secondary hover:text-text-primary'}`}
            >
              <Activity size={16} />
              <span className="whitespace-nowrap">Audit Log</span>
            </button>
            <button 
              onClick={() => setActiveTab('analytics')}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-xs font-extrabold uppercase tracking-tight transition-all ${activeTab === 'analytics' ? 'bg-surface-low text-primary shadow-ambient' : 'text-text-secondary hover:text-text-primary'}`}
            >
              <TrendingUp size={16} />
              <span className="whitespace-nowrap">Analytics</span>
            </button>
            <button 
              onClick={() => navigate('/admin/timetable')}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-xs font-extrabold uppercase tracking-tight transition-all text-text-secondary hover:text-text-primary hover:bg-surface-low`}
            >
              <Database size={16} />
              <span className="whitespace-nowrap">Timetable</span>
            </button>
          </div>

          {activeTab === 'bookings' && (
            <div className="flex items-center gap-2 bg-tonal-secondary/10 p-1.5 rounded-xl w-fit font-display font-bold">
              <button 
                onClick={() => setFilterRange('day')}
                className={`px-4 py-1.5 rounded-lg text-[10px] uppercase font-extrabold transition-all tracking-widest ${filterRange === 'day' ? 'bg-primary text-white shadow-ambient' : 'text-text-secondary hover:text-text-primary'}`}
              >
                Today
              </button>
              <button 
                onClick={() => setFilterRange('week')}
                className={`px-4 py-1.5 rounded-lg text-[10px] uppercase font-extrabold transition-all tracking-widest ${filterRange === 'week' ? 'bg-primary text-white shadow-ambient' : 'text-text-secondary hover:text-text-primary'}`}
              >
                This Week
              </button>
            </div>
          )}

          {activeTab === 'users' && (
            <button 
              onClick={() => openUserModal()}
              className="flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-2xl font-extrabold text-[10px] uppercase tracking-widest hover:opacity-90 transition-all active:scale-95 shadow-ambient"
            >
              <UserPlus size={18} />
              Add User
            </button>
          )}
        </div>

        <div className="flex-1 bg-tonal-secondary/5 rounded-[2.5rem] overflow-hidden shadow-ambient backdrop-blur-md flex flex-col min-h-0">
          {loading ? (
            <div className="p-20 flex justify-center items-center">
              <div className="animate-spin rounded-full h-12 w-12 border-primary border-t-transparent"></div>
            </div>
          ) : (
            <>
              {activeTab === 'bookings' && (
                <div className="flex-1 flex flex-col min-h-0">
                  <AdminBookings 
                    bookings={bookings} 
                    searchTerm={searchTerm} 
                    onCancel={handleCancelBooking} 
                  />
                  {bookingsMeta.totalPages > 1 && (
                    <div className="p-4 bg-surface-low border-t border-border flex items-center justify-between">
                      <p className="text-[10px] font-black uppercase tracking-widest text-text-secondary opacity-50">
                        Page {bookingsMeta.page} of {bookingsMeta.totalPages}
                      </p>
                      <div className="flex gap-2">
                        <button 
                          disabled={bookingsMeta.page <= 1}
                          onClick={() => fetchData(bookingsMeta.page - 1)}
                          className="px-4 py-2 bg-bg-secondary rounded-xl text-[10px] font-black uppercase tracking-widest border border-border hover:bg-bg-primary transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          Prev
                        </button>
                        <button 
                          disabled={bookingsMeta.page >= bookingsMeta.totalPages}
                          onClick={() => fetchData(bookingsMeta.page + 1)}
                          className="px-4 py-2 bg-primary text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:opacity-90 transition-all shadow-ambient disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </div>
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
                  setQuickBookForm={updateQuickBookForm}
                  submitting={submitting}
                  onSubmit={handleQuickBookSubmit}
                />
              )}
              {activeTab === 'users' && (
                <div className="flex-1 flex flex-col min-h-0">
                  <AdminUsers 
                    users={users} 
                    searchTerm={searchTerm} 
                    onEdit={openUserModal} 
                    onDelete={deleteUser} 
                    onApprove={handleApproveUser}
                  />
                  {usersMeta.totalPages > 1 && (
                    <div className="p-4 bg-surface-low border-t border-border flex items-center justify-between">
                      <p className="text-[10px] font-black uppercase tracking-widest text-text-secondary opacity-50">
                        Page {usersMeta.page} of {usersMeta.totalPages}
                      </p>
                      <div className="flex gap-2">
                        <button 
                          disabled={usersMeta.page <= 1}
                          onClick={() => fetchUsers(usersMeta.page - 1)}
                          className="px-4 py-2 bg-bg-secondary rounded-xl text-[10px] font-black uppercase tracking-widest border border-border hover:bg-bg-primary transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          Prev
                        </button>
                        <button 
                          disabled={usersMeta.page >= usersMeta.totalPages}
                          onClick={() => fetchUsers(usersMeta.page + 1)}
                          className="px-4 py-2 bg-primary text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:opacity-90 transition-all shadow-ambient disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {activeTab === 'audit' && (
                <div className="flex-1 p-6 overflow-y-auto min-h-0">
                  <AdminAuditLog />
                </div>
              )}
              {activeTab === 'analytics' && (
                <div className="flex-1 p-6 overflow-y-auto min-h-0">
                  <AdminAnalytics />
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <AdminUserModal 
        isOpen={isUserModalOpen}
        onClose={closeUserModal}
        editingUser={editingUser}
        fetchUsers={fetchUsers}
        departments={departments}
      />
      
      <AdminPromotionActionModal 
        isOpen={isPromotionModalOpen}
        onClose={() => setIsPromotionModalOpen(false)}
        selectedPromotionId={selectedPromotionId}
        promotionStatus={promotionStatus}
        fetchData={fetchData}
      />
      
      <ConfirmModal 
        isOpen={confirmConfig.isOpen}
        onClose={() => setConfirmConfig({ ...confirmConfig, isOpen: false })}
        onConfirm={() => confirmConfig.action?.()}
        title={confirmConfig.title}
        message={confirmConfig.message}
        confirmText={confirmConfig.confirmText}
        confirmType={confirmConfig.confirmType}
      />
    </div>
  );
}

export default AdminDashboard;
