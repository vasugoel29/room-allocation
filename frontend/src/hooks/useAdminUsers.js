import { useState, useEffect } from 'react';
import { adminService } from '../services/adminService';
import toast from 'react-hot-toast';

/**
 * Users tab data. The directory is a read-only mirror of the college ACL; the only local action is
 * deactivating someone in CRAS (soft delete).
 */
export function useAdminUsers(activeTab, searchTerm = '') {
  const [users, setUsers] = useState([]);
  const [usersMeta, setUsersMeta] = useState({ page: 1, totalPages: 1 });

  const fetchUsers = async (page = usersMeta.page) => {
    try {
      const result = await adminService.getUsers(page, 20, searchTerm);
      setUsers(result.data || result);
      if (result.meta) setUsersMeta(result.meta);
    } catch (err) {
      console.error('Failed to fetch users', err);
    }
  };


  const handleDeactivateUser = async (id) => {
    try {
      await adminService.deactivateUser(id);
      toast.success('User deactivated');
      fetchUsers();
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Failed to deactivate user');
    }
  };

  useEffect(() => {
    if (activeTab === 'users' || activeTab === 'quick') {
      fetchUsers(1);
    }
  }, [activeTab, searchTerm]);

  return { users, usersMeta, fetchUsers, handleDeactivateUser };
}
