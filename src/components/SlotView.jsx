


import { useEffect, useState } from "react";

// slots and days will be fetched from API

function getFeatureColor(feature) {
  // Simple color assignment for features
  if (feature === "AC") return "#87CEFA";
  if (feature === "Projector") return "#FFD700";
  if (feature === "AC+Projector") return "#90EE90";
  return "#E6E6FA";
}

function SlotView({ day, availability, onBack }) {
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [showBookButton, setShowBookButton] = useState(null);
  const { slot: selectedSlot, ac, projector } = availability || {};
  const [rooms, setRooms] = useState({});
  const [avail, setAvail] = useState({});
  // Always use today's date
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10);
  const weekdayMap = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const todayDay = weekdayMap[today.getDay()];

  useEffect(() => {
    // Fetch rooms and availability for today from API
    const API_BASE = "http://localhost:4000";
    async function fetchData() {
      const roomsRes = await fetch(`${API_BASE}/available-rooms/all`);
      const roomsData = await roomsRes.json();
      setAvail(roomsData);
      // Fetch room features for today
      const featuresRes = await fetch(`${API_BASE}/available-rooms?day=${todayDay}&slot=${selectedSlot}`);
      const featuresData = await featuresRes.json();
      const roomMap = {};
      featuresData.forEach(r => { roomMap[r.roomId] = { features: r.features }; });
      setRooms(roomMap);
    }
    fetchData();
  }, [selectedSlot, todayDay]);


  // Feature ranking: AC+Projector > AC > Projector > None
  function getFeatureRank(features) {
    if (features.includes("AC") && features.includes("Projector")) return 1;
    if (features.includes("AC")) return 2;
    if (features.includes("Projector")) return 3;
    return 4;
  }

  // Only show rooms available for today
  const availableRooms = (avail[todayDay]?.[selectedSlot]?.map(r => r.roomId) || [])
    .filter(room => {
      const features = rooms[room]?.features || [];
      if (ac && !features.includes("AC")) return false;
      if (projector && !features.includes("Projector")) return false;
      return true;
    })
    .sort((a, b) => {
      const fa = rooms[a]?.features || [];
      const fb = rooms[b]?.features || [];
      return getFeatureRank(fa) - getFeatureRank(fb);
    });

  return (
    <div className="max-w-3xl mx-auto p-6">
      <button
        onClick={onBack}
        style={{ marginBottom: "1rem", padding: "0.5rem 1.2rem", background: "#007bff", color: "#fff", border: "none", borderRadius: "6px", fontWeight: 600, fontSize: "1rem", cursor: "pointer" }}
      >
        Back to Selection
      </button>
      <div className="bg-gray-900 p-6 rounded-md shadow-sm">
        <h3 className="font-semibold mb-4 text-gray-200">
          Room Availability for {selectedSlot} on {todayDay}
        </h3>
        <div className="flex flex-col gap-2 w-full">
          {availableRooms.length > 0 ? (
            availableRooms.map((room) => {
              const features = rooms[room]?.features || [];
              const isSelected = selectedRoom === room;
              return (
                <div key={room} className="relative flex items-center group" style={{ minHeight: 48 }}>
                  <div
                    className={`flex items-center justify-between bg-gray-800 rounded-lg px-4 py-2 mb-1 cursor-pointer transition-all duration-300 w-full ${isSelected ? 'ring-2 ring-blue-400 shadow-lg' : ''}`}
                    style={{
                      maxWidth: isSelected ? 'calc(100% - 140px)' : '100%',
                      minWidth: 220,
                      zIndex: 1,
                      transition: 'max-width 0.3s cubic-bezier(0.4,0,0.2,1)'
                    }}
                    onClick={() => {
                      if (isSelected) {
                        setSelectedRoom(null);
                        setShowBookButton(null);
                      } else {
                        setSelectedRoom(room);
                        setTimeout(() => setShowBookButton(room), 250);
                      }
                    }}
                  >
                    <span className="text-gray-200 font-medium" style={{ minWidth: 120 }}>{room}</span>
                    <div className="flex flex-wrap gap-2 justify-end flex-1">
                      {features.length > 0 ? (
                        features.sort().map((feature) => (
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
                  {isSelected && showBookButton === room && (
                    <div
                      className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center"
                      style={{
                        marginLeft: 12,
                        zIndex: 2,
                        opacity: isSelected && showBookButton === room ? 1 : 0,
                        transition: 'opacity 0.4s cubic-bezier(0.4,0,0.2,1)',
                      }}
                      onClick={e => e.stopPropagation()}
                    >
                      <button
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1 rounded font-semibold shadow transition-all duration-300"
                        onClick={async () => {
                          const API_BASE = "http://localhost:4000";
                          // Always use today's date for booking
                          const res = await fetch(`${API_BASE}/book-room`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ date: dateStr, slot: selectedSlot, roomId: room })
                          });
                          if (res.ok) {
                            alert(`Room ${room} booked!`);
                            // Refetch availability and room features after booking
                            const roomsRes = await fetch(`${API_BASE}/available-rooms/all`);
                            const roomsData = await roomsRes.json();
                            setAvail(roomsData);
                            const featuresRes = await fetch(`${API_BASE}/available-rooms?day=${todayDay}&slot=${selectedSlot}`);
                            const featuresData = await featuresRes.json();
                            const roomMap = {};
                            featuresData.forEach(r => { roomMap[r.roomId] = { features: r.features }; });
                            setRooms(roomMap);
                          } else {
                            const err = await res.json();
                            alert(`Booking failed: ${err.error || 'Unknown error'}`);
                          }
                        }}
                      >
                        Book Room
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="flex items-center justify-between w-full bg-gray-800 rounded-lg px-4 py-2">
              <span className="text-gray-500 italic text-sm select-none">All rooms occupied</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default SlotView;
