import * as db from '../db.js';
import XLSX from 'xlsx';
import bcrypt from 'bcrypt';
import logger from '../utils/logger.js';
import { logActivity } from '../services/loggerService.js';
import { randomUUID } from 'crypto';

// In-memory job store for async CSV uploads
// Map<jobId, { status: 'processing'|'completed'|'failed', message?: string, error?: string }>
const jobStore = new Map();

// Simple custom CSV parser
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
    const result = await db.query("SELECT name, email, branch, year, section, degree, department_name, roll_no FROM users WHERE role = 'VIEWER'");
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
    const result = await db.query("SELECT name, email, department_name FROM users WHERE role = 'FACULTY'");
    return exportToXLSX(result.rows, 'faculty_export.xlsx', res);
  } catch (err) {
    logger.error('Failed to export faculty XLSX', err);
    res.status(500).json({ error: 'Failed to export faculty XLSX' });
  }
};

export const exportTimetable = async (req, res) => {
  try {
    if (req.user?.id) {
      await logActivity({
        userId: req.user.id,
        action: 'EXPORT_TIMETABLE_XLSX',
        entityType: 'upload',
        details: { format: 'xlsx' }
      });
    }
    const result = await db.query(`
      SELECT fts.id, fts.faculty_name, fts.semester, fts.day_of_week, fts.slot_time,
             fts.content, fts.is_occupied, fts.room_id, r.name AS room_name
      FROM faculty_timetable_slots fts
      LEFT JOIN rooms r ON r.id = fts.room_id
      ORDER BY fts.faculty_name, fts.day_of_week, fts.slot_time
    `);
    return exportToXLSX(result.rows, 'timetable_export.xlsx', res);
  } catch (err) {
    logger.error('Failed to export timetable XLSX', err);
    res.status(500).json({ error: 'Failed to export timetable XLSX' });
  }
};

// -------------------------------------------------------------
// IMPORTS (CSV) — async fire-and-forget with job polling
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
        if (isNaN(section) || section < 1 || section > 15) section = 1;
        let password = row.password;
        if (!password) {
          const sanitizedName = (row.name || '').toLowerCase().replace(/\s+/g, '');
          const randomSuffix = Math.floor(1000 + Math.random() * 9000);
          password = `${sanitizedName}${randomSuffix}`;
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        processedRows.push({
          name: row.name || '', email: row.email.toLowerCase(), password: hashedPassword,
          branch: row.branch || '', year, section, degree: row.degree || '',
          department_name: row.department_name || '', roll_no: row.roll_no || ''
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
          placeholders.push(`($${idx},$${idx+1},$${idx+2},'VIEWER',$${idx+3},$${idx+4},$${idx+5},$${idx+6},$${idx+7},$${idx+8})`);
          values.push(row.name, row.email, row.password, row.branch, row.year, row.section, row.degree, row.department_name, row.roll_no);
          idx += 9;
        }
        await client.query(`
          INSERT INTO users (name, email, password, role, branch, year, section, degree, department_name, roll_no)
          VALUES ${placeholders.join(',')}
          ON CONFLICT (email) DO UPDATE SET
            name=EXCLUDED.name, branch=EXCLUDED.branch, year=EXCLUDED.year,
            section=EXCLUDED.section, degree=EXCLUDED.degree,
            department_name=EXCLUDED.department_name, roll_no=EXCLUDED.roll_no
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
        const hashedPassword = await bcrypt.hash(password, 10);
        processedFaculty.push({
          name: row.name || '', email: row.email.toLowerCase(),
          password: hashedPassword, department_name: row.department_name || ''
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
          placeholders.push(`($${idx},$${idx+1},$${idx+2},'FACULTY',$${idx+3})`);
          values.push(row.name, row.email, row.password, row.department_name);
          idx += 5;
        }
        await client.query(`
          INSERT INTO users (name, email, password, role, department_name)
          VALUES ${placeholders.join(',')}
          ON CONFLICT (email) DO UPDATE SET
            name=EXCLUDED.name, department_name=EXCLUDED.department_name
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
      await client.query('TRUNCATE faculty_timetable_slots');
      
      const chunkSize = 500;
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        const values = [];
        const placeholders = [];
        let idx = 1;
        
        for (const row of chunk) {
          if (!row.faculty_name) continue;
          const isOccupied = row.is_occupied === 'true' || row.is_occupied === '1';
          const roomId = row.room_id && !isNaN(parseInt(row.room_id)) ? parseInt(row.room_id) : null;
          placeholders.push(`($${idx},$${idx+1},$${idx+2},$${idx+3},$${idx+4},$${idx+5},$${idx+6})`);
          values.push(row.faculty_name, row.semester || '', row.day_of_week || '', row.slot_time || '', row.content || '', isOccupied, roomId);
          idx += 7;

          // Sync with room_availability: if a room is assigned, mark it as unavailable for that day/hour
          if (roomId && row.day_of_week && row.slot_time) {
            const match = row.slot_time.match(/(\d{1,2}):(\d{2})/);
            if (match) {
              const startHour = parseInt(match[1]);
              await client.query(`
                INSERT INTO room_availability (room_id, day, hour, is_available)
                VALUES ($1, $2, $3, FALSE)
                ON CONFLICT (room_id, day, hour) DO UPDATE SET is_available = FALSE
              `, [roomId, row.day_of_week, startHour]);
            }
          }
        }
        if (placeholders.length > 0) {
          await client.query(`
            INSERT INTO faculty_timetable_slots (faculty_name, semester, day_of_week, slot_time, content, is_occupied, room_id)
            VALUES ${placeholders.join(',')}
          `, values);
        }
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

// Job status polling endpoint
export const getJobStatus = (req, res) => {
  const { jobId } = req.params;
  const job = jobStore.get(jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  // Clean up completed/failed jobs after retrieval to avoid memory growth
  if (job.status !== 'processing') jobStore.delete(jobId);
  return res.json(job);
};
