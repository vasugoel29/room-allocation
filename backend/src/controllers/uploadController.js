import * as db from '../db.js';
import XLSX from 'xlsx-js-style';
import bcrypt from 'bcrypt';
import logger from '../utils/logger.js';
import { logActivity } from '../services/loggerService.js';
import { randomUUID } from 'crypto';

const jobStore = new Map();

const parseCSV = (csvText) => {
  const lines = csvText.split(/\r?\n/).filter(line => line.trim() !== '');
  if (lines.length === 0) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const row = {};
    const values = [];
    let curVal = '';
    let insideQuote = false;
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      if (char === '"') {
        insideQuote = !insideQuote;
      } else if (char === ',' && !insideQuote) {
        values.push(curVal.trim());
        curVal = '';
      } else {
        curVal += char;
      }
    }
    values.push(curVal.trim());

    headers.forEach((header, idx) => {
      row[header] = values[idx] !== undefined ? values[idx].replace(/^"|"$/g, '') : '';
    });
    rows.push(row);
  }
  return rows;
};

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

function getBuildingAndFloor(roomName) {
  if (roomName.startsWith('APJ')) {
    return { building: 'APJ Block', floor: parseInt(roomName.replace('APJ', '').charAt(0)) || 0 };
  }
  const firstDigit = roomName.charAt(0);
  const floorDigit = roomName.charAt(1);
  const floor = parseInt(floorDigit) || 0;
  
  let building = 'Other';
  if (firstDigit === '4') building = '4th Block';
  else if (firstDigit === '5') building = '5th Block';
  else if (firstDigit === '6') building = '6th Block';
  else if (firstDigit === '8') building = '8th Block';
  
  return { building, floor };
}

// -------------------------------------------------------------
// TEMPLATES DOWNLOADS (CSV)
// -------------------------------------------------------------

export const getStudentsTemplate = async (req, res) => {
  if (req.user?.id) {
    await logActivity({
      userId: req.user.id,
      action: 'DOWNLOAD_STUDENTS_TEMPLATE',
      entityType: 'upload',
      details: { format: 'csv' }
    });
  }
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=students_template.csv");
  res.send("name,email,branch,year,section,degree,department_name,roll_no\n");
};

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
  res.send("name,email,department_name\n");
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
  res.send("faculty_name,semester,day_of_week,slot_time,content,room_id\n");
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
const GRID_HOURS = Array.from({ length: 10 }, (_, index) => index + 8);

const normaliseDay = (value = '') => {
  const day = String(value).trim().toLowerCase();
  return WEEK_DAYS.find(candidate => candidate.toLowerCase().startsWith(day.slice(0, 3))) || value;
};

const getGridHour = (slotTime = '') => {
  const match = String(slotTime).match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hour = Number(match[1]);
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
    const result = await db.query(`
      SELECT u.name, u.email, b.name as branch, u.year, u.section, u.degree, d.name as department_name, u.roll_no 
      FROM users u
      LEFT JOIN branches b ON u.branch_id = b.id
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE u.role = 'VIEWER'
    `);
    return exportToXLSX(result.rows, 'students_export.xlsx', res);
  } catch (err) {
    logger.error('Failed to export students XLSX', err);
    res.status(500).json({ error: 'Failed to export students XLSX' });
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
      SELECT u.name, u.email, d.name as department_name 
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE u.role = 'FACULTY'
    `);
    return exportToXLSX(result.rows, 'faculty_export.xlsx', res);
  } catch (err) {
    logger.error('Failed to export faculty XLSX', err);
    res.status(500).json({ error: 'Failed to export faculty XLSX' });
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
      SELECT ts.id, u.name AS faculty_name, ts.semester, ts.day_of_week,
             TO_CHAR(ts.start_time, 'HH24:MI') || '-' || TO_CHAR(ts.end_time, 'HH24:MI') AS slot_time,
             s.name AS content, ts.room_id, r.name AS room_name
      FROM timetable_slots ts
      LEFT JOIN users u ON ts.faculty_id = u.id
      LEFT JOIN subjects s ON ts.subject_id = s.id
      LEFT JOIN rooms r ON ts.room_id = r.id
      ORDER BY u.name, ts.day_of_week, ts.start_time
    `);
    return exportTimetableCalendar(result.rows, res, view);
  } catch (err) {
    logger.error('Failed to export timetable XLSX', err);
    res.status(500).json({ error: 'Failed to export timetable XLSX' });
  }
};

// -------------------------------------------------------------
// IMPORTS (CSV)
// -------------------------------------------------------------

const runStudentsImport = async (jobId, csvContent, userId) => {
  try {
    const rows = parseCSV(csvContent);
    const processedRows = [];
    const batchSize = 10;
    for (let i = 0; i < rows.length; i += batchSize) {
      const chunk = rows.slice(i, i + batchSize);
      await Promise.all(chunk.map(async (row) => {
        if (!row.email) return;
        let year = parseInt(row.year);
        if (isNaN(year) || year < 1 || year > 5) year = 1;
        let section = parseInt(row.section);
        if (isNaN(section) || section < 1 || section > 20) section = 1;
        let password = row.password;
        if (!password) {
          const sanitizedName = (row.name || '').toLowerCase().replace(/\s+/g, '');
          const randomSuffix = Math.floor(1000 + Math.random() * 9000);
          password = `${sanitizedName}${randomSuffix}`;
        }
        const hashedPassword = await bcrypt.hash(password, 4);

        let departmentId = null;
        let branchId = null;
        if (row.department_name) {
          const dName = row.department_name.trim();
          let deptRes = await db.query('SELECT id FROM departments WHERE name = $1', [dName]);
          if (deptRes.rowCount === 0) {
            deptRes = await db.query('INSERT INTO departments (name) VALUES ($1) RETURNING id', [dName]);
          }
          departmentId = deptRes.rows[0].id;
          
          const bName = row.branch ? row.branch.trim() : dName;
          const shortCode = bName.match(/\(([^)]+)\)/)?.[1] || bName.substring(0, 3).toUpperCase();
          let branchRes = await db.query('SELECT id FROM branches WHERE name = $1 AND department_id = $2', [bName, departmentId]);
          if (branchRes.rowCount === 0) {
            branchRes = await db.query('INSERT INTO branches (name, short_code, department_id) VALUES ($1, $2, $3) RETURNING id', [bName, shortCode, departmentId]);
          }
          branchId = branchRes.rows[0].id;
        }

        processedRows.push({
          name: row.name || '', email: row.email.toLowerCase(), passwordHash: hashedPassword,
          branch_id: branchId, year, semester: year * 2, section, degree: row.degree || '',
          department_id: departmentId, roll_no: row.roll_no || ''
        });
      }));
    }

    await db.runInTransaction(async (client) => {
      const chunkSize = 500;
      for (let i = 0; i < processedRows.length; i += chunkSize) {
        const chunk = processedRows.slice(i, i + chunkSize);
        const values = [];
        const placeholders = [];
        let idx = 1;
        for (const row of chunk) {
          placeholders.push(`($${idx},$${idx+1},$${idx+2},'VIEWER',$${idx+3},$${idx+4},$${idx+5},$${idx+6},$${idx+7},$${idx+8}, $${idx+9}, true)`);
          values.push(row.name, row.email, row.passwordHash, row.department_id, row.branch_id, row.degree, row.roll_no, row.year, row.semester, row.section);
          idx += 10;
        }
        await client.query(`
          INSERT INTO users (name, email, password_hash, role, department_id, branch_id, degree, roll_no, year, semester, section, is_approved)
          VALUES ${placeholders.join(',')}
          ON CONFLICT (email) DO UPDATE SET
            name=EXCLUDED.name, 
            password_hash=EXCLUDED.password_hash,
            department_id=EXCLUDED.department_id, 
            branch_id=EXCLUDED.branch_id, 
            degree=EXCLUDED.degree,
            roll_no=EXCLUDED.roll_no, 
            year=EXCLUDED.year,
            semester=EXCLUDED.semester,
            section=EXCLUDED.section
        `, values);
      }
      if (userId) await logActivity({ userId, action: 'IMPORT_STUDENTS_CSV', entityType: 'upload', details: { recordCount: rows.length } }, client);
    });
    jobStore.set(jobId, { status: 'completed', message: `Successfully imported ${rows.length} student records` });
  } catch (err) {
    logger.error('Failed to import students CSV', err);
    jobStore.set(jobId, { status: 'failed', error: err.message || 'Import failed' });
  }
};

export const importStudents = async (req, res) => {
  const csvContent = req.body.csvContent;
  if (!csvContent) return res.status(400).json({ error: 'Missing csvContent field' });
  const jobId = randomUUID();
  jobStore.set(jobId, { status: 'processing' });
  res.status(202).json({ jobId, status: 'processing' });
  runStudentsImport(jobId, csvContent, req.user?.id);
};

const runFacultyImport = async (jobId, csvContent, userId) => {
  try {
    const rows = parseCSV(csvContent);
    const processedFaculty = [];
    const batchSize = 10;
    for (let i = 0; i < rows.length; i += batchSize) {
      const chunk = rows.slice(i, i + batchSize);
      await Promise.all(chunk.map(async (row) => {
        if (!row.email) return;
        let password = row.password || (row.name || '').toLowerCase().replace(/\s+/g, '');
        const hashedPassword = await bcrypt.hash(password, 4);

        let departmentId = null;
        if (row.department_name) {
          const dName = row.department_name.trim();
          let deptRes = await db.query('SELECT id FROM departments WHERE name = $1', [dName]);
          if (deptRes.rowCount === 0) {
            deptRes = await db.query('INSERT INTO departments (name) VALUES ($1) RETURNING id', [dName]);
          }
          departmentId = deptRes.rows[0].id;
        }

        processedFaculty.push({
          name: row.name || '', email: row.email.toLowerCase(),
          passwordHash: hashedPassword, department_id: departmentId
        });
      }));
    }

    await db.runInTransaction(async (client) => {
      const chunkSize = 500;
      for (let i = 0; i < processedFaculty.length; i += chunkSize) {
        const chunk = processedFaculty.slice(i, i + chunkSize);
        const values = [];
        const placeholders = [];
        let idx = 1;
        for (const row of chunk) {
          placeholders.push(`($${idx},$${idx+1},$${idx+2},'FACULTY',$${idx+3},true)`);
          values.push(row.name, row.email, row.passwordHash, row.department_id);
          idx += 4;
        }
        await client.query(`
          INSERT INTO users (name, email, password_hash, role, department_id, is_approved)
          VALUES ${placeholders.join(',')}
          ON CONFLICT (email) DO UPDATE SET
            name=EXCLUDED.name, 
            password_hash=EXCLUDED.password_hash,
            department_id=EXCLUDED.department_id
        `, values);
      }
      if (userId) await logActivity({ userId, action: 'IMPORT_FACULTY_CSV', entityType: 'upload', details: { recordCount: rows.length } }, client);
    });
    jobStore.set(jobId, { status: 'completed', message: `Successfully imported ${rows.length} faculty records` });
  } catch (err) {
    logger.error('Failed to import faculty CSV', err);
    jobStore.set(jobId, { status: 'failed', error: err.message || 'Import failed' });
  }
};

export const importFaculty = async (req, res) => {
  const csvContent = req.body.csvContent;
  if (!csvContent) return res.status(400).json({ error: 'Missing csvContent field' });
  const jobId = randomUUID();
  jobStore.set(jobId, { status: 'processing' });
  res.status(202).json({ jobId, status: 'processing' });
  runFacultyImport(jobId, csvContent, req.user?.id);
};

const runTimetableImport = async (jobId, csvContent, userId) => {
  try {
    const rows = parseCSV(csvContent);
    await db.runInTransaction(async (client) => {
      await client.query('DELETE FROM timetable_slots');
      
      const dummyPasswordHash = await bcrypt.hash('facultypass123', 4);

      for (const row of rows) {
        if (!row.faculty_name) continue;

        const dayOfWeek = (row.day_of_week || 'MON').toUpperCase();
        const parsedTime = parseSlotTime(row.slot_time);

        // 1. Resolve room
        let roomId = null;
        if (row.room_id) {
          const roomName = String(row.room_id).trim();
          let roomRes = await client.query('SELECT id FROM rooms WHERE UPPER(name) = UPPER($1)', [roomName]);
          if (roomRes.rowCount === 0) {
            const bf = getBuildingAndFloor(roomName);
            roomRes = await client.query(
              `INSERT INTO rooms (name, building, floor, capacity, type, student_access)
               VALUES ($1, $2, $3, 60, 'Lecture Room', true) RETURNING id`,
              [roomName, bf.building, bf.floor]
            );
          }
          roomId = roomRes.rows[0].id;
        }

        // 2. Resolve faculty user
        let facultyId = null;
        if (row.faculty_name) {
          const fName = toTitleCase(row.faculty_name.trim());
          let facRes = await client.query("SELECT id FROM users WHERE role = 'FACULTY' AND UPPER(name) = UPPER($1)", [fName]);
          if (facRes.rowCount === 0) {
            const fEmail = `${fName.toLowerCase().replace(/[^a-z]/g, '')}@nsut.ac.in`;
            facRes = await client.query(
              `INSERT INTO users (name, email, password_hash, role, is_approved)
               VALUES ($1, $2, $3, 'FACULTY', true) RETURNING id`,
              [fName, fEmail, dummyPasswordHash]
            );
          }
          facultyId = facRes.rows[0].id;
        }

        // 3. Resolve subject
        let subjectId = null;
        if (row.content) {
          const sName = row.content.trim();
          const sCode = sName.substring(0, 5).toUpperCase() + Math.floor(Math.random() * 100);
          let subRes = await client.query('SELECT id FROM subjects WHERE name = $1', [sName]);
          if (subRes.rowCount === 0) {
            subRes = await client.query('INSERT INTO subjects (code, name) VALUES ($1, $2) RETURNING id', [sCode, sName]);
          }
          subjectId = subRes.rows[0].id;
        }

        const sem = row.semester ? parseInt(row.semester) : 1;

        // Skip overlap conflicts
        const overlap = await client.query(`
          SELECT id FROM timetable_slots
          WHERE room_id = $1 AND day_of_week = $2
            AND timerange(start_time, end_time) && timerange($3::time, $4::time)
        `, [roomId, dayOfWeek, parsedTime.start, parsedTime.end]);

        if (overlap.rowCount > 0) continue;

        await client.query(`
          INSERT INTO timetable_slots (faculty_id, semester, day_of_week, start_time, end_time, subject_id, room_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [facultyId, sem, dayOfWeek, parsedTime.start, parsedTime.end, subjectId, roomId]);
      }

      if (userId) await logActivity({ userId, action: 'IMPORT_TIMETABLE_CSV', entityType: 'upload', details: { recordCount: rows.length } }, client);
    });
    jobStore.set(jobId, { status: 'completed', message: `Successfully imported ${rows.length} timetable records` });
  } catch (err) {
    logger.error('Failed to import timetable CSV', err);
    jobStore.set(jobId, { status: 'failed', error: err.message || 'Import failed' });
  }
};

export const importTimetable = async (req, res) => {
  const csvContent = req.body.csvContent;
  if (!csvContent) return res.status(400).json({ error: 'Missing csvContent field' });
  const jobId = randomUUID();
  jobStore.set(jobId, { status: 'processing' });
  res.status(202).json({ jobId, status: 'processing' });
  runTimetableImport(jobId, csvContent, req.user?.id);
};

export const getJobStatus = (req, res) => {
  const { jobId } = req.params;
  const job = jobStore.get(jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (job.status !== 'processing') jobStore.delete(jobId);
  return res.json(job);
};
