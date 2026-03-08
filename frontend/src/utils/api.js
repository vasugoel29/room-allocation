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

  const executeFetch = () => fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  try {
    let response = await executeFetch();
    
    // If it's a 503 (often Render cold start/db connecting), retry once after a short delay
    if (response.status === 503) {
      console.warn('Backend is waking up (503), retrying in 2 seconds...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      response = await executeFetch();
    }
    
    return response;
  } catch (err) {
    // If it literally failed to fetch (network error), try once more
    console.warn('Fetch failed, retrying once...', err);
    await new Promise(resolve => setTimeout(resolve, 1500));
    return executeFetch();
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
