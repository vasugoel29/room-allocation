import jwt from 'jsonwebtoken';

if (!process.env.JWT_SECRET) {
  console.error('CRITICAL: JWT_SECRET environment variable is not set!');
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
}
export const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_fallback_only_for_non_production';
// Note: In production, the app will exit if JWT_SECRET is missing.
// For development, we keep a fallback to avoid blocking the team, but warn loudly.

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
  'ADMIN': 4
};

export function requireRole(minimumRole) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const userRoleValue = roleHierarchy[req.user.role] || 0;
    const requiredRoleValue = roleHierarchy[minimumRole] || 0;
    
    if (userRoleValue < requiredRoleValue) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

/**
 * Middleware to check if the authenticated user has a specific resource permission
 * from the institutional Access Control Layer (ACL).
 * @param {string} resource - The resource permission name, e.g. 'rooms:view', 'rooms:book'
 * @param {string} [fallbackRole] - Optional fallback role (e.g. 'STUDENT_REP')
 */
export function requireResource(resource, fallbackRole = null) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Admin always has all resource permissions
    if (req.user.role === 'ADMIN' || (Array.isArray(req.user.roles) && req.user.roles.includes('ADMIN'))) {
      return next();
    }

    // Direct resource check against ACL permissions
    if (Array.isArray(req.user.permissions) && req.user.permissions.includes(resource)) {
      return next();
    }

    // Fallback to role hierarchy if a fallbackRole was supplied
    if (fallbackRole) {
      const userRoleValue = roleHierarchy[req.user.role] || 0;
      const requiredRoleValue = roleHierarchy[fallbackRole] || 0;
      if (userRoleValue >= requiredRoleValue) {
        return next();
      }
    }

    return res.status(403).json({
      error: `Forbidden: You do not have access to resource '${resource}'.`
    });
  };
}
