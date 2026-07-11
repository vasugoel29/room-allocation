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
    
    const processedRows = [];
    const batchSize = 10;
    for (let i = 0; i < rows.length; i += batchSize) {
      const chunk = rows.slice(i, i + batchSize);
      await Promise.all(chunk.map(async (row) => {
        if (!row.email) return;
        
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

        processedRows.push({
          name: row.name || '',
          email: row.email.toLowerCase(),
          password: hashedPassword,
          branch: row.branch || '',
          year,
          section,
          degree: row.degree || '',
          department_name: row.department_name || '',
          roll_no: row.roll_no || ''
        });
      }));
    }

    await db.runInTransaction(async (client) => {
      const chunkSize = 100;
      for (let i = 0; i < processedRows.length; i += chunkSize) {
        const chunk = processedRows.slice(i, i + chunkSize);
        const values = [];
        const placeholders = [];
        let index = 1;
        for (const row of chunk) {
          placeholders.push(`($${index}, $${index+1}, $${index+2}, 'VIEWER', $${index+3}, $${index+4}, $${index+5}, $${index+6}, $${index+7}, $${index+8})`);
          values.push(
            row.name,
            row.email,
            row.password,
            row.branch,
            row.year,
            row.section,
            row.degree,
            row.department_name,
            row.roll_no
          );
          index += 9;
        }

        const bulkQuery = `
          INSERT INTO users (name, email, password, role, branch, year, section, degree, department_name, roll_no)
          VALUES ${placeholders.join(', ')}
          ON CONFLICT (email) DO UPDATE SET 
            name = EXCLUDED.name,
            branch = EXCLUDED.branch,
            year = EXCLUDED.year,
            section = EXCLUDED.section,
            degree = EXCLUDED.degree,
            department_name = EXCLUDED.department_name,
            roll_no = EXCLUDED.roll_no
        `;
        await client.query(bulkQuery, values);
      }

      if (req.user?.id) {
        await logActivity({
          userId: req.user.id,
          action: 'IMPORT_STUDENTS_CSV',
          entityType: 'upload',
          details: { recordCount: rows.length }
        }, client);
      }
    });

    res.json({ success: true, message: `Successfully imported ${rows.length} student records` });
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
    
    const processedFaculty = [];
    const batchSize = 10;
    for (let i = 0; i < rows.length; i += batchSize) {
      const chunk = rows.slice(i, i + batchSize);
      await Promise.all(chunk.map(async (row) => {
        if (!row.email) return;

        let password = row.password;
        if (!password) {
          password = (row.name || '').toLowerCase().replace(/\s+/g, '');
        }
        const hashedPassword = await bcrypt.hash(password, 10);

        processedFaculty.push({
          name: row.name || '',
          email: row.email.toLowerCase(),
          password: hashedPassword,
          department_name: row.department_name || ''
        });
      }));
    }

    await db.runInTransaction(async (client) => {
      const chunkSize = 100;
      for (let i = 0; i < processedFaculty.length; i += chunkSize) {
        const chunk = processedFaculty.slice(i, i + chunkSize);
        const values = [];
        const placeholders = [];
        let index = 1;
        for (const row of chunk) {
          placeholders.push(`($${index}, $${index+1}, $${index+2}, 'FACULTY', $${index+3})`);
          values.push(
            row.name,
            row.email,
            row.password,
            row.department_name
          );
          index += 5;
        }

        const bulkQuery = `
          INSERT INTO users (name, email, password, role, department_name)
          VALUES ${placeholders.join(', ')}
          ON CONFLICT (email) DO UPDATE SET 
            name = EXCLUDED.name,
            department_name = EXCLUDED.department_name
        `;
        await client.query(bulkQuery, values);
      }

      if (req.user?.id) {
        await logActivity({
          userId: req.user.id,
          action: 'IMPORT_FACULTY_CSV',
          entityType: 'upload',
          details: { recordCount: rows.length }
        }, client);
      }
    });

    res.json({ success: true, message: `Successfully imported ${rows.length} faculty records` });
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

    await db.runInTransaction(async (client) => {
      await client.query('TRUNCATE faculty_timetable_slots');
      
      const chunkSize = 100;
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        const values = [];
        const placeholders = [];
        let index = 1;
        
        for (const row of chunk) {
          if (!row.faculty_name) continue;
          const isOccupied = row.is_occupied === 'true' || row.is_occupied === '1';
          placeholders.push(`($${index}, $${index+1}, $${index+2}, $${index+3}, $${index+4}, $${index+5})`);
          values.push(
            row.faculty_name,
            row.semester || '',
            row.day_of_week || '',
            row.slot_time || '',
            row.content || '',
            isOccupied
          );
          index += 6;
        }

        if (placeholders.length > 0) {
          const bulkQuery = `
            INSERT INTO faculty_timetable_slots (faculty_name, semester, day_of_week, slot_time, content, is_occupied)
            VALUES ${placeholders.join(', ')}
          `;
          await client.query(bulkQuery, values);
        }
      }

      if (req.user?.id) {
        await logActivity({
          userId: req.user.id,
          action: 'IMPORT_TIMETABLE_CSV',
          entityType: 'upload',
          details: { recordCount: rows.length }
        }, client);
      }
    });

    res.json({ success: true, message: `Successfully imported ${rows.length} timetable records` });
  } catch (err) {
    logger.error('Failed to import timetable CSV', err);
    res.status(500).json({ error: 'Failed to import timetable CSV' });
  }
};
