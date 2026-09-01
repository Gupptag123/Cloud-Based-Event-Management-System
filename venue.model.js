/**
 * models/venue.model.js
 * ---------------------------------------------------------------------------
 * Venue document helpers.
 * Schema: _id, name, address, city, capacity, facilities[], createdBy,
 *         createdAt, updatedAt
 * ---------------------------------------------------------------------------
 */

'use strict';

const db = require('../lib/database');

function list({ city, search } = {}) {
  let venues = db.venues.find(null, { sort: 'name' });
  if (city) venues = venues.filter((v) => v.city.toLowerCase() === String(city).toLowerCase());
  if (search) {
    const q = String(search).toLowerCase();
    venues = venues.filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        v.city.toLowerCase().includes(q) ||
        (v.address || '').toLowerCase().includes(q)
    );
  }
  return venues;
}

function findById(id) {
  return db.venues.findById(id);
}

function create(payload) {
  return db.venues.create({
    name: payload.name,
    address: payload.address || '',
    city: payload.city || '',
    capacity: Number(payload.capacity) || 0,
    facilities: Array.isArray(payload.facilities) ? payload.facilities : [],
    createdBy: payload.createdBy || null,
  });
}

function update(id, patch) {
  return db.venues.updateById(id, patch);
}

function remove(id) {
  return db.venues.deleteById(id);
}

/** How many published/draft events currently reference this venue. */
function eventCount(venueId) {
  return db.events.count((e) => e.venueId === venueId && e.status !== 'cancelled');
}

function brief(venueId) {
  const venue = db.venues.findById(venueId);
  if (!venue) return null;
  return {
    _id: venue._id,
    name: venue.name,
    city: venue.city,
    address: venue.address,
    capacity: venue.capacity,
  };
}

module.exports = { list, findById, create, update, remove, eventCount, brief };
