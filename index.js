/**
 * routes/index.js
 * ---------------------------------------------------------------------------
 * Mounts every API router under /api and documents the surface.
 * ---------------------------------------------------------------------------
 */

'use strict';

const express = require('../lib/framework');

const config = require('../config/config');
const pkg = require('../package.json');

const { authenticate, optionalAuth, authorize } = require('../middleware/auth');
const { rateLimit } = require('../middleware/common');

const auth = require('../controllers/auth.controller');
const events = require('../controllers/event.controller');
const venues = require('../controllers/venue.controller');
const registrations = require('../controllers/registration.controller');
const dashboard = require('../controllers/dashboard.controller');

const router = express.Router();

/* ------------------------------------------------------------------ health */

router.get('/health', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'ok',
      version: pkg.version,
      environment: config.env,
      database: config.storage.driver === 'mongodb' ? 'mongodb' : 'json-store',
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    },
  });
});

/* -------------------------------------------------------------------- auth */

const authLimiter = rateLimit({ windowMs: 60_000, max: 20, key: 'auth' });

router.post('/auth/register', authLimiter, auth.register);
router.post('/auth/login', authLimiter, auth.login);
router.get('/auth/me', authenticate, auth.me);
router.put('/auth/me', authenticate, auth.updateProfile);
router.put('/auth/password', authenticate, auth.changePassword);
router.get('/auth/config', auth.clientConfig);

/* ------------------------------------------------------------------ events */
/* Order matters: literal segments before the ':id' wildcard.                */

router.get('/events/categories', events.categories);
router.get('/events', optionalAuth, events.list);
router.get('/events/:id/registrations', authenticate, authorize('organizer'), events.listRegistrations);
router.get('/events/:id', optionalAuth, events.getOne);
router.post('/events', authenticate, authorize('organizer'), events.create);
router.put('/events/:id', authenticate, authorize('organizer'), events.update);
router.patch('/events/:id/status', authenticate, authorize('organizer'), events.changeStatus);
router.delete('/events/:id', authenticate, authorize('organizer'), events.remove);

/* ------------------------------------------------------------------ venues */

router.get('/venues', optionalAuth, venues.list);
router.get('/venues/:id', optionalAuth, venues.getOne);
router.post('/venues', authenticate, authorize('organizer'), venues.create);
router.put('/venues/:id', authenticate, authorize('organizer'), venues.update);
router.delete('/venues/:id', authenticate, authorize('organizer'), venues.remove);

/* ----------------------------------------------------------- registrations */

router.get('/registrations/mine', authenticate, registrations.listMine);
router.post('/registrations/bulk-decision', authenticate, authorize('organizer'), registrations.bulkDecide);
router.get('/registrations', authenticate, authorize('organizer'), registrations.listForOrganizer);
router.post('/registrations', authenticate, registrations.create);
router.get('/registrations/:id', authenticate, registrations.getOne);
router.patch('/registrations/:id/decision', authenticate, authorize('organizer'), registrations.decide);
router.delete('/registrations/:id', authenticate, registrations.cancel);

/* --------------------------------------------------------------- dashboard */

router.get('/dashboard/platform', dashboard.platformStats);
router.get('/dashboard/participant', authenticate, dashboard.participantDashboard);
router.get('/dashboard/report/:eventId', authenticate, authorize('organizer'), dashboard.eventReport);
router.get('/dashboard', authenticate, authorize('organizer'), dashboard.organizerDashboard);

module.exports = router;
