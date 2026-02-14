import jwt from 'jsonwebtoken';

export const JWT_SECRET = 'your_jwt_secret';

// Middleware to check JWT and role
export function authenticate(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid token' });
  }
  try {
    const token = auth.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

export function requireRole(role) {
  return (req, res, next) => {
    // STUDENT_REP handles everything for now
    if (req.user.role !== role && req.user.role !== 'STUDENT_REP') { 
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}
