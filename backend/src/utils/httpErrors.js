import logger from './logger.js';

/**
 * Utility functions for standardizing API error responses.
 * Internal details (SQL errors, stack traces, exception text) are logged, never sent (SEC-12).
 */

export const GENERIC_SERVER_ERROR = 'Something went wrong on our side. Please try again.';

// Postgres errors that mean "bad request", not "server broke". The client gets a plain message;
// constraint/table/column names never leave the server.
const PG_CLIENT_ERRORS = {
  '23505': [409, 'That already exists.'],
  '23503': [400, 'A referenced record does not exist.'],
  '23502': [400, 'A required field is missing.'],
  '23514': [400, 'A value is out of the allowed range.'],
  '22P02': [400, 'A value has the wrong format.'],
  '22003': [400, 'A number is out of range.'],
  '22007': [400, 'A date or time has the wrong format.'],
  '22008': [400, 'A date or time is out of range.'],
  '22001': [400, 'A value is too long.'],
};

export const sendServerError = (res, err, message = GENERIC_SERVER_ERROR) => {
  const mapped = err && PG_CLIENT_ERRORS[err.code];
  if (mapped) {
    logger.warn(`${message} (client error ${err.code})`, { detail: err.detail, constraint: err.constraint });
    return res.status(mapped[0]).json({ error: mapped[1] });
  }
  logger.error(message, err);
  return res.status(500).json({ error: message });
};
