/**
 * Section-timetable import, shared by the admin upload (POST /api/timetable/upload) and the
 * seeder's demo timetable. Re-importing rows that already exist (all columns equal) adds nothing
 * and duplicates within one batch collapse, so running the same import twice is harmless (OPS-14).
 * Runs inside the caller's transaction: any bad row rolls back the whole batch.
 */
export const SLOT_COLUMNS = ['department', 'semester', 'section', 'day_of_week', 'slot_time', 'subject_name', 'room_name', 'subject_code', 'faculty_name'];

export async function importSectionSlots(client, slots) {
  const seen = new Set();
  const unique = [];
  for (const slot of slots) {
    const row = SLOT_COLUMNS.map((c) => (slot?.[c] === undefined || slot?.[c] === null ? null : String(slot[c])));
    const key = JSON.stringify(row);
    if (!seen.has(key)) { seen.add(key); unique.push(row); }
  }

  let inserted = 0;
  const chunkSize = 200;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const placeholders = chunk.map((_, r) =>
      `(${SLOT_COLUMNS.map((__, c) => `$${r * SLOT_COLUMNS.length + c + 1}::text`).join(', ')})`);
    const result = await client.query(`
      INSERT INTO timetable_slots (${SLOT_COLUMNS.join(', ')})
      SELECT ${SLOT_COLUMNS.map((c) => `v.${c}`).join(', ')}
        FROM (VALUES ${placeholders.join(', ')}) AS v(${SLOT_COLUMNS.join(', ')})
       WHERE NOT EXISTS (
         SELECT 1 FROM timetable_slots t
          WHERE ${SLOT_COLUMNS.map((c) => `t.${c}::text IS NOT DISTINCT FROM v.${c}`).join(' AND ')}
       )
    `, chunk.flat());
    inserted += result.rowCount;
  }
  return { inserted, skipped: slots.length - inserted };
}
