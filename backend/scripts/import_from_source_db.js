import pkg from 'pg';
const { Client } = pkg;

async function importData() {
  const sourceUrl = 'postgresql://roomuser:roompass@localhost:5432/roomdb_trial';
  const targetUrl = 'postgresql://roomuser:roompass@localhost:5432/roomdb_acl_test';

  console.log('Connecting to source (roomdb_trial) and target (roomdb_acl_test)...');
  const source = new Client({ connectionString: sourceUrl });
  const target = new Client({ connectionString: targetUrl });

  await source.connect();
  await target.connect();

  try {
    // 1. Import Departments
    console.log('Importing departments...');
    const deptRows = await source.query('SELECT id, name FROM departments ORDER BY id');
    for (const d of deptRows.rows) {
      await target.query(
        `INSERT INTO departments (id, name) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
        [d.id, d.name]
      );
    }
    await target.query(`SELECT setval(pg_get_serial_sequence('departments', 'id'), COALESCE(MAX(id), 1)) FROM departments`);
    console.log(`Imported ${deptRows.rowCount} departments.`);

    // 2. Import Faculty & Key Users (exclude existing ACL user if present)
    console.log('Importing faculty and key users...');
    const userRows = await source.query(`
      SELECT id, name, email, password, role, branch, year, section, department_id, is_approved
      FROM users
      WHERE role IN ('FACULTY', 'ADMIN', 'STUDENT_REP')
      ORDER BY id
    `);
    for (const u of userRows.rows) {
      // Don't overwrite Vasu if already registered with ACL
      if (u.email === 'vasu.goel.ug22@nsut.ac.in') continue;

      await target.query(
        `INSERT INTO users (id, name, email, password, role, branch, year, section, department_id, is_approved)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (id) DO UPDATE
         SET name = EXCLUDED.name, email = EXCLUDED.email, role = EXCLUDED.role, department_id = EXCLUDED.department_id`,
        [u.id, u.name, u.email, u.password || 'google_managed', u.role, u.branch, u.year, u.section, u.department_id, u.is_approved]
      );
    }
    await target.query(`SELECT setval(pg_get_serial_sequence('users', 'id'), COALESCE(MAX(id), 1)) FROM users`);
    console.log(`Imported ${userRows.rowCount} staff & representative users.`);

    // 3. Import Rooms
    console.log('Importing rooms...');
    const roomRows = await source.query(`
      SELECT id, name, building, floor, capacity, has_ac, has_projector, type, description, student_access
      FROM rooms
      ORDER BY id
    `);
    for (const r of roomRows.rows) {
      await target.query(
        `INSERT INTO rooms (id, name, building, floor, capacity, has_ac, has_projector, type, description, student_access)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (id) DO UPDATE
         SET name = EXCLUDED.name, building = EXCLUDED.building, floor = EXCLUDED.floor,
             capacity = EXCLUDED.capacity, has_ac = EXCLUDED.has_ac, has_projector = EXCLUDED.has_projector,
             type = EXCLUDED.type, description = EXCLUDED.description, student_access = EXCLUDED.student_access`,
        [r.id, r.name, r.building, r.floor, r.capacity, r.has_ac, r.has_projector, r.type, r.description, r.student_access]
      );
    }
    await target.query(`SELECT setval(pg_get_serial_sequence('rooms', 'id'), COALESCE(MAX(id), 1)) FROM rooms`);
    console.log(`Imported ${roomRows.rowCount} rooms.`);

    // 4. Import Room Availability
    console.log('Importing room availability...');
    const availRows = await source.query(`
      SELECT id, room_id, day, hour, is_available, user_id
      FROM room_availability
      ORDER BY id
    `);
    for (const a of availRows.rows) {
      await target.query(
        `INSERT INTO room_availability (id, room_id, day, hour, is_available, user_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE
         SET is_available = EXCLUDED.is_available, user_id = EXCLUDED.user_id`,
        [a.id, a.room_id, a.day, a.hour, a.is_available, a.user_id]
      );
    }
    await target.query(`SELECT setval(pg_get_serial_sequence('room_availability', 'id'), COALESCE(MAX(id), 1)) FROM room_availability`);
    console.log(`Imported ${availRows.rowCount} room availability records.`);

    // 5. Import Timetable Slots
    console.log('Importing timetable slots...');
    const slotCheck = await target.query('SELECT COUNT(*) FROM timetable_slots');
    if (parseInt(slotCheck.rows[0].count) < 100) {
      const slotRows = await source.query(`
        SELECT id, day, hour, branch_id, semester, section, group_name, room_id, subject_code, subject_name, teacher_name
        FROM timetable_slots
        ORDER BY id
      `);
      for (const s of slotRows.rows) {
        await target.query(
          `INSERT INTO timetable_slots (id, day, hour, branch_id, semester, section, group_name, room_id, subject_code, subject_name, teacher_name)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (id) DO NOTHING`,
          [s.id, s.day, s.hour, s.branch_id, s.semester, s.section, s.group_name, s.room_id, s.subject_code, s.subject_name, s.teacher_name]
        );
      }
      await target.query(`SELECT setval(pg_get_serial_sequence('timetable_slots', 'id'), COALESCE(MAX(id), 1)) FROM timetable_slots`);
      console.log(`Imported ${slotRows.rowCount} timetable slots.`);
    } else {
      console.log('Timetable slots already present in target DB.');
    }

    console.log('Data import completed successfully!');
  } catch (err) {
    console.error('Import error:', err);
  } finally {
    await source.end();
    await target.end();
  }
}

importData();
