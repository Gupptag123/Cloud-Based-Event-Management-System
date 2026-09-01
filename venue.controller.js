/**
 * controllers/venue.controller.js
 * ---------------------------------------------------------------------------
 * Venue management (organizer role).
 * ---------------------------------------------------------------------------
 */

'use strict';

const venueModel = require('../models/venue.model');
const { validator } = require('../lib/validate');
const { asyncHandler, notFound, forbidden, badRequest } = require('../lib/errors');

function parseFacilities(input) {
  if (Array.isArray(input)) return input.map((f) => String(f).trim()).filter(Boolean).slice(0, 15);
  if (typeof input === 'string') {
    return input.split(',').map((f) => f.trim()).filter(Boolean).slice(0, 15);
  }
  return [];
}

/** GET /api/venues */
const list = asyncHandler(async (req, res) => {
  const venues = venueModel.list({ city: req.query.city, search: req.query.search }).map((venue) => ({
    ...venue,
    eventCount: venueModel.eventCount(venue._id),
  }));
  res.json({ success: true, data: venues });
});

/** GET /api/venues/:id */
const getOne = asyncHandler(async (req, res) => {
  const venue = venueModel.findById(req.params.id);
  if (!venue) throw notFound('Venue not found');
  res.json({ success: true, data: { ...venue, eventCount: venueModel.eventCount(venue._id) } });
});

function validatePayload(body) {
  const data = validator(body || {})
    .string('name', { required: true, min: 2, max: 120, label: 'Venue name' })
    .string('address', { max: 240, label: 'Address' })
    .string('city', { required: true, min: 2, max: 80, label: 'City' })
    .integer('capacity', { required: true, min: 1, max: 1_000_000, label: 'Capacity' })
    .result();
  data.facilities = parseFacilities(body?.facilities);
  return data;
}

/** POST /api/venues */
const create = asyncHandler(async (req, res) => {
  const data = validatePayload(req.body);
  const venue = venueModel.create({ ...data, createdBy: req.user._id });
  res.status(201).json({ success: true, message: 'Venue added', data: venue });
});

/** PUT /api/venues/:id */
const update = asyncHandler(async (req, res) => {
  const existing = venueModel.findById(req.params.id);
  if (!existing) throw notFound('Venue not found');
  if (req.user.role !== 'admin' && existing.createdBy && existing.createdBy !== req.user._id) {
    throw forbidden('You can only edit venues you added');
  }
  const data = validatePayload({ ...existing, ...req.body });
  res.json({ success: true, message: 'Venue updated', data: venueModel.update(existing._id, data) });
});

/** DELETE /api/venues/:id */
const remove = asyncHandler(async (req, res) => {
  const existing = venueModel.findById(req.params.id);
  if (!existing) throw notFound('Venue not found');
  if (req.user.role !== 'admin' && existing.createdBy && existing.createdBy !== req.user._id) {
    throw forbidden('You can only delete venues you added');
  }
  const used = venueModel.eventCount(existing._id);
  if (used > 0) {
    throw badRequest(`This venue is used by ${used} active event(s) and cannot be deleted`);
  }
  venueModel.remove(existing._id);
  res.json({ success: true, message: 'Venue deleted', data: { _id: existing._id } });
});

module.exports = { list, getOne, create, update, remove };
