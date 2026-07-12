/**
 * Utility functions for standardizing API error responses
 */

export const sendError = (res, status, message) => {
  return res.status(status).json({ error: message });
};

export const sendServerError = (res, err, defaultMessage = 'Internal server error') => {
  return res.status(500).json({ error: err?.message || defaultMessage });
};
