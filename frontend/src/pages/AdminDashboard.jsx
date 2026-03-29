import { useState, useContext } from 'react';
import { 
  Shield, 
  Users, 
  Calendar as CalendarIcon, 
  Download, 
  Search, 
  Zap, 
  UserPlus,
  ShieldAlert
} from 'lucide-react';
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

// Services & Hooks
import adminService from '../services/adminService';
import { bookingService } from '../services/bookingService';
import { useAdminData } from '../hooks/useAdminData';
import { useAdminUsers } from '../hooks/useAdminUsers';
import { useAdminQuickBook } from '../hooks/useAdminQuickBook';

function AdminDashboard() {
  const { user } = useContext(AppContext);
  const [activeTab, setActiveTab] = useState('bookings'); // 'bookings' | 'promotions' | 'users' | 'quick'
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRange, setFilterRange] = useState('day'); // 'day' | 'week'
  
  const { bookings, promotions, loading, fetchData } = useAdminData(filterRange);
  const { 
    users, departments, isUserModalOpen, editingUser, 
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
              onClick={() => openUserModal()}
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
                  setQuickBookForm={updateQuickBookForm}
                  submitting={submitting}
                  onSubmit={handleQuickBookSubmit}
                />
              )}
              {activeTab === 'users' && (
                <AdminUsers 
                  users={users} 
                  searchTerm={searchTerm} 
                  onEdit={openUserModal} 
                  onDelete={deleteUser} 
                  onApprove={handleApproveUser}
                />
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
