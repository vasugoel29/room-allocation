// Single source of truth for the isolated e2e stack (ports + database).
export const E2E_DB_URL = process.env.E2E_DATABASE_URL || 'postgresql://roomuser:roompass@localhost:5432/roomdb_e2e_test';
export const API_PORT = Number(process.env.E2E_API_PORT || 4100);
export const WEB_PORT = Number(process.env.E2E_WEB_PORT || 5180);
export const API_URL = `http://localhost:${API_PORT}/api`;
export const WEB_URL = `http://localhost:${WEB_PORT}`;
export const JWT_SECRET = 'e2e_jwt_secret_do_not_use_elsewhere';
