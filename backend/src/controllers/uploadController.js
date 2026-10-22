import { normalizeDay, parseSlotTime } from '../utils/timetableLogic.js';
import { sendServerError } from '../utils/httpErrors.js';
import * as db from '../db.js';
import { invalidateRoomCaches } from '../utils/cache.js';
import { facultyRepository } from '../repositories/facultyRepository.js';
import { userRepository } from '../repositories/userRepository.js';
import { scopesFor } from '../auth/scopes.js';
import { PERMISSIONS as P } from '../auth/permissions.js';
import XLSX from 'xlsx-js-style';
import logger from '../utils/logger.js';
import { logActivity } from '../services/loggerService.js';
import { startJob, finishJob, failJob, getJob } from '../services/importJobs.js';

// In-memory job store for async CSV uploads
// Map<jobId, { status: 'processing'|'completed'|'failed', message?: string, error?: string }>

// Simple custom CSV parser
/**
 * RFC 4180 CSV: quoted fields may contain commas, newlines and doubled quotes ("" -> ").
 * Returns one object per non-blank record, keyed by the trimmed header names (NEW-admin-5).
 */
const parseCSV = (csvText) => {
  const records = [];
  let record = [];
  let field = '';
  let quoted = false;
  const text = String(csvText).replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { record.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      record.push(field); records.push(record); record = []; field = '';
    } else field += c;
  }
  record.push(field);
  records.push(record);

  const nonBlank = records.filter((r) => r.some((v) => v.trim() !== ''));
  if (nonBlank.length === 0) return [];
  const headers = nonBlank[0].map((h) => h.trim());
  return nonBlank.slice(1).map((values) =>
    Object.fromEntries(headers.map((h, idx) => [h, (values[idx] ?? '').trim()])));
};

// -------------------------------------------------------------
// TEMPLATES DOWNLOADS (CSV)
// -------------------------------------------------------------

export const getFacultyTemplate = async (req, res) => {
  if (req.user?.id) {
    await logActivity({
      userId: req.user.id,
      action: 'DOWNLOAD_FACULTY_TEMPLATE',
      entityType: 'upload',
      details: { format: 'csv' }
    });
  }
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=faculty_template.csv");
  res.send("name,email,department_name,status\n");
};

export const getTimetableTemplate = async (req, res) => {
  if (req.user?.id) {
    await logActivity({
      userId: req.user.id,
      action: 'DOWNLOAD_TIMETABLE_TEMPLATE',
      entityType: 'upload',
      details: { format: 'csv' }
    });
  }
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=timetable_template.csv");
  res.send("faculty_name,semester,day_of_week,slot_time,content,is_occupied,room_id\n");
};

// -------------------------------------------------------------
// EXPORTS (XLSX)
// -------------------------------------------------------------

const exportToXLSX = (data, filename, res) => {
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Data');
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
  res.send(buffer);
};

const WEEK_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const GRID_HOURS = Array.from({ length: 10 }, (_, index) => index + 8); // Matches the Admin Room Grid: 08:00–18:00

const normaliseDay = (value = '') => {
  const day = String(value).trim().toLowerCase();
  return WEEK_DAYS.find(candidate => candidate.toLowerCase().startsWith(day.slice(0, 3))) || value;
};

const getGridHour = (slotTime = '') => {
  const match = String(slotTime).match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hour = Number(match[1]);
  // Imported timetable values can use 12-hour times, e.g. T702:00-03:00.
  // The Room Grid represents those as 14:00–15:00.
  return hour < 8 ? hour + 12 : hour;
};

const formatGridHour = (hour) => `${String(hour).padStart(2, '0')}:00`;

const safeSheetName = (name, usedNames) => {
  const base = (name || 'Timetable').replace(/[\\/*?:\[\]]/g, ' ').trim().slice(0, 31) || 'Timetable';
  let sheetName = base;
  let suffix = 2;
  while (usedNames.has(sheetName)) {
    sheetName = `${base.slice(0, 28)} (${suffix++})`;
  }
  usedNames.add(sheetName);
  return sheetName;
};

const appendCalendarSheet = (workbook, title, slots, usedSheetNames, cellDetails) => {
    const cellEntries = new Map();
    slots.forEach(slot => {
      const hour = getGridHour(slot.slot_time);
      if (!GRID_HOURS.includes(hour)) return;
      const key = `${hour}|${normaliseDay(slot.day_of_week)}`;
      const details = cellDetails(slot);
      cellEntries.set(key, [...(cellEntries.get(key) || []), details]);
    });

    const sheetRows = [
      [`Weekly Timetable — ${title}`],
      ['Time', ...WEEK_DAYS],
      ...GRID_HOURS.map(hour => [formatGridHour(hour), ...WEEK_DAYS.map(day => (cellEntries.get(`${hour}|${day}`) || []).join('\n\n'))])
    ];
    const worksheet = XLSX.utils.aoa_to_sheet(sheetRows);
    worksheet['!merges'] = [XLSX.utils.decode_range('A1:F1')];
    worksheet['!cols'] = [{ wch: 16 }, ...WEEK_DAYS.map(() => ({ wch: 28 }))];
    worksheet['!rows'] = [{ hpt: 26 }, { hpt: 22 }, ...GRID_HOURS.map(() => ({ hpt: 54 }))];
    worksheet['!freeze'] = { xSplit: 1, ySplit: 2 };

    const titleStyle = { font: { bold: true, sz: 14, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '4F46E5' } }, alignment: { horizontal: 'center', vertical: 'center' } };
    const headerStyle = { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '312E81' } }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true } };
    const cellStyle = { alignment: { vertical: 'top', wrapText: true }, border: { top: { style: 'thin', color: { rgb: 'D1D5DB' } }, bottom: { style: 'thin', color: { rgb: 'D1D5DB' } }, left: { style: 'thin', color: { rgb: 'D1D5DB' } }, right: { style: 'thin', color: { rgb: 'D1D5DB' } } } };
    for (let column = 0; column <= 5; column++) {
      const address = XLSX.utils.encode_cell({ r: 0, c: column });
      if (worksheet[address]) worksheet[address].s = titleStyle;
      const headerAddress = XLSX.utils.encode_cell({ r: 1, c: column });
      if (worksheet[headerAddress]) worksheet[headerAddress].s = headerStyle;
    }
    for (let row = 2; row < sheetRows.length; row++) {
      for (let column = 0; column <= 5; column++) {
        const address = XLSX.utils.encode_cell({ r: row, c: column });
        if (worksheet[address]) worksheet[address].s = cellStyle;
      }
    }
    XLSX.utils.book_append_sheet(workbook, worksheet, safeSheetName(title, usedSheetNames));
};

const appendRoomGridSheet = (workbook, title, slots, usedSheetNames) => {
  const cellEntries = new Map();
  slots.forEach(slot => {
    const hour = getGridHour(slot.slot_time);
    const day = normaliseDay(slot.day_of_week);
    if (!GRID_HOURS.includes(hour) || !WEEK_DAYS.includes(day)) return;
    const key = `${day}|${hour}`;
    const details = [slot.content || 'Scheduled class', slot.faculty_name ? `Faculty: ${slot.faculty_name}` : '']
      .filter(Boolean)
      .join('\n');
    cellEntries.set(key, [...(cellEntries.get(key) || []), details]);
  });

  const sheetRows = [
    [`Room Schedule Grid — ${title}`],
    ['Day', ...GRID_HOURS.map(formatGridHour)],
    ...WEEK_DAYS.map(day => [day, ...GRID_HOURS.map(hour => (cellEntries.get(`${day}|${hour}`) || []).join('\n\n'))])
  ];
  const worksheet = XLSX.utils.aoa_to_sheet(sheetRows);
  worksheet['!merges'] = [XLSX.utils.decode_range('A1:K1')];
  worksheet['!cols'] = [{ wch: 16 }, ...GRID_HOURS.map(() => ({ wch: 24 }))];
  worksheet['!rows'] = [{ hpt: 26 }, { hpt: 22 }, ...WEEK_DAYS.map(() => ({ hpt: 105 }))];
  worksheet['!freeze'] = { xSplit: 1, ySplit: 2 };
  const titleStyle = { font: { bold: true, sz: 14, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '4F46E5' } }, alignment: { horizontal: 'center', vertical: 'center' } };
  const headerStyle = { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '312E81' } }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true } };
  const cellStyle = { alignment: { vertical: 'top', wrapText: true }, border: { top: { style: 'thin', color: { rgb: 'D1D5DB' } }, bottom: { style: 'thin', color: { rgb: 'D1D5DB' } }, left: { style: 'thin', color: { rgb: 'D1D5DB' } }, right: { style: 'thin', color: { rgb: 'D1D5DB' } } } };
  for (let column = 0; column <= 10; column++) {
    const titleAddress = XLSX.utils.encode_cell({ r: 0, c: column });
    if (worksheet[titleAddress]) worksheet[titleAddress].s = titleStyle;
    const headerAddress = XLSX.utils.encode_cell({ r: 1, c: column });
    if (worksheet[headerAddress]) worksheet[headerAddress].s = headerStyle;
  }
  for (let row = 2; row < sheetRows.length; row++) {
    for (let column = 0; column <= 10; column++) {
      const address = XLSX.utils.encode_cell({ r: row, c: column });
      if (worksheet[address]) worksheet[address].s = cellStyle;
    }
  }
  XLSX.utils.book_append_sheet(workbook, worksheet, safeSheetName(title, usedSheetNames));
};

const exportTimetableCalendar = (rows, res, view) => {
  const workbook = XLSX.utils.book_new();
  const usedSheetNames = new Set();
  const groupBy = (getName) => rows.reduce((groups, slot) => {
    const name = getName(slot);
    if (!name) return groups;
    if (!groups[name]) groups[name] = [];
    groups[name].push(slot);
    return groups;
  }, {});

  if (view === 'faculty') {
    const slotsByFaculty = groupBy(slot => slot.faculty_name || 'Unassigned');
    Object.entries(slotsByFaculty).forEach(([faculty, slots]) => {
      appendCalendarSheet(
        workbook,
        `Faculty - ${faculty}`,
        slots,
        usedSheetNames,
        slot => [slot.content || 'Scheduled class', slot.room_name ? `Room: ${slot.room_name}` : '', slot.semester ? `Semester: ${slot.semester}` : ''].filter(Boolean).join('\n')
      );
    });
  } else {
    const slotsByRoom = groupBy(slot => slot.room_name);
    Object.entries(slotsByRoom).forEach(([room, slots]) => appendRoomGridSheet(workbook, `Room - ${room}`, slots, usedSheetNames));
  }

  if (workbook.SheetNames.length === 0) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Weekly Timetable'], ['No timetable entries found']]), 'Timetable');
  }
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx', cellStyles: true });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=${view}_timetable_calendar.xlsx`);
  res.send(buffer);
};

export const exportStudents = async (req, res) => {
  try {
    if (req.user?.id) {
      await logActivity({
        userId: req.user.id,
        action: 'EXPORT_STUDENTS_XLSX',
        entityType: 'upload',
        details: { format: 'xlsx' }
      });
    }
    // Students include class representatives (decision 2026-10-20); deactivated accounts are left out.
    // Scoped admins export only the students within their ACL people scopes.
    const rows = await userRepository.students(scopesFor(req.user, P.ADMIN));
    return exportToXLSX(rows, 'students_export.xlsx', res);
  } catch (err) {
    logger.error('Failed to export students XLSX', err);
    sendServerError(res, err, 'Failed to export students XLSX');
  }
};

export const exportFaculty = async (req, res) => {
  try {
    if (req.user?.id) {
      await logActivity({
        userId: req.user.id,
        action: 'EXPORT_FACULTY_XLSX',
        entityType: 'upload',
        details: { format: 'xlsx' }
      });
    }
    const result = await db.query(`
      SELECT name, email, department_name, CASE WHEN is_active THEN 'active' ELSE 'inactive' END AS status
      FROM faculties ORDER BY name`);
    return exportToXLSX(result.rows, 'faculty_export.xlsx', res);
  } catch (err) {
    logger.error('Failed to export faculty XLSX', err);
    sendServerError(res, err, 'Failed to export faculty XLSX');
  }
};

export const exportTimetable = async (req, res) => {
  try {
    const view = req.query.view === 'room' ? 'room' : 'faculty';
    if (req.user?.id) {
      await logActivity({
        userId: req.user.id,
        action: 'EXPORT_TIMETABLE_XLSX',
        entityType: 'upload',
        details: { format: 'xlsx', view }
      });
    }
    const result = await db.query(`
      SELECT fts.id, fts.faculty_name, fts.semester, fts.day_of_week, fts.slot_time,
             fts.content, fts.is_occupied, fts.room_id, r.name AS room_name
      FROM faculty_timetable_slots fts
      LEFT JOIN rooms r ON r.id = fts.room_id
      WHERE fts.is_active
      ORDER BY fts.faculty_name, fts.day_of_week, fts.slot_time
    `);
    return exportTimetableCalendar(result.rows, res, view);
  } catch (err) {
    logger.error('Failed to export timetable XLSX', err);
    sendServerError(res, err, 'Failed to export timetable XLSX');
  }
};

// -------------------------------------------------------------
// IMPORTS (CSV) — async fire-and-forget with job polling
// -------------------------------------------------------------


const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Faculty CSV → faculty directory (faculties table). Creates or updates entries by email; a row
 * with status "inactive" soft-deletes that entry. No sign-in accounts or passwords are created:
 * faculty sign in with Google, and their directory entry is linked on first sign-in.
 */
const runFacultyImport = async (jobId, csvContent, userId) => {
  try {
    const rows = parseCSV(csvContent);
    const seen = new Map();
    const skipped = [];
    rows.forEach((row, i) => {
      const line = i + 2; // header is line 1
      const email = (row.email || '').trim().toLowerCase();
      const name = (row.name || '').trim();
      if (!email || !EMAIL_RE.test(email)) return skipped.push({ line, reason: 'invalid or missing email' });
      if (!name) return skipped.push({ line, reason: 'missing name' });
      if (seen.has(email)) return skipped.push({ line, reason: `duplicate of line ${seen.get(email).line}` });
      seen.set(email, { line, email, name, department_name: (row.department_name || '').trim() || null,
        inactive: /^(inactive|deactivated|deleted)$/i.test((row.status || '').trim()) });
    });

    const counts = { created: 0, updated: 0, deactivated: 0 };
    await db.runInTransaction(async (client) => {
      for (const entry of seen.values()) {
        if (entry.inactive) {
          const { rows: found } = await client.query('SELECT id FROM faculties WHERE lower(email) = $1 AND is_active', [entry.email]);
          if (found[0] && (await facultyRepository.deactivate(found[0].id, client))) counts.deactivated++;
          continue;
        }
        const saved = await facultyRepository.upsert(entry, client);
        if (saved.inserted) counts.created++; else counts.updated++;
      }
      if (userId) {
        await logActivity({
          userId, action: 'IMPORT_FACULTY_CSV', entityType: 'upload',
          details: { recordCount: rows.length, ...counts, skipped: skipped.length },
        }, client);
      }
    });
    await finishJob(jobId, {
      message: `Faculty directory updated: ${counts.created} added, ${counts.updated} updated, ${counts.deactivated} deactivated, ${skipped.length} skipped`,
      ...counts,
      skipped,
    });
  } catch (err) {
    logger.error('Failed to import faculty CSV', err);
    await failJob(jobId, 'Import failed');
  }
};

export const importFaculty = async (req, res) => {
  const csvContent = req.body.csvContent;
  if (!csvContent) return res.status(400).json({ error: 'Missing csvContent field' });
  const jobId = await startJob('faculty', req.user?.id);
  res.status(202).json({ jobId, status: 'processing' });
  runFacultyImport(jobId, csvContent, req.user?.id).catch((err) => logger.error('Faculty import job bookkeeping failed', err));
};

/**
 * Faculty timetable CSV → faculty_timetable_slots. An import replaces the active faculty timetable
 * (previous slots are soft-deleted). Rows are matched to the faculty directory by name; a slot
 * blocks its room (room_id) and its teacher (faculty_id) directly — nothing is copied into
 * room_availability. Unreadable rows are skipped and names CRAS doesn't know are reported.
 */
const runTimetableImport = async (jobId, csvContent, userId) => {
  try {
    const rows = parseCSV(csvContent);
    const skipped = [];
    const slots = [];
    rows.forEach((row, i) => {
      const line = i + 2; // header is line 1
      const name = (row.faculty_name || '').trim();
      const day = normalizeDay(row.day_of_week);
      const time = parseSlotTime(row.slot_time);
      if (!name) return skipped.push({ line, reason: 'missing faculty_name' });
      if (!day) return skipped.push({ line, reason: 'day_of_week must be a weekday (Mon–Sun)' });
      if (!time) return skipped.push({ line, reason: 'slot_time must look like 09:00-10:00' });
      const roomId = row.room_id && /^\d+$/.test(String(row.room_id).trim()) ? Number(row.room_id) : null;
      slots.push({
        name, semester: row.semester || '', day, slotTime: String(row.slot_time).trim(), ...time,
        content: row.content || '', isOccupied: row.is_occupied === 'true' || row.is_occupied === '1', roomId,
      });
    });

    let unresolved = [];
    await db.runInTransaction(async (client) => {
      const names = [...new Set(slots.map((s) => s.name.toUpperCase()))];
      const ids = new Map((await client.query(
        `SELECT DISTINCT ON (upper(trim(name))) upper(trim(name)) AS k, id FROM faculties
          WHERE upper(trim(name)) = ANY($1) ORDER BY upper(trim(name)), is_active DESC, id`, [names],
      )).rows.map((r) => [r.k, r.id]));
      unresolved = [...new Set(slots.filter((s) => !ids.has(s.name.toUpperCase())).map((s) => s.name))].sort();

      // A timetable import replaces the active timetable; previous slots are soft-deleted, never removed.
      await client.query('UPDATE faculty_timetable_slots SET is_active = FALSE, deactivated_at = NOW() WHERE is_active');
      const COLS = ['faculty_name', 'faculty_id', 'semester', 'day_of_week', 'slot_time', 'start_min', 'end_min', 'content', 'is_occupied', 'room_id'];
      for (let i = 0; i < slots.length; i += 500) {
        const chunk = slots.slice(i, i + 500);
        const placeholders = chunk.map((_, r) => `(${COLS.map((__, c) => `$${r * COLS.length + c + 1}`).join(',')})`);
        await client.query(
          `INSERT INTO faculty_timetable_slots (${COLS.join(', ')}) VALUES ${placeholders.join(',')}`,
          chunk.flatMap((s) => [s.name, ids.get(s.name.toUpperCase()) ?? null, s.semester, s.day, s.slotTime,
            s.startMin, s.endMin, s.content, s.isOccupied, s.roomId]),
        );
      }
      if (userId) {
        await logActivity({
          userId, action: 'IMPORT_TIMETABLE_CSV', entityType: 'upload',
          details: { recordCount: rows.length, imported: slots.length, skipped: skipped.length, unresolved: unresolved.length },
        }, client);
      }
    });
    invalidateRoomCaches();
    await finishJob(jobId, {
      message: `Imported ${slots.length} timetable records, ${skipped.length} skipped`
        + (unresolved.length ? `; ${unresolved.length} faculty name(s) not in the directory` : ''),
      skipped,
      unresolved,
    });
  } catch (err) {
    logger.error('Failed to import timetable CSV', err);
    await failJob(jobId, err.message || 'Import failed');
  }
};

export const importTimetable = async (req, res) => {
  const csvContent = req.body.csvContent;
  if (!csvContent) return res.status(400).json({ error: 'Missing csvContent field' });
  const jobId = await startJob('timetable', req.user?.id);
  res.status(202).json({ jobId, status: 'processing' });
  runTimetableImport(jobId, csvContent, req.user?.id).catch((err) => logger.error('Timetable import job bookkeeping failed', err));
};

// Job status polling endpoint (import_jobs; status survives restarts)
export const getJobStatus = async (req, res) => {
  try {
    const job = await getJob(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    return res.json(job);
  } catch (err) {
    sendServerError(res, err);
  }
};
