/**
 * controllers/auth.controller.js
 * ---------------------------------------------------------------------------
 * Registration, login, session lookup and profile update.
 * ---------------------------------------------------------------------------
 */

'use strict';

const config = require('../config/config');
const security = require('../lib/security');
const userModel = require('../models/user.model');
const { validator } = require('../lib/validate');
const { asyncHandler, conflict, unauthorized, badRequest } = require('../lib/errors');

function issueToken(user) {
  return security.sign({ sub: user._id, role: user.role, email: user.email, name: user.name });
}

/** POST /api/auth/register */
const register = asyncHandler(async (req, res) => {
  const data = validator(req.body || {})
    .string('name', { required: true, min: 2, max: 80, label: 'Full name' })
    .email('email', { required: true, label: 'Email' })
    .password('password', { required: true, min: 6, label: 'Password' })
    .oneOf('role', ['organizer', 'participant'], { label: 'Role' })
    .phone('phone', { label: 'Phone number' })
    .string('organization', { max: 120, label: 'Organization' })
    .result();

  if (userModel.findByEmail(data.email)) {
    throw conflict('An account with that email already exists');
  }

  const user = userModel.create({
    name: data.name,
    email: data.email,
    password: data.password,
    role: data.role || 'participant',
    phone: data.phone || '',
    organization: data.organization || '',
  });

  res.status(201).json({
    success: true,
    message: 'Account created successfully',
    data: { token: issueToken(user), user: userModel.toPublic(user) },
  });
});

/** POST /api/auth/login */
const login = asyncHandler(async (req, res) => {
  const data = validator(req.body || {})
    .email('email', { required: true, label: 'Email' })
    .password('password', { required: true, min: 1, label: 'Password' })
    .result();

  const user = userModel.findByEmail(data.email);
  // Same message for unknown email and wrong password (no account enumeration).
  if (!user || !security.verifyPassword(data.password, user.password)) {
    throw unauthorized('Incorrect email or password');
  }

  res.json({
    success: true,
    message: `Welcome back, ${user.name.split(' ')[0]}!`,
    data: { token: issueToken(user), user: userModel.toPublic(user) },
  });
});

/** GET /api/auth/me */
const me = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { user: userModel.toPublic(req.user) } });
});

/** PUT /api/auth/me */
const updateProfile = asyncHandler(async (req, res) => {
  const data = validator(req.body || {})
    .string('name', { min: 2, max: 80, label: 'Full name' })
    .phone('phone', { label: 'Phone number' })
    .string('organization', { max: 120, label: 'Organization' })
    .result();

  const updated = userModel.update(req.user._id, data);
  res.json({ success: true, message: 'Profile updated', data: { user: userModel.toPublic(updated) } });
});

/** PUT /api/auth/password */
const changePassword = asyncHandler(async (req, res) => {
  const data = validator(req.body || {})
    .password('currentPassword', { required: true, min: 1, label: 'Current password' })
    .password('newPassword', { required: true, min: 6, label: 'New password' })
    .result();

  const user = userModel.findById(req.user._id);
  if (!security.verifyPassword(data.currentPassword, user.password)) {
    throw badRequest('Your current password is incorrect');
  }

  userModel.update(user._id, { password: data.newPassword });
  res.json({ success: true, message: 'Password changed successfully' });
});

/** GET /api/auth/config - non-secret values the frontend needs. */
const clientConfig = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: {
      categories: config.eventCategories,
      eventStatuses: config.eventStatuses,
      registrationStatuses: config.registrationStatuses,
      roles: ['organizer', 'participant'],
    },
  });
});

module.exports = { register, login, me, updateProfile, changePassword, clientConfig };
