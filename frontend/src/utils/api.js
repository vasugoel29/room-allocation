// Allow Vercel to override the base URL by using environment variables.
// In local dev, it falls back to '/api' which uses the proxy in vite.config.js.
const BASE_URL = import.meta.env.VITE_API_URL || '/api';

/**
 * Standardized API fetch wrapper
 */
export async function apiFetch(endpoint, options = {}) {
  const token = localStorage.getItem('token');
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...options.headers,
  };

  // Only idempotent requests are retried automatically. A POST/PATCH/DELETE whose response was
  // lost may already have been applied (a booking created, a transfer accepted), so replaying it
  // could do it twice (FE-10); the caller reports the failure instead.
  const method = (options.method || 'GET').toUpperCase();
  const MAX_RETRIES = method === 'GET' || method === 'HEAD' ? 4 : 0;
  const RETRY_DELAY_BASE = 2000;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(`${BASE_URL}${endpoint}`, {
        ...options,
        headers,
      });

      // If it's a 503 (Render cold start) or 504 (Gateway timeout), retry
      if ((response.status === 503 || response.status === 504) && attempt < MAX_RETRIES) {
        const delay = RETRY_DELAY_BASE * Math.pow(2, attempt);
        console.warn(`Backend is waking up (${response.status}), retrying in ${delay / 1000}s (Attempt ${attempt + 1}/${MAX_RETRIES})...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      const isSignInCall = ['/auth/google', '/auth/dev-login'].some((p) => endpoint.startsWith(p));
      if (response.status === 401 && !isSignInCall) {
        console.warn('Session expired or unauthorized. Logging out...');
        localStorage.removeItem('user');
        localStorage.removeItem('token');
        window.location.reload(); // Force App to re-render and show Login
        return response; 
      }

      return response;
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        const delay = RETRY_DELAY_BASE * Math.pow(2, attempt);
        console.warn(`Fetch failed, retrying in ${delay / 1000}s (Attempt ${attempt + 1}/${MAX_RETRIES})...`, err);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw err;
    }
  }
}

/**
 * The JSON body of a successful response. Otherwise throws an Error with the server's message
 * (or `fallback`), carrying `status`, `conflict` and the error `body` for callers that need them.
 */
export async function readJson(res, fallback = 'Request failed') {
  if (res.ok) return res.json();
  const body = await res.json().catch(() => ({}));
  const err = new Error(body.error || fallback);
  err.status = res.status;
  err.body = body;
  if (body.conflict) err.conflict = body.conflict;
  throw err;
}

export const api = {
  get: (endpoint) => apiFetch(endpoint, { method: 'GET' }),
  post: (endpoint, body) => apiFetch(endpoint, { 
    method: 'POST', 
    body: JSON.stringify(body) 
  }),
  patch: (endpoint, body) => apiFetch(endpoint, { 
    method: 'PATCH', 
    body: JSON.stringify(body) 
  }),
  delete: (endpoint) => apiFetch(endpoint, { method: 'DELETE' }),
};

export default api;
