import { timetableRepository as tt, sectionKey } from '../repositories/timetableRepository.js';
import { notify, personName } from '../notifications/notify.js';
import { formatIstRange, istDateTimeToUtc } from '../utils/timezone.js';
import { logActivity } from './auditLogService.js';

/**
 * An admin booking over a timetabled class cancels that class for the booked date (decision
 * 2026-10-22): the room is released for those hours, the teacher's own record shows the class
 * cancelled, and the teacher and the section's students are told. Everything is tied to the
 * booking, so cancelling or moving it puts the class back (and tells the same people).
 */

/** One entry per class with the hours it loses: [{ cls, hours: [h…] }]. */
function groupByClass(hits) {
  const byClass = new Map();
  for (const { cls, hour } of hits) {
    const key = `${cls.kind}:${cls.id}`;
    if (!byClass.has(key)) byClass.set(key, { cls, hours: [] });
    byClass.get(key).hours.push(hour);
  }
  return [...byClass.values()];
}

/** Who a class concerns: its teacher (directory id) and, for a section class, the section's students. */
async function stakeholders(client, cls) {
  const recipients = [];
  if (cls.faculty_id) recipients.push({ facultyId: cls.faculty_id });
  const key = cls.kind === 'section' ? sectionKey({ branch: cls.department, semester: cls.semester, section: cls.section }) : null;
  if (key) {
    const { rows } = await client.query(
      `SELECT id FROM users WHERE is_active AND UPPER(TRIM(branch)) = $1 AND semester = $2 AND section = $3`,
      [key.department, key.semester, key.section],
    );
    recipients.push(...rows.map((r) => ({ userId: r.id })));
  }
  return recipients;
}

const classFacts = (cls, roomName, dateKey, hours) => {
  const { date, time } = formatIstRange(istDateTimeToUtc(dateKey, Math.min(...hours)), istDateTimeToUtc(dateKey, Math.max(...hours) + 1));
  return { subject: cls.subject_name || 'Your class', roomName, date, time };
};

/** Cancels the classes `hits` (from bookingRules.unreleasedClassesAt) for this booking's date. */
export async function cancelClassesForBooking(client, { booking, room, t, hits, actor }) {
  if (!hits.length) return [];
  const by = await personName(client, actor.id, 'The administration');
  const groups = groupByClass(hits);
  for (const hour of [...new Set(hits.map((h) => h.hour))]) {
    await tt.release({ roomId: room.id, date: t.dateKey, startHour: hour, endHour: hour + 1, sourceType: 'admin_booking', sourceId: booking.id, by: actor.id }, client);
  }
  for (const { cls, hours } of groups) {
    if (cls.faculty_id) {
      for (const hour of hours) {
        // The teacher is free then and their timetable drops the class; a cancellation they made
        // themselves is left as theirs.
        await client.query(
          `INSERT INTO faculty_slot_overrides (faculty_id, date, hour, is_cancelled, created_by, booking_id)
           VALUES ($1, $2, $3, TRUE, $4, $5)
           ON CONFLICT (faculty_id, date, hour) DO UPDATE SET is_cancelled = TRUE, created_by = EXCLUDED.created_by, booking_id = EXCLUDED.booking_id
            WHERE NOT faculty_slot_overrides.is_cancelled`,
          [cls.faculty_id, t.dateKey, hour, actor.id, booking.id],
        );
      }
    }
    await notify(client, await stakeholders(client, cls), 'class_cancelled_for_booking', { ...classFacts(cls, room.name, t.dateKey, hours), by },
      { actorId: actor.id, entityType: 'booking', entityId: booking.id });
  }
  await logActivity({
    userId: actor.id, action: 'CANCEL_CLASS_FOR_BOOKING', entityType: 'booking', entityId: booking.id,
    details: { room_id: room.id, date: t.dateKey, classes: groups.map(({ cls, hours }) => ({ kind: cls.kind, id: cls.id, subject: cls.subject_name, hours })) },
  }, client);
  return groups;
}

/**
 * Puts back the classes a booking had cancelled (the booking was cancelled or moved). Tells the
 * same people unless `quiet` (bulk cancellations when a room or account is removed).
 */
export async function restoreClassesForBookings(client, bookingIds, { actorId = null, reason = 'cancelled', quiet = false } = {}) {
  const ids = [].concat(bookingIds).filter((id) => id != null);
  if (!ids.length) return;
  const { rows: releases } = await client.query(
    `UPDATE room_slot_releases SET is_active = FALSE, deactivated_at = NOW()
      WHERE source_type = 'admin_booking' AND source_id = ANY($1) AND is_active
      RETURNING room_id, release_date::text AS date, start_hour`,
    [ids],
  );
  await client.query(
    'UPDATE faculty_slot_overrides SET is_cancelled = FALSE WHERE booking_id = ANY($1) AND is_cancelled', [ids],
  );
  if (quiet || !releases.length) return;
  // Re-derive the classes from the released room-hours and tell their people.
  const byRoomDate = new Map();
  for (const r of releases) {
    const k = `${r.room_id}|${r.date}`;
    if (!byRoomDate.has(k)) byRoomDate.set(k, { roomId: r.room_id, date: r.date, hours: [] });
    byRoomDate.get(k).hours.push(r.start_hour);
  }
  for (const { roomId, date, hours } of byRoomDate.values()) {
    const { rows: [room] } = await client.query('SELECT name FROM rooms WHERE id = $1', [roomId]);
    const day = new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
    const classes = await tt.roomClasses(roomId, day, client);
    for (const cls of classes) {
      const lost = hours.filter((h) => cls.start_min < h * 60 + 60 && h * 60 < cls.end_min);
      if (!lost.length) continue;
      await notify(client, await stakeholders(client, cls), 'class_restored', { ...classFacts(cls, room?.name, date, lost), reason },
        { actorId, entityType: 'booking', entityId: ids[0] });
    }
  }
}
