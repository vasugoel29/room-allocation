import { validationResult } from 'express-validator';

export const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMsg = errors.array()[0].msg || 'Validation failed';
    return res.status(400).json({ error: errorMsg, details: errors.array() });
  }
  next();
};
