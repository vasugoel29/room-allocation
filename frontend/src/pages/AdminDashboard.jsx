import { useState, useContext, useEffect } from 'react';
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
  TrendingUp,
  Home,
  Layers,
  ChevronDown
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
import AdminUploads from '../features/admin/AdminUploads';
import AdminTimetable from './AdminTimetable';
import { AdminTabBar } from '../features/admin/AdminTabBar';
import { AdminFilterBar } from '../features/admin/AdminFilterBar';
import AdminTimetableSlots from '../features/admin/AdminTimetableSlots';
import RoomScheduleGrid from './RoomScheduleGrid';

// Services & Hooks
import { adminService } from '../services/adminService';
import { bookingService } from '../services/bookingService';
import { roomService } from '../services/roomService';
import { useAdminData } from '../hooks/useAdminData';
import { useAdminUsers } from '../hooks/useAdminUsers';
import { useAdminQuickBook } from '../hooks/useAdminQuickBook';

// Rooms & Departments Components
import AdminRooms from '../features/admin/AdminRooms';
import AdminRoomModal from '../components/modals/AdminRoomModal';
import AdminDepartments from '../features/admin/AdminDepartments';
import AdminDepartmentModal from '../components/modals/AdminDepartmentModal';

function AdminDashboard() {
  const { user } = useContext(AppContext);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'bookings';
  const setActiveTab = (tab) => {
    setSearchParams({ tab });
    setSearchTerm('');
  };
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRange, setFilterRange] = useState('day'); // 'day' | 'week'
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
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

  // Rooms and Departments state
  const [adminRooms, setAdminRooms] = useState([]);
  const [adminDepartments, setAdminDepartments] = useState([]);
  const [paginatedPromotions, setPaginatedPromotions] = useState([]);

  // Pagination Metas
  const [roomsMeta, setRoomsMeta] = useState({ page: 1, totalPages: 1 });
  const [deptsMeta, setDeptsMeta] = useState({ page: 1, totalPages: 1 });
  const [promotionsMeta, setPromotionsMeta] = useState({ page: 1, totalPages: 1 });

  // Room modal state
  const [isRoomModalOpen, setIsRoomModalOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState(null);

  // Department modal state
  const [isDeptModalOpen, setIsDeptModalOpen] = useState(false);
  const [editingDept, setEditingDept] = useState(null);

  const fetchAdminRooms = async (page = 1) => {
    try {
      const data = await roomService.getRooms({ page, limit: 10 });
      setAdminRooms(data.data || data);
      if (data.meta) setRoomsMeta(data.meta);
    } catch (err) {
      console.error(err);
      toast.error('Failed to fetch rooms');
    }
  };

  const fetchAdminDepartments = async (page = 1) => {
    try {
      const data = await adminService.getDepartments({ page, limit: 10 });
      setAdminDepartments(data.data || data);
      if (data.meta) setDeptsMeta(data.meta);
    } catch (err) {
      console.error(err);
      toast.error('Failed to fetch departments');
    }
  };

  const fetchPaginatedPromotions = async (page = 1) => {
    try {
      const data = await adminService.getPromotions(page, 10);
      setPaginatedPromotions(data.data || data);
      if (data.meta) setPromotionsMeta(data.meta);
    } catch (err) {
      console.error(err);
      toast.error('Failed to fetch requests');
    }
  };

  const handlePromotionSuccess = () => {
    fetchData(); // updates bookings & global promotions badge
    fetchPaginatedPromotions(promotionsMeta.page);
  };

  const deleteRoom = (id) => {
    setConfirmConfig({
      isOpen: true,
      title: 'Delete Room',
      message: 'Are you sure you want to delete this room? This will also cascade delete all associated bookings.',
      confirmText: 'Delete Room',
      confirmType: 'danger',
      action: async () => {
        try {
          await adminService.deleteRoom(id);
          toast.success('Room deleted successfully');
          fetchAdminRooms(roomsMeta.page);
        } catch (err) {
          console.error(err);
          toast.error(err.message || 'Failed to delete room');
        }
      }
    });
  };

  const openRoomModal = (room = null) => {
    setEditingRoom(room);
    setIsRoomModalOpen(true);
  };

  const deleteDepartment = (id) => {
    setConfirmConfig({
      isOpen: true,
      title: 'Delete Department',
      message: 'Are you sure you want to delete this department?',
      confirmText: 'Delete Department',
      confirmType: 'danger',
      action: async () => {
        try {
          await adminService.deleteDepartment(id);
          toast.success('Department deleted successfully');
          fetchAdminDepartments(deptsMeta.page);
        } catch (err) {
          console.error(err);
          toast.error(err.message || 'Failed to delete department');
        }
      }
    });
  };

  const openDeptModal = (dept = null) => {
    setEditingDept(dept);
    setIsDeptModalOpen(true);
  };

  useEffect(() => {
    if (activeTab === 'rooms') {
      fetchAdminRooms(1);
    } else if (activeTab === 'departments') {
      fetchAdminDepartments(1);
    } else if (activeTab === 'promotions') {
      fetchPaginatedPromotions(1);
    }
  }, [activeTab]);
  
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
    <div className="p-4 sm:p-8 max-w-full mx-auto w-full h-full flex flex-col overflow-hidden">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-primary p-3 rounded-2xl shadow-ambient">
              <Shield size={24} className="text-white" />
            </div>
            <h1 className="text-3xl font-extrabold text-text-primary tracking-tight font-display capitalize">Admin Console</h1>
          </div>
          <p className="text-text-secondary font-bold capitalize text-[10px] tracking-widest opacity-40 font-display">Manage allocations and elevation requests.</p>
        </div>
      </div>

      <div className="flex-1 flex flex-col md:flex-row gap-8 min-h-0">
        <AdminTabBar 
          activeTab={activeTab} 
          setActiveTab={setActiveTab} 
          promotions={promotions} 
          users={users} 
        />

        {/* Right workspace panel */}
        <div className="flex-1 bg-tonal-secondary/5 rounded-[2.5rem] overflow-hidden shadow-ambient border border-border/10 backdrop-blur-md flex flex-col min-h-0">
          <AdminFilterBar 
            activeTab={activeTab}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            filterRange={filterRange}
            setFilterRange={setFilterRange}
            exportCSV={exportCSV}
            openUserModal={openUserModal}
            openRoomModal={openRoomModal}
            openDeptModal={openDeptModal}
          />

          {/* Active section body content */}
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto no-scrollbar">
            {loading ? (
              <div className="flex-1 overflow-auto no-scrollbar p-4 space-y-4 animate-pulse">
                {/* Mobile skeleton */}
                <div className="grid grid-cols-1 gap-4 sm:hidden">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="bg-bg-primary/50 p-5 rounded-2xl border border-border/10 space-y-4">
                      <div className="flex justify-between items-start">
                        <div className="space-y-2 flex-1">
                          <div className="h-5 w-20 bg-surface-highest/20 rounded-md" />
                          <div className="h-4 w-32 bg-surface-highest/10 rounded-md" />
                        </div>
                        <div className="h-5 w-16 bg-surface-highest/20 rounded-md" />
                      </div>
                      <div className="h-10 bg-surface-highest/10 rounded-xl" />
                    </div>
                  ))}
                </div>
                
                {/* Desktop skeleton */}
                <div className="hidden sm:block">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-border/10 bg-bg-secondary/20">
                        <th className="px-6 py-4"><div className="h-3 w-16 bg-surface-highest/10 rounded" /></th>
                        <th className="px-6 py-4"><div className="h-3 w-12 bg-surface-highest/10 rounded" /></th>
                        <th className="px-6 py-4"><div className="h-3 w-24 bg-surface-highest/10 rounded" /></th>
                        <th className="px-6 py-4"><div className="h-3 w-16 bg-surface-highest/10 rounded" /></th>
                        <th className="px-6 py-4 text-right"><div className="h-3 w-16 bg-surface-highest/10 rounded ml-auto" /></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/10">
                      {[1, 2, 3, 4, 5].map(i => (
                        <tr key={i} className="border-b border-border/5">
                          <td className="px-6 py-4">
                            <div className="space-y-2">
                              <div className="h-4 w-28 bg-surface-highest/20 rounded" />
                              <div className="h-3 w-20 bg-surface-highest/10 rounded" />
                            </div>
                          </td>
                          <td className="px-6 py-4"><div className="h-6 w-14 bg-surface-highest/15 rounded-md" /></td>
                          <td className="px-6 py-4"><div className="h-4 w-36 bg-surface-highest/10 rounded" /></td>
                          <td className="px-6 py-4"><div className="h-5 w-16 bg-surface-highest/15 rounded-md" /></td>
                          <td className="px-6 py-4 text-right"><div className="h-8 w-20 bg-surface-highest/25 rounded-xl ml-auto" /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
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
                        <p className="text-[10px] font-black capitalize tracking-widest text-text-secondary opacity-50">
                          Page {bookingsMeta.page} of {bookingsMeta.totalPages}
                        </p>
                        <div className="flex gap-2">
                          <button 
                            disabled={bookingsMeta.page <= 1}
                            onClick={() => fetchData(bookingsMeta.page - 1)}
                            className="px-4 py-2 bg-bg-secondary rounded-xl text-[10px] font-black capitalize tracking-widest border border-border hover:bg-bg-primary transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            Prev
                          </button>
                          <button 
                            disabled={bookingsMeta.page >= bookingsMeta.totalPages}
                            onClick={() => fetchData(bookingsMeta.page + 1)}
                            className="px-4 py-2 bg-primary text-white rounded-xl text-[10px] font-black capitalize tracking-widest hover:opacity-90 transition-all shadow-ambient disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {activeTab === 'promotions' && (
                  <div className="flex-1 flex flex-col min-h-0">
                    <AdminRequests 
                      promotions={paginatedPromotions} 
                      searchTerm={searchTerm} 
                      handlePromotionAction={handlePromotion} 
                    />
                    {promotionsMeta.totalPages > 1 && (
                      <div className="p-4 bg-surface-low border-t border-border flex items-center justify-between">
                        <p className="text-[10px] font-black capitalize tracking-widest text-text-secondary opacity-50">
                          Page {promotionsMeta.page} of {promotionsMeta.totalPages}
                        </p>
                        <div className="flex gap-2">
                          <button 
                            disabled={promotionsMeta.page <= 1}
                            onClick={() => fetchPaginatedPromotions(promotionsMeta.page - 1)}
                            className="px-4 py-2 bg-bg-secondary rounded-xl text-[10px] font-black capitalize tracking-widest border border-border hover:bg-bg-primary transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            Prev
                          </button>
                          <button 
                            disabled={promotionsMeta.page >= promotionsMeta.totalPages}
                            onClick={() => fetchPaginatedPromotions(promotionsMeta.page + 1)}
                            className="px-4 py-2 bg-primary text-white rounded-xl text-[10px] font-black capitalize tracking-widest hover:opacity-90 transition-all shadow-ambient disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
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
                        <p className="text-[10px] font-black capitalize tracking-widest text-text-secondary opacity-50">
                          Page {usersMeta.page} of {usersMeta.totalPages}
                        </p>
                        <div className="flex gap-2">
                          <button 
                            disabled={usersMeta.page <= 1}
                            onClick={() => fetchUsers(usersMeta.page - 1)}
                            className="px-4 py-2 bg-bg-secondary rounded-xl text-[10px] font-black capitalize tracking-widest border border-border hover:bg-bg-primary transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            Prev
                          </button>
                          <button 
                            disabled={usersMeta.page >= usersMeta.totalPages}
                            onClick={() => fetchUsers(usersMeta.page + 1)}
                            className="px-4 py-2 bg-primary text-white rounded-xl text-[10px] font-black capitalize tracking-widest hover:opacity-90 transition-all shadow-ambient disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {activeTab === 'rooms' && (
                  <div className="flex-1 flex flex-col min-h-0">
                    <AdminRooms 
                      rooms={adminRooms}
                      searchTerm={searchTerm}
                      onEdit={openRoomModal}
                      onDelete={deleteRoom}
                    />
                    {roomsMeta.totalPages > 1 && (
                      <div className="p-4 bg-surface-low border-t border-border flex items-center justify-between">
                        <p className="text-[10px] font-black capitalize tracking-widest text-text-secondary opacity-50">
                          Page {roomsMeta.page} of {roomsMeta.totalPages}
                        </p>
                        <div className="flex gap-2">
                          <button 
                            disabled={roomsMeta.page <= 1}
                            onClick={() => fetchAdminRooms(roomsMeta.page - 1)}
                            className="px-4 py-2 bg-bg-secondary rounded-xl text-[10px] font-black capitalize tracking-widest border border-border hover:bg-bg-primary transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            Prev
                          </button>
                          <button 
                            disabled={roomsMeta.page >= roomsMeta.totalPages}
                            onClick={() => fetchAdminRooms(roomsMeta.page + 1)}
                            className="px-4 py-2 bg-primary text-white rounded-xl text-[10px] font-black capitalize tracking-widest hover:opacity-90 transition-all shadow-ambient disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {activeTab === 'departments' && (
                  <div className="flex-1 flex flex-col min-h-0">
                    <AdminDepartments 
                      departments={adminDepartments}
                      searchTerm={searchTerm}
                      onEdit={openDeptModal}
                      onDelete={deleteDepartment}
                    />
                    {deptsMeta.totalPages > 1 && (
                      <div className="p-4 bg-surface-low border-t border-border flex items-center justify-between">
                        <p className="text-[10px] font-black capitalize tracking-widest text-text-secondary opacity-50">
                          Page {deptsMeta.page} of {deptsMeta.totalPages}
                        </p>
                        <div className="flex gap-2">
                          <button 
                            disabled={deptsMeta.page <= 1}
                            onClick={() => fetchAdminDepartments(deptsMeta.page - 1)}
                            className="px-4 py-2 bg-bg-secondary rounded-xl text-[10px] font-black capitalize tracking-widest border border-border hover:bg-bg-primary transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            Prev
                          </button>
                          <button 
                            disabled={deptsMeta.page >= deptsMeta.totalPages}
                            onClick={() => fetchAdminDepartments(deptsMeta.page + 1)}
                            className="px-4 py-2 bg-primary text-white rounded-xl text-[10px] font-black capitalize tracking-widest hover:opacity-90 transition-all shadow-ambient disabled:opacity-30 disabled:cursor-not-allowed"
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
                {activeTab === 'uploads' && (
                  <div className="flex-1 p-6 overflow-y-auto min-h-0">
                    <AdminUploads />
                  </div>
                )}
                {activeTab === 'timetable' && (
                  <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar space-y-8 p-2">
                    <AdminTimetable />
                    <div className="border-t border-border/10 pt-6">
                      <AdminTimetableSlots />
                    </div>
                  </div>
                )}
                {activeTab === 'room-grid' && (
                  <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar">
                    <RoomScheduleGrid />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <AdminUserModal 
        isOpen={isUserModalOpen}
        onClose={closeUserModal}
        editingUser={editingUser}
        fetchUsers={fetchUsers}
        departments={departments}
      />
      
      <AdminRoomModal 
        isOpen={isRoomModalOpen}
        onClose={() => setIsRoomModalOpen(false)}
        editingRoom={editingRoom}
        fetchRooms={fetchAdminRooms}
      />
      
      <AdminDepartmentModal 
        isOpen={isDeptModalOpen}
        onClose={() => setIsDeptModalOpen(false)}
        editingDept={editingDept}
        fetchDepts={fetchAdminDepartments}
      />
      
      <AdminPromotionActionModal 
        isOpen={isPromotionModalOpen}
        onClose={() => setIsPromotionModalOpen(false)}
        selectedPromotionId={selectedPromotionId}
        promotionStatus={promotionStatus}
        fetchData={handlePromotionSuccess}
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
