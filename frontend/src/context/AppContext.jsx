/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { authService } from '../services/authService';
import { bookingService } from '../services/bookingService';
import { roomService } from '../services/roomService';

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
  const [filters, setFilters] = useState({ smartRoom: false, searchTerm: '', floor: 'all', building: ['5th Block'] });
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');
  const [viewMode, setViewMode] = useState('day'); // 'week' | 'day'
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [timetableData, setTimetableData] = useState({});
  const [facultyTimetableData, setFacultyTimetableData] = useState({});
  const [facultyOverrides, setFacultyOverrides] = useState([]);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Stash the event so it can be triggered later.
      setDeferredPrompt(e);
      console.log('PWA: deferredPrompt captured');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

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

  const [faculties, setFaculties] = useState([]);
  const [incomingTransfers, setIncomingTransfers] = useState([]);
  const [outgoingTransfers, setOutgoingTransfers] = useState([]);
  const [selectedDay, setSelectedDay] = useState(initialDay);
  const [backendError, setBackendError] = useState(null);
  const prevBackendError = useRef(null);

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } catch (err) {
      console.error('Logout error', err);
    } finally {
      setUser(null);
      localStorage.removeItem('user');
      localStorage.removeItem('token');
    }
  }, []);

  const fetchTransfers = useCallback(async () => {
    if (!user) return;
    try {
      const [incoming, outgoing] = await Promise.all([
        bookingService.getIncomingTransfers(),
        bookingService.getOutgoingTransfers()
      ]);
      setIncomingTransfers(incoming);
      setOutgoingTransfers(outgoing);
    } catch (err) {
      console.error('Fetch transfers failed', err);
    }
  }, [user]);

  const fetchFaculties = useCallback(async () => {
    try {
      const data = await authService.getFaculties();
      setFaculties(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Fetch faculties failed', err);
    }
  }, []);

  const fetchDepartments = useCallback(async () => {
    try {
      const data = await roomService.getDepartments();
      setDepartments(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Fetch departments failed', err);
    }
  }, []);

  const fetchRooms = useCallback(async () => {
    try {
      const queryParams = { 
        building: filters.building,
        floor: filters.floor,
        searchTerm: filters.searchTerm
      };
      if (filters.smartRoom) {
        queryParams.ac = 'true';
        queryParams.projector = 'true';
      }
      const data = await roomService.getRooms(queryParams);
      if (Array.isArray(data)) setRooms(data);
      else console.error('Expected array of rooms, got:', data);
    } catch (err) {
      console.error('Fetch rooms failed', err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.building, filters.floor, filters.searchTerm, filters.smartRoom]);

  const fetchBookings = useCallback(async () => {
    try {
      const data = await bookingService.getBookings();
      setBookings(data);
    } catch (err) {
      console.error('Fetch bookings failed', err);
    }
  }, []);

  const fetchAvailability = useCallback(async () => {
    try {
      const data = await roomService.getAvailability();
      setAvailability(data);
    } catch (err) {
      console.error('Fetch availability failed', err);
    }
  }, []);


  const fetchTimetable = useCallback(async () => {
    if (!user) return;
    try {
      if (user.role === 'FACULTY') {
        const data = await roomService.getFacultyTimetable();
        setFacultyTimetableData(data || {});
      } else {
        const data = await roomService.getTimetable();
        setTimetableData(data);
      }
    } catch (err) {
      console.error('Fetch timetable failed', err);
    }
  }, [user?.role]); // Only depend on role for the API endpoint decision

  const fetchFacultyOverrides = useCallback(async () => {
    if (!user || user.role !== 'FACULTY') return;
    try {
      const data = await roomService.getFacultyOverrides();
      setFacultyOverrides(data || []);
    } catch (err) {
      console.error('Fetch faculty overrides failed', err);
    }
  }, [user?.role]);

  const refreshAllData = useCallback(async () => {
    if (!user) return;
    return Promise.all([
      fetchRooms(),
      fetchFaculties(),
      fetchDepartments(),
      fetchBookings(),
      fetchAvailability(),
      fetchTransfers(),
      fetchTimetable(),
      fetchFacultyOverrides()
    ]);
  }, [user?.id, fetchRooms, fetchFaculties, fetchDepartments, fetchBookings, fetchAvailability, fetchTransfers, fetchTimetable, fetchFacultyOverrides]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Consolidated Main Data Fetching Effect
  useEffect(() => {
    if (user) {
      refreshAllData();
    }
  }, [
    user?.id, 
    selectedDay, 
    filters.building, 
    refreshAllData
  ]);

  useEffect(() => {
    // Keep internal state for consecutive failures to avoid flickering on transient issues
    let failureCount = 0;
    
    const checkConnection = async () => {
      try {
        await roomService.getHealth();
        
        // If we were in error state and now recovered
        if (prevBackendError.current && user) {
          console.log('Backend recovered! Refreshing data...');
          refreshAllData();
        }
        
        setBackendError(null);
        prevBackendError.current = null;
        failureCount = 0;
      } catch (err) {
        failureCount++;
        // Only show error screen after 2 consecutive failures to allow for minor network jitters
        if (failureCount >= 2) {
          console.error('Backend connection check failed:', err);
          const errMsg = 'Cannot connect to server. Please ensure the backend is running.';
          setBackendError(errMsg);
          prevBackendError.current = errMsg;
        }
      }
    };

    checkConnection();
    const interval = setInterval(checkConnection, 30000);
    return () => clearInterval(interval);
    // Removed function dependencies that were causing re-render loops
  }, [user]); 

  return (
    <AppContext.Provider value={{
      user,
      setUser,
      rooms,
      faculties,
      incomingTransfers,
      outgoingTransfers,
      pendingTransferCount: incomingTransfers.filter(t => t.status === 'PENDING').length,
      bookings,
      availability,
      departments,
      filters,
      setFilters,
      theme,
      setTheme,
      viewMode,
      setViewMode,
      selectedDay,
      setSelectedDay,
      deferredPrompt,
      clearInstallPrompt: () => setDeferredPrompt(null),
      backendError,
      fetchRooms,
      fetchFaculties,
      fetchDepartments,
      fetchBookings,
      fetchAvailability,
      timetableData,
      facultyTimetableData,
      facultyOverrides,
      fetchTimetable,
      fetchFacultyOverrides,
      fetchTransfers,
      refreshAllData,
      logout
    }}>
      {children}
    </AppContext.Provider>
  );
};

