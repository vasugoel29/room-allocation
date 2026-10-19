import { vi } from 'vitest';

/** Build a minimal fetch Response-like object (real Response exists in Node 22, use it). */
export const jsonResponse = (body, status = 200) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

/**
 * Install a fetch mock driven by a route table.
 * routes: Array<[method, matcher(string|RegExp), handler(url, init) | body]>
 * Unmatched requests resolve 404 {} so tests never hit the network.
 * Returns the vi.fn so tests can inspect calls.
 */
export function installFetch(routes = []) {
  const fn = vi.fn(async (url, init = {}) => {
    const method = (init.method || 'GET').toUpperCase();
    for (const [m, matcher, handler] of routes) {
      if (m !== '*' && m.toUpperCase() !== method) continue;
      const hit = typeof matcher === 'string' ? url === matcher || url.startsWith(matcher + '?') : matcher.test(url);
      if (!hit) continue;
      const out = typeof handler === 'function' ? await handler(url, init) : handler;
      if (out instanceof Response) return out;
      return jsonResponse(out);
    }
    return jsonResponse({ error: `unmocked ${method} ${url}` }, 404);
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

/** All [method, url, parsedBody] tuples the fetch mock received. */
export const fetchCalls = (fn) =>
  fn.mock.calls.map(([url, init = {}]) => [
    (init.method || 'GET').toUpperCase(),
    url,
    init.body ? JSON.parse(init.body) : undefined,
  ]);
