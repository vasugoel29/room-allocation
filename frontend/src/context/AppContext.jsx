/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { authService } from '../services/authService';
import { bookingService } from '../services/bookingService';
import { getInitialBookingDateString } from '../utils/dateHelpers';
import { roomService } from '../services/roomService';
import { getIstDateKey, addDaysToKey, mondayOfKey } from '../utils/timezone';
import { teaches, can as canUser, canAny, canSeeCalendar, P } from '../utils/permissions';

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
  const [roomsError, setRoomsError] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [availability, setAvailability] = useState([]);
  const [filters, setFilters] = useState({ smartRoom: false, searchTerm: '', floor: 'all', building: ['5th Block'], roomType: 'all' });
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');
  const [viewMode, setViewMode] = useState('day'); // 'week' | 'day'
  const [deferredPrompt, setDeferredPrompt] = useState(null);
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

  const initialDay = useMemo(() => getInitialBookingDateString(), []);

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

  // Refresh role/permissions/profile from the server once per load, so changes made in the ACL
  // (a role change or revocation) reach the UI without signing out and in again.
  const userId = user?.id;
  useEffect(() => {
    if (!userId || !localStorage.getItem('token')) return;
    let cancelled = false;
    authService.me()
      .then((fresh) => {
        if (cancelled || !fresh) return;
        setUser(fresh);
        try { localStorage.setItem('user', JSON.stringify(fresh)); } catch { /* storage unavailable */ }
      })
      .catch((err) => console.warn('Could not refresh profile', err));
    return () => { cancelled = true; };
  }, [userId]);

  // Each loader only asks for what this person may see, so nobody collects 403s on app open.
  const fetchTransfers = useCallback(async () => {
    if (!canAny(user, P.BOOKINGS, P.FACULTY_PORTAL, P.ADMIN)) return;
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
    if (!canAny(user, P.BOOKINGS, P.BOOKINGS_DIRECT, P.FACULTY_PORTAL, P.ADMIN)) return;
    try {
      const data = await authService.getFaculties();
      setFaculties(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Fetch faculties failed', err);
    }
  }, [user]);

  const seesCalendar = canSeeCalendar(user);
  const fetchRooms = useCallback(async () => {
    if (!seesCalendar) return;
    try {
      const queryParams = { 
        building: filters.building.flatMap(b => b === 'Others' ? ['Other', 'Others'] : [b])
      };
      const data = await roomService.getRooms(queryParams);
      if (Array.isArray(data)) { setRooms(data); setRoomsError(null); }
      else console.error('Expected array of rooms, got:', data);
    } catch (err) {
      // Surfaced to the calendar so a failure isn't shown as "no matching rooms" (FE-13).
      console.error('Fetch rooms failed', err);
      setRoomsError(err.message || 'Could not load rooms');
    }
  }, [filters.building, seesCalendar]);

  // Calendar occupancy is loaded for bounded windows rather than as one capped download (PERF-01,
  // FE-12): this week and next (booking happens there), plus the week of the selected day when the
  // user browses elsewhere. "Mine" adds the user's own and supervised bookings of any date/status.
  const thisMonday = mondayOfKey(getIstDateKey(new Date()));
  const selectedMonday = /^\d{4}-\d{2}-\d{2}$/.test(selectedDay || '') ? mondayOfKey(selectedDay) : thisMonday;
  const fetchBookings = useCallback(async () => {
    const windows = [[thisMonday, addDaysToKey(thisMonday, 13)]];
    if (selectedMonday < thisMonday || selectedMonday > addDaysToKey(thisMonday, 7)) {
      windows.push([selectedMonday, addDaysToKey(selectedMonday, 6)]);
    }
    try {
      const [mine, ...calendars] = await Promise.all([
        bookingService.getMine(),
        ...(seesCalendar ? windows.map(([from, to]) => bookingService.getCalendar(from, to)) : []),
      ]);
      const byId = new Map();
      for (const b of [...calendars.flat(), ...mine]) byId.set(b.id, b);
      setBookings([...byId.values()]);
    } catch (err) {
      console.error('Fetch bookings failed', err);
    }
  }, [thisMonday, selectedMonday, seesCalendar]);

  const fetchAvailability = useCallback(async () => {
    if (!seesCalendar) return;
    try {
      const data = await roomService.getAvailability();
      setAvailability(data);
    } catch (err) {
      console.error('Fetch availability failed', err);
    }
  }, [seesCalendar]);


  const fetchTimetable = useCallback(async () => {
    if (!user || !canAny(user, P.TIMETABLE, ...(teaches(user) ? [P.FACULTY_PORTAL] : []))) return;
    try {
      if (teaches(user)) {
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
    if (!user || !teaches(user) || !canUser(user, P.FACULTY_PORTAL)) return;
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
      fetchBookings(),
      fetchAvailability(),
      fetchTransfers(),
      fetchTimetable(),
      fetchFacultyOverrides()
    ]);
  }, [user, fetchRooms, fetchFaculties, fetchBookings, fetchAvailability, fetchTransfers, fetchTimetable, fetchFacultyOverrides]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  const loadInitialData = useCallback(async () => {
    if (!user) return;
    return Promise.all([
      fetchFaculties(),
      fetchAvailability(),
      fetchTransfers(),
      fetchTimetable(),
      fetchFacultyOverrides()
    ]);
  }, [user, fetchFaculties, fetchAvailability, fetchTransfers, fetchTimetable, fetchFacultyOverrides]);

  // Load global data exactly once on user login/change
  useEffect(() => {
    if (user) {
      loadInitialData();
    }
  }, [user, loadInitialData]);

  // Bookings reload when the user browses to a week outside the loaded windows.
  useEffect(() => {
    if (user) fetchBookings();
  }, [user, fetchBookings]);

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

  // Permission check against what the ACL granted (catalog names in utils/permissions.js).
  const hasResource = useCallback((permission) => canUser(user, permission), [user]);

  const contextValue = useMemo(() => ({
    user,
    setUser,
    hasResource,
    rooms,
    roomsError,

    faculties,
    incomingTransfers,
    outgoingTransfers,
    pendingTransferCount,
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
    deferredPrompt,
    clearInstallPrompt,
    backendError,
    fetchRooms,
    fetchFaculties,
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
    hasResource,
    rooms,
    roomsError,
    faculties,
    incomingTransfers,
    outgoingTransfers,
    pendingTransferCount,
    bookings,
    availability,
    filters,
    theme,
    viewMode,
    selectedDay,
    deferredPrompt,
    clearInstallPrompt,
    backendError,
    fetchRooms,
    fetchFaculties,
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

