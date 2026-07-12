import * as db from '../db.js';
import { getDayOfWeek, getHourFromTime } from '../utils/timetableLogic.js';
import { roomRepository } from '../repositories/roomRepository.js';
import cache from '../utils/cache.js';

function toTitleCase(str) {
  if (!str) return '';
  return str.toLowerCase().replace(/\b\w/g, s => s.toUpperCase());
}

export async function getTimetable(req, res) {
  try {
    const { user } = req;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const dept = user.branch || user.department_name;
    const semester = user.semester || (user.year ? (user.year * 2) : null); // Fallback to year * 2 (even sem) or similar if needed, but usually semester is best.
    
    // Mapping from short codes to full names in timetable_slots
    const deptMapping = {
      'IT': 'INFORMATION TECHNOLOGY',
      'CS': 'COMPUTER SCIENCE AND ENGINEERING',
      'ICE': 'INSTRUMENTATION AND CONTROL ENGINEERING',
      'ECE': 'ELECTRONICS AND COMMUNICATION ENGINEERING',
      'ME': 'MECHANICAL ENGINEERING',
      'MPAE': 'MANUFACTURING PROCESS AND AUTOMATION ENGINEERING',
      'EE': 'ELECTRICAL ENGINEERING',
      'BT': 'BIOTECHNOLOGY'
    };

    const mappedDept = deptMapping[dept?.toUpperCase()] || dept;

    const results = await db.query(
      'SELECT * FROM timetable_slots WHERE (UPPER(department) = $1 OR UPPER(department) = $2) AND semester::TEXT = $3::TEXT AND section::TEXT = $4::TEXT',
      [
        dept?.toUpperCase(),
        mappedDept?.toUpperCase(),
        semester,
        user.section
      ]
    );

    res.json(results.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function uploadTimetable(req, res) {
  try {
    const { slots } = req.body;
    if (!Array.isArray(slots)) return res.status(400).json({ error: 'Invalid data format' });

    await db.runInTransaction(async (client) => {
      const chunkSize = 200;
      for (let i = 0; i < slots.length; i += chunkSize) {
        const chunk = slots.slice(i, i + chunkSize);
        const values = [];
        const placeholders = [];
        let index = 1;
        for (const slot of chunk) {
          placeholders.push(`($${index}, $${index+1}, $${index+2}, $${index+3}, $${index+4}, $${index+5}, $${index+6}, $${index+7}, $${index+8})`);
          values.push(
            slot.department,
            slot.semester,
            slot.section,
            slot.day_of_week,
            slot.slot_time,
            slot.subject_name,
            slot.room_name,
            slot.subject_code,
            slot.faculty_name
          );
          index += 9;
        }
        const bulkQuery = `
          INSERT INTO timetable_slots (department, semester, section, day_of_week, slot_time, subject_name, room_name, subject_code, faculty_name)
          VALUES ${placeholders.join(', ')}
        `;
        await client.query(bulkQuery, values);
      }
    });

    res.json({ message: 'Timetable uploaded successfully' });
  } catch (err) {
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

export async function createCancellationRequest(req, res) {
  try {
    const { room_name, subject_name, date, hour, faculty_name, booking_id } = req.body;
    if (!room_name || !date || hour === undefined || !faculty_name) {
      return res.status(400).json({ error: 'Room, date, hour, and faculty are required.' });
    }

    const facultyResult = await db.query(
      `SELECT id FROM users WHERE role = 'FACULTY' AND UPPER(TRIM(name)) = UPPER(TRIM($1)) LIMIT 1`,
      [faculty_name]
    );
    if (!facultyResult.rows[0]) {
      return res.status(404).json({ error: 'The class faculty could not be found, so approval cannot be requested.' });
    }

    const result = await db.query(`
      INSERT INTO class_cancellation_requests
        (requested_by, faculty_id, room_name, subject_name, class_date, hour, booking_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [req.user.id, facultyResult.rows[0].id, room_name, subject_name || null, date, Number(hour), booking_id || null]);

    res.status(201).json({ message: 'Cancellation request sent to the faculty member for approval.', request: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'A cancellation request for this class is already awaiting faculty approval.' });
    }
    res.status(500).json({ error: err.message || 'Failed to create cancellation request.' });
  }
}

export async function getPendingCancellationRequests(req, res) {
  try {
    const result = await db.query(`
      SELECT c.*, u.name AS user_name
      FROM class_cancellation_requests c
      JOIN users u ON u.id = c.requested_by
      WHERE c.faculty_id = $1 AND c.status = 'PENDING'
      ORDER BY c.created_at DESC
    `, [req.user.id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to load cancellation requests.' });
  }
}

export async function reviewCancellationRequest(req, res) {
  const approved = req.params.action === 'approve';
  if (!approved && req.params.action !== 'reject') return res.status(400).json({ error: 'Invalid action.' });

  try {
    const result = await db.runInTransaction(async (client) => {
      const requestResult = await client.query(`
        SELECT * FROM class_cancellation_requests
        WHERE id = $1 AND faculty_id = $2 AND status = 'PENDING'
        FOR UPDATE
      `, [req.params.id, req.user.id]);
      const request = requestResult.rows[0];
      if (!request) return null;

      if (approved) {
        if (request.booking_id) {
          await client.query(`UPDATE bookings SET status = 'CANCELLED', cancelled_at = NOW(), updated_at = NOW() WHERE id = $1`, [request.booking_id]);
        } else {
          const room = await roomRepository.findByName(request.room_name, client);
          if (!room) throw new Error('Room no longer exists.');
          await roomRepository.upsertAvailability(room.id, request.class_date, request.hour, true, req.user.id, client);
        }
      }

      await client.query(`
        UPDATE class_cancellation_requests
        SET status = $1, reviewed_at = NOW()
        WHERE id = $2
      `, [approved ? 'APPROVED' : 'REJECTED', request.id]);
      return request;
    });

    if (!result) return res.status(404).json({ error: 'Cancellation request was not found or has already been reviewed.' });
    cache.delete('room_availability_all');
    res.json({ message: approved ? 'Cancellation approved; the room is now available.' : 'Cancellation request rejected.' });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to review cancellation request.' });
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
          WHERE (UPPER(u.branch) = $1 OR UPPER(u.branch) = $2 OR UPPER(u.department_name) = $1 OR UPPER(u.department_name) = $2)
          AND u.year = CEIL($3::float / 2)
          AND u.section::TEXT = $4::TEXT
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

export async function autocompleteFaculty(req, res) {
  try {
    const { query } = req.query;
    if (!query) {
      return res.json([]);
    }

    const likeQuery = `%${query}%`;
    const result = await db.query(`
      SELECT MAX(name) AS name FROM (
        SELECT name FROM users WHERE role = 'FACULTY' AND name ILIKE $1
        UNION
        SELECT DISTINCT faculty_name AS name FROM timetable_slots WHERE faculty_name ILIKE $1
      ) AS combined
      WHERE name IS NOT NULL AND name != ''
      GROUP BY UPPER(name)
      ORDER BY name
      LIMIT 10
    `, [likeQuery]);

    res.json(result.rows.map(r => toTitleCase(r.name)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ─── Admin CRUD for timetable slots ────────────────────────────────────────

export async function listSlots(req, res) {
  try {
    const { faculty_name, day_of_week, semester, page = 1, limit = 50 } = req.query;
    const conditions = [];
    const values = [];
    let idx = 1;

    if (faculty_name) { conditions.push(`fts.faculty_name ILIKE $${idx++}`); values.push(`%${faculty_name}%`); }
    if (day_of_week)  { conditions.push(`fts.day_of_week ILIKE $${idx++}`); values.push(day_of_week); }
    if (semester)     { conditions.push(`fts.semester = $${idx++}`);         values.push(semester); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const [dataResult, countResult] = await Promise.all([
      db.query(`
        SELECT fts.id, fts.faculty_name, fts.semester, fts.day_of_week,
               fts.slot_time, fts.content, fts.is_occupied,
               fts.room_id, r.name AS room_name, fts.created_at
        FROM faculty_timetable_slots fts
        LEFT JOIN rooms r ON r.id = fts.room_id
        ${where}
        ORDER BY fts.faculty_name, fts.day_of_week, fts.slot_time
        LIMIT $${idx} OFFSET $${idx + 1}
      `, [...values, parseInt(limit), offset]),
      db.query(`SELECT COUNT(*) FROM faculty_timetable_slots fts ${where}`, values)
    ]);

    res.json({
      data: dataResult.rows,
      meta: { total: parseInt(countResult.rows[0].count), page: parseInt(page), limit: parseInt(limit) }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function createSlot(req, res) {
  try {
    const { faculty_name, semester, day_of_week, slot_time, content, is_occupied, room_id } = req.body;
    if (!faculty_name || !day_of_week || !slot_time) {
      return res.status(400).json({ error: 'faculty_name, day_of_week, and slot_time are required' });
    }
    const result = await db.query(`
      INSERT INTO faculty_timetable_slots (faculty_name, semester, day_of_week, slot_time, content, is_occupied, room_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, faculty_name, semester, day_of_week, slot_time, content, is_occupied, room_id, created_at
    `, [faculty_name, semester || '', day_of_week, slot_time, content || '', is_occupied ?? false, room_id ?? null]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function updateSlot(req, res) {
  try {
    const { id } = req.params;
    const { faculty_name, semester, day_of_week, slot_time, content, is_occupied, room_id } = req.body;

    const result = await db.query(`
      UPDATE faculty_timetable_slots
      SET faculty_name = COALESCE($1, faculty_name),
          semester     = COALESCE($2, semester),
          day_of_week  = COALESCE($3, day_of_week),
          slot_time    = COALESCE($4, slot_time),
          content      = COALESCE($5, content),
          is_occupied  = COALESCE($6, is_occupied),
          room_id      = $7
      WHERE id = $8
      RETURNING id, faculty_name, semester, day_of_week, slot_time, content, is_occupied, room_id
    `, [faculty_name, semester, day_of_week, slot_time, content, is_occupied, room_id ?? null, id]);

    if (result.rows.length === 0) return res.status(404).json({ error: 'Slot not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function deleteSlot(req, res) {
  try {
    const { id } = req.params;
    const result = await db.query('DELETE FROM faculty_timetable_slots WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Slot not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
