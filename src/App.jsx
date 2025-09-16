import React, { useState } from "react";
import Login from "./components/Login";
import SchedulingForm from "./components/ScheduleOptionForm";
import CalendarView from "./components/CalendarView";
import SlotView  from "./components/SlotView";
import AdminPanel from "./components/AdminPanel";


function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [preferences, setPreferences] = useState(null);
  const [showAdmin, setShowAdmin] = useState(false);
  const [userEmail, setUserEmail] = useState("");

  // On login, decode JWT to get email
  const handleLogin = () => {
    setIsLoggedIn(true);
    const token = localStorage.getItem('token');
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        setUserEmail(payload.email);
        if (payload.email === 'Admin@nsut.ac.in') {
          setShowAdmin(true);
        }
      } catch {}
    }
  };

  if (!isLoggedIn) {
    return <Login onLogin={handleLogin} />;
  }

  if (showAdmin) {
    return <AdminPanel />;
  }

  if (showCalendar) {
    // If showFullCalendar is set, show calendar with no preferences
    if (preferences?.showFullCalendar) {
      return <CalendarView onBack={() => { setShowCalendar(false); setPreferences(null); }} />;
    }
    // Otherwise show SlotView for submitted preferences
    return <SlotView day={preferences?.day} availability={preferences} onBack={() => { setShowCalendar(false); setPreferences(null); }} />;
  }

  return (
    <>
      <SchedulingForm onSubmit={formData => { setPreferences(formData); setShowCalendar(true); }} />
      <div className="flex justify-center mt-6">
        <button
          className="bg-gray-700 hover:bg-gray-800 text-white px-4 py-2 rounded font-semibold"
          onClick={() => setShowAdmin(true)}
        >
          Go to Admin Panel
        </button>
      </div>
    </>
  );
}

export default App;