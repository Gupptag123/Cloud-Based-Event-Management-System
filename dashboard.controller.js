/**
 * controllers/dashboard.controller.js
 * ---------------------------------------------------------------------------
 * Dashboard statistics and report data for organizers and participants.
 * Returns chart-ready series so the frontend can render without extra work.
 * ---------------------------------------------------------------------------
 */

'use strict';

const db = require('../lib/database');
const config = require('../config/config');
const eventModel = require('../models/event.model');
const registrationModel = require('../models/registration.model');
const venueModel = require('../models/venue.model');
const { asyncHandler, notFound, forbidden } = require('../lib/errors');

function lastNDays(n) {
  const days = [];
  const today = new Date();
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(today.getTime() - i * 86_400_000);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

/** GET /api/dashboard - organizer overview. */
const organizerDashboard = asyncHandler(async (req, res) => {
  const organizerId = req.user._id;
  const today = eventModel.todayISO();

  // An administrator oversees the whole platform, so the same dashboard widens
  // to every event rather than only the ones they personally organise.
  const isAdmin = req.user.role === 'admin';
  const events = isAdmin
    ? db.events.all()
    : db.events.find((e) => e.organizerId === organizerId);
  const eventIds = new Set(events.map((e) => e._id));
  const registrations = db.registrations.find((r) => eventIds.has(r.eventId));

  const decorated = events.map((e) => eventModel.decorate(e, { includeOrganizer: false }));

  /* ------------------------------- headline ------------------------------- */
  const stats = {
    totalEvents: events.length,
    publishedEvents: events.filter((e) => e.status === 'published').length,
    draftEvents: events.filter((e) => e.status === 'draft').length,
    cancelledEvents: events.filter((e) => e.status === 'cancelled').length,
    upcomingEvents: events.filter((e) => e.date >= today && e.status === 'published').length,
    pastEvents: events.filter((e) => e.date < today).length,
    totalRegistrations: registrations.length,
    pendingRegistrations: registrations.filter((r) => r.status === 'pending').length,
    approvedRegistrations: registrations.filter((r) => r.status === 'approved').length,
    rejectedRegistrations: registrations.filter((r) => r.status === 'rejected').length,
    cancelledRegistrations: registrations.filter((r) => r.status === 'cancelled').length,
    totalSeats: decorated.reduce((sum, e) => sum + (Number.isFinite(e.capacity) ? e.capacity : 0), 0),
    seatsFilled: decorated.reduce((sum, e) => sum + e.seatsTaken, 0),
    revenue: registrations
      .filter((r) => r.status === 'approved')
      .reduce((sum, r) => {
        const event = events.find((e) => e._id === r.eventId);
        return sum + (Number(event?.fee) || 0) * (Number(r.seats) || 1);
      }, 0),
  };
  stats.fillRate = stats.totalSeats > 0 ? Math.round((stats.seatsFilled / stats.totalSeats) * 100) : 0;
  stats.approvalRate =
    stats.totalRegistrations > 0
      ? Math.round((stats.approvedRegistrations / stats.totalRegistrations) * 100)
      : 0;

  /* -------------------------------- charts ------------------------------- */

  // Registrations per event (top 8 by volume)
  const registrationsPerEvent = decorated
    .slice()
    .sort((a, b) => b.seatsTaken - a.seatsTaken)
    .slice(0, 8)
    .map((e) => ({
      eventId: e._id,
      label: e.title.length > 26 ? `${e.title.slice(0, 25)}…` : e.title,
      title: e.title,
      approved: e.registrations.approved,
      pending: e.registrations.pending,
      rejected: e.registrations.rejected,
      capacity: Number.isFinite(e.capacity) ? e.capacity : 0,
      percentFull: e.percentFull,
    }));

  // Events by category
  const byCategory = config.eventCategories
    .map((name) => ({
      label: name,
      value: events.filter((e) => e.category === name).length,
      color: eventModel.pickBannerColor(name),
    }))
    .filter((row) => row.value > 0);

  // Registration status breakdown
  const byStatus = config.registrationStatuses.map((status) => ({
    label: status.charAt(0).toUpperCase() + status.slice(1),
    value: registrations.filter((r) => r.status === status).length,
    color: { pending: '#d97706', approved: '#059669', rejected: '#dc2626', cancelled: '#64748b' }[status],
  }));

  // Registration trend over the last 14 days
  const days = lastNDays(14);
  const trend = days.map((day) => ({
    label: day.slice(5),
    date: day,
    value: registrations.filter((r) => String(r.regDate).slice(0, 10) === day).length,
  }));

  // Upcoming events timeline
  const upcoming = decorated
    .filter((e) => e.date >= today && e.status !== 'cancelled')
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);

  // Latest activity feed
  const recentRegistrations = registrationModel
    .listForOrganizer(organizerId, { all: isAdmin })
    .slice(0, 8);

  res.json({
    success: true,
    data: {
      scope: isAdmin ? 'platform' : 'organizer',
      stats,
      charts: { registrationsPerEvent, byCategory, byStatus, trend },
      upcoming,
      recentRegistrations,
      venueCount: venueModel.list().length,
    },
  });
});

/** GET /api/dashboard/participant - participant overview. */
const participantDashboard = asyncHandler(async (req, res) => {
  const today = eventModel.todayISO();
  const rows = registrationModel.listForUser(req.user._id, {});

  const stats = {
    totalRegistrations: rows.length,
    approved: rows.filter((r) => r.status === 'approved').length,
    pending: rows.filter((r) => r.status === 'pending').length,
    rejected: rows.filter((r) => r.status === 'rejected').length,
    cancelled: rows.filter((r) => r.status === 'cancelled').length,
    upcoming: rows.filter((r) => r.event && r.event.date >= today && r.status !== 'cancelled').length,
    attended: rows.filter((r) => r.event && r.event.date < today && r.status === 'approved').length,
  };

  const byCategory = config.eventCategories
    .map((name) => ({
      label: name,
      value: rows.filter((r) => r.event?.category === name).length,
      color: eventModel.pickBannerColor(name),
    }))
    .filter((row) => row.value > 0);

  const upcoming = rows
    .filter((r) => r.event && r.event.date >= today && r.status !== 'cancelled')
    .sort((a, b) => a.event.date.localeCompare(b.event.date))
    .slice(0, 5);

  const recommended = eventModel.search({
    status: 'published',
    when: 'upcoming',
    availability: 'open',
    sort: 'date',
    limit: 4,
  }).items.filter((e) => !rows.some((r) => r.eventId === e._id && r.status !== 'cancelled'));

  res.json({ success: true, data: { stats, charts: { byCategory }, upcoming, recommended } });
});

/** GET /api/dashboard/report/:eventId - printable per-event report. */
const eventReport = asyncHandler(async (req, res) => {
  const event = eventModel.raw(req.params.eventId);
  if (!event) throw notFound('Event not found');
  if (req.user.role !== 'admin' && event.organizerId !== req.user._id) {
    throw forbidden('You can only report on your own events');
  }

  const registrations = registrationModel.listForEvent(event._id, {});
  const decorated = eventModel.findById(event._id);

  res.json({
    success: true,
    data: {
      event: decorated,
      counts: eventModel.registrationCounts(event._id),
      registrations,
      generatedAt: new Date().toISOString(),
    },
  });
});

/** GET /api/dashboard/platform - overall public statistics for the home page. */
const platformStats = asyncHandler(async (req, res) => {
  const today = eventModel.todayISO();
  const events = db.events.find((e) => e.status === 'published');
  res.json({
    success: true,
    data: {
      totalEvents: events.length,
      upcomingEvents: events.filter((e) => e.date >= today).length,
      totalOrganizers: db.users.count((u) => u.role === 'organizer'),
      totalParticipants: db.users.count((u) => u.role === 'participant'),
      totalRegistrations: db.registrations.count((r) => r.status !== 'cancelled'),
      totalVenues: db.venues.count(),
      cities: [...new Set(db.venues.all().map((v) => v.city).filter(Boolean))].sort(),
    },
  });
});

module.exports = { organizerDashboard, participantDashboard, eventReport, platformStats };
