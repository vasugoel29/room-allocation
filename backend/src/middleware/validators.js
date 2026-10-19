import { body, query } from 'express-validator';
import { isDateKey } from '../utils/timezone.js';
import { validateRequest } from './validate.js';

/**
 * Shared request validation (P6.1): malformed input is a 400 with a readable message, never a
 * 500 from deep inside a controller. Routes compose these with `validate(...)`.
 */

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MAX_INT = 2_147_483_647;

/** router.param guard: ids in the path must be positive 32-bit integers (NEW-bookings-5). */
export const idParamWith = (message) => (req, res, next, value, name) => {
  if (!/^[1-9]\d{0,9}$/.test(String(value)) || Number(value) > MAX_INT) {
    return res.status(400).json({ error: message || `Invalid ${name}` });
  }
  next();
};
export const idParam = idParamWith();

const where = (location) => (location === 'query' ? query : body);

/** A real calendar date, YYYY-MM-DD. */
export const dateKey = (field, { location = 'query', optional = false, label = field } = {}) => {
  const chain = where(location)(field);
  return (optional ? chain.optional({ values: 'falsy' }) : chain.exists({ values: 'falsy' }).withMessage(`${label} is required (YYYY-MM-DD)`).bail())
    .custom(isDateKey).withMessage(`${label} must be a date (YYYY-MM-DD)`);
};

/** An hour of the day, 0–23 (converted to a number). */
export const hour = (field, { location = 'query', optional = false, label = field, min = 0, max = 23 } = {}) => {
  const chain = where(location)(field);
  return (optional ? chain.optional() : chain.exists({ values: 'null' }).withMessage(`${label} is required`).bail())
    .isInt({ min, max }).withMessage(`${label} must be a whole hour between ${min} and ${max}`).toInt();
};

/** A positive whole number (converted). */
export const positiveInt = (field, { location = 'body', optional = false, label = field, max = MAX_INT } = {}) => {
  const chain = where(location)(field);
  return (optional ? chain.optional({ values: 'null' }) : chain.exists({ values: 'null' }).withMessage(`${label} is required`).bail())
    .isInt({ min: 1, max }).withMessage(`${label} must be a whole number of at least 1`).toInt();
};

/** Required free text, trimmed, with a length cap. */
export const text = (field, { location = 'body', optional = false, label = field, max = 255 } = {}) => {
  const chain = where(location)(field);
  return (optional ? chain.optional({ values: 'null' }) : chain.exists({ values: 'falsy' }).withMessage(`${label} is required`).bail())
    .isString().withMessage(`${label} must be text`).bail()
    .trim().notEmpty().withMessage(`${label} is required`)
    .isLength({ max }).withMessage(`${label} must be at most ${max} characters`);
};

/** A strict boolean (true/false, not "yes" or missing). */
export const bool = (field, { location = 'body', optional = false, label = field } = {}) => {
  const chain = where(location)(field);
  return (optional ? chain.optional({ values: 'null' }) : chain.exists({ values: 'null' }).withMessage(`${label} is required`).bail())
    .isBoolean({ strict: true }).withMessage(`${label} must be true or false`);
};

/** One of a fixed set of values. */
export const oneOf = (field, values, { location = 'body', optional = false, label = field } = {}) => {
  const chain = where(location)(field);
  return (optional ? chain.optional({ values: 'falsy' }) : chain.exists({ values: 'falsy' }).withMessage(`${label} is required`).bail())
    .isIn(values).withMessage(`${label} must be one of ${values.join(', ')}`);
};

/** Pagination: page >= 1, limit 1..max (converted). */
export const pagination = ({ max = 100 } = {}) => [
  query('page').optional().isInt({ min: 1 }).withMessage('page must be a whole number of at least 1').toInt(),
  query('limit').optional().isInt({ min: 1, max }).withMessage(`limit must be between 1 and ${max}`).toInt(),
];

export const validate = (...chains) => [...chains.flat(), validateRequest];
