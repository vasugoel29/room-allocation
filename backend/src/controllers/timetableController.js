import * as db from '../db.js';
import { getDayOfWeek, getHourFromTime } from '../utils/timetableLogic.js';

export async function getTimetable(req, res) {
  try {
    const { user } = req;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const results = await db.query('SELECT * FROM timetable_slots WHERE (UPPER(department) = $1 OR UPPER(department) = $2) AND semester::TEXT = $3::TEXT AND section::TEXT = $4::TEXT', [
      user.branch || user.department_name,
      (user.branch || user.department_name) === 'IT' ? 'INFORMATION TECHNOLOGY' : ((user.branch || user.department_name) === 'CS' ? 'COMPUTER SCIENCE AND ENGINEERING' : (user.branch || user.department_name)),
      user.semester,
      user.section
    ]);

    res.json(results.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function uploadTimetable(req, res) {
  try {
    const { slots } = req.body;
    if (!Array.isArray(slots)) return res.status(400).json({ error: 'Invalid data format' });

    await db.query('BEGIN');
    
    // Optional: Clear existing data or handle updates
    // await db.query('DELETE FROM timetable_slots');

    const query = `
      INSERT INTO timetable_slots (department, semester, section, day_of_week, slot_time, subject_name, room_name, subject_code, faculty_name)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `;

    for (const slot of slots) {
      await db.query(query, [
        slot.department,
        slot.semester,
        slot.section,
        slot.day_of_week,
        slot.slot_time,
        slot.subject_name,
        slot.room_name,
        slot.subject_code,
        slot.faculty_name
      ]);
    }

    await db.query('COMMIT');
    res.json({ message: 'Timetable uploaded successfully' });
  } catch (err) {
    await db.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  }
}

export async function getFacultyTimetable(req, res) {
    try {
      const { user } = req;
      const { day } = req.query; // Optional: Mon, Tue, etc.
      
      let query = 'SELECT * FROM timetable_slots WHERE UPPER(faculty_name) = $1';
      const params = [user.name.toUpperCase()];
      
      if (day) {
        query += ' AND day_of_week = $2';
        params.push(day);
      }
  
      const result = await db.query(query, params);
      
      // Group by day for easier frontend consumption
      const grouped = result.rows.reduce((acc, slot) => {
        const d = slot.day_of_week;
        if (!acc[d]) acc[d] = [];
        acc[d].push(slot);
        return acc;
      }, {});
  
      res.json(grouped);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
}

export async function checkFacultyAvailability(req, res) {
    try {
        const { id } = req.params; // Faculty ID
        const { date, hour } = req.query; // Date (YYYY-MM-DD), Hour (0-23)

        const faculty = await db.query('SELECT name FROM users WHERE id = $1 AND role = $2', [id, 'FACULTY']);
        if (faculty.rows.length === 0) return res.status(404).json({ error: 'Faculty not found' });
        
        const facultyName = faculty.rows[0].name.toUpperCase();
        const dayName = getDayOfWeek(date);

        // 1. Check Static Schedule
        const staticRes = await db.query(`
            SELECT * FROM timetable_slots 
            WHERE UPPER(faculty_name) = $1 AND day_of_week = $2
        `, [facultyName, dayName]);

        const isOccupiedStatic = staticRes.rows.some(s => getHourFromTime(s.slot_time) === parseInt(hour));

        // 2. Check Faculty Overrides
        const overrideRes = await db.query(`
            SELECT * FROM faculty_overrides
            WHERE faculty_id = $1 AND date = $2 AND hour = $3
        `, [id, date, hour]);

        const isCancelled = overrideRes.rows.some(o => o.is_cancelled);

        // 3. Check Dynamic Bookings (Active)
        const bookingRes = await db.query(`
            SELECT * FROM bookings 
            WHERE faculty_id = $1 AND start_time::date = $2 AND EXTRACT(HOUR FROM start_time) = $3 AND status = 'ACTIVE'
        `, [id, date, hour]);

        const isOccupiedDynamic = bookingRes.rows.length > 0;

        // Final Verdict: Occupied if (Static AND NOT Cancelled) OR (Dynamic)
        const isOccupied = (isOccupiedStatic && !isCancelled) || isOccupiedDynamic;

        res.json({
            isOccupied,
            reason: isOccupied ? (isOccupiedDynamic ? 'Dynamic Booking' : 'Static Class') : null,
            details: isOccupied ? (isOccupiedDynamic ? bookingRes.rows[0] : staticRes.rows.find(s => getHourFromTime(s.slot_time) === parseInt(hour))) : null
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

export async function overrideFacultySlot(req, res) {
    try {
        const { date, hour, is_cancelled, reason } = req.body;
        const faculty_id = req.user.id;

        await db.query(`
            INSERT INTO faculty_overrides (faculty_id, date, hour, is_cancelled, reason)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (faculty_id, date, hour) 
            DO UPDATE SET is_cancelled = EXCLUDED.is_cancelled, reason = EXCLUDED.reason
        `, [faculty_id, date, hour, is_cancelled, reason]);

        res.json({ message: 'Slot updated successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

export async function getFacultyOverrides(req, res) {
    try {
        const faculty_id = req.user.id;
        const result = await db.query('SELECT * FROM faculty_overrides WHERE faculty_id = $1', [faculty_id]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

/**
 * Universal Search for Admins to view ANY faculty or section schedule
 */
export async function searchTimetable(req, res) {
    try {
      const { type, name, department, semester, section } = req.query;

      if (type === 'FACULTY') {
        const facultyName = name.toUpperCase();
        
        // 1. Static Schedule from Timetable Slots
        const staticRes = await db.query(`
          SELECT * FROM timetable_slots
          WHERE UPPER(faculty_name) = $1
        `, [facultyName]);

        // 2. Dynamic Digital Bookings
        const bookingRes = await db.query(`
          SELECT b.*, r.name as room_name, u.name as creator_name
          FROM bookings b
          JOIN rooms r ON b.room_id = r.id
          JOIN users u ON b.created_by = u.id
          LEFT JOIN users f ON b.faculty_id = f.id
          WHERE (UPPER(f.name) = $1 OR UPPER(u.name) = $1)
          AND b.status = 'ACTIVE'
        `, [facultyName]);

        return res.json({
          type: 'FACULTY',
          name: facultyName,
          staticSlots: staticRes.rows,
          dynamicBookings: bookingRes.rows
        });
      } 
      
      if (type === 'SECTION') {
        // Normalize department for search
        const deptUpper = department.toUpperCase();
        
        // 1. Static Timetable Slots
        // USE ::TEXT to ensure comparison with character varying columns
        const staticRes = await db.query(`
          SELECT * FROM timetable_slots
          WHERE (UPPER(department) = $1 OR UPPER(department) = $2)
          AND semester::TEXT = $3::TEXT
          AND section::TEXT = $4::TEXT
        `, [
          deptUpper, 
          department === 'IT' ? 'INFORMATION TECHNOLOGY' : (department === 'CS' ? 'COMPUTER SCIENCE AND ENGINEERING' : deptUpper), 
          semester, 
          section
        ]);

        // 2. Dynamic Bookings for this section
        const bookingRes = await db.query(`
          SELECT b.*, r.name as room_name, u.name as creator_name
          FROM bookings b
          JOIN rooms r ON b.room_id = r.id
          JOIN users u ON b.created_by = u.id
          WHERE (UPPER(b.branch) = $1 OR UPPER(b.branch) = $2)
          AND b.semester::TEXT = $3::TEXT
          AND b.section::TEXT = $4::TEXT
          AND b.status = 'ACTIVE'
        `, [
          deptUpper,
          department === 'IT' ? 'INFORMATION TECHNOLOGY' : (department === 'CS' ? 'COMPUTER SCIENCE AND ENGINEERING' : deptUpper), 
          semester, 
          section
        ]);

        return res.json({
          type: 'SECTION',
          department: deptUpper,
          semester,
          section,
          staticSlots: staticRes.rows,
          dynamicBookings: bookingRes.rows
        });
      }

      res.status(400).json({ error: 'Invalid search type' });
    } catch (err) {
      console.error('Search error:', err);
      res.status(500).json({ error: err.message });
    }
}
