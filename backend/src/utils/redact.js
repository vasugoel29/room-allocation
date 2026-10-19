/**
 * Prepares request data for the audit log: secrets are replaced, bulky payloads summarised,
 * so the audit trail never becomes a second copy of credentials or uploaded files (SEC-14).
 */
const SECRET_KEY = /pass(word)?|token|secret|credential|authorization|api[-_]?key|otp|cookie/i;
const BULK_KEY = /csv|content|file|data$/i;
const MAX_STRING = 200;
const MAX_ARRAY = 20;
const MAX_DEPTH = 4;

export function redactForAudit(value, depth = 0, key = '') {
  if (value === null || value === undefined) return value;
  if (key && SECRET_KEY.test(key)) return '[REDACTED]';
  if (typeof value === 'string') {
    if (key && /csv/i.test(key)) return `[${value.length} chars omitted]`;
    if (key && BULK_KEY.test(key) && value.length > MAX_STRING) return `[${value.length} chars omitted]`;
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}… [${value.length} chars]` : value;
  }
  if (typeof value !== 'object') return value;
  if (depth >= MAX_DEPTH) return '[nested]';
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ARRAY).map((v) => redactForAudit(v, depth + 1));
    return value.length > MAX_ARRAY ? [...items, `[+${value.length - MAX_ARRAY} more]`] : items;
  }
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redactForAudit(v, depth + 1, k)]));
}
