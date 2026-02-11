// db-rooms.cjs
// Utility for rooms, slots, days, availability, bookings using PostgreSQL
const db = require('./db.cjs');

async function getRooms() {
  const result = await db.query('SELECT room_id, features FROM rooms');
  const rooms = {};
  for (const row of result.rows) {
    rooms[row.room_id] = { features: row.features };
  }
  return rooms;
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

async function addBooking({ date, slot, roomId }) {
  // Insert booking
  const result = await db.query(
    'INSERT INTO bookings (date, slot, room_id) VALUES ($1, $2, $3) RETURNING *',
    [date, slot, roomId]
  );
  // Remove room from availability
  const day = getDayFromDate(date);
  const delRes = await db.query('DELETE FROM availability WHERE day = $1 AND slot = $2 AND room_id = $3 RETURNING room_id', [day, slot, roomId]);
  console.log(`[db-rooms] addBooking: Removed from availability:`, delRes.rows);
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
