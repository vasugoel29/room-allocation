/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { api } from '../utils/api';

export const AppContext = createContext();

export const AppProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('user');
      return saved && saved !== 'undefined' ? JSON.parse(saved) : null;
    } catch (e) {
      console.error('Error parsing user from localStorage:', e);
      return null;
    }
  });

  const [rooms, setRooms] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [availability, setAvailability] = useState([]);
  const [filters, setFilters] = useState({ smartRoom: false, searchTerm: '', floor: 'all', building: '5th Block' });
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');
  const [viewMode, setViewMode] = useState('day'); // 'week' | 'day'

  const initialDay = useMemo(() => {
    const now = new Date();
    const day = now.getDay();
    const hour = now.getHours();
    
    const targetDate = new Date(now);
    if (day === 0) targetDate.setDate(now.getDate() + 1);
    else if (day === 6) targetDate.setDate(now.getDate() + 2);
    else if (hour >= 18) {
      if (day === 5) targetDate.setDate(now.getDate() + 3);
      else targetDate.setDate(now.getDate() + 1);
    }
    
    const year = targetDate.getFullYear();
    const month = String(targetDate.getMonth() + 1).padStart(2, '0');
    const dayNum = String(targetDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${dayNum}`;
  }, []);

  const [selectedDay, setSelectedDay] = useState(initialDay);
  const [backendError, setBackendError] = useState(null);
  const prevBackendError = useRef(null);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  }, []);

  const fetchRooms = useCallback(async () => {
    try {
      const queryParams = { ...filters };
      if (filters.smartRoom) {
        queryParams.ac = 'true';
        queryParams.projector = 'true';
      }
      delete queryParams.smartRoom;
      const query = new URLSearchParams(queryParams).toString();
      const res = await api.get(`/rooms?${query}`);
      const data = await res.json();
      if (Array.isArray(data)) setRooms(data);
      else console.error('Expected array of rooms, got:', data);
    } catch (err) {
      console.error('Fetch rooms failed', err);
    }
  }, [filters]);

  const fetchBookings = useCallback(async () => {
    try {
      const res = await api.get('/bookings');
      const data = await res.json();
      setBookings(data);
    } catch (err) {
      console.error('Fetch bookings failed', err);
    }
  }, []);

  const fetchAvailability = useCallback(async () => {
    try {
      const res = await api.get('/availability');
      const data = await res.json();
      setAvailability(data);
    } catch (err) {
      console.error('Fetch availability failed', err);
    }
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    if (user) {
      fetchRooms();
    }
  }, [user, fetchRooms]);

  useEffect(() => {
    if (user) {
      fetchBookings();
      fetchAvailability();
    }
  }, [user, fetchBookings, fetchAvailability]);

  useEffect(() => {
    const checkConnection = async () => {
      try {
        const res = await api.get('/health');
        if (!res.ok) throw new Error('Backend unresponsive');
        if (prevBackendError.current && user) {
          console.log('Backend recovered! Refreshing data...');
          fetchRooms();
          fetchBookings();
          fetchAvailability();
        }
        setBackendError(null);
        prevBackendError.current = null;
      } catch (err) {
        console.error('Backend connection check failed:', err);
        const errMsg = 'Cannot connect to server. Please ensure the backend is running.';
        setBackendError(errMsg);
        prevBackendError.current = errMsg;
      }
    };

    checkConnection();
    const interval = setInterval(checkConnection, 30000);
    return () => clearInterval(interval);
  }, [user, fetchRooms, fetchBookings, fetchAvailability]);

  return (
    <AppContext.Provider value={{
      user,
      setUser,
      rooms,
      bookings,
      availability,
      filters,
      setFilters,
      theme,
      setTheme,
      viewMode,
      setViewMode,
      selectedDay,
      setSelectedDay,
      backendError,
      fetchRooms,
      fetchBookings,
      fetchAvailability,
      handleLogout
    }}>
      {children}
    </AppContext.Provider>
  );
};
