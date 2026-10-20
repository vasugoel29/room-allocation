import { describe, it, expect } from 'vitest';
import { readJson } from '../../utils/api';

const response = (status, body) => new Response(body === undefined ? 'not json' : JSON.stringify(body), { status });

describe('readJson (one way to read API responses)', () => {
  it('returns the body of a successful response', async () => {
    expect(await readJson(response(200, { a: 1 }), 'x')).toEqual({ a: 1 });
  });
  it("throws the server's message with status, body and conflict", async () => {
    const err = await readJson(response(409, { error: 'Room is already booked', conflict: { type: 'room_booked' } }), 'Booking failed').catch((e) => e);
    expect(err).toMatchObject({ message: 'Room is already booked', status: 409, conflict: { type: 'room_booked' } });
  });
  it('falls back to the given message when the error has no JSON body', async () => {
    const err = await readJson(response(502), 'Failed to fetch rooms').catch((e) => e);
    expect(err).toMatchObject({ message: 'Failed to fetch rooms', status: 502 });
  });
});
