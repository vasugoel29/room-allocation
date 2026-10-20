import { sendServerError } from '../utils/httpErrors.js';
import * as db from '../db.js';
import { getDayOfWeek, getHourFromTime } from '../utils/timetableLogic.js';
import { roomRepository } from '../repositories/roomRepository.js';
import cache from '../utils/cache.js';
import { notify } from '../notifications/notify.js';
import { slotOverlaps } from '../services/bookingRules.js';
import { logActivity } from '../services/loggerService.js';
import { importSectionSlots } from '../services/timetableImport.js';

function toTitleCase(str) {
  if (!str) return '';
  return str.toLowerCase().replace(/\b\w/g, s => s.toUpperCase());
}

export async function getTimetable(req, res) {
  try {
    const { user } = req;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const dept = user.branch || user.department_name;
    // Use semester directly; fall back to year * 2 for legacy tokens without semester
    const semester = user.semester || (user.year ? (user.year * 2) : null);
    
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
    sendServerError(res, err);
  }
}

/** POST /api/timetable/upload { slots: [...] } — see services/timetableImport.js. */
export async function uploadTimetable(req, res) {
  try {
    const { slots } = req.body;
    if (!Array.isArray(slots)) return res.status(400).json({ error: 'Invalid data format' });
    const { inserted, skipped } = await db.runInTransaction((client) => importSectionSlots(client, slots));
    res.json({ message: 'Timetable uploaded successfully', inserted, skipped });
  } catch (err) {
    sendServerError(res, err);
  }
}

export async function getFacultyTimetable(req, res) {
    try {
      const { user } = req;
      const { day } = req.query; // Optional: Mon, Tue, etc.
      
      let query = `
        SELECT fts.*, r.name AS room_name 
        FROM faculty_timetable_slots fts
        LEFT JOIN rooms r ON r.id = fts.room_id
        WHERE UPPER(fts.faculty_name) = $1 AND fts.is_active
      `;
      const params = [user.name.toUpperCase()];
      
      if (day) {
        query += ' AND fts.day_of_week = $2';
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
      sendServerError(res, err);
    }
}

export async function checkFacultyAvailability(req, res) {
    try {
        const { id } = req.params; // Faculty ID
        const { date, hour } = req.query; // Date (YYYY-MM-DD), Hour (0-23)

        // `id` is a faculty-directory id (what the faculty picker returns).
        const faculty = await db.query('SELECT name FROM faculties WHERE id = $1 AND is_active', [id]);
        if (faculty.rows.length === 0) return res.status(404).json({ error: 'Faculty not found' });
        
        const facultyName = faculty.rows[0].name.toUpperCase();
        const dayName = getDayOfWeek(date);

        // 1. Check Static Schedule (Check both student class slots and faculty specific slots)
        const staticRes = await db.query(`
            SELECT slot_time FROM timetable_slots 
            WHERE UPPER(faculty_name) = $1 AND day_of_week = $2
        `, [facultyName, dayName]);

        const facultyStaticRes = await db.query(`
            SELECT slot_time FROM faculty_timetable_slots 
            WHERE is_active AND is_occupied = true AND UPPER(faculty_name) = $1 AND day_of_week = $2
        `, [facultyName, dayName]);

        const combinedSlots = [...staticRes.rows, ...facultyStaticRes.rows];

        const staticSlot = combinedSlots.find((slot) => {
            const [startTime, endTime] = String(slot.slot_time || '').split('-');
            const startHour = getHourFromTime(startTime);
            const endHour = getHourFromTime(endTime || startTime);
            return Number(hour) >= startHour && Number(hour) < endHour;
        });
        const isOccupiedStatic = Boolean(staticSlot);

        // 2. Check Dynamic Bookings (Active)
        const bookingRes = await db.query(`
            SELECT * FROM bookings 
            WHERE faculty_id = $1
              AND (start_time AT TIME ZONE 'Asia/Kolkata')::date = $2::date
              AND EXTRACT(HOUR FROM start_time AT TIME ZONE 'Asia/Kolkata') = $3
              AND status = 'ACTIVE'
        `, [id, date, hour]);

        const isOccupiedDynamic = bookingRes.rows.length > 0;

        // Final Verdict: Occupied if Static OR Dynamic (overrides bypassed)
        const isOccupied = isOccupiedStatic || isOccupiedDynamic;
        res.json({
            isOccupied,
            reason: isOccupied ? (isOccupiedDynamic ? 'Dynamic Booking' : 'Static Class') : null,
            // Do not expose a faculty member's timetable or booking details.
            details: null
        });

    } catch (err) {
        sendServerError(res, err);
    }
}

/** The names a faculty member's classes are filed under: their account name and directory name. */
async function facultyNames(user) {
  const { rows } = await db.query('SELECT name FROM faculties WHERE user_id = $1 AND is_active', [user.id]);
  return [...new Set([user.name, ...rows.map((r) => r.name)].filter(Boolean).map((n) => n.trim().toUpperCase()))];
}

const istToday = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);

/**
 * POST /api/timetable/faculty/override { date, hour, is_cancelled = true }
 * A faculty member cancels (or restores) one of their own timetabled classes for one date. The
 * class's room is released for that date and hour only, so it shows as free and can be booked;
 * timetables drop the class for that day. Refused unless they teach at that time.
 */
export async function overrideFacultySlot(req, res) {
  const { date, hour } = req.body;
  const cancel = req.body.is_cancelled !== false;
  if (date < istToday()) return res.status(400).json({ error: 'Classes in the past cannot be changed.' });
  try {
    const names = await facultyNames(req.user);
    const day = new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
    const { rows: slots } = await db.query(
      `SELECT t.slot_time, t.faculty_name, r.id AS room_id FROM timetable_slots t
         LEFT JOIN rooms r ON r.is_active AND lower(r.name) = lower(t.room_name)
        WHERE UPPER(TRIM(t.faculty_name)) = ANY($1) AND t.day_of_week = $2
       UNION ALL
       SELECT f.slot_time, f.faculty_name, f.room_id FROM faculty_timetable_slots f
        WHERE f.is_active AND f.is_occupied AND UPPER(TRIM(f.faculty_name)) = ANY($1) AND f.day_of_week = $2`,
      [names, day],
    );
    const slot = slots.find((s) => slotOverlaps(s.slot_time, hour * 60, hour * 60 + 60));
    if (!slot) return res.status(404).json({ error: 'You have no class at that time.' });

    const override = await db.runInTransaction(async (client) => {
      const { rows: [o] } = await client.query(
        `INSERT INTO faculty_slot_overrides (faculty_name, date, hour, is_cancelled)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (faculty_name, date, hour) DO UPDATE SET is_cancelled = EXCLUDED.is_cancelled
         RETURNING id, faculty_name, date::text AS date, hour, is_cancelled`,
        [slot.faculty_name, date, hour, cancel],
      );
      // Withdraw any earlier release for this override, then release again if cancelled.
      await client.query(
        `UPDATE room_slot_releases SET is_active = FALSE, deactivated_at = NOW()
          WHERE source_type = 'faculty_override' AND source_id = $1 AND is_active`, [o.id],
      );
      if (cancel && slot.room_id) {
        await client.query(
          `INSERT INTO room_slot_releases (room_id, release_date, start_hour, end_hour, source_type, source_id, created_by)
           VALUES ($1, $2, $3, $4, 'faculty_override', $5, $6)`,
          [slot.room_id, date, hour, hour + 1, o.id, req.user.id],
        );
      }
      await logActivity({
        userId: req.user.id, action: cancel ? 'CANCEL_OWN_CLASS' : 'RESTORE_OWN_CLASS', entityType: 'faculty_override',
        entityId: o.id, details: { date, hour, room_id: slot.room_id ?? null },
      }, client);
      return o;
    });
    cache.delete('room_availability_all');
    cache.deletePattern('admin_status_.*');
    res.json({ message: cancel ? 'Class cancelled for that date; the room is free.' : 'Class restored.', override });
  } catch (err) {
    sendServerError(res, err, 'Failed to update the class.');
  }
}

/** GET /api/timetable/faculty/overrides — this faculty member's cancelled classes (last 30 days on). */
export async function getFacultyOverrides(req, res) {
  try {
    const { rows } = await db.query(
      `SELECT id, faculty_name, date::text AS date, hour, is_cancelled FROM faculty_slot_overrides
        WHERE UPPER(TRIM(faculty_name)) = ANY($1) AND date >= CURRENT_DATE - 30 AND is_cancelled
        ORDER BY date, hour`,
      [await facultyNames(req.user)],
    );
    res.json(rows);
  } catch (err) {
    sendServerError(res, err);
  }
}

/** Template data for a class-cancellation request (IST date and the one-hour slot). */
function classFacts(request, extra) {
  const pad = (h) => String(h).padStart(2, '0');
  // pg parses DATE as local midnight: read the local parts, not toISOString (which can shift a day).
  const d = request.class_date;
  const dateKey = d instanceof Date ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : String(d).slice(0, 10);
  return {
    subject: request.subject_name || 'the class',
    roomName: request.room_name,
    date: dateKey,
    time: `${pad(request.hour)}:00 – ${pad(request.hour + 1)}:00`,
    ...extra,
  };
}

export async function createCancellationRequest(req, res) {
  try {
    const { room_name, subject_name, date, hour, faculty_name, booking_id } = req.body;
    if (!room_name || !date || hour === undefined || !faculty_name) {
      return res.status(400).json({ error: 'Room, date, hour, and faculty are required.' });
    }
    const h = Number(hour);
    const realDate = /^\d{4}-\d{2}-\d{2}$/.test(String(date)) && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === String(date);
    if (!realDate) return res.status(400).json({ error: 'date must be a real YYYY-MM-DD date.' });
    if (!Number.isInteger(h) || h < 0 || h > 23) return res.status(400).json({ error: 'hour must be between 0 and 23.' });
    const room = await roomRepository.findByName(room_name);
    if (!room) return res.status(404).json({ error: `Room ${room_name} not found.` });

    // A linked booking must be the one in this room at this date and hour (BKG-12).
    if (booking_id) {
      const { rows: [b] } = await db.query(
        `SELECT id FROM bookings
          WHERE id = $1 AND room_id = $2 AND status IN ('ACTIVE','PENDING')
            AND (start_time AT TIME ZONE 'Asia/Kolkata')::date = $3::date
            AND EXTRACT(HOUR FROM start_time AT TIME ZONE 'Asia/Kolkata') <= $4
            AND EXTRACT(HOUR FROM end_time AT TIME ZONE 'Asia/Kolkata') > $4`,
        [booking_id, room.id, date, h],
      );
      if (!b) return res.status(400).json({ error: 'The booking does not match this room, date and hour.' });
    }

    const facultyResult = await db.query(
      `SELECT id FROM faculties WHERE is_active AND UPPER(TRIM(name)) = UPPER(TRIM($1)) ORDER BY id LIMIT 1`,
      [faculty_name]
    );
    if (!facultyResult.rows[0]) {
      return res.status(404).json({ error: 'The class faculty could not be found, so approval cannot be requested.' });
    }

    const result = await db.runInTransaction(async (client) => {
      const inserted = await client.query(`
        INSERT INTO class_cancellation_requests
          (requested_by, faculty_id, room_name, subject_name, class_date, hour, booking_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `, [req.user.id, facultyResult.rows[0].id, room_name, subject_name || null, date, Number(hour), booking_id || null]);
      const request = inserted.rows[0];
      await notify(client, [{ facultyId: request.faculty_id }], 'class_cancellation_requested',
        classFacts(request, { requesterName: req.user.name || 'A student' }),
        { actorId: req.user.id, entityType: 'class_cancellation', entityId: request.id });
      return inserted;
    });

    res.status(201).json({ message: 'Cancellation request sent to the faculty member for approval.', request: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'A cancellation request for this class is already awaiting faculty approval.' });
    }
    sendServerError(res, err, 'Failed to create cancellation request.');
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
    `, [req.user.faculty_id ?? -1]);
    res.json(result.rows);
  } catch (err) {
    sendServerError(res, err, 'Failed to load cancellation requests.');
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
      `, [req.params.id, req.user.faculty_id ?? -1]);
      const request = requestResult.rows[0];
      if (!request) return null;

      if (approved) {
        if (request.booking_id) {
          // Only the still-open booking the request was made for (soft cancel; history kept).
          await client.query(
            `UPDATE bookings SET status = 'CANCELLED', cancelled_at = NOW(), updated_at = NOW()
              WHERE id = $1 AND status IN ('ACTIVE','PENDING')`,
            [request.booking_id],
          );
        } else {
          const room = await roomRepository.findByName(request.room_name, client);
          if (!room) return { notFoundRoom: true };
          // The timetabled class doesn't happen on this one date: release that hour for that date
          // only, instead of changing the room's weekly availability (BKG-05).
          await client.query(
            `INSERT INTO room_slot_releases (room_id, release_date, start_hour, end_hour, source_type, source_id, created_by)
             SELECT $1, class_date, hour, hour + 1, 'cancellation_request', id, $2 FROM class_cancellation_requests WHERE id = $3`,
            [room.id, req.user.id, request.id],
          );
        }
      }

      await client.query(`
        UPDATE class_cancellation_requests
        SET status = $1, reviewed_at = NOW()
        WHERE id = $2
      `, [approved ? 'APPROVED' : 'REJECTED', request.id]);
      await notify(client, [{ userId: request.requested_by }], 'class_cancellation_decided',
        classFacts(request, { approved, by: req.user.name || 'Faculty' }),
        { actorId: req.user.id, entityType: 'class_cancellation', entityId: request.id });
      return request;
    });

    if (!result) return res.status(404).json({ error: 'Cancellation request was not found or has already been reviewed.' });
    if (result.notFoundRoom) return res.status(409).json({ error: 'The room for this class no longer exists.' });
    cache.delete('room_availability_all');
    cache.deletePattern('admin_status_.*');
    res.json({ message: approved ? 'Cancellation approved; the room is now available.' : 'Cancellation request rejected.' });
  } catch (err) {
    sendServerError(res, err, 'Failed to review cancellation request.');
  }
}

/**
 * Universal Search for Admins to view ANY faculty or section schedule
 */
export async function searchTimetable(req, res) {
    try {
      const { type, name, department, semester, section } = req.query;
      const blank = (v) => typeof v !== 'string' || !v.trim();

      if (type === 'FACULTY' && blank(name)) return res.status(400).json({ error: 'name is required for a faculty search' });
      if (type === 'SECTION' && (blank(department) || blank(semester) || blank(section))) {
        return res.status(400).json({ error: 'department, semester and section are required for a section search' });
      }

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
          LEFT JOIN faculties f ON b.faculty_id = f.id
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
          SELECT b.*, r.name as room_name, u.name as creator_name, f.name as faculty_name
          FROM bookings b
          JOIN rooms r ON b.room_id = r.id
          JOIN users u ON b.created_by = u.id
          LEFT JOIN faculties f ON b.faculty_id = f.id
          WHERE (UPPER(u.branch) = $1 OR UPPER(u.branch) = $2 OR UPPER(u.department_name) = $1 OR UPPER(u.department_name) = $2)
          AND u.semester::TEXT = $3::TEXT
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
      sendServerError(res, err);
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
        SELECT name FROM faculties WHERE is_active AND name ILIKE $1
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
    sendServerError(res, err);
  }
}

// ─── Admin CRUD for timetable slots ────────────────────────────────────────

export async function listSlots(req, res) {
  try {
    const { faculty_name, day_of_week, semester } = req.query;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
    const conditions = [];
    const values = [];
    let idx = 1;

    if (faculty_name) { conditions.push(`fts.faculty_name ILIKE $${idx++}`); values.push(`%${faculty_name}%`); }
    if (day_of_week)  { conditions.push(`fts.day_of_week ILIKE $${idx++}`); values.push(day_of_week); }
    if (semester)     { conditions.push(`fts.semester = $${idx++}`);         values.push(semester); }

    conditions.unshift('fts.is_active');
    const where = `WHERE ${conditions.join(' AND ')}`;
    const offset = (page - 1) * limit;

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
      `, [...values, limit, offset]),
      db.query(`SELECT COUNT(*) FROM faculty_timetable_slots fts ${where}`, values)
    ]);

    res.json({
      data: dataResult.rows,
      meta: { total: parseInt(countResult.rows[0].count), page, limit }
    });
  } catch (err) {
    sendServerError(res, err);
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
    sendServerError(res, err);
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
          -- room_id changes only when sent; an explicit null unassigns the room (OPS-12)
          room_id      = CASE WHEN $9::boolean THEN $7 ELSE room_id END
      WHERE id = $8 AND is_active
      RETURNING id, faculty_name, semester, day_of_week, slot_time, content, is_occupied, room_id
    `, [faculty_name, semester, day_of_week, slot_time, content, is_occupied, room_id ?? null, id, Object.hasOwn(req.body, 'room_id')]);

    if (result.rows.length === 0) return res.status(404).json({ error: 'Slot not found' });
    res.json(result.rows[0]);
  } catch (err) {
    sendServerError(res, err);
  }
}

export async function deleteSlot(req, res) {
  try {
    const { id } = req.params;
    // Soft delete (rows are never removed from the app).
    const result = await db.query(
      'UPDATE faculty_timetable_slots SET is_active = FALSE, deactivated_at = NOW() WHERE id = $1 AND is_active RETURNING id',
      [id],
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Slot not found' });
    res.json({ success: true });
  } catch (err) {
    sendServerError(res, err);
  }
}

