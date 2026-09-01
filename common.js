/**
 * middleware/common.js
 * ---------------------------------------------------------------------------
 * Cross-cutting middleware: request logging, CORS, security headers, a simple
 * in-memory rate limiter for auth endpoints, 404 handling and the central
 * error handler.
 * ---------------------------------------------------------------------------
 */

'use strict';

const config = require('../config/config');
const { HttpError, notFound } = require('../lib/errors');

/* --------------------------------- logging -------------------------------- */

function requestLogger(req, res, next) {
  const startedAt = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const code = res.statusCode;
    const colour = code >= 500 ? '\x1b[31m' : code >= 400 ? '\x1b[33m' : '\x1b[32m';
    const line = `${req.method.padEnd(6)} ${(req.path || req.url).padEnd(42)} ${colour}${code}\x1b[0m  ${ms.toFixed(1)}ms`;
    if (!(req.path || '').startsWith('/css') && !(req.path || '').startsWith('/js')) {
      console.log(`  ${line}`);
    }
  });
  next();
}

/* ----------------------------------- CORS --------------------------------- */

function cors(req, res, next) {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Access-Control-Max-Age', '600');
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  next();
}

/* ----------------------------- security headers --------------------------- */

function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-XSS-Protection', '0');
  next();
}

/* ------------------------------- rate limiting ---------------------------- */

const buckets = new Map();

/**
 * Very small fixed-window limiter. Protects login/register from brute force.
 */
function rateLimit({ windowMs = 60_000, max = 30, key = 'global' } = {}) {
  return function limiter(req, res, next) {
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    const bucketKey = `${key}:${ip}`;
    const now = Date.now();
    const bucket = buckets.get(bucketKey);

    if (!bucket || now > bucket.resetAt) {
      buckets.set(bucketKey, { count: 1, resetAt: now + windowMs });
      return next();
    }

    bucket.count += 1;
    if (bucket.count > max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      return next(new HttpError(429, `Too many attempts. Please try again in ${retryAfter}s.`));
    }
    next();
  };
}

/* Periodically drop expired buckets so the map cannot grow unbounded. */
const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets) if (now > v.resetAt) buckets.delete(k);
}, 60_000);
sweeper.unref?.();

/* -------------------------------- 404 + errors ---------------------------- */

function apiNotFound(req, res, next) {
  next(notFound(`No API route matches ${req.method} ${req.path}`));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = err.statusCode || err.status || 500;

  if (status >= 500) {
    console.error('\x1b[31m[error]\x1b[0m', err.stack || err.message);
  }

  if (res.headersSent) return res.end();

  res.statusCode = status;
  const body = {
    success: false,
    message:
      status >= 500 && config.env === 'production'
        ? 'Something went wrong on the server'
        : err.message || 'Unexpected error',
  };
  if (err.details) body.errors = err.details;
  if (status >= 500 && config.env !== 'production') body.stack = (err.stack || '').split('\n').slice(0, 5);

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

module.exports = {
  requestLogger,
  cors,
  securityHeaders,
  rateLimit,
  apiNotFound,
  errorHandler,
};
