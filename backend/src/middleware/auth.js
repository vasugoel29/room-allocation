import jwt from 'jsonwebtoken';

export const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_fallback_only';

// Middleware to check JWT and role
export function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid token' });
  }
  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

const roleHierarchy = {
  'VIEWER': 1,
  'STUDENT_REP': 2,
  'FACULTY': 3,
  'admin': 4
};

export function requireRole(minimumRole) {
  return (req, res, next) => {
    const userRoleValue = roleHierarchy[req.user.role] || 0;
    const requiredRoleValue = roleHierarchy[minimumRole] || 0;
    
    if (userRoleValue < requiredRoleValue) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}
