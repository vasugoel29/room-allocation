import { useState, useEffect } from 'react';
import { adminService } from '../services/adminService';
import toast from 'react-hot-toast';

export function useAdminUsers(activeTab) {
  const [users, setUsers] = useState([]);
  const [usersMeta, setUsersMeta] = useState({ page: 1, totalPages: 1 });
  const [departments, setDepartments] = useState([]);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);

  const fetchUsers = async (page = 1) => {
    try {
      const result = await adminService.getUsers(page);
      setUsers(result.data || result);
      if (result.meta) setUsersMeta(result.meta);
    } catch (err) {
      console.error('Failed to fetch users', err);
    }
  };

  const fetchDepartments = async () => {
    try {
      const data = await adminService.getDepartments();
      setDepartments(data);
    } catch (err) {
      console.error('Failed to fetch departments', err);
    }
  };

  const handleApproveUser = async (id) => {
    try {
      await adminService.approveUser(id);
      toast.success('User approved!');
      fetchUsers();
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Approval failed');
    }
  };

  const handleDeleteUser = async (id) => {
    try {
      await adminService.deleteUser(id);
      toast.success('User deleted');
      fetchUsers();
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Failed to delete user');
    }
  };

  const openUserModal = (u = null) => {
    setEditingUser(u);
    setIsUserModalOpen(true);
  };

  const closeUserModal = () => {
    setEditingUser(null);
    setIsUserModalOpen(false);
  };

  useEffect(() => {
    if (activeTab === 'users' || activeTab === 'quick') {
      fetchUsers();
    }
  }, [activeTab]);

  useEffect(() => {
    fetchDepartments();
  }, []);

  return { 
    users, usersMeta, departments, isUserModalOpen, editingUser, 
    fetchUsers, fetchDepartments, handleApproveUser, handleDeleteUser,
    openUserModal, closeUserModal 
  };
}
