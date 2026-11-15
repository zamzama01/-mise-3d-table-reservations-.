import crypto from 'crypto';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import path from 'path';

function resolveJwtSecret() {
  const envSecret = String(process.env.JWT_SECRET || '').trim();
  if (envSecret && envSecret !== 'replace-with-a-long-random-secret') {
    return envSecret;
  }

  const dataDir = path.resolve(process.cwd(), 'data');
  const secretFile = path.join(dataDir, '.jwt_secret');
  try {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    if (fs.existsSync(secretFile)) {
      const stored = fs.readFileSync(secretFile, 'utf8').trim();
      if (stored.length >= 32) return stored;
    }
    const generated = crypto.randomBytes(48).toString('hex');
    fs.writeFileSync(secretFile, generated, { mode: 0o600 });
    return generated;
  } catch {
    return 'mise-persistent-fallback-jwt-key-change-in-production';
  }
}

const JWT_SECRET = resolveJwtSecret();

export function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Please sign in first.' });
    return;
  }

  const token = header.slice(7).trim();
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Session expired. Please sign in again.' });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      res.status(401).json({ error: 'Please sign in first.' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Permission denied.' });
      return;
    }
    next();
  };
}
