// db-rooms.cjs
// Utility for rooms, slots, days, availability, bookings using PostgreSQL
const db = require('./db.cjs');

async function getRooms() {
  const result = await db.query('SELECT id, name, building, floor, capacity, has_ac, has_projector FROM rooms');
  return result.rows;
}

async function getDays() {
  const result = await db.query('SELECT day FROM days');
  return result.rows.map(r => r.day);
}

async function getSlots() {
  const result = await db.query('SELECT slot FROM slots');
  return result.rows.map(r => r.slot);
}

async function getAvailability(day, slot) {
  const result = await db.query('SELECT room_id FROM availability WHERE day = $1 AND slot = $2', [day, slot]);
  const availableRooms = result.rows.map(r => r.room_id);
  console.log(`[db-rooms] getAvailability: day=${day}, slot=${slot}, availableRooms=`, availableRooms);
  return availableRooms;
}

async function getAllAvailability() {
  const days = await getDays();
  const slots = await getSlots();
  const result = {};
  for (const day of days) {
    result[day] = {};
    for (const slot of slots) {
      result[day][slot] = await getAvailability(day, slot);
    }
  }
  return result;
}

async function getBookings() {
  const result = await db.query('SELECT * FROM bookings ORDER BY id');
  return result.rows;
}

async function addBooking({ date, slot, roomId, createdBy, purpose, isSemester = false }) {
  // Construct start/end time
  const start = new Date(date);
  start.setHours(parseInt(slot), 0, 0, 0);
  const end = new Date(date);
  end.setHours(parseInt(slot) + 1, 0, 0, 0);

  const result = await db.query(
    'INSERT INTO bookings (room_id, created_by, start_time, end_time, purpose, is_semester_booking) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
    [roomId, createdBy, start.toISOString(), end.toISOString(), purpose, isSemester]
  );
  return result.rows[0];
}

function getDayFromDate(dateStr) {
  const jsDate = new Date(dateStr);
  const weekdayMap = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  return weekdayMap[jsDate.getDay()];
}

module.exports = {
  getRooms,
  getDays,
  getSlots,
  getAvailability,
  getAllAvailability,
  getBookings,
  addBooking,
  getDayFromDate
};
