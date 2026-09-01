/**
 * controllers/registration.controller.js
 * ---------------------------------------------------------------------------
 * Participant registration and the organizer approve / reject workflow.
 * ---------------------------------------------------------------------------
 */

'use strict';

const registrationModel = require('../models/registration.model');
const eventModel = require('../models/event.model');
const { validator } = require('../lib/validate');
const { asyncHandler, notFound, forbidden } = require('../lib/errors');

/** The organizer of the parent event (or an admin) may act on a registration. */
function assertCanModerate(registration, user) {
  if (!registration) throw notFound('Registration not found');
  const event = eventModel.raw(registration.eventId);
  if (!event) throw notFound('The event for this registration no longer exists');
  if (user.role === 'admin') return event;
  if (event.organizerId !== user._id) {
    throw forbidden('You can only manage registrations for your own events');
  }
  return event;
}

/** POST /api/registrations - participant registers for an event. */
const create = asyncHandler(async (req, res) => {
  const data = validator(req.body || {})
    .string('eventId', { required: true, min: 4, max: 60, label: 'Event' })
    .string('notes', { max: 500, label: 'Notes' })
    .integer('seats', { min: 1, max: 10, label: 'Number of seats' })
    .result();

  const registration = registrationModel.register({
    eventId: data.eventId,
    userId: req.user._id,
    notes: data.notes || '',
    seats: data.seats || 1,
  });

  res.status(201).json({
    success: true,
    message: 'Registration submitted. You will be notified once the organizer reviews it.',
    data: registration,
  });
});

/** GET /api/registrations/mine - the signed-in participant's registrations. */
const listMine = asyncHandler(async (req, res) => {
  const rows = registrationModel.listForUser(req.user._id, {
    status: req.query.status,
    when: req.query.when || 'all',
  });
  const summary = rows.reduce(
    (acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    },
    { pending: 0, approved: 0, rejected: 0, cancelled: 0 }
  );
  res.json({ success: true, data: rows, meta: { total: rows.length, summary } });
});

/** GET /api/registrations - every registration across the organizer's events. */
const listForOrganizer = asyncHandler(async (req, res) => {
  const rows = registrationModel.listForOrganizer(req.user._id, {
    status: req.query.status,
    eventId: req.query.eventId,
    search: req.query.search,
    all: req.user.role === 'admin',
  });
  const summary = rows.reduce(
    (acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    },
    { pending: 0, approved: 0, rejected: 0, cancelled: 0 }
  );
  res.json({ success: true, data: rows, meta: { total: rows.length, summary } });
});

/** GET /api/registrations/:id */
const getOne = asyncHandler(async (req, res) => {
  const registration = registrationModel.findById(req.params.id);
  if (!registration) throw notFound('Registration not found');
  const isOwner = registration.userId === req.user._id;
  if (!isOwner) assertCanModerate(registration, req.user);
  res.json({ success: true, data: registrationModel.decorate(registration) });
});

/** PATCH /api/registrations/:id/decision - organizer approves or rejects. */
const decide = asyncHandler(async (req, res) => {
  const registration = registrationModel.findById(req.params.id);
  assertCanModerate(registration, req.user);

  const { status } = validator(req.body || {})
    .oneOf('status', ['approved', 'rejected', 'pending'], { required: true, label: 'Decision' })
    .result();

  const updated = registrationModel.decide(registration._id, status, req.user._id);
  const verb = status === 'approved' ? 'approved' : status === 'rejected' ? 'rejected' : 'moved back to pending';
  res.json({ success: true, message: `Registration ${verb}`, data: updated });
});

/** POST /api/registrations/bulk-decision - approve/reject many at once. */
const bulkDecide = asyncHandler(async (req, res) => {
  const { status } = validator(req.body || {})
    .oneOf('status', ['approved', 'rejected', 'pending'], { required: true, label: 'Decision' })
    .result();

  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  const results = { updated: [], failed: [] };

  for (const id of ids) {
    try {
      const registration = registrationModel.findById(id);
      assertCanModerate(registration, req.user);
      results.updated.push(registrationModel.decide(id, status, req.user._id));
    } catch (err) {
      results.failed.push({ id, message: err.message });
    }
  }

  res.json({
    success: true,
    message: `${results.updated.length} registration(s) ${status}${results.failed.length ? `, ${results.failed.length} failed` : ''}`,
    data: results,
  });
});

/** DELETE /api/registrations/:id - participant withdraws. */
const cancel = asyncHandler(async (req, res) => {
  const registration = registrationModel.findById(req.params.id);
  if (!registration) throw notFound('Registration not found');
  if (registration.userId !== req.user._id && req.user.role !== 'admin') {
    assertCanModerate(registration, req.user);
  }
  res.json({
    success: true,
    message: 'Registration cancelled',
    data: registrationModel.cancel(registration._id),
  });
});

module.exports = { create, listMine, listForOrganizer, getOne, decide, bulkDecide, cancel };
