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
  const [filters, setFilters] = useState({ smartRoom: false, searchTerm: '', floor: 'all', building: ['5th Block'], roomType: 'all' });
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
        building: filters.building
      };
      const data = await roomService.getRooms(queryParams);
      if (Array.isArray(data)) setRooms(data);
      else console.error('Expected array of rooms, got:', data);
    } catch (err) {
      console.error('Fetch rooms failed', err);
    }
  }, [filters.building]);

  const fetchBookings = useCallback(async () => {
    try {
      const data = await bookingService.getBookings({ limit: 1000 });
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
  }, [user]); // Depend on user directly to satisfy ESLint rules

  const fetchFacultyOverrides = useCallback(async () => {
    if (!user || user.role !== 'FACULTY') return;
    try {
      const data = await roomService.getFacultyOverrides();
      setFacultyOverrides(data || []);
    } catch (err) {
      console.error('Fetch faculty overrides failed', err);
    }
  }, [user]);

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
  }, [user, fetchRooms, fetchFaculties, fetchDepartments, fetchBookings, fetchAvailability, fetchTransfers, fetchTimetable, fetchFacultyOverrides]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  const loadInitialData = useCallback(async () => {
    if (!user) return;
    return Promise.all([
      fetchFaculties(),
      fetchDepartments(),
      fetchBookings(),
      fetchAvailability(),
      fetchTransfers(),
      fetchTimetable(),
      fetchFacultyOverrides()
    ]);
  }, [user, fetchFaculties, fetchDepartments, fetchBookings, fetchAvailability, fetchTransfers, fetchTimetable, fetchFacultyOverrides]);

  // Load global data exactly once on user login/change
  useEffect(() => {
    if (user) {
      loadInitialData();
    }
  }, [user, loadInitialData]);

  // Load rooms when user or room filter changes (since fetchRooms depends on filters, this runs on filter changes)
  useEffect(() => {
    if (user) {
      fetchRooms();
    }
  }, [user, fetchRooms]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]); 

  const clearInstallPrompt = useCallback(() => setDeferredPrompt(null), []);

  const pendingTransferCount = useMemo(() => {
    return incomingTransfers.filter(t => t.status === 'PENDING').length;
  }, [incomingTransfers]);

  const contextValue = useMemo(() => ({
    user,
    setUser,
    rooms,
    faculties,
    incomingTransfers,
    outgoingTransfers,
    pendingTransferCount,
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
    clearInstallPrompt,
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
  }), [
    user,
    rooms,
    faculties,
    incomingTransfers,
    outgoingTransfers,
    pendingTransferCount,
    bookings,
    availability,
    departments,
    filters,
    theme,
    viewMode,
    selectedDay,
    deferredPrompt,
    clearInstallPrompt,
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
  ]);

  return (
    <AppContext.Provider value={contextValue}>
      {children}
    </AppContext.Provider>
  );
};

