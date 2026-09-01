/**
 * models/event.model.js
 * ---------------------------------------------------------------------------
 * Event document helpers plus the search / filter / sort engine and the
 * derived availability fields (seats left, registration open, deadline state).
 *
 * Schema: _id, organizerId, title, description, category, date (YYYY-MM-DD),
 *         time (HH:MM), endTime, venueId, capacity, registrationDeadline,
 *         status, bannerColor, tags[], fee, createdAt, updatedAt
 * ---------------------------------------------------------------------------
 */

'use strict';

const db = require('../lib/database');
const config = require('../config/config');
const venueModel = require('./venue.model');
const userModel = require('./user.model');

const ACTIVE_REGISTRATION_STATUSES = ['pending', 'approved'];

/* -------------------------------------------------------------------------- */
/* Date helpers - all event dates are stored as plain YYYY-MM-DD strings       */
/* -------------------------------------------------------------------------- */

/** Today's local date as YYYY-MM-DD. */
function todayISO() {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}

/** true when `dateStr` is strictly before today. */
function isPast(dateStr) {
  return String(dateStr) < todayISO();
}

function daysBetween(fromISO, toISO) {
  const a = Date.parse(`${fromISO}T00:00:00Z`);
  const b = Date.parse(`${toISO}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/* -------------------------------------------------------------------------- */
/* Derived fields                                                             */
/* -------------------------------------------------------------------------- */

function registrationCounts(eventId) {
  const rows = db.registrations.find((r) => r.eventId === eventId);
  const counts = { total: rows.length, pending: 0, approved: 0, rejected: 0, cancelled: 0 };
  for (const row of rows) {
    if (counts[row.status] !== undefined) counts[row.status] += 1;
  }

  // A request may ask for several seats, so occupancy is measured in seats, not
  // in rows. Pending requests hold their seats too: without that a burst of
  // unreviewed requests could be approved one by one past the venue limit.
  counts.activeRows = counts.pending + counts.approved;
  counts.occupied = rows
    .filter((row) => row.status === 'pending' || row.status === 'approved')
    .reduce((seats, row) => seats + Math.max(1, Number(row.seats) || 1), 0);
  return counts;
}

/** Effective capacity: the event limit, never above the venue's physical limit. */
function effectiveCapacity(event) {
  const venue = event.venueId ? venueModel.findById(event.venueId) : null;
  const venueCap = venue && Number(venue.capacity) > 0 ? Number(venue.capacity) : Infinity;
  const eventCap = Number(event.capacity) > 0 ? Number(event.capacity) : Infinity;
  const cap = Math.min(venueCap, eventCap);
  return Number.isFinite(cap) ? cap : 0;
}

/**
 * Attach everything the UI needs: venue, organizer, counts and availability.
 * @param {object} event
 * @param {object} [opts] { includeOrganizer: boolean }
 */
function decorate(event, opts = {}) {
  if (!event) return null;

  const counts = registrationCounts(event._id);
  const capacity = effectiveCapacity(event);
  const seatsLeft = capacity > 0 ? Math.max(0, capacity - counts.occupied) : 0;
  const today = todayISO();

  const deadline = event.registrationDeadline || event.date;
  const deadlinePassed = String(deadline) < today;
  const eventPassed = isPast(event.date);

  let closedReason = null;
  if (event.status === 'cancelled') closedReason = 'This event has been cancelled';
  else if (event.status === 'draft') closedReason = 'This event is not published yet';
  else if (event.status === 'completed' || eventPassed) closedReason = 'This event has already taken place';
  else if (deadlinePassed) closedReason = `Registration closed on ${deadline}`;
  else if (capacity > 0 && seatsLeft <= 0) closedReason = 'All seats are full';

  return {
    ...event,
    venue: event.venueId ? venueModel.brief(event.venueId) : null,
    organizer: opts.includeOrganizer === false ? undefined : userModel.briefById(event.organizerId),
    capacity,
    registrations: counts,
    seatsTaken: counts.occupied,
    seatsLeft,
    percentFull: capacity > 0 ? Math.min(100, Math.round((counts.occupied / capacity) * 100)) : 0,
    isFull: capacity > 0 && seatsLeft <= 0,
    deadlinePassed,
    eventPassed,
    daysUntilEvent: daysBetween(today, event.date),
    registrationOpen: closedReason === null,
    closedReason,
  };
}

/* -------------------------------------------------------------------------- */
/* Queries                                                                    */
/* -------------------------------------------------------------------------- */

const SORTABLE = {
  date: (a, b) => String(a.date).localeCompare(String(b.date)) || String(a.time).localeCompare(String(b.time)),
  title: (a, b) => a.title.localeCompare(b.title),
  created: (a, b) => String(a.createdAt).localeCompare(String(b.createdAt)),
  popularity: (a, b) => a.seatsTaken - b.seatsTaken,
  seatsLeft: (a, b) => a.seatsLeft - b.seatsLeft,
  category: (a, b) => a.category.localeCompare(b.category),
};

/**
 * Search, filter, sort and paginate events.
 *
 * @param {object} params
 *   search      free text across title, description, tags, venue name/city
 *   category    exact category
 *   city        venue city
 *   status      event status (defaults to 'published' for public listings)
 *   organizerId restrict to one organizer
 *   from,to     inclusive YYYY-MM-DD date range
 *   when        'upcoming' | 'past' | 'today' | 'week' | 'month' | 'all'
 *   availability 'available' | 'full' | 'open'
 *   sort        date | title | created | popularity | seatsLeft | category
 *   order       'asc' | 'desc'
 *   page,limit  pagination
 */
function search(params = {}) {
  const {
    search: query,
    category,
    city,
    status,
    organizerId,
    from,
    to,
    when = 'all',
    availability,
    sort = 'date',
    order = 'asc',
    page = 1,
    limit = config.limits.defaultPageSize,
  } = params;

  let rows = db.events.all();

  if (status) rows = rows.filter((e) => e.status === status);
  if (organizerId) rows = rows.filter((e) => e.organizerId === organizerId);
  if (category) rows = rows.filter((e) => e.category === category);
  if (from) rows = rows.filter((e) => String(e.date) >= String(from));
  if (to) rows = rows.filter((e) => String(e.date) <= String(to));

  const today = todayISO();
  if (when === 'upcoming') rows = rows.filter((e) => String(e.date) >= today);
  else if (when === 'past') rows = rows.filter((e) => String(e.date) < today);
  else if (when === 'today') rows = rows.filter((e) => String(e.date) === today);
  else if (when === 'week') {
    rows = rows.filter((e) => {
      const d = daysBetween(today, e.date);
      return d >= 0 && d <= 7;
    });
  } else if (when === 'month') {
    rows = rows.filter((e) => {
      const d = daysBetween(today, e.date);
      return d >= 0 && d <= 31;
    });
  }

  // Decorate before text search so venue name/city are searchable.
  let decorated = rows.map((e) => decorate(e));

  if (city) {
    const c = String(city).toLowerCase();
    decorated = decorated.filter((e) => (e.venue?.city || '').toLowerCase() === c);
  }

  if (query) {
    const q = String(query).trim().toLowerCase();
    const terms = q.split(/\s+/).filter(Boolean);
    decorated = decorated.filter((e) => {
      const haystack = [
        e.title,
        e.description,
        e.category,
        e.venue?.name,
        e.venue?.city,
        e.organizer?.name,
        e.organizer?.organization,
        ...(e.tags || []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
  }

  if (availability === 'available') decorated = decorated.filter((e) => !e.isFull);
  else if (availability === 'full') decorated = decorated.filter((e) => e.isFull);
  else if (availability === 'open') decorated = decorated.filter((e) => e.registrationOpen);

  const comparator = SORTABLE[sort] || SORTABLE.date;
  const direction = order === 'desc' ? -1 : 1;
  decorated.sort((a, b) => comparator(a, b) * direction);

  const total = decorated.length;
  const safeLimit = Math.min(Math.max(Number(limit) || config.limits.defaultPageSize, 1), config.limits.maxPageSize);
  const safePage = Math.max(Number(page) || 1, 1);
  const start = (safePage - 1) * safeLimit;

  return {
    items: decorated.slice(start, start + safeLimit),
    pagination: {
      total,
      page: safePage,
      limit: safeLimit,
      pages: Math.max(1, Math.ceil(total / safeLimit)),
      hasPrev: safePage > 1,
      hasNext: start + safeLimit < total,
    },
  };
}

function findById(id, opts) {
  const event = db.events.findById(id);
  return event ? decorate(event, opts) : null;
}

function raw(id) {
  return db.events.findById(id);
}

function create(payload) {
  return db.events.create({
    organizerId: payload.organizerId,
    title: payload.title,
    description: payload.description || '',
    category: payload.category || 'Other',
    date: payload.date,
    time: payload.time,
    endTime: payload.endTime || '',
    venueId: payload.venueId || null,
    capacity: Number(payload.capacity) || 0,
    registrationDeadline: payload.registrationDeadline || payload.date,
    status: payload.status || 'published',
    fee: Number(payload.fee) || 0,
    bannerColor: payload.bannerColor || pickBannerColor(payload.category),
    tags: Array.isArray(payload.tags) ? payload.tags : [],
  });
}

function update(id, patch) {
  return db.events.updateById(id, patch);
}

/** Deleting an event also removes its registrations (cascade). */
function remove(id) {
  const removed = db.events.deleteById(id);
  if (removed) db.registrations.deleteMany((r) => r.eventId === id);
  return removed;
}

const CATEGORY_COLORS = {
  Technical: '#2563eb',
  Cultural: '#db2777',
  Sports: '#059669',
  Workshop: '#d97706',
  Seminar: '#7c3aed',
  Conference: '#0891b2',
  Hackathon: '#dc2626',
  Other: '#475569',
};

function pickBannerColor(category) {
  return CATEGORY_COLORS[category] || CATEGORY_COLORS.Other;
}

module.exports = {
  decorate,
  search,
  findById,
  raw,
  create,
  update,
  remove,
  registrationCounts,
  effectiveCapacity,
  todayISO,
  isPast,
  daysBetween,
  pickBannerColor,
  CATEGORY_COLORS,
  ACTIVE_REGISTRATION_STATUSES,
};
