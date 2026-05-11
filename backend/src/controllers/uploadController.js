import * as db from '../db.js';
import XLSX from 'xlsx';
import bcrypt from 'bcrypt';
import logger from '../utils/logger.js';
import { logActivity } from '../services/loggerService.js';

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
  res.send("faculty_name,semester,day_of_week,slot_time,content,is_occupied\n");
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
    const result = await db.query("SELECT faculty_name, semester, day_of_week, slot_time, content, is_occupied FROM faculty_timetable_slots");
    return exportToXLSX(result.rows, 'timetable_export.xlsx', res);
  } catch (err) {
    logger.error('Failed to export timetable XLSX', err);
    res.status(500).json({ error: 'Failed to export timetable XLSX' });
  }
};

// -------------------------------------------------------------
// IMPORTS (CSV)
// -------------------------------------------------------------

export const importStudents = async (req, res) => {
  try {
    const csvContent = req.body.csvContent;
    if (!csvContent) {
      return res.status(400).json({ error: 'Missing csvContent field' });
    }
    const rows = parseCSV(csvContent);
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      for (const row of rows) {
        if (!row.email) continue;
        
        // Sanitize bounds
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

        await client.query(`
          INSERT INTO users (name, email, password, role, branch, year, section, degree, department_name, roll_no)
          VALUES ($1, $2, $3, 'VIEWER', $4, $5, $6, $7, $8, $9)
          ON CONFLICT (email) DO UPDATE SET 
            name = EXCLUDED.name,
            branch = EXCLUDED.branch,
            year = EXCLUDED.year,
            section = EXCLUDED.section,
            degree = EXCLUDED.degree,
            department_name = EXCLUDED.department_name,
            roll_no = EXCLUDED.roll_no
        `, [
          row.name || '',
          row.email.toLowerCase(),
          hashedPassword,
          row.branch || '',
          year,
          section,
          row.degree || '',
          row.department_name || '',
          row.roll_no || ''
        ]);
      }

      if (req.user?.id) {
        await logActivity({
          userId: req.user.id,
          action: 'IMPORT_STUDENTS_CSV',
          entityType: 'upload',
          details: { recordCount: rows.length }
        }, client);
      }

      await client.query('COMMIT');
      res.json({ success: true, message: `Successfully imported ${rows.length} student records` });
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error('Failed to import students CSV inside transaction', err);
      res.status(500).json({ error: 'Database transaction failed during student import' });
    } finally {
      client.release();
    }
  } catch (err) {
    logger.error('Failed to import students CSV', err);
    res.status(500).json({ error: 'Failed to import students CSV' });
  }
};

export const importFaculty = async (req, res) => {
  try {
    const csvContent = req.body.csvContent;
    if (!csvContent) {
      return res.status(400).json({ error: 'Missing csvContent field' });
    }
    const rows = parseCSV(csvContent);
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      for (const row of rows) {
        if (!row.email) continue;

        let password = row.password;
        if (!password) {
          password = (row.name || '').toLowerCase().replace(/\s+/g, '');
        }
        const hashedPassword = await bcrypt.hash(password, 10);

        await client.query(`
          INSERT INTO users (name, email, password, role, department_name)
          VALUES ($1, $2, $3, 'FACULTY', $4)
          ON CONFLICT (email) DO UPDATE SET 
            name = EXCLUDED.name,
            department_name = EXCLUDED.department_name
        `, [
          row.name || '',
          row.email.toLowerCase(),
          hashedPassword,
          row.department_name || ''
        ]);
      }

      if (req.user?.id) {
        await logActivity({
          userId: req.user.id,
          action: 'IMPORT_FACULTY_CSV',
          entityType: 'upload',
          details: { recordCount: rows.length }
        }, client);
      }

      await client.query('COMMIT');
      res.json({ success: true, message: `Successfully imported ${rows.length} faculty records` });
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error('Failed to import faculty CSV inside transaction', err);
      res.status(500).json({ error: 'Database transaction failed during faculty import' });
    } finally {
      client.release();
    }
  } catch (err) {
    logger.error('Failed to import faculty CSV', err);
    res.status(500).json({ error: 'Failed to import faculty CSV' });
  }
};

export const importTimetable = async (req, res) => {
  try {
    const csvContent = req.body.csvContent;
    if (!csvContent) {
      return res.status(400).json({ error: 'Missing csvContent field' });
    }
    const rows = parseCSV(csvContent);
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('TRUNCATE faculty_timetable_slots');
      for (const row of rows) {
        if (!row.faculty_name) continue;

        const isOccupied = row.is_occupied === 'true' || row.is_occupied === '1';

        await client.query(`
          INSERT INTO faculty_timetable_slots (faculty_name, semester, day_of_week, slot_time, content, is_occupied)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          row.faculty_name,
          row.semester || '',
          row.day_of_week || '',
          row.slot_time || '',
          row.content || '',
          isOccupied
        ]);
      }

      if (req.user?.id) {
        await logActivity({
          userId: req.user.id,
          action: 'IMPORT_TIMETABLE_CSV',
          entityType: 'upload',
          details: { recordCount: rows.length }
        }, client);
      }

      await client.query('COMMIT');
      res.json({ success: true, message: `Successfully imported ${rows.length} timetable records` });
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error('Failed to import timetable CSV inside transaction', err);
      res.status(500).json({ error: 'Database transaction failed during timetable import' });
    } finally {
      client.release();
    }
  } catch (err) {
    logger.error('Failed to import timetable CSV', err);
    res.status(500).json({ error: 'Failed to import timetable CSV' });
  }
};
