/**
 * middleware/auth.js
 * ---------------------------------------------------------------------------
 * JWT authentication and role-based authorization middleware.
 * ---------------------------------------------------------------------------
 */

'use strict';

const security = require('../lib/security');
const db = require('../lib/database');
const { unauthorized, forbidden } = require('../lib/errors');

function extractToken(req) {
  const header = req.headers.authorization || '';
  if (header.toLowerCase().startsWith('bearer ')) return header.slice(7).trim();
  if (req.query && req.query.token) return String(req.query.token);
  return null;
}

/** Require a valid token. Populates req.user with the fresh database record. */
function authenticate(req, res, next) {
  try {
    const token = extractToken(req);
    if (!token) throw unauthorized('Please sign in to continue');

    const payload = security.verify(token);
    const user = db.users.findById(payload.sub);
    if (!user) throw unauthorized('Your account no longer exists');

    delete user.password;
    req.user = user;
    req.token = token;
    next();
  } catch (err) {
    next(err);
  }
}

/** Attach req.user when a token is present, but never reject the request. */
function optionalAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) return next();
  try {
    const payload = security.verify(token);
    const user = db.users.findById(payload.sub);
    if (user) {
      delete user.password;
      req.user = user;
    }
  } catch {
    /* ignore invalid tokens on public endpoints */
  }
  next();
}

/** Require one of the given roles. `admin` is always allowed. */
function authorize(...roles) {
  const allowed = roles.flat();
  return function roleGuard(req, res, next) {
    if (!req.user) return next(unauthorized('Please sign in to continue'));
    if (req.user.role === 'admin' || allowed.includes(req.user.role)) return next();
    next(forbidden(`This action requires the ${allowed.join(' or ')} role`));
  };
}

module.exports = { authenticate, optionalAuth, authorize };
