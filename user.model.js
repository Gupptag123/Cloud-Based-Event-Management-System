/**
 * models/user.model.js
 * ---------------------------------------------------------------------------
 * User document helpers: creation, lookup and safe serialization.
 * Schema: _id, name, email, password(hash), role, phone, organization,
 *         createdAt, updatedAt
 * ---------------------------------------------------------------------------
 */

'use strict';

const db = require('../lib/database');
const security = require('../lib/security');

/** Remove the password hash before a document ever leaves the API. */
function toPublic(user) {
  if (!user) return null;
  const { password, ...safe } = user;
  return safe;
}

function findByEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  return db.users.findOne((u) => u.email === normalized);
}

function findById(id) {
  return db.users.findById(id);
}

function create({ name, email, password, role = 'participant', phone = '', organization = '' }) {
  return db.users.create({
    name,
    email: String(email).trim().toLowerCase(),
    password: security.hashPassword(password),
    role,
    phone,
    organization,
  });
}

function update(id, patch) {
  const clean = { ...patch };
  if (clean.password) clean.password = security.hashPassword(clean.password);
  if (clean.email) clean.email = String(clean.email).trim().toLowerCase();
  return db.users.updateById(id, clean);
}

/** Display name lookup used when embedding organizer details in events. */
function briefById(id) {
  const user = db.users.findById(id);
  if (!user) return null;
  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    organization: user.organization || '',
    role: user.role,
  };
}

module.exports = { toPublic, findByEmail, findById, create, update, briefById };
