/**
 * lib/security.js
 * ---------------------------------------------------------------------------
 * Password hashing and JSON Web Token support built on Node's native `crypto`
 * module - no bcrypt / jsonwebtoken packages required.
 *
 *  - Passwords use scrypt (memory-hard KDF, OWASP recommended) with a unique
 *    128-bit random salt per user, compared in constant time.
 *  - Tokens are standards-compliant JWTs signed with HMAC-SHA256 (HS256) and
 *    verified with a constant-time signature comparison, including `exp`
 *    expiry checking.
 * ---------------------------------------------------------------------------
 */

'use strict';

const crypto = require('node:crypto');
const config = require('../config/config');

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

/* -------------------------------------------------------------------------- */
/* Passwords                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Hash a plain-text password.
 * @returns {string} "scrypt$<saltHex>$<hashHex>"
 */
function hashPassword(plain) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(
    String(plain),
    salt,
    config.auth.scryptKeyLength,
    SCRYPT_PARAMS
  );
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}

/** Constant-time verification of a password against a stored hash. */
function verifyPassword(plain, stored) {
  try {
    const [scheme, saltHex, hashHex] = String(stored).split('$');
    if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
    const expected = Buffer.from(hashHex, 'hex');
    const actual = crypto.scryptSync(
      String(plain),
      Buffer.from(saltHex, 'hex'),
      expected.length,
      SCRYPT_PARAMS
    );
    return crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/* JWT (HS256)                                                                */
/* -------------------------------------------------------------------------- */

function base64UrlEncode(input) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(input) {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(padded + '='.repeat((4 - (padded.length % 4)) % 4), 'base64').toString('utf8');
}

function sign(payload, { expiresIn = config.auth.jwtExpiresIn, secret = config.auth.jwtSecret } = {}) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const body = { ...payload, iat: issuedAt, exp: issuedAt + Number(expiresIn) };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedBody = base64UrlEncode(JSON.stringify(body));
  const data = `${encodedHeader}.${encodedBody}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(data)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return `${data}.${signature}`;
}

/**
 * Verify a token.
 * @throws {Error} with .statusCode 401 when the token is invalid or expired.
 */
function verify(token, { secret = config.auth.jwtSecret } = {}) {
  const fail = (message) => {
    throw Object.assign(new Error(message), { statusCode: 401 });
  };

  if (typeof token !== 'string') fail('Authentication token missing');
  const parts = token.split('.');
  if (parts.length !== 3) fail('Malformed authentication token');

  const [encodedHeader, encodedBody, signature] = parts;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedBody}`)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) fail('Invalid authentication token');

  let payload;
  try {
    payload = JSON.parse(base64UrlDecode(encodedBody));
  } catch {
    fail('Malformed authentication token');
  }

  const header = (() => {
    try {
      return JSON.parse(base64UrlDecode(encodedHeader));
    } catch {
      return null;
    }
  })();
  if (!header || header.alg !== 'HS256') fail('Unsupported token algorithm');

  if (typeof payload.exp === 'number' && payload.exp < Math.floor(Date.now() / 1000)) {
    fail('Session expired, please sign in again');
  }

  return payload;
}

module.exports = { hashPassword, verifyPassword, sign, verify };
