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
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const MAX_RETRIES = 4;
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

      // Handle 401 (Unauthorized/Token Expired) centrally
      if (response.status === 401 && !endpoint.includes('/auth/login')) {
        console.warn('Session expired or unauthorized. Logging out...');
        localStorage.removeItem('token');
        localStorage.removeItem('user');
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
