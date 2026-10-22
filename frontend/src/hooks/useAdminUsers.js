import { useState, useEffect, useCallback } from 'react';
import { adminService } from '../services/adminService';
import toast from 'react-hot-toast';

/**
 * Users tab data. The directory is a read-only mirror of the college ACL; the only local action is
 * deactivating someone in CRAS (soft delete).
 */
export function useAdminUsers(activeTab, searchTerm = '') {
  const [users, setUsers] = useState([]);
  const [usersMeta, setUsersMeta] = useState({ page: 1, totalPages: 1 });

  // Stable per search term, so the tab effect below doesn't re-run when only the page changes.
  const loadUsers = useCallback(async (page) => {
    try {
      const result = await adminService.getUsers(page, 20, searchTerm);
      setUsers(result.data || result);
      if (result.meta) setUsersMeta(result.meta);
    } catch (err) {
      console.error('Failed to fetch users', err);
    }
  }, [searchTerm]);
  const fetchUsers = (page = usersMeta.page) => loadUsers(page);


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
      loadUsers(1);
    }
  }, [activeTab, loadUsers]);

  return { users, usersMeta, fetchUsers, handleDeactivateUser };
}
