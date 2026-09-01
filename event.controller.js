/**
 * controllers/event.controller.js
 * ---------------------------------------------------------------------------
 * Event CRUD, public discovery (search / filter / sort) and per-event
 * registration listing for organizers.
 * ---------------------------------------------------------------------------
 */

'use strict';

const config = require('../config/config');
const eventModel = require('../models/event.model');
const venueModel = require('../models/venue.model');
const registrationModel = require('../models/registration.model');
const { validator } = require('../lib/validate');
const { asyncHandler, notFound, forbidden, badRequest, unprocessable } = require('../lib/errors');

/** Only the owning organizer (or an admin) may modify an event. */
function assertOwner(event, user) {
  if (!event) throw notFound('Event not found');
  if (user.role === 'admin') return;
  if (event.organizerId !== user._id) throw forbidden('You can only manage your own events');
}

function parseTags(input) {
  if (Array.isArray(input)) return input.map((t) => String(t).trim()).filter(Boolean).slice(0, 10);
  if (typeof input === 'string') {
    return input
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 10);
  }
  return [];
}

/** GET /api/events - public discovery endpoint. */
const list = asyncHandler(async (req, res) => {
  const q = req.query || {};
  // Unauthenticated / participant users only ever see published events.
  const isOrganizerView = q.mine === 'true' && req.user;
  const status = isOrganizerView ? q.status || undefined : q.status === undefined ? 'published' : q.status;

  // For an administrator, "mine" means the whole platform: they moderate every
  // event, so the managed view must not be narrowed to their own user id.
  const isAdminView = isOrganizerView && req.user.role === 'admin';

  const result = eventModel.search({
    search: q.search,
    category: q.category,
    city: q.city,
    status: isOrganizerView ? status : status || 'published',
    organizerId: isAdminView ? q.organizerId : isOrganizerView ? req.user._id : q.organizerId,
    from: q.from,
    to: q.to,
    when: q.when || (isOrganizerView ? 'all' : 'all'),
    availability: q.availability,
    sort: q.sort,
    order: q.order,
    page: q.page,
    limit: q.limit,
  });

  res.json({
    success: true,
    data: result.items,
    pagination: result.pagination,
    meta: { categories: config.eventCategories },
  });
});

/** GET /api/events/categories - category list with live counts. */
const categories = asyncHandler(async (req, res) => {
  const published = eventModel.search({ status: 'published', limit: config.limits.maxPageSize, page: 1 });
  const counts = {};
  for (const name of config.eventCategories) counts[name] = 0;
  for (const event of published.items) {
    counts[event.category] = (counts[event.category] || 0) + 1;
  }
  res.json({
    success: true,
    data: config.eventCategories.map((name) => ({
      name,
      count: counts[name] || 0,
      color: eventModel.pickBannerColor(name),
    })),
  });
});

/** GET /api/events/:id */
const getOne = asyncHandler(async (req, res) => {
  const event = eventModel.findById(req.params.id);
  if (!event) throw notFound('Event not found');

  // Drafts and cancelled events are only visible to their organizer.
  const isOwner = req.user && (req.user._id === event.organizerId || req.user.role === 'admin');
  if (event.status === 'draft' && !isOwner) throw notFound('Event not found');

  // Tell the caller whether they already hold a registration.
  let myRegistration = null;
  if (req.user) {
    const existing = registrationModel.findByEventAndUser(event._id, req.user._id);
    if (existing) {
      myRegistration = { _id: existing._id, status: existing.status, regDate: existing.regDate, seats: existing.seats };
    }
  }

  res.json({ success: true, data: { ...event, myRegistration, isOwner: Boolean(isOwner) } });
});

/* -------------------------------------------------------------------------- */
/* Create / update                                                            */
/* -------------------------------------------------------------------------- */

function validateEventPayload(body, { partial = false } = {}) {
  const required = !partial;
  const v = validator(body || {})
    .string('title', { required, min: 3, max: config.limits.maxTitleLength, label: 'Event title' })
    .string('description', { max: config.limits.maxDescriptionLength, label: 'Description' })
    .oneOf('category', config.eventCategories, { required, label: 'Category' })
    .date('date', { required, label: 'Event date' })
    .time('time', { required, label: 'Start time' })
    .time('endTime', { label: 'End time' })
    .date('registrationDeadline', { label: 'Registration deadline' })
    .integer('capacity', { min: 0, max: 1_000_000, label: 'Capacity' })
    .integer('fee', { min: 0, max: 1_000_000, label: 'Registration fee' })
    .oneOf('status', config.eventStatuses, { label: 'Status' })
    .string('venueId', { max: 60, label: 'Venue' });

  const data = v.result();

  if (data.venueId) {
    const venue = venueModel.findById(data.venueId);
    if (!venue) throw unprocessable('The selected venue does not exist', { venueId: 'Unknown venue' });
    if (data.capacity && venue.capacity && data.capacity > venue.capacity) {
      throw unprocessable(
        `Capacity cannot exceed the venue limit of ${venue.capacity}`,
        { capacity: `Maximum for this venue is ${venue.capacity}` }
      );
    }
  }

  if (data.date && data.registrationDeadline && data.registrationDeadline > data.date) {
    throw unprocessable('The registration deadline must be on or before the event date', {
      registrationDeadline: 'Must be on or before the event date',
    });
  }

  if (data.time && data.endTime && data.endTime <= data.time) {
    throw unprocessable('The end time must be after the start time', {
      endTime: 'Must be after the start time',
    });
  }

  if (body && body.tags !== undefined) data.tags = parseTags(body.tags);
  return data;
}

/** POST /api/events */
const create = asyncHandler(async (req, res) => {
  const data = validateEventPayload(req.body);

  if (data.date < eventModel.todayISO() && (data.status || 'published') === 'published') {
    throw unprocessable('A published event cannot be in the past', { date: 'Choose today or a future date' });
  }

  const event = eventModel.create({ ...data, organizerId: req.user._id });
  res.status(201).json({
    success: true,
    message: 'Event created successfully',
    data: eventModel.findById(event._id),
  });
});

/** PUT /api/events/:id */
const update = asyncHandler(async (req, res) => {
  const existing = eventModel.raw(req.params.id);
  assertOwner(existing, req.user);

  const merged = { ...existing, ...req.body };
  const data = validateEventPayload(merged, { partial: false });

  // Never allow capacity to drop below the number of seats already taken.
  const counts = eventModel.registrationCounts(existing._id);
  if (data.capacity && data.capacity < counts.occupied) {
    throw unprocessable(
      `Capacity cannot be lower than the ${counts.occupied} seat(s) already taken`,
      { capacity: `Minimum is ${counts.occupied}` }
    );
  }

  eventModel.update(existing._id, data);
  res.json({
    success: true,
    message: 'Event updated successfully',
    data: eventModel.findById(existing._id),
  });
});

/** PATCH /api/events/:id/status */
const changeStatus = asyncHandler(async (req, res) => {
  const existing = eventModel.raw(req.params.id);
  assertOwner(existing, req.user);

  const { status } = validator(req.body || {})
    .oneOf('status', config.eventStatuses, { required: true, label: 'Status' })
    .result();

  eventModel.update(existing._id, { status });
  res.json({
    success: true,
    message: `Event marked as ${status}`,
    data: eventModel.findById(existing._id),
  });
});

/** DELETE /api/events/:id */
const remove = asyncHandler(async (req, res) => {
  const existing = eventModel.raw(req.params.id);
  assertOwner(existing, req.user);

  const counts = eventModel.registrationCounts(existing._id);
  const force = String(req.query.force || '') === 'true';
  if (counts.activeRows > 0 && !force) {
    throw badRequest(
      `This event has ${counts.activeRows} active registration(s) holding ${counts.occupied} seat(s). Cancel the event instead, or delete with ?force=true.`
    );
  }

  eventModel.remove(existing._id);
  res.json({ success: true, message: 'Event deleted', data: { _id: existing._id } });
});

/** GET /api/events/:id/registrations - organizer only. */
const listRegistrations = asyncHandler(async (req, res) => {
  const existing = eventModel.raw(req.params.id);
  assertOwner(existing, req.user);

  const rows = registrationModel.listForEvent(existing._id, { status: req.query.status });
  res.json({
    success: true,
    data: rows,
    meta: { event: eventModel.findById(existing._id), counts: eventModel.registrationCounts(existing._id) },
  });
});

module.exports = { list, categories, getOne, create, update, changeStatus, remove, listRegistrations };
