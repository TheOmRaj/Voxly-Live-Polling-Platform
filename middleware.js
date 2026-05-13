const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET || 'pollify-jwt-secret-dev';

function authenticate(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'No token provided' });
  try {
    const payload = jwt.verify(auth.split(' ')[1], SECRET);
    req.user = { id: payload.sub, name: payload.name, email: payload.email };
    next();
  } catch (e) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function optionalAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(auth.split(' ')[1], SECRET);
      req.user = { id: payload.sub, name: payload.name, email: payload.email };
    } catch { }
  }
  next();
}

function requireScope(scope) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const tokenScope = req.user.scope || '';
    if (!tokenScope.includes(scope)) return res.status(403).json({ error: 'Insufficient scope' });
    next();
  };
}

module.exports = { authenticate, optionalAuth, requireScope };
