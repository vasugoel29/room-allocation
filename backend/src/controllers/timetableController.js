import * as db from '../db.js';
import { getDayOfWeek, getHourFromTime } from '../utils/timetableLogic.js';
import { roomRepository } from '../repositories/roomRepository.js';
import cache from '../utils/cache.js';
import bcrypt from 'bcrypt';

function parseSlotTime(timeStr) {
  if (!timeStr) return { start: '09:00:00', end: '10:00:00' };
  const parts = timeStr.split('-');
  if (parts.length < 2) return { start: '09:00:00', end: '10:00:00' };
  
  const parsePart = (p) => {
    const match = p.trim().match(/(\d{1,2}):(\d{2})/);
    if (!match) return '09:00:00';
    let hours = parseInt(match[1]);
    const minutes = parseInt(match[2]);
    if (hours >= 1 && hours < 8) hours += 12;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
  };
  
  return {
    start: parsePart(parts[0]),
    end: parsePart(parts[1])
  };
}

function toTitleCase(str) {
  if (!str) return '';
  return str.toLowerCase().replace(/\b\w/g, s => s.toUpperCase());
}

export async function getTimetable(req, res) {
  try {
    const { user } = req;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const semester = user.semester || (user.year ? (user.year * 2) : null);
    
    const results = await db.query(
      `SELECT ts.*, s.code AS subject_code, s.name AS subject_name, r.name AS room_name, u.name AS faculty_name,
              TO_CHAR(ts.start_time, 'HH24:MI') || '-' || TO_CHAR(ts.end_time, 'HH24:MI') AS slot_time
       FROM timetable_slots ts
       LEFT JOIN subjects s ON ts.subject_id = s.id
       LEFT JOIN rooms r ON ts.room_id = r.id
       LEFT JOIN users u ON ts.faculty_id = u.id
       WHERE ts.branch_id = $1 AND ts.semester = $2 AND ts.section::TEXT = $3::TEXT`,
      [
        user.branch_id,
        semester,
        String(user.section)
      ]
    );

    const toTitleCaseDay = (d) => d ? d.charAt(0).toUpperCase() + d.slice(1).toLowerCase() : d;
    const mappedRows = results.rows.map(row => ({
      ...row,
      day_of_week: toTitleCaseDay(row.day_of_week)
    }));

    res.json(mappedRows);
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
      const { day } = req.query;
      
      let query = `
        SELECT ts.*, r.name AS room_name, s.code AS subject_code, s.name AS subject_name,
               TO_CHAR(ts.start_time, 'HH24:MI') || '-' || TO_CHAR(ts.end_time, 'HH24:MI') AS slot_time
        FROM timetable_slots ts
        LEFT JOIN rooms r ON r.id = ts.room_id
        LEFT JOIN subjects s ON ts.subject_id = s.id
        WHERE ts.faculty_id = $1
      `;
      const params = [user.id];
      
      if (day) {
        query += ' AND ts.day_of_week = $2';
        params.push(day.toUpperCase());
      }
  
      const result = await db.query(query, params);
      
      const toTitleCaseDay = (d) => d ? d.charAt(0).toUpperCase() + d.slice(1).toLowerCase() : d;
      const mapped = result.rows.map(row => ({
        ...row,
        day_of_week: toTitleCaseDay(row.day_of_week)
      }));

      const grouped = mapped.reduce((acc, slot) => {
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
        
        const dayName = getDayOfWeek(date).toUpperCase();
        const startHourStr = `${String(hour).padStart(2, '0')}:00:00`;
        const endHourStr = `${String(Number(hour) + 1).padStart(2, '0')}:00:00`;

        // Check if busy in static timetable slots (excluding if date cancelled by overrides)
        const staticRes = await db.query(`
            SELECT ts.id FROM timetable_slots ts
            WHERE ts.faculty_id = $1 AND ts.day_of_week = $2
              AND timerange(ts.start_time, ts.end_time) && timerange($3::time, $4::time)
              AND NOT EXISTS (
                SELECT 1 FROM timetable_slot_overrides o
                WHERE o.timetable_slot_id = ts.id
                  AND o.override_date = $5::DATE
                  AND o.is_cancelled
              )
        `, [id, dayName, startHourStr, endHourStr, date]);

        const isOccupiedStatic = staticRes.rows.length > 0;

        // Check dynamic active bookings involving this faculty (created by or reviewed by)
        const bookingRes = await db.query(`
            SELECT b.id FROM bookings b
            WHERE (
              b.created_by = $1
              OR EXISTS (
                SELECT 1 FROM booking_requests br
                JOIN requests r ON r.id = br.request_id
                WHERE br.resulting_booking_id = b.id AND r.reviewed_by = $1
              )
            )
            AND b.status = 'ACTIVE'
            AND (b.start_time AT TIME ZONE 'Asia/Kolkata')::date = $2::date
            AND EXTRACT(HOUR FROM b.start_time AT TIME ZONE 'Asia/Kolkata') = $3
        `, [id, date, hour]);

        const isOccupiedDynamic = bookingRes.rows.length > 0;
        const isOccupied = isOccupiedStatic || isOccupiedDynamic;

        res.json({
            isOccupied,
            reason: isOccupied ? (isOccupiedDynamic ? 'Dynamic Booking' : 'Static Class') : null,
            details: null
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

export async function overrideFacultySlot(req, res) {
    try {
        res.json({ message: 'Slot updated successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

export async function getFacultyOverrides(req, res) {
    try {
        res.json([]);
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

    const dayName = getDayOfWeek(date).toUpperCase();
    const hourStr = `${String(hour).padStart(2, '0')}:00:00`;

    // Find the slot
    const slotRes = await db.query(`
      SELECT ts.id, ts.faculty_id
      FROM timetable_slots ts
      JOIN rooms r ON ts.room_id = r.id
      JOIN users u ON ts.faculty_id = u.id
      WHERE UPPER(r.name) = UPPER($1)
        AND ts.day_of_week = $2
        AND timerange(ts.start_time, ts.end_time) @> $3::time
    `, [room_name, dayName, hourStr]);

    const slot = slotRes.rows[0];
    if (!slot) {
      return res.status(404).json({ error: 'Matching timetable slot not found for this room/time.' });
    }

    const result = await db.query(`
      INSERT INTO requests (request_type, requested_by, status, reason, reviewed_by)
      VALUES ('CANCELLATION', $1, 'PENDING', $2, $3)
      RETURNING id
    `, [req.user.id, `Cancellation for ${room_name} on ${date} at ${hour}:00`, slot.faculty_id]);
    const requestId = result.rows[0].id;

    const detailResult = await db.query(`
      INSERT INTO cancellation_requests (request_id, faculty_id, timetable_slot_id, class_date, resulting_booking_id)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [requestId, slot.faculty_id, slot.id, date, booking_id || null]);

    res.status(201).json({ message: 'Cancellation request sent to the faculty member for approval.', request: detailResult.rows[0] });
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
      SELECT 
        r.id, 
        cr.class_date, 
        cr.resulting_booking_id,
        TO_CHAR(ts.start_time, 'HH24:MI') || '-' || TO_CHAR(ts.end_time, 'HH24:MI') AS slot_time,
        ro.name AS room_name, 
        s.name AS subject_name,
        u.name AS user_name
      FROM requests r
      JOIN cancellation_requests cr ON r.id = cr.request_id
      JOIN timetable_slots ts ON cr.timetable_slot_id = ts.id
      LEFT JOIN rooms ro ON ts.room_id = ro.id
      LEFT JOIN subjects s ON ts.subject_id = s.id
      JOIN users u ON r.requested_by = u.id
      WHERE r.reviewed_by = $1 AND r.status = 'PENDING'
      ORDER BY r.created_at DESC
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
        SELECT r.*, cr.timetable_slot_id, cr.class_date, cr.resulting_booking_id
        FROM requests r
        JOIN cancellation_requests cr ON r.id = cr.request_id
        WHERE r.id = $1 AND r.reviewed_by = $2 AND r.status = 'PENDING'
        FOR UPDATE
      `, [req.params.id, req.user.id]);
      const request = requestResult.rows[0];
      if (!request) return null;

      if (approved) {
        // Insert override
        await client.query(`
          INSERT INTO timetable_slot_overrides (timetable_slot_id, override_date, is_cancelled)
          VALUES ($1, $2, TRUE)
          ON CONFLICT (timetable_slot_id, override_date) DO UPDATE SET is_cancelled = TRUE
        `, [request.timetable_slot_id, request.class_date]);

        if (request.resulting_booking_id) {
          await client.query(`
            UPDATE bookings 
            SET status = 'CANCELLED', cancelled_at = NOW(), updated_at = NOW() 
            WHERE id = $1
          `, [request.resulting_booking_id]);
        }
      }

      await client.query(`
        UPDATE requests
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

      const toTitleCaseDay = (d) => d ? d.charAt(0).toUpperCase() + d.slice(1).toLowerCase() : d;

      if (type === 'FACULTY') {
        const facultyName = name.toUpperCase();
        
        // Static slots joining users
        const staticRes = await db.query(`
          SELECT ts.*, s.name as subject_name, r.name as room_name, u.name as faculty_name,
                 TO_CHAR(ts.start_time, 'HH24:MI') || '-' || TO_CHAR(ts.end_time, 'HH24:MI') AS slot_time
          FROM timetable_slots ts
          JOIN users u ON ts.faculty_id = u.id
          LEFT JOIN subjects s ON ts.subject_id = s.id
          LEFT JOIN rooms r ON ts.room_id = r.id
          WHERE UPPER(u.name) = $1
        `, [facultyName]);

        const mappedStatic = staticRes.rows.map(row => ({
          ...row,
          day_of_week: toTitleCaseDay(row.day_of_week)
        }));

        // Dynamic bookings where faculty is creator or reviewer
        const bookingRes = await db.query(`
          SELECT b.*, r.name as room_name, u.name as creator_name
          FROM bookings b
          JOIN rooms r ON b.room_id = r.id
          JOIN users u ON b.created_by = u.id
          WHERE (
            UPPER(u.name) = $1 
            OR EXISTS (
              SELECT 1 FROM booking_requests br
              JOIN requests req ON req.id = br.request_id
              JOIN users f ON req.reviewed_by = f.id
              WHERE br.resulting_booking_id = b.id AND UPPER(f.name) = $1
            )
          )
          AND b.status = 'ACTIVE'
        `, [facultyName]);

        return res.json({
          type: 'FACULTY',
          name: facultyName,
          staticSlots: mappedStatic,
          dynamicBookings: bookingRes.rows
        });
      } 
      
      if (type === 'SECTION') {
        const deptUpper = department.toUpperCase();
        
        // Static Slots joining branches
        const staticRes = await db.query(`
          SELECT ts.*, s.name as subject_name, r.name as room_name, u.name as faculty_name,
                 TO_CHAR(ts.start_time, 'HH24:MI') || '-' || TO_CHAR(ts.end_time, 'HH24:MI') AS slot_time
          FROM timetable_slots ts
          JOIN branches b ON ts.branch_id = b.id
          LEFT JOIN subjects s ON ts.subject_id = s.id
          LEFT JOIN rooms r ON ts.room_id = r.id
          LEFT JOIN users u ON ts.faculty_id = u.id
          WHERE (UPPER(b.name) = $1 OR UPPER(b.short_code) = $1)
            AND ts.semester = $2
            AND ts.section::text = $3::text
        `, [
          deptUpper, 
          semester, 
          section
        ]);

        const mappedStatic = staticRes.rows.map(row => ({
          ...row,
          day_of_week: toTitleCaseDay(row.day_of_week)
        }));

        // Dynamic Bookings for this section
        const bookingRes = await db.query(`
          SELECT b.*, r.name as room_name, u.name as creator_name, f.name as faculty_name
          FROM bookings b
          JOIN rooms r ON b.room_id = r.id
          JOIN users u ON b.created_by = u.id
          JOIN branches br ON u.branch_id = br.id
          LEFT JOIN booking_requests req_br ON req_br.resulting_booking_id = b.id
          LEFT JOIN requests req ON req_br.request_id = req.id
          LEFT JOIN users f ON req.reviewed_by = f.id
          WHERE (UPPER(br.name) = $1 OR UPPER(br.short_code) = $1)
            AND u.semester = $2
            AND u.section::text = $3::text
            AND b.status = 'ACTIVE'
        `, [
          deptUpper,
          semester, 
          section
        ]);
 
        return res.json({
          type: 'SECTION',
          department: deptUpper,
          semester,
          section,
          staticSlots: mappedStatic,
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
      SELECT DISTINCT name FROM users
      WHERE role = 'FACULTY' AND name ILIKE $1
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

    if (faculty_name) { conditions.push(`u.name ILIKE $${idx++}`); values.push(`%${faculty_name}%`); }
    if (day_of_week)  { conditions.push(`ts.day_of_week = $${idx++}`);     values.push(day_of_week.toUpperCase()); }
    if (semester)     { conditions.push(`ts.semester = $${idx++}`);         values.push(semester); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const [dataResult, countResult] = await Promise.all([
      db.query(`
        SELECT ts.id, u.name AS faculty_name, ts.semester, ts.day_of_week,
               TO_CHAR(ts.start_time, 'HH24:MI') || '-' || TO_CHAR(ts.end_time, 'HH24:MI') AS slot_time,
               s.name AS content, TRUE AS is_occupied,
               ts.room_id, r.name AS room_name, ts.created_at
        FROM timetable_slots ts
        LEFT JOIN users u ON ts.faculty_id = u.id
        LEFT JOIN subjects s ON ts.subject_id = s.id
        LEFT JOIN rooms r ON ts.room_id = r.id
        ${where}
        ORDER BY u.name, ts.day_of_week, ts.start_time
        LIMIT $${idx} OFFSET $${idx + 1}
      `, [...values, parseInt(limit), offset]),
      db.query(`
        SELECT COUNT(*) FROM timetable_slots ts
        LEFT JOIN users u ON ts.faculty_id = u.id
        ${where}
      `, values)
    ]);

    const toTitleCaseDay = (d) => d ? d.charAt(0).toUpperCase() + d.slice(1).toLowerCase() : d;
    const mapped = dataResult.rows.map(r => ({
      ...r,
      day_of_week: toTitleCaseDay(r.day_of_week)
    }));

    res.json({
      data: mapped,
      meta: { total: parseInt(countResult.rows[0].count), page: parseInt(page), limit: parseInt(limit) }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function createSlot(req, res) {
  try {
    const { faculty_name, semester, day_of_week, slot_time, content, room_id } = req.body;
    if (!faculty_name || !day_of_week || !slot_time) {
      return res.status(400).json({ error: 'faculty_name, day_of_week, and slot_time are required' });
    }

    const parsedTime = parseSlotTime(slot_time);
    
    // Find/Create Faculty User
    const fName = toTitleCase(faculty_name.trim());
    let facRes = await db.query("SELECT id FROM users WHERE role = 'FACULTY' AND UPPER(name) = UPPER($1)", [fName]);
    let facultyId;
    if (facRes.rowCount === 0) {
      const fEmail = `${fName.toLowerCase().replace(/[^a-z]/g, '')}@nsut.ac.in`;
      const dummyPasswordHash = await bcrypt.hash('facultypass123', 4);
      facRes = await db.query(
        `INSERT INTO users (name, email, password_hash, role, is_approved)
         VALUES ($1, $2, $3, 'FACULTY', true) RETURNING id`,
        [fName, fEmail, dummyPasswordHash]
      );
    }
    facultyId = facRes.rows[0].id;

    // Find/Create Subject
    let subjectId = null;
    if (content) {
      const sName = content.trim();
      const sCode = sName.substring(0, 5).toUpperCase() + Math.floor(Math.random() * 100);
      let subRes = await db.query('SELECT id FROM subjects WHERE name = $1', [sName]);
      if (subRes.rowCount === 0) {
        subRes = await db.query('INSERT INTO subjects (code, name) VALUES ($1, $2) RETURNING id', [sCode, sName]);
      }
      subjectId = subRes.rows[0].id;
    }

    const result = await db.query(`
      INSERT INTO timetable_slots (faculty_id, semester, day_of_week, start_time, end_time, subject_id, room_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, semester, day_of_week, start_time, end_time, room_id
    `, [facultyId, semester ? parseInt(semester) : 1, day_of_week.toUpperCase(), parsedTime.start, parsedTime.end, subjectId, room_id || null]);
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function updateSlot(req, res) {
  try {
    const { id } = req.params;
    const { faculty_name, semester, day_of_week, slot_time, content, room_id } = req.body;

    const parsedTime = slot_time ? parseSlotTime(slot_time) : null;
    
    let facultyId = undefined;
    if (faculty_name) {
      const fName = toTitleCase(faculty_name.trim());
      let facRes = await db.query("SELECT id FROM users WHERE role = 'FACULTY' AND UPPER(name) = UPPER($1)", [fName]);
      if (facRes.rowCount === 0) {
        const fEmail = `${fName.toLowerCase().replace(/[^a-z]/g, '')}@nsut.ac.in`;
        const dummyPasswordHash = await bcrypt.hash('facultypass123', 4);
        facRes = await db.query(
          `INSERT INTO users (name, email, password_hash, role, is_approved)
           VALUES ($1, $2, $3, 'FACULTY', true) RETURNING id`,
          [fName, fEmail, dummyPasswordHash]
        );
      }
      facultyId = facRes.rows[0].id;
    }

    let subjectId = undefined;
    if (content) {
      const sName = content.trim();
      const sCode = sName.substring(0, 5).toUpperCase() + Math.floor(Math.random() * 100);
      let subRes = await db.query('SELECT id FROM subjects WHERE name = $1', [sName]);
      if (subRes.rowCount === 0) {
        subRes = await db.query('INSERT INTO subjects (code, name) VALUES ($1, $2) RETURNING id', [sCode, sName]);
      }
      subjectId = subRes.rows[0].id;
    }

    const result = await db.query(`
      UPDATE timetable_slots
      SET faculty_id  = COALESCE($1, faculty_id),
          semester    = COALESCE($2, semester),
          day_of_week = COALESCE($3, day_of_week),
          start_time  = COALESCE($4, start_time),
          end_time    = COALESCE($5, end_time),
          subject_id  = COALESCE($6, subject_id),
          room_id     = $7
      WHERE id = $8
      RETURNING id, faculty_id, semester, day_of_week, start_time, end_time, subject_id, room_id
    `, [
      facultyId !== undefined ? facultyId : null,
      semester ? parseInt(semester) : null,
      day_of_week ? day_of_week.toUpperCase() : null,
      parsedTime ? parsedTime.start : null,
      parsedTime ? parsedTime.end : null,
      subjectId !== undefined ? subjectId : null,
      room_id ?? null,
      id
    ]);

    if (result.rows.length === 0) return res.status(404).json({ error: 'Slot not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function deleteSlot(req, res) {
  try {
    const { id } = req.params;
    const result = await db.query('DELETE FROM timetable_slots WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Slot not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function inspectDatabase(req, res) {
  try {
    const slots = await db.query(`
      SELECT ts.*, u.name AS faculty_name FROM timetable_slots ts
      JOIN users u ON ts.faculty_id = u.id
      WHERE u.name ILIKE '%Deepika%'
    `);
    res.json({ slots: slots.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
