import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiFetch, api } from '../../utils/api';
import { jsonResponse } from '../utils/http';

describe('utils/api apiFetch', () => {
  let fetchMock;

  beforeEach(() => {
    localStorage.clear();
    fetchMock = vi.fn(async () => jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('prefixes the base URL (/api when VITE_API_URL unset) and sends JSON content type', async () => {
    await apiFetch('/rooms');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/rooms');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.headers.Authorization).toBeUndefined();
  });

  it('attaches Bearer token from localStorage', async () => {
    localStorage.setItem('token', 'abc.def');
    await apiFetch('/rooms');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer abc.def');
  });

  it('lets caller headers override defaults', async () => {
    localStorage.setItem('token', 't');
    await apiFetch('/x', { headers: { 'Content-Type': 'text/csv', 'X-A': '1' } });
    const h = fetchMock.mock.calls[0][1].headers;
    expect(h['Content-Type']).toBe('text/csv');
    expect(h['X-A']).toBe('1');
    expect(h.Authorization).toBe('Bearer t');
  });

  it('api.get/post/patch/delete build method + JSON body', async () => {
    await api.get('/a');
    await api.post('/b', { x: 1 });
    await api.patch('/c', { y: 2 });
    await api.delete('/d');
    const calls = fetchMock.mock.calls.map(([u, i]) => [i.method, u, i.body]);
    expect(calls).toEqual([
      ['GET', '/api/a', undefined],
      ['POST', '/api/b', '{"x":1}'],
      ['PATCH', '/api/c', '{"y":2}'],
      ['DELETE', '/api/d', undefined],
    ]);
  });

  it('api.patch with no body sends no body (JSON.stringify(undefined))', async () => {
    await api.patch('/bookings/1/cancel');
    expect(fetchMock.mock.calls[0][1].body).toBeUndefined();
  });

  it('returns non-OK JSON error responses to the caller unchanged (no throw)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'Room taken' }, 409));
    const res = await apiFetch('/bookings', { method: 'POST', body: '{}' });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'Room taken' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('401 on a protected endpoint clears user + token and returns the response', async () => {
    localStorage.setItem('token', 't');
    localStorage.setItem('user', '{"id":1}');
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'expired' }, 401));
    // window.location.reload is not implemented by jsdom (logs only); we assert the storage side effects.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await apiFetch('/bookings');
    expect(res.status).toBe(401);
    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
  });

  it.each(['/auth/google', '/auth/dev-login'])('401 from sign-in call %s does NOT log the user out', async (endpoint) => {
    localStorage.setItem('token', 'keep');
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'Not allowed' }, 401));
    const res = await apiFetch(endpoint, { method: 'POST', body: '{}' });
    expect(res.status).toBe(401);
    expect(localStorage.getItem('token')).toBe('keep');
  });

  it('retries 503/504 with exponential backoff then returns the eventual response', async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}, 503))
      .mockResolvedValueOnce(jsonResponse({}, 504))
      .mockResolvedValueOnce(jsonResponse({ ok: 1 }, 200));
    const p = apiFetch('/health');
    await vi.advanceTimersByTimeAsync(1999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1); // 2s
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(4000); // +4s
    const res = await p;
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('gives up after 4 retries on persistent 503 and returns the last 503', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(async () => jsonResponse({}, 503));
    const p = apiFetch('/health');
    await vi.advanceTimersByTimeAsync(2000 + 4000 + 8000 + 16000);
    const res = await p;
    expect(res.status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it('GET network errors are retried and eventually rethrown', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(async () => { throw new TypeError('Failed to fetch'); });
    const p = apiFetch('/rooms').catch((e) => e);
    await vi.advanceTimersByTimeAsync(30000);
    const err = await p;
    expect(err).toBeInstanceOf(TypeError);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  // FE-10: a POST that reached the server but whose response was lost (network error) is replayed
  // up to 4 more times → duplicate bookings/imports. Correct: never auto-retry non-idempotent methods.
  it('[FE-10] does not retry a non-idempotent POST after a network error', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(async () => { throw new TypeError('Failed to fetch'); });
    const p = api.post('/bookings', { room_id: 1 }).catch((e) => e);
    await vi.advanceTimersByTimeAsync(30000);
    const err = await p;
    expect(err).toBeInstanceOf(TypeError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('[FE-10] does not retry a non-idempotent PATCH after a network error', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(async () => { throw new TypeError('Failed to fetch'); });
    const p = api.patch('/transfers/5/accept').catch((e) => e);
    await vi.advanceTimersByTimeAsync(30000);
    await p;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
