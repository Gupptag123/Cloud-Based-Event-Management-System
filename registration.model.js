/**
 * models/registration.model.js
 * ---------------------------------------------------------------------------
 * Registration document helpers and the business rules that guard them:
 * duplicate prevention, venue capacity enforcement and registration deadline
 * enforcement.
 *
 * Schema: _id, eventId, userId, status, regDate, notes, seats,
 *         decidedAt, decidedBy, createdAt, updatedAt
 * ---------------------------------------------------------------------------
 */

'use strict';

const db = require('../lib/database');
const eventModel = require('./event.model');
const userModel = require('./user.model');
const { notFound, conflict, badRequest } = require('../lib/errors');

/** Join a registration with its event and participant for API responses. */
function decorate(registration) {
  if (!registration) return null;
  const event = eventModel.raw(registration.eventId);
  return {
    ...registration,
    event: event
      ? {
          _id: event._id,
          title: event.title,
          category: event.category,
          date: event.date,
          time: event.time,
          status: event.status,
          bannerColor: event.bannerColor,
          venue: event.venueId ? require('./venue.model').brief(event.venueId) : null,
        }
      : null,
    participant: userModel.briefById(registration.userId),
  };
}

function findById(id) {
  return db.registrations.findById(id);
}

function findByEventAndUser(eventId, userId) {
  return db.registrations.findOne((r) => r.eventId === eventId && r.userId === userId);
}

function listForUser(userId, { status, when = 'all' } = {}) {
  let rows = db.registrations.find((r) => r.userId === userId);
  if (status) rows = rows.filter((r) => r.status === status);

  let decorated = rows.map(decorate);
  const today = eventModel.todayISO();
  if (when === 'upcoming') decorated = decorated.filter((r) => r.event && r.event.date >= today);
  else if (when === 'past') decorated = decorated.filter((r) => r.event && r.event.date < today);

  decorated.sort((a, b) => String(b.regDate).localeCompare(String(a.regDate)));
  return decorated;
}

function listForEvent(eventId, { status } = {}) {
  let rows = db.registrations.find((r) => r.eventId === eventId);
  if (status) rows = rows.filter((r) => r.status === status);
  return rows
    .map(decorate)
    .sort((a, b) => String(a.regDate).localeCompare(String(b.regDate)));
}

/** Every registration across all events owned by an organizer. */
function listForOrganizer(organizerId, { status, eventId, search, all = false } = {}) {
  // `all` widens the view to every event on the platform, for administrators.
  let rows;
  if (all) {
    rows = db.registrations.all();
  } else {
    const ownedIds = new Set(
      db.events.find((e) => e.organizerId === organizerId).map((e) => e._id)
    );
    rows = db.registrations.find((r) => ownedIds.has(r.eventId));
  }
  if (status) rows = rows.filter((r) => r.status === status);
  if (eventId) rows = rows.filter((r) => r.eventId === eventId);

  let decorated = rows.map(decorate);
  if (search) {
    const q = String(search).toLowerCase();
    decorated = decorated.filter((r) =>
      [r.participant?.name, r.participant?.email, r.event?.title]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }
  decorated.sort((a, b) => String(b.regDate).localeCompare(String(a.regDate)));
  return decorated;
}

/* -------------------------------------------------------------------------- */
/* Business rules                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Create a registration after validating every rule.
 * @throws {HttpError} 404 unknown event, 409 duplicate/full/closed
 */
function register({ eventId, userId, notes = '', seats = 1 }) {
  const event = eventModel.findById(eventId);
  if (!event) throw notFound('Event not found');

  if (event.organizerId === userId) {
    throw conflict('You cannot register for an event you are organising');
  }

  const existing = findByEventAndUser(eventId, userId);
  if (existing && existing.status !== 'cancelled' && existing.status !== 'rejected') {
    throw conflict('You have already registered for this event');
  }

  // --- deadline + status enforcement -------------------------------------
  if (!event.registrationOpen) {
    throw conflict(event.closedReason || 'Registration is closed for this event');
  }

  // --- capacity enforcement ----------------------------------------------
  const requestedSeats = Math.max(1, Number(seats) || 1);
  if (event.capacity > 0 && requestedSeats > event.seatsLeft) {
    throw conflict(
      event.seatsLeft === 0
        ? 'All seats are full for this event'
        : `Only ${event.seatsLeft} seat(s) left for this event`
    );
  }

  // Re-registering after a cancellation reuses the same record.
  if (existing) {
    return decorate(
      db.registrations.updateById(existing._id, {
        status: 'pending',
        notes,
        seats: requestedSeats,
        regDate: new Date().toISOString(),
        decidedAt: null,
        decidedBy: null,
      })
    );
  }

  return decorate(
    db.registrations.create({
      eventId,
      userId,
      status: 'pending',
      seats: requestedSeats,
      notes,
      regDate: new Date().toISOString(),
      decidedAt: null,
      decidedBy: null,
    })
  );
}

/**
 * Organizer decision on a registration.
 * @param {'approved'|'rejected'|'pending'} decision
 */
function decide(registrationId, decision, deciderId) {
  const registration = db.registrations.findById(registrationId);
  if (!registration) throw notFound('Registration not found');
  if (!['approved', 'rejected', 'pending'].includes(decision)) {
    throw badRequest('Decision must be approved, rejected or pending');
  }

  // Approving must not exceed capacity.
  if (decision === 'approved' && registration.status !== 'approved') {
    const event = eventModel.findById(registration.eventId);
    if (!event) throw notFound('Event not found');
    const approvedSeats = db.registrations
      .find((r) => r.eventId === registration.eventId && r.status === 'approved')
      .reduce((sum, r) => sum + (Number(r.seats) || 1), 0);
    const seats = Number(registration.seats) || 1;
    if (event.capacity > 0 && approvedSeats + seats > event.capacity) {
      throw conflict(
        `Approving this would exceed the capacity of ${event.capacity} (currently ${approvedSeats} approved)`
      );
    }
  }

  return decorate(
    db.registrations.updateById(registrationId, {
      status: decision,
      decidedAt: decision === 'pending' ? null : new Date().toISOString(),
      decidedBy: decision === 'pending' ? null : deciderId,
    })
  );
}

/** Participant withdraws their own registration. */
function cancel(registrationId) {
  const registration = db.registrations.findById(registrationId);
  if (!registration) throw notFound('Registration not found');
  if (registration.status === 'cancelled') return decorate(registration);
  return decorate(
    db.registrations.updateById(registrationId, {
      status: 'cancelled',
      decidedAt: new Date().toISOString(),
    })
  );
}

function remove(id) {
  return db.registrations.deleteById(id);
}

module.exports = {
  decorate,
  findById,
  findByEventAndUser,
  listForUser,
  listForEvent,
  listForOrganizer,
  register,
  decide,
  cancel,
  remove,
};
