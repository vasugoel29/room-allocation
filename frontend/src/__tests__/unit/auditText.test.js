import { describe, it, expect } from 'vitest';
import { describeAudit } from '../../utils/auditText';

const http = (method, path, body = {}) => ({ action: 'X', details: { method, path, status: 200, body } });

describe('describeAudit', () => {
  it('request-audit rows read as what the person did', () => {
    expect(describeAudit(http('POST', '/api/auth/dev-login', { email: 'a@nsut.ac.in' }))).toBe('Signed in as a@nsut.ac.in.');
    expect(describeAudit(http('POST', '/api/auth/logout'))).toBe('Signed out.');
    expect(describeAudit(http('POST', '/api/bookings', {
      purpose: 'Class', room_id: 9, start_time: '2026-10-20T02:30:00.000Z', end_time: '2026-10-20T03:30:00.000Z',
    }))).toBe('Submitted a booking for room #9 on 20 Oct, 08:00–09:00 (Class).');
    expect(describeAudit(http('PATCH', '/api/bookings/12/cancel'))).toBe('Cancelled booking #12.');
    expect(describeAudit(http('PATCH', '/api/faculty/4/approve'))).toBe('Approved booking request #4.');
    expect(describeAudit(http('DELETE', '/api/rooms/31'))).toBe('Removed room #31; its upcoming bookings were cancelled.');
    expect(describeAudit(http('POST', '/api/rooms', { name: 'APJ-06', type: 'Lab', capacity: 45 }))).toBe('Added room APJ-06 (Lab, 45 seats).');
    expect(describeAudit(http('POST', '/api/availability/override', { day: 'Mon', hour: 9, room_name: 'T-101', is_available: false })))
      .toBe('Blocked room T-101 on Mon at 09:00.');
    expect(describeAudit(http('PATCH', '/api/timetable/cancellation-requests/7/reject'))).toBe('Rejected class-cancellation request #7.');
  });

  it('named service actions use their own details', () => {
    expect(describeAudit({ action: 'REQUEST_BOOKING', details: { room_id: 9, start_time: '2026-10-20T02:30:00.000Z', end_time: '2026-10-20T03:30:00.000Z' } }))
      .toBe('Requested room #9 on 20 Oct, 08:00–09:00; waiting for faculty approval.');
    expect(describeAudit({ action: 'APPROVE_BOOKING', entity_id: 5, details: { approved_by: 'FACULTY' } })).toBe('Approved booking #5 as the supervising faculty.');
    expect(describeAudit({ action: 'CANCEL_BOOKING', entity_id: 5, details: { previous_status: 'PENDING', by: 'creator' } }))
      .toBe('Cancelled booking #5 (by the booker) before it was approved.');
    expect(describeAudit({ action: 'COMPLETE_TRANSFER', details: { booking_id: 3, from_user: 1, to_user: 2 } })).toBe('Booking #3 moved from user #1 to user #2.');
    expect(describeAudit({ action: 'IMPORT_FACULTY_CSV', details: { created: 2, updated: 1, deactivated: 0, skipped: 3 } }))
      .toBe('Imported the faculty directory: 2 added, 1 updated, 0 deactivated, 3 skipped.');
  });

  it('never shows JSON: unknown routes and actions still get a sentence', () => {
    expect(describeAudit(http('POST', '/api/something-new/42/archive'))).toBe('Created something new #42 archive.');
    expect(describeAudit({ action: 'REBUILD_INDEX', details: {} })).toBe('Rebuild index.');
    expect(describeAudit({ action: 'REQUEST_BOOKING', details: null })).toBe('Requested a room; waiting for faculty approval.');
    expect(describeAudit({})).toBe('No details recorded.');
  });
});
