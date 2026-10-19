export const LOAD_DB_URL = process.env.LOAD_DATABASE_URL || 'postgresql://roomuser:roompass@localhost:5432/roomdb_load_test';
export const LOAD_API_PORT = Number(process.env.LOAD_API_PORT || 4200);
export const LOAD_JWT_SECRET = 'load_jwt_secret_do_not_use_elsewhere';
