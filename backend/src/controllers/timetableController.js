import * as db from "../db.js";
import logger from "../utils/logger.js";

/**
 * Get the current semester/section timetable
 */
export const getTimetable = async (req, res) => {
  try {
    const { department, section, semester } = req.query;

    let query = `
      SELECT * FROM timetable_slots 
      WHERE 1=1
    `;
    const params = [];

    if (department) {
      params.push(department);
      query += ` AND department = $${params.length}`;
    }
    if (section) {
      params.push(section);
      query += ` AND section = $${params.length}`;
    }
    if (semester) {
      params.push(semester);
      query += ` AND semester = $${params.length}`;
    }

    query += " ORDER BY day_of_week, slot_time";

    const result = await db.query(query, params);
    
    // Group by day to match the structure the frontend expects
    const grouped = result.rows.reduce((acc, row) => {
      if (!acc[row.day_of_week]) acc[row.day_of_week] = [];
      acc[row.day_of_week].push({
        time: row.slot_time,
        subjectCode: row.subject_code,
        subjectName: row.subject_name,
        room: row.room_name,
        type: row.type,
        batch: row.batch,
        faculty: row.faculty_name,
        department: row.department,
        section: row.section,
        semester: row.semester
      });
      return acc;
    }, {});

    res.json(grouped);
  } catch (err) {
    logger.error("Failed to fetch timetable", err);
    res.status(500).json({ error: "Failed to fetch timetable" });
  }
};

/**
 * Bulk upload timetable slots from CSV
 */
export const uploadTimetable = async (req, res) => {
  const client = await db.pool.connect();
  try {
    const { slots } = req.body;
    if (!Array.isArray(slots)) {
      return res.status(400).json({ error: "Invalid data format. Expected 'slots' array." });
    }

    await client.query('BEGIN');

    // Optional: Clear existing timetable for specific context if needed
    // For now, we'll just append or handle conflicts based on unique constraints

    const insertQuery = `
      INSERT INTO timetable_slots (
        department, semester, section, day_of_week, slot_time, 
        subject_code, subject_name, room_name, type, batch, faculty_name
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (department, semester, section, day_of_week, slot_time) 
      DO UPDATE SET
        subject_code = EXCLUDED.subject_code,
        subject_name = EXCLUDED.subject_name,
        room_name = EXCLUDED.room_name,
        type = EXCLUDED.type,
        batch = EXCLUDED.batch,
        faculty_name = EXCLUDED.faculty_name
    `;

    for (const slot of slots) {
      await client.query(insertQuery, [
        slot.department, slot.semester, slot.section, slot.day, slot.time,
        slot.subjectCode, slot.subjectName, slot.room, slot.type, slot.batch, slot.faculty
      ]);
    }

    await client.query('COMMIT');
    res.json({ message: `Successfully uploaded ${slots.length} slots.` });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error("Failed to upload timetable", err);
    res.status(500).json({ error: "Failed to upload timetable" });
  } finally {
    client.release();
  }
};
