import { sendServerError } from '../utils/httpErrors.js';
import * as db from '../db.js';
import { getDayOfWeek, normalizeDay, parseSlotTime } from '../utils/timetableLogic.js';
import { roomRepository } from '../repositories/roomRepository.js';
import { timetableRepository, sectionKey } from '../repositories/timetableRepository.js';
import { invalidateRoomCaches } from '../utils/cache.js';
import { istDateTimeToUtc } from '../utils/timezone.js';
import { notify } from '../notifications/notify.js';
import { facultyClassAt } from '../services/bookingRules.js';
import { logActivity } from '../services/loggerService.js';
import { importSectionSlots } from '../services/timetableImport.js';

function toTitleCase(str) {
  if (!str) return '';
  return str.toLowerCase().replace(/\b\w/g, s => s.toUpperCase());
}

export async function getTimetable(req, res) {
  try {
    // The student's section, as the ACL sends it: branch + semester + section (exact match).
    res.json(await timetableRepository.sectionClasses(sectionKey(req.user)));
  } catch (err) {
    sendServerError(res, err);
  }
}

/** POST /api/timetable/upload { slots: [...] } — see services/timetableImport.js. */
export async function uploadTimetable(req, res) {
  try {
    const { slots } = req.body;
    if (!Array.isArray(slots) || !slots.length) return res.status(400).json({ error: 'slots must be a non-empty array' });
    const result = await db.runInTransaction(async (client) => {
      const r = await importSectionSlots(client, slots);
      await logActivity({
        userId: req.user.id, action: 'IMPORT_SECTION_TIMETABLE', entityType: 'timetable',
        details: { ...r, rejected: r.rejected.length, unresolved: { rooms: r.unresolved.rooms.length, faculty: r.unresolved.faculty.length } },
      }, client);
      return r;
    });
    invalidateRoomCaches();
    res.json({ message: `Timetable imported for ${result.sections} section(s)`, ...result });
  } catch (err) {
    sendServerError(res, err);
  }
}

export async function getFacultyTimetable(req, res) {
  try {
    const day = req.query.day ? normalizeDay(req.query.day) : null;
    const facultyId = req.user.faculty_id ?? null;
    const { rows } = facultyId == null ? { rows: [] } : await db.query(
      `SELECT fts.*, r.name AS room_name
         FROM faculty_timetable_slots fts LEFT JOIN rooms r ON r.id = fts.room_id
        WHERE fts.faculty_id = $1 AND fts.is_active AND ($2::text IS NULL OR fts.day_of_week = $2)
        ORDER BY fts.day_of_week, fts.start_min`,
      [facultyId, day],
    );
    // Grouped by day for the Faculty Portal.
    const grouped = rows.reduce((acc, slot) => {
      (acc[slot.day_of_week] ||= []).push(slot);
      return acc;
    }, {});
    res.json(grouped);
  } catch (err) {
    sendServerError(res, err);
  }
}

const isDateKey = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d)) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === String(d);

/** GET /api/timetable/faculty/check/:id?date&hour — is this faculty member free for that hour? */
export async function checkFacultyAvailability(req, res) {
  try {
    const { id } = req.params;
    const { date } = req.query;
    const hour = Number(req.query.hour);
    if (!isDateKey(date) || !Number.isInteger(hour) || hour < 0 || hour > 23) {
      return res.status(400).json({ error: 'date (YYYY-MM-DD) and hour (0-23) are required' });
    }
    // `id` is a faculty-directory id (what the faculty picker returns).
    const faculty = await db.query('SELECT id FROM faculties WHERE id = $1 AND is_active', [id]);
    if (faculty.rows.length === 0) return res.status(404).json({ error: 'Faculty not found' });

    // The same rule the booking check applies: their classes (minus ones they cancelled that date)...
    const t = { day: getDayOfWeek(date), dateKey: date, startMin: hour * 60, endMin: hour * 60 + 60 };
    const isOccupiedStatic = Boolean(await facultyClassAt(db, Number(id), t));
    // ...and bookings they supervise.
    const bookingRes = await db.query(`
      SELECT 1 FROM bookings
       WHERE faculty_id = $1 AND status = 'ACTIVE'
         AND tstzrange(start_time, end_time) && tstzrange($2::timestamptz, $3::timestamptz) LIMIT 1
    `, [id, istDateTimeToUtc(date, hour), istDateTimeToUtc(date, hour + 1)]);
    const isOccupiedDynamic = bookingRes.rowCount > 0;

    const isOccupied = isOccupiedStatic || isOccupiedDynamic;
    res.json({
      isOccupied,
      reason: isOccupied ? (isOccupiedDynamic ? 'Dynamic Booking' : 'Static Class') : null,
      // Do not expose a faculty member's timetable or booking details.
      details: null,
    });
  } catch (err) {
    sendServerError(res, err);
  }
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
    const facultyId = req.user.faculty_id ?? null;
    const classes = facultyId == null ? [] : await timetableRepository.facultyClasses(facultyId, getDayOfWeek(date));
    const slot = classes.find((c) => c.start_min < hour * 60 + 60 && hour * 60 < c.end_min);
    if (!slot) return res.status(404).json({ error: 'You have no class at that time.' });

    const override = await db.runInTransaction(async (client) => {
      const { rows: [o] } = await client.query(
        `INSERT INTO faculty_slot_overrides (faculty_id, date, hour, is_cancelled, created_by)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (faculty_id, date, hour) DO UPDATE SET is_cancelled = EXCLUDED.is_cancelled, created_by = EXCLUDED.created_by
         RETURNING id, faculty_id, date::text AS date, hour, is_cancelled`,
        [facultyId, date, hour, cancel, req.user.id],
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
    invalidateRoomCaches();
    res.json({ message: cancel ? 'Class cancelled for that date; the room is free.' : 'Class restored.', override });
  } catch (err) {
    sendServerError(res, err, 'Failed to update the class.');
  }
}

/** GET /api/timetable/faculty/overrides — this faculty member's cancelled classes (last 30 days on). */
export async function getFacultyOverrides(req, res) {
  try {
    const { rows } = await db.query(
      `SELECT id, faculty_id, date::text AS date, hour, is_cancelled FROM faculty_slot_overrides
        WHERE faculty_id = $1 AND date >= CURRENT_DATE - 30 AND is_cancelled
        ORDER BY date, hour`,
      [req.user.faculty_id ?? -1],
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
          (requested_by, faculty_id, room_id, subject_name, class_date, hour, booking_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `, [req.user.id, facultyResult.rows[0].id, room.id, subject_name || null, date, Number(hour), booking_id || null]);
      const request = { ...inserted.rows[0], room_name: room.name };
      await notify(client, [{ facultyId: request.faculty_id }], 'class_cancellation_requested',
        classFacts(request, { requesterName: req.user.name || 'A student' }),
        { actorId: req.user.id, entityType: 'class_cancellation', entityId: request.id });
      return request;
    });

    res.status(201).json({ message: 'Cancellation request sent to the faculty member for approval.', request: result });
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
      SELECT c.*, COALESCE(r.name, c.room_name) AS room_name, u.name AS user_name
      FROM class_cancellation_requests c
      JOIN users u ON u.id = c.requested_by
      LEFT JOIN rooms r ON r.id = c.room_id
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
        SELECT c.*, COALESCE(r.name, c.room_name) AS room_name, r.is_active AS room_active
          FROM class_cancellation_requests c LEFT JOIN rooms r ON r.id = c.room_id
         WHERE c.id = $1 AND c.faculty_id = $2 AND c.status = 'PENDING'
         FOR UPDATE OF c
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
          if (!request.room_id || !request.room_active) return { notFoundRoom: true };
          // The timetabled class doesn't happen on this one date: release that hour for that date
          // only, instead of changing the room's weekly availability (BKG-05).
          await client.query(
            `INSERT INTO room_slot_releases (room_id, release_date, start_hour, end_hour, source_type, source_id, created_by)
             SELECT room_id, class_date, hour, hour + 1, 'cancellation_request', id, $1 FROM class_cancellation_requests WHERE id = $2`,
            [req.user.id, request.id],
          );
        }
      }

      await client.query(`
        UPDATE class_cancellation_requests
        SET status = $1, reviewed_at = NOW(), reviewed_by = $3
        WHERE id = $2
      `, [approved ? 'APPROVED' : 'REJECTED', request.id, req.user.id]);
      await notify(client, [{ userId: request.requested_by }], 'class_cancellation_decided',
        classFacts(request, { approved, by: req.user.name || 'Faculty' }),
        { actorId: req.user.id, entityType: 'class_cancellation', entityId: request.id });
      return request;
    });

    if (!result) return res.status(404).json({ error: 'Cancellation request was not found or has already been reviewed.' });
    if (result.notFoundRoom) return res.status(409).json({ error: 'The room for this class no longer exists.' });
    invalidateRoomCaches();
    res.json({ message: approved ? 'Cancellation approved; the room is now available.' : 'Cancellation request rejected.' });
  } catch (err) {
    sendServerError(res, err, 'Failed to review cancellation request.');
  }
}

/** GET /api/timetable/branches — the branches (ACL values) that have an active section timetable. */
export async function listBranches(req, res) {
  try {
    const { rows } = await db.query('SELECT DISTINCT department FROM timetable_slots WHERE is_active ORDER BY department');
    res.json(rows.map((r) => r.department));
  } catch (err) {
    sendServerError(res, err);
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
        const facultyName = name.trim().toUpperCase();

        // 1. Classes filed under that name, or linked to a directory entry of that name
        const staticRes = await db.query(`
          SELECT * FROM timetable_slots
          WHERE is_active AND (UPPER(TRIM(faculty_name)) = $1
                OR faculty_id IN (SELECT id FROM faculties WHERE UPPER(TRIM(name)) = $1))
          ORDER BY day_of_week, start_min
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
        // The ACL section key: branch + semester + section, matched exactly.
        const key = sectionKey({ branch: department, semester, section });
        if (!key) return res.status(400).json({ error: 'semester and section must be numbers' });

        const staticSlots = await timetableRepository.sectionClasses(key);
        const bookingRes = await db.query(`
          SELECT b.*, r.name as room_name, u.name as creator_name, f.name as faculty_name
          FROM bookings b
          JOIN rooms r ON b.room_id = r.id
          JOIN users u ON b.created_by = u.id
          LEFT JOIN faculties f ON b.faculty_id = f.id
          WHERE UPPER(TRIM(u.branch)) = $1 AND u.semester = $2 AND u.section = $3
          AND b.status = 'ACTIVE'
        `, [key.department, key.semester, key.section]);

        return res.json({
          type: 'SECTION',
          department: key.department,
          semester: key.semester,
          section: key.section,
          staticSlots,
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
        SELECT DISTINCT faculty_name AS name FROM timetable_slots WHERE is_active AND faculty_name ILIKE $1
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
        SELECT fts.id, fts.faculty_name, fts.faculty_id, fts.semester, fts.day_of_week,
               fts.slot_time, fts.start_min, fts.end_min, fts.content, fts.is_occupied,
               fts.room_id, r.name AS room_name, fts.created_at
        FROM faculty_timetable_slots fts
        LEFT JOIN rooms r ON r.id = fts.room_id
        ${where}
        ORDER BY fts.faculty_name, fts.day_of_week, fts.start_min
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

const SLOT_RETURNING = 'id, faculty_name, faculty_id, semester, day_of_week, slot_time, start_min, end_min, content, is_occupied, room_id, created_at';

/**
 * Validates the fields of a faculty timetable slot that are present. The faculty member must be in
 * the directory (classes are matched by faculty_id), the day a weekday and the time readable.
 */
async function slotFields(body) {
  const out = {};
  if (body.faculty_name !== undefined) {
    const { rows: [f] } = await db.query(
      'SELECT id, name FROM faculties WHERE is_active AND UPPER(TRIM(name)) = UPPER(TRIM($1)) ORDER BY id LIMIT 1', [body.faculty_name],
    );
    if (!f) return { error: `${body.faculty_name} is not in the faculty directory` };
    Object.assign(out, { faculty_name: f.name, faculty_id: f.id });
  }
  if (body.day_of_week !== undefined) {
    out.day_of_week = normalizeDay(body.day_of_week);
    if (!out.day_of_week) return { error: 'day_of_week must be a weekday (Mon–Sun)' };
  }
  if (body.slot_time !== undefined) {
    const t = parseSlotTime(body.slot_time);
    if (!t) return { error: 'slot_time must look like 09:00-10:00' };
    Object.assign(out, { slot_time: String(body.slot_time).trim(), start_min: t.startMin, end_min: t.endMin });
  }
  return { fields: out };
}

export async function createSlot(req, res) {
  try {
    const { semester, content, is_occupied, room_id } = req.body;
    if (!req.body.faculty_name || !req.body.day_of_week || !req.body.slot_time) {
      return res.status(400).json({ error: 'faculty_name, day_of_week, and slot_time are required' });
    }
    const { fields: f, error } = await slotFields(req.body);
    if (error) return res.status(400).json({ error });
    const result = await db.query(`
      INSERT INTO faculty_timetable_slots (faculty_name, faculty_id, semester, day_of_week, slot_time, start_min, end_min, content, is_occupied, room_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING ${SLOT_RETURNING}
    `, [f.faculty_name, f.faculty_id, semester || '', f.day_of_week, f.slot_time, f.start_min, f.end_min, content || '', is_occupied ?? false, room_id ?? null]);
    invalidateRoomCaches();
    res.status(201).json(result.rows[0]);
  } catch (err) {
    sendServerError(res, err);
  }
}

export async function updateSlot(req, res) {
  try {
    const { id } = req.params;
    const { semester, content, is_occupied, room_id } = req.body;
    const { fields: f, error } = await slotFields(req.body);
    if (error) return res.status(400).json({ error });

    const result = await db.query(`
      UPDATE faculty_timetable_slots
      SET faculty_name = COALESCE($1, faculty_name),
          faculty_id   = COALESCE($2, faculty_id),
          semester     = COALESCE($3, semester),
          day_of_week  = COALESCE($4, day_of_week),
          slot_time    = COALESCE($5, slot_time),
          start_min    = COALESCE($6, start_min),
          end_min      = COALESCE($7, end_min),
          content      = COALESCE($8, content),
          is_occupied  = COALESCE($9, is_occupied),
          -- room_id changes only when sent; an explicit null unassigns the room (OPS-12)
          room_id      = CASE WHEN $12::boolean THEN $10 ELSE room_id END
      WHERE id = $11 AND is_active
      RETURNING ${SLOT_RETURNING}
    `, [f.faculty_name, f.faculty_id, semester, f.day_of_week, f.slot_time, f.start_min, f.end_min, content, is_occupied,
      room_id ?? null, id, Object.hasOwn(req.body, 'room_id')]);

    if (result.rows.length === 0) return res.status(404).json({ error: 'Slot not found' });
    invalidateRoomCaches();
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
    invalidateRoomCaches();
    res.json({ success: true });
  } catch (err) {
    sendServerError(res, err);
  }
}

