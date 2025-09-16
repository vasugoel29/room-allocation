

import db from "../db.json";

const slots = db.slots;
const days = db.days;

function getFeatureColor(feature) {
  // Simple color assignment for features
  if (feature === "AC") return "#87CEFA";
  if (feature === "Projector") return "#FFD700";
  if (feature === "AC+Projector") return "#90EE90";
  return "#E6E6FA";
}

function SlotView({ day, availability, onBack }) {
  const { day: selectedDay, slot: selectedSlot, ac, projector } = availability || {};
  const rooms = db.rooms;
  const avail = db.availability;


  // Feature ranking: AC+Projector > AC > Projector > None
  function getFeatureRank(features) {
    if (features.includes("AC") && features.includes("Projector")) return 1;
    if (features.includes("AC")) return 2;
    if (features.includes("Projector")) return 3;
    return 4;
  }

  const availableRooms = (avail[selectedDay]?.[selectedSlot] || [])
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
          Room Availability for {selectedSlot} on {selectedDay}
        </h3>
        <div className="flex flex-col gap-2 w-full">
          {availableRooms.length > 0 ? (
            availableRooms.map((room) => {
              const features = rooms[room]?.features || [];
              return (
                <div key={room} className="flex items-center justify-between w-full bg-gray-800 rounded-lg px-4 py-2">
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
