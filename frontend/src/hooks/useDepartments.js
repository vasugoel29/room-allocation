import { useState, useEffect } from 'react';
import adminService from '../services/adminService';

export function useDepartments() {
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchDepartments = async () => {
    try {
      setLoading(true);
      const data = await adminService.getDepartments();
      if (Array.isArray(data)) {
        setDepartments(data);
      } else {
        console.error('Expected array for departments, got:', data);
      }
    } catch (err) {
      console.error('Failed to fetch departments', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDepartments();
  }, []);

  return { departments, setDepartments, loading, fetchDepartments };
}
