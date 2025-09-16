import React, { useState, useEffect } from "react";
import data from "../db.json";
function ScheduleOptionForm({onSubmit}) {
  const handleLogout = () => {
    localStorage.removeItem('token');
    window.location.reload();
  };
  const [formData, setFormData] = useState({
    day: "",
    slot: "",
    duration: "",
    ac: false,
    projector: false
  });

  // Generate durations dynamically in intervals of 1 hour
  const durations = Array.from({ length: 8 }, (_, i) => i + 1); // [1,2,3,4,5,6,7,8]
  const [options, setOptions] = useState({
    days: data.days || [],
    durations,
    slots: data.slots || []
  });

  // Use slot keys from db.json for selection
  const availableSlots = options.slots;

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === "checkbox" ? checked : value
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (onSubmit) {
      onSubmit(formData);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", minHeight: "100vh", backgroundColor: "#f0f2f5", padding: "1rem" }}>
      <div style={{ width: "100%", maxWidth: "400px", display: "flex", justifyContent: "flex-end", marginBottom: "0.5rem" }}>
        <button
          onClick={handleLogout}
          style={{ backgroundColor: '#444', color: '#fff', border: 'none', borderRadius: '6px', padding: '0.5rem 1.5rem', fontWeight: 600, cursor: 'pointer' }}
        >
          Logout
        </button>
      </div>
      <form onSubmit={handleSubmit} style={{ maxWidth: "400px", width: "100%", backgroundColor: "#fff", boxShadow: "0 4px 12px rgba(0,0,0,0.1)", padding: "2rem", borderRadius: "12px" }}>
        <h2 style={{ textAlign: "center", marginBottom: "1.5rem" }}>Scheduling Form</h2>
        
        <div style={{ marginBottom: "1.25rem" }}>
          <label htmlFor="day" style={{ display: "block", marginBottom: "0.5rem", fontWeight: "600" }}>Preferred Day:</label>
          <select id="day" name="day" value={formData.day} onChange={handleChange} required style={{ width: "100%", padding: "0.5rem", borderRadius: "6px", border: "1px solid #ccc", fontSize: "1rem" }}>
            <option value="" disabled>Select a day</option>
            {options.days.map((day) => (
              <option key={day} value={day}>{day}</option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: "1.5rem" }}>
          <label htmlFor="duration" style={{ display: "block", marginBottom: "0.5rem", fontWeight: "600" }}>Duration:</label>
          <select id="duration" name="duration" value={formData.duration} onChange={handleChange} required style={{ width: "100%", padding: "0.5rem", borderRadius: "6px", border: "1px solid #ccc", fontSize: "1rem" }}>
            <option value="" disabled>Select a duration</option>
            {options.durations.map((duration) => (
              <option key={duration} value={duration}>
                {duration} {duration === 1 ? "hour" : "hours"}
              </option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: "1.5rem" }}>
          <label htmlFor="slot" style={{ display: "block", marginBottom: "0.5rem", fontWeight: "600" }}>Preferred Slot:</label>
          <select
            id="slot"
            name="slot"
            value={formData.slot}
            onChange={handleChange}
            required
            style={{ width: "100%", padding: "0.5rem", borderRadius: "6px", border: "1px solid #ccc", fontSize: "1rem" }}
            disabled={availableSlots.length === 0}
          >
            <option value="" disabled>
              Select a slot
            </option>
            {availableSlots.map((slot) => (
              <option key={slot} value={slot}>
                {slot}
              </option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: "1.5rem", display: "flex", gap: "1.5rem" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: "600" }}>
            <input
              type="checkbox"
              name="ac"
              checked={formData.ac}
              onChange={handleChange}
              style={{ width: "1.1em", height: "1.1em" }}
            />
            AC
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: "600" }}>
            <input
              type="checkbox"
              name="projector"
              checked={formData.projector}
              onChange={handleChange}
              style={{ width: "1.1em", height: "1.1em" }}
            />
            Projector
          </label>
        </div>

        <button type="submit" style={{ width: "100%", padding: "0.75rem", backgroundColor: "#007bff", border: "none", borderRadius: "6px", color: "#fff", fontWeight: "600", fontSize: "1rem", cursor: "pointer", transition: "background-color 0.3s ease" }} onMouseOver={e => e.currentTarget.style.backgroundColor = '#0056b3'} onMouseOut={e => e.currentTarget.style.backgroundColor = '#007bff'}>
          Submit
        </button>
      <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
        <hr style={{ margin: '1rem 0', border: 'none', borderTop: '1px solid #ccc' }} />
        <button
          type="button"
          style={{ padding: '0.75rem 2rem', backgroundColor: '#28a745', border: 'none', borderRadius: '6px', color: '#fff', fontWeight: '600', fontSize: '1rem', cursor: 'pointer', marginTop: '0.5rem' }}
          onClick={() => onSubmit({ showFullCalendar: true })}
        >
          See Full Calendar View
        </button>
      </div>
      </form>
    </div>
  );
}

export default ScheduleOptionForm;