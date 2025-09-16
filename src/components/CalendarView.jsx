import db from "../db.json";
import React, { useState } from "react";

const days = db.days;
const slots = db.slots;

// Assign random colors to features
const featureColors = {};
const colorPalette = [
  "#FFB6C1", // Light Pink
  "#87CEFA", // Light Blue
  "#90EE90", // Light Green
  "#FFD700", // Gold
  "#FFA07A", // Light Salmon
  "#D8BFD8", // Thistle
  "#FFDEAD", // Navajo White
  "#B0E0E6", // Powder Blue
  "#E6E6FA", // Lavender
  "#F5DEB3"  // Wheat
];
function getFeatureColor(feature) {
  if (!featureColors[feature]) {
    featureColors[feature] = colorPalette[Object.keys(featureColors).length % colorPalette.length];
  }
  return featureColors[feature];
}

export default function CalendarView({ availability = db.availability, rooms = db.rooms, preferences, onBack }) {
  const [overlay, setOverlay] = useState(null); // { day, slot, rooms: [] }
  const handleLogout = () => {
    localStorage.removeItem('token');
    window.location.reload();
  };
  // Helper to get feature string for a room
  function getRoomFeature(room) {
    const features = rooms?.[room]?.features || [];
    if (features.length === 0) return "None";
    return features.sort().join("+");
  }

  const cellPadding = 6; // px padding for day cells to increase spacing
  const gapBetweenPills = 6; // px gap between pills horizontally and vertically
  const pillPadding = "0.1rem 0.25rem";
  const maxPillsPerRow = 2;

  // Feature ranking for sorting
  const featureRank = {
    "AC+Projector": 1,
    "AC": 2,
    "Projector": 3,
    "None": 4,
  };

  // Helper to parse time string "HH:MM" into minutes from midnight
  function timeStringToMinutes(timeStr) {
    const [hours, minutes] = timeStr.split(":").map(Number);
    return hours * 60 + minutes;
  }

  // Given preferredStartTime and duration, find the consecutive slots that fit the duration
  function getConsecutiveSlots(preferredStartTime, duration) {
    const startIndex = slots.indexOf(preferredStartTime);
    if (startIndex === -1) return [];
    const requiredSlotsCount = Math.ceil(duration / 30); // assuming each slot is 30 minutes
    const endIndex = startIndex + requiredSlotsCount;
    if (endIndex > slots.length) return [];
    return slots.slice(startIndex, endIndex);
  }

  // Determine slots to consider based on preferences
  const preferredStartTime = preferences?.preferredStartTime;
  const duration = preferences?.duration;
  const consecutiveSlots = preferredStartTime && duration ? getConsecutiveSlots(preferredStartTime, duration) : [];

  return (
    <div className="mx-4 my-6" style={{ position: 'relative' }}>
      <div className="flex flex-row justify-between items-center mb-6 max-w-3xl mx-auto w-full">
        <button
          onClick={onBack}
          className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded font-semibold text-base shadow transition-colors"
        >
          Back to Selection
        </button>
        <button
          onClick={handleLogout}
          className="bg-gray-700 hover:bg-gray-800 text-white px-5 py-2 rounded font-semibold text-base shadow transition-colors"
        >
          Logout
        </button>
      </div>
  <div className="border border-gray-200 rounded-xl overflow-hidden shadow-md bg-white">
        {/* Header Row */}
        <div className="grid grid-cols-6 bg-gray-50 text-center text-base font-semibold border-b border-gray-200">
          <div className="py-4 px-4 border-r border-gray-100 bg-gray-200 text-left text-gray-700 tracking-wide">
            Time
          </div>
          {days.map((d) => (
            <div key={d} className="py-4 px-4 border-r border-gray-100">
              <div className="text-gray-800 text-lg font-medium">{d}</div>
              <div className="text-gray-400 text-xs font-normal italic mt-1">({/* date placeholder */})</div>
            </div>
          ))}
        </div>

        {/* Rows */}
        <div className="max-h-[70vh] overflow-y-auto bg-white">
          {/* Overlay card for room details */}
          {overlay && (
            <div
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100vw',
                height: '100vh',
                background: 'rgba(0,0,0,0.25)',
                zIndex: 1000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              onClick={() => setOverlay(null)}
            >
              <div
                className="bg-white rounded-xl shadow-2xl p-8 max-w-lg w-full relative"
                style={{ minWidth: 320, maxHeight: '80vh', overflowY: 'auto' }}
                onClick={e => e.stopPropagation()}
              >
                <button
                  onClick={() => setOverlay(null)}
                  style={{ position: 'absolute', top: 12, right: 16, background: 'none', border: 'none', fontSize: 22, color: '#888', cursor: 'pointer' }}
                  aria-label="Close"
                >
                  ×
                </button>
                <h2 className="text-xl font-bold mb-4">Room Details</h2>
                <div className="flex flex-col gap-3">
                  {overlay.rooms
                    .slice()
                    .sort((a, b) => {
                      const fa = rooms[a]?.features || [];
                      const fb = rooms[b]?.features || [];
                      // Feature ranking: AC+Projector < AC < Projector < None
                      function getFeatureRank(features) {
                        if (features.includes("AC") && features.includes("Projector")) return 1;
                        if (features.includes("AC")) return 2;
                        if (features.includes("Projector")) return 3;
                        return 4;
                      }
                      return getFeatureRank(fa) - getFeatureRank(fb);
                    })
                    .map(room => (
                      <div key={room} className="flex items-center justify-between bg-gray-100 rounded-lg px-4 py-2">
                        <span className="font-semibold text-gray-800">{room}</span>
                        <div className="flex gap-2">
                          {(rooms[room]?.features || []).length > 0 ? (
                            rooms[room].features.sort().map(feature => (
                              <span
                                key={feature}
                                className="text-xs px-3 py-1 rounded-full select-none"
                                style={{ background: getFeatureColor(feature), color: '#333', fontWeight: 500 }}
                              >
                                {feature}
                              </span>
                            ))
                          ) : (
                            <span className="text-gray-500 italic text-xs select-none">No features</span>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          )}
          {slots.map((slot) => {
            // Always render the row, but show 'All rooms occupied' for non-selected slots
            return (
              <div
                key={slot}
                className="grid grid-cols-6 border-t border-gray-100"
              >
                {/* Time Column */}
                <div className="bg-gray-200 py-3 px-4 text-sm font-medium border-r border-gray-100 text-gray-700">
                  {slot}
                </div>

                {/* Day Cells */}
                {days.map((day) => {
                  // If not selected day or slot, show 'All rooms occupied'
                  if ((preferences?.day && preferences.day !== day) || (preferences?.slot && preferences.slot !== slot)) {
                    return (
                      <div key={`${slot}-${day}`} className="border-r border-gray-100 flex flex-col gap-1" style={{ padding: `${cellPadding}px`, boxSizing: "border-box", minHeight: "1.5rem", display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ color: '#888', fontStyle: 'italic', fontSize: '0.95em' }}>All rooms occupied</span>
                      </div>
                    );
                  }
                  // ...existing code...
                  let roomsAvailable = [];
                  if (consecutiveSlots.length > 0) {
                    if (slot === consecutiveSlots[0]) {
                      const roomsInAllSlots = consecutiveSlots.reduce((acc, s, idx) => {
                        const roomsAtSlot = availability[day]?.[s] || [];
                        if (idx === 0) return roomsAtSlot;
                        return acc.filter((room) => roomsAtSlot.includes(room));
                      }, []);
                      roomsAvailable = roomsInAllSlots;
                    } else {
                      roomsAvailable = [];
                    }
                  } else {
                    roomsAvailable = availability[day]?.[slot] || [];
                  }

                  let filteredRooms = roomsAvailable;
                  if (preferences) {
                    filteredRooms = roomsAvailable.filter(room => {
                      const feats = rooms?.[room]?.features || [];
                      if (preferences.ac && !feats.includes("AC")) return false;
                      if (preferences.projector && !feats.includes("Projector")) return false;
                      return true;
                    });
                  }

                  return (
                    <div
                      key={`${slot}-${day}`}
                      className="border-r border-gray-100 flex flex-col gap-1"
                      style={{ padding: `${cellPadding}px`, boxSizing: "border-box" }}
                    >
                      {filteredRooms.length > 0 ? (
                        <div className="flex gap-1 relative" style={{ width: "100%", height: "100%" }}>
                          {(() => {
                            const room = filteredRooms[0];
                            const feature = getRoomFeature(room);
                            const pillColor = getFeatureColor(feature);
                            return (
                              <div
                                key={room}
                                className="text-xs font-medium rounded-full flex items-center justify-center cursor-pointer"
                                style={{
                                  padding: pillPadding,
                                  minWidth: 0,
                                  whiteSpace: "nowrap",
                                  lineHeight: 1.1,
                                  overflow: "hidden",
                                  boxSizing: "border-box",
                                  flex: `1 1 0`,
                                  height: "100%",
                                  background: pillColor,
                                }}
                                onClick={() => filteredRooms.length > 1 && setOverlay({ day, slot, rooms: filteredRooms })}
                                title={filteredRooms.length > 1 ? "Show all rooms" : undefined}
                              >
                                {room}
                              </div>
                            );
                          })()}
                          {filteredRooms.length > 1 && (
                            <span
                              className="flex items-center justify-center"
                              style={{
                                position: "absolute",
                                top: "-0.4em",
                                right: "0.1em",
                                width: "1.1em",
                                height: "1.1em",
                                borderRadius: "50%",
                                background: "#F44336",
                                color: "#fff",
                                fontWeight: 400,
                                fontSize: "0.85em",
                                boxShadow: "0 2px 8px rgba(0,0,0,0.10)",
                                zIndex: 10,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              {filteredRooms.length - 1}
                            </span>
                          )}
                        </div>
                      ) : (
                        <div style={{ minHeight: "1.5rem", display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ color: '#888', fontStyle: 'italic', fontSize: '0.95em' }}>All rooms occupied</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}