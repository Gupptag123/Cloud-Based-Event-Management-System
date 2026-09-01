/**
 * lib/errors.js
 * ---------------------------------------------------------------------------
 * Typed HTTP errors and a small helper for wrapping async route handlers.
 * ---------------------------------------------------------------------------
 */

'use strict';

class HttpError extends Error {
  constructor(statusCode, message, details) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    if (details) this.details = details;
  }
}

const badRequest = (message = 'Bad request', details) => new HttpError(400, message, details);
const unauthorized = (message = 'Authentication required') => new HttpError(401, message);
const forbidden = (message = 'You do not have permission to do that') => new HttpError(403, message);
const notFound = (message = 'Resource not found') => new HttpError(404, message);
const conflict = (message = 'Conflict', details) => new HttpError(409, message, details);
const unprocessable = (message = 'Validation failed', details) => new HttpError(422, message, details);

/** Wrap an async handler so rejected promises reach the error middleware. */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = {
  HttpError,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  unprocessable,
  asyncHandler,
};
