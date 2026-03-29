import { useState, useEffect } from 'react';
import { adminService } from '../services/adminService';
import toast from 'react-hot-toast';

export function useAdminUsers(activeTab) {
  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);

  const fetchUsers = async () => {
    try {
      const data = await adminService.getUsers();
      setUsers(data);
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
    users, departments, isUserModalOpen, editingUser, 
    fetchUsers, fetchDepartments, handleApproveUser, handleDeleteUser,
    openUserModal, closeUserModal 
  };
}
