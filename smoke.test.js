/**
 * tests/smoke.test.js
 * ---------------------------------------------------------------------------
 * End-to-end smoke tests for every API flow. Uses only Node built-ins.
 *
 *   npm test
 *
 * The suite starts the real server on a spare port against a throwaway data
 * directory, so it never touches the data in /data.
 * ---------------------------------------------------------------------------
 */

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

/* Isolate the test run: throwaway data dir + quiet logging, set BEFORE the
 * application modules are required (config reads process.env at load time). */
const TMP_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'cbems-test-'));
process.env.DATA_DIR = TMP_DATA;
process.env.NODE_ENV = 'test';
process.env.PORT = process.env.TEST_PORT || '5099';
process.env.JWT_SECRET = 'test-secret';

// eslint-disable-next-line import/order
const { start } = require('../server');
// eslint-disable-next-line import/order
const { seed } = require('../scripts/seed');

const BASE = `http://127.0.0.1:${process.env.PORT}`;

let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, extra) {
  if (condition) {
    passed += 1;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } else {
    failed += 1;
    failures.push(name);
    console.log(`  \x1b[31m✗\x1b[0m ${name}${extra ? `\n      ${JSON.stringify(extra)}` : ''}`);
  }
}

function section(title) {
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}

async function api(method, route, { token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(BASE + route, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON (e.g. static HTML) */
  }
  return { status: res.status, json, text, headers: res.headers };
}

/* -------------------------------------------------------------------------- */

async function run() {
  const server = start(Number(process.env.PORT));
  await new Promise((resolve) => setTimeout(resolve, 300));
  seed();

  const state = {};

  /* ------------------------------------------------------------- health */
  section('Health & configuration');
  {
    const r = await api('GET', '/api/health');
    check('GET /api/health returns 200 ok', r.status === 200 && r.json?.data?.status === 'ok', r.json);

    const c = await api('GET', '/api/auth/config');
    check('GET /api/auth/config lists categories', Array.isArray(c.json?.data?.categories) && c.json.data.categories.length > 0);

    const p = await api('GET', '/api/dashboard/platform');
    check('GET /api/dashboard/platform returns counts', p.status === 200 && p.json.data.totalEvents > 0, p.json);

    const nf = await api('GET', '/api/does-not-exist');
    check('unknown API route returns 404 JSON', nf.status === 404 && nf.json?.success === false, nf.json);
  }

  /* --------------------------------------------------------------- auth */
  section('Authentication');
  {
    const email = `tester_${Date.now()}@example.com`;
    const reg = await api('POST', '/api/auth/register', {
      body: { name: 'Test Participant', email, password: 'secret123', role: 'participant' },
    });
    check('register creates account + token', reg.status === 201 && Boolean(reg.json?.data?.token), reg.json);
    check('register never returns the password hash', reg.json?.data?.user?.password === undefined);
    state.newUserToken = reg.json?.data?.token;
    state.newUserEmail = email;

    const dupe = await api('POST', '/api/auth/register', {
      body: { name: 'Test Participant', email, password: 'secret123', role: 'participant' },
    });
    check('duplicate email rejected with 409', dupe.status === 409, dupe.json);

    const badEmail = await api('POST', '/api/auth/register', {
      body: { name: 'X', email: 'not-an-email', password: '1' },
    });
    check('validation errors return 422 with field map', badEmail.status === 422 && typeof badEmail.json?.errors === 'object', badEmail.json);

    const login = await api('POST', '/api/auth/login', { body: { email: 'organizer@demo.com', password: 'demo1234' } });
    check('organizer login succeeds', login.status === 200 && Boolean(login.json?.data?.token), login.json);
    state.organizer = login.json.data.token;
    state.organizerId = login.json.data.user._id;

    const wrong = await api('POST', '/api/auth/login', { body: { email: 'organizer@demo.com', password: 'wrong' } });
    check('wrong password returns 401', wrong.status === 401, wrong.json);

    const unknown = await api('POST', '/api/auth/login', { body: { email: 'nobody@demo.com', password: 'whatever' } });
    check('unknown email returns the same 401 message', unknown.status === 401 && unknown.json.message === wrong.json.message);

    const p = await api('POST', '/api/auth/login', { body: { email: 'participant@demo.com', password: 'demo1234' } });
    state.participant = p.json.data.token;
    state.participantId = p.json.data.user._id;
    check('participant login succeeds', p.status === 200 && p.json.data.user.role === 'participant');

    const p2 = await api('POST', '/api/auth/login', { body: { email: 'arjun@demo.com', password: 'demo1234' } });
    state.participant2 = p2.json.data.token;

    const org2 = await api('POST', '/api/auth/login', { body: { email: 'rahul@demo.com', password: 'demo1234' } });
    state.organizer2 = org2.json.data.token;

    const me = await api('GET', '/api/auth/me', { token: state.organizer });
    check('GET /api/auth/me returns the session user', me.status === 200 && me.json.data.user.email === 'organizer@demo.com');

    const noToken = await api('GET', '/api/auth/me');
    check('protected route without token returns 401', noToken.status === 401);

    const badToken = await api('GET', '/api/auth/me', { token: 'abc.def.ghi' });
    check('tampered token returns 401', badToken.status === 401);

    const profile = await api('PUT', '/api/auth/me', { token: state.newUserToken, body: { name: 'Renamed Tester' } });
    check('profile update works', profile.status === 200 && profile.json.data.user.name === 'Renamed Tester', profile.json);

    const pwBad = await api('PUT', '/api/auth/password', {
      token: state.newUserToken,
      body: { currentPassword: 'nope', newPassword: 'brandnew1' },
    });
    check('password change rejects wrong current password', pwBad.status === 400, pwBad.json);

    const pwOk = await api('PUT', '/api/auth/password', {
      token: state.newUserToken,
      body: { currentPassword: 'secret123', newPassword: 'brandnew1' },
    });
    check('password change succeeds', pwOk.status === 200, pwOk.json);

    const reLogin = await api('POST', '/api/auth/login', { body: { email: state.newUserEmail, password: 'brandnew1' } });
    check('login works with the new password', reLogin.status === 200);
    state.newUserToken = reLogin.json.data.token;
  }

  /* ------------------------------------------------------- event listing */
  section('Event discovery: search, filter, sort');
  {
    const all = await api('GET', '/api/events?limit=100');
    check('GET /api/events returns published events', all.status === 200 && all.json.data.length > 0, all.json?.message);
    check('drafts are hidden from the public list', all.json.data.every((e) => e.status === 'published'));
    check('pagination metadata present', typeof all.json.pagination?.total === 'number');

    const decorated = all.json.data[0];
    check('events include venue details', decorated.venue !== null && typeof decorated.venue.name === 'string');
    check('events include seat availability', typeof decorated.seatsLeft === 'number' && typeof decorated.registrationOpen === 'boolean');

    const searched = await api('GET', '/api/events?search=hackathon&limit=50');
    check('free-text search matches title text', searched.json.data.some((e) => /hack/i.test(e.title)), searched.json.data.map((e) => e.title));

    const searchVenue = await api('GET', '/api/events?search=innovation%20lab&limit=50');
    check('search also matches venue name', searchVenue.json.data.length > 0 && searchVenue.json.data.every((e) => /innovation/i.test(e.venue.name)));

    const cat = await api('GET', '/api/events?category=Workshop&limit=50');
    check('category filter works', cat.json.data.length > 0 && cat.json.data.every((e) => e.category === 'Workshop'));

    const city = await api('GET', '/api/events?city=Pune&limit=50');
    check('city filter works', city.json.data.length > 0 && city.json.data.every((e) => e.venue.city === 'Pune'));

    const upcoming = await api('GET', '/api/events?when=upcoming&limit=50');
    const today = new Date().toISOString().slice(0, 10);
    check('when=upcoming excludes past events', upcoming.json.data.every((e) => e.date >= today));

    const past = await api('GET', '/api/events?when=past&status=completed&limit=50');
    check('when=past returns only past events', past.json.data.length > 0 && past.json.data.every((e) => e.date < today));

    const sortedDesc = await api('GET', '/api/events?sort=date&order=desc&limit=50');
    const dates = sortedDesc.json.data.map((e) => e.date);
    check('sort=date&order=desc is descending', dates.every((d, i) => i === 0 || dates[i - 1] >= d), dates);

    const byPop = await api('GET', '/api/events?sort=popularity&order=desc&limit=5');
    const taken = byPop.json.data.map((e) => e.seatsTaken);
    check('sort=popularity ranks by registrations', taken.every((t, i) => i === 0 || taken[i - 1] >= t), taken);

    const open = await api('GET', '/api/events?availability=open&limit=50');
    check('availability=open returns only open events', open.json.data.every((e) => e.registrationOpen === true));

    const page = await api('GET', '/api/events?limit=3&page=2');
    check('pagination returns the right page size', page.json.data.length <= 3 && page.json.pagination.page === 2);

    const cats = await api('GET', '/api/events/categories');
    check('GET /api/events/categories returns counts', cats.status === 200 && cats.json.data.some((c) => c.count > 0), cats.json);

    state.publicEventId = upcoming.json.data.find((e) => e.registrationOpen)._id;
    state.closedEventId = all.json.data.find((e) => e.deadlinePassed && e.status === 'published')?._id;
  }

  /* ---------------------------------------------------------- event CRUD */
  section('Event CRUD & ownership');
  {
    const venues = await api('GET', '/api/venues');
    check('GET /api/venues lists venues', venues.status === 200 && venues.json.data.length > 0);
    state.smallVenueId = venues.json.data.find((v) => v.capacity <= 80)._id;
    state.bigVenueId = venues.json.data.find((v) => v.capacity >= 400)._id;

    const asParticipant = await api('POST', '/api/events', {
      token: state.participant,
      body: { title: 'Not allowed', category: 'Other', date: '2030-01-01', time: '10:00' },
    });
    check('participant cannot create an event (403)', asParticipant.status === 403, asParticipant.json);

    const future = new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10);
    const deadline = new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10);

    const created = await api('POST', '/api/events', {
      token: state.organizer,
      body: {
        title: 'Smoke Test Event',
        description: 'Created by the automated smoke test suite.',
        category: 'Technical',
        date: future,
        time: '10:00',
        endTime: '12:00',
        venueId: state.bigVenueId,
        capacity: 2,
        registrationDeadline: deadline,
        status: 'published',
        fee: 0,
        tags: 'smoke, test',
      },
    });
    check('organizer creates an event (201)', created.status === 201, created.json);
    check('tags parsed from a comma string', Array.isArray(created.json?.data?.tags) && created.json.data.tags.length === 2, created.json?.data?.tags);
    state.testEventId = created.json?.data?._id;

    const badDate = await api('POST', '/api/events', {
      token: state.organizer,
      body: { title: 'Bad date event', category: 'Other', date: '2020-01-01', time: '10:00', status: 'published' },
    });
    check('published event in the past is rejected (422)', badDate.status === 422, badDate.json);

    const badDeadline = await api('POST', '/api/events', {
      token: state.organizer,
      body: { title: 'Bad deadline', category: 'Other', date: future, time: '10:00', registrationDeadline: '2099-01-01' },
    });
    check('deadline after event date is rejected (422)', badDeadline.status === 422, badDeadline.json);

    const badTimes = await api('POST', '/api/events', {
      token: state.organizer,
      body: { title: 'Bad times', category: 'Other', date: future, time: '15:00', endTime: '09:00' },
    });
    check('end time before start time is rejected (422)', badTimes.status === 422, badTimes.json);

    const overVenue = await api('POST', '/api/events', {
      token: state.organizer,
      body: { title: 'Too big', category: 'Other', date: future, time: '10:00', venueId: state.smallVenueId, capacity: 100000 },
    });
    check('capacity above venue limit is rejected (422)', overVenue.status === 422, overVenue.json);

    const badVenue = await api('POST', '/api/events', {
      token: state.organizer,
      body: { title: 'Ghost venue', category: 'Other', date: future, time: '10:00', venueId: 'nope' },
    });
    check('unknown venue is rejected (422)', badVenue.status === 422, badVenue.json);

    const one = await api('GET', `/api/events/${state.testEventId}`);
    check('GET /api/events/:id returns the event', one.status === 200 && one.json.data._id === state.testEventId);

    const missing = await api('GET', '/api/events/000000000000000000000000');
    check('unknown event id returns 404', missing.status === 404);

    const updated = await api('PUT', `/api/events/${state.testEventId}`, {
      token: state.organizer,
      body: { title: 'Smoke Test Event (updated)' },
    });
    check('organizer updates their own event', updated.status === 200 && updated.json.data.title === 'Smoke Test Event (updated)', updated.json);

    const foreign = await api('PUT', `/api/events/${state.testEventId}`, {
      token: state.organizer2,
      body: { title: 'Hijacked' },
    });
    check('another organizer cannot edit it (403)', foreign.status === 403, foreign.json);

    const statusChange = await api('PATCH', `/api/events/${state.testEventId}/status`, {
      token: state.organizer,
      body: { status: 'published' },
    });
    check('PATCH status works', statusChange.status === 200 && statusChange.json.data.status === 'published');

    const mine = await api('GET', '/api/events?mine=true&limit=100', { token: state.organizer });
    check('mine=true returns only my events (incl. drafts)', mine.json.data.length > 0 && mine.json.data.every((e) => e.organizerId === state.organizerId));
    check('mine=true includes draft events', mine.json.data.some((e) => e.status === 'draft'));
  }

  /* --------------------------------------------------------- registration */
  section('Registration: capacity & deadline enforcement');
  {
    const reg1 = await api('POST', '/api/registrations', {
      token: state.participant,
      body: { eventId: state.testEventId, notes: 'Looking forward to it' },
    });
    check('participant registers (201, pending)', reg1.status === 201 && reg1.json.data.status === 'pending', reg1.json);
    state.reg1 = reg1.json?.data?._id;

    const dupe = await api('POST', '/api/registrations', {
      token: state.participant,
      body: { eventId: state.testEventId },
    });
    check('duplicate registration rejected (409)', dupe.status === 409, dupe.json);

    const selfReg = await api('POST', '/api/registrations', {
      token: state.organizer,
      body: { eventId: state.testEventId },
    });
    check('organizer cannot register for own event (409)', selfReg.status === 409, selfReg.json);

    const reg2 = await api('POST', '/api/registrations', {
      token: state.participant2,
      body: { eventId: state.testEventId },
    });
    check('second participant registers (fills capacity 2/2)', reg2.status === 201, reg2.json);
    state.reg2 = reg2.json?.data?._id;

    const afterFull = await api('GET', `/api/events/${state.testEventId}`);
    check('event now reports 0 seats left', afterFull.json.data.seatsLeft === 0, afterFull.json.data);
    check('event now reports isFull = true', afterFull.json.data.isFull === true);
    check('registrationOpen flips to false when full', afterFull.json.data.registrationOpen === false);

    const third = await api('POST', '/api/registrations', {
      token: state.newUserToken,
      body: { eventId: state.testEventId },
    });
    check('registration beyond capacity rejected (409)', third.status === 409, third.json);
    check('capacity rejection explains why', /full|seat/i.test(third.json?.message || ''), third.json?.message);

    if (state.closedEventId) {
      const closed = await api('POST', '/api/registrations', {
        token: state.newUserToken,
        body: { eventId: state.closedEventId },
      });
      check('registration after deadline rejected (409)', closed.status === 409, closed.json);
      check('deadline rejection explains why', /closed/i.test(closed.json?.message || ''), closed.json?.message);
    } else {
      check('deadline fixture present in seed data', false, 'no closed event found');
    }

    const noAuth = await api('POST', '/api/registrations', { body: { eventId: state.testEventId } });
    check('registration requires authentication (401)', noAuth.status === 401);

    const badEvent = await api('POST', '/api/registrations', {
      token: state.newUserToken,
      body: { eventId: '000000000000000000000000' },
    });
    check('registering for unknown event returns 404', badEvent.status === 404, badEvent.json);

    const capacityShrink = await api('PUT', `/api/events/${state.testEventId}`, {
      token: state.organizer,
      body: { capacity: 1 },
    });
    check('capacity cannot drop below seats taken (422)', capacityShrink.status === 422, capacityShrink.json);
  }

  /* ------------------------------------------------------ approve / reject */
  section('Organizer approve / reject workflow');
  {
    const queue = await api('GET', '/api/registrations', { token: state.organizer });
    check('organizer sees the registration queue', queue.status === 200 && queue.json.data.length > 0, queue.json?.message);
    check('queue rows embed participant + event', Boolean(queue.json.data[0].participant?.name && queue.json.data[0].event?.title));
    check('queue includes a status summary', typeof queue.json.meta?.summary?.pending === 'number');

    const pendingOnly = await api('GET', '/api/registrations?status=pending', { token: state.organizer });
    check('queue filters by status', pendingOnly.json.data.every((r) => r.status === 'pending'));

    const searchQueue = await api('GET', '/api/registrations?search=priya', { token: state.organizer });
    check('queue searches by participant name', searchQueue.json.data.length > 0 && searchQueue.json.data.every((r) => /priya/i.test(r.participant.name)));

    const approve = await api('PATCH', `/api/registrations/${state.reg1}/decision`, {
      token: state.organizer,
      body: { status: 'approved' },
    });
    check('organizer approves a registration', approve.status === 200 && approve.json.data.status === 'approved', approve.json);
    check('approval records who decided and when', Boolean(approve.json.data.decidedAt && approve.json.data.decidedBy));

    const reject = await api('PATCH', `/api/registrations/${state.reg2}/decision`, {
      token: state.organizer,
      body: { status: 'rejected' },
    });
    check('organizer rejects a registration', reject.status === 200 && reject.json.data.status === 'rejected');

    const foreignDecision = await api('PATCH', `/api/registrations/${state.reg1}/decision`, {
      token: state.organizer2,
      body: { status: 'rejected' },
    });
    check('other organizer cannot decide (403)', foreignDecision.status === 403, foreignDecision.json);

    const participantDecision = await api('PATCH', `/api/registrations/${state.reg1}/decision`, {
      token: state.participant,
      body: { status: 'approved' },
    });
    check('participant cannot decide (403)', participantDecision.status === 403);

    const badDecision = await api('PATCH', `/api/registrations/${state.reg1}/decision`, {
      token: state.organizer,
      body: { status: 'banana' },
    });
    check('invalid decision value rejected (422)', badDecision.status === 422);

    // Rejecting reg2 freed a seat -> a third participant should now fit.
    const afterReject = await api('GET', `/api/events/${state.testEventId}`);
    check('rejecting frees a seat', afterReject.json.data.seatsLeft === 1, afterReject.json.data);

    const nowFits = await api('POST', '/api/registrations', {
      token: state.newUserToken,
      body: { eventId: state.testEventId },
    });
    check('registration succeeds once a seat is freed', nowFits.status === 201, nowFits.json);
    state.reg3 = nowFits.json?.data?._id;

    // Approving reg3 would make 2 approved out of capacity 2 -> allowed.
    const approve3 = await api('PATCH', `/api/registrations/${state.reg3}/decision`, {
      token: state.organizer,
      body: { status: 'approved' },
    });
    check('second approval within capacity succeeds', approve3.status === 200, approve3.json);

    // Now put reg2 back to pending and try approving -> would exceed capacity.
    await api('PATCH', `/api/registrations/${state.reg2}/decision`, { token: state.organizer, body: { status: 'pending' } });
    const overApprove = await api('PATCH', `/api/registrations/${state.reg2}/decision`, {
      token: state.organizer,
      body: { status: 'approved' },
    });
    check('approval that would exceed capacity rejected (409)', overApprove.status === 409, overApprove.json);

    const bulk = await api('POST', '/api/registrations/bulk-decision', {
      token: state.organizer,
      body: { ids: [state.reg2], status: 'rejected' },
    });
    check('bulk decision endpoint works', bulk.status === 200 && bulk.json.data.updated.length === 1, bulk.json);

    const perEvent = await api('GET', `/api/events/${state.testEventId}/registrations`, { token: state.organizer });
    check('per-event registration list works', perEvent.status === 200 && perEvent.json.data.length >= 3, perEvent.json?.message);
    check('per-event list includes counts', typeof perEvent.json.meta?.counts?.approved === 'number');

    const perEventForeign = await api('GET', `/api/events/${state.testEventId}/registrations`, { token: state.organizer2 });
    check('per-event list is owner-only (403)', perEventForeign.status === 403);
  }

  /* ------------------------------------------------- participant view */
  section('Participant view');
  {
    const mine = await api('GET', '/api/registrations/mine', { token: state.participant });
    check('GET /api/registrations/mine works', mine.status === 200 && mine.json.data.length > 0, mine.json?.message);
    check('my registrations embed event details', Boolean(mine.json.data[0].event?.title));
    check('my registrations include a summary', typeof mine.json.meta?.summary?.approved === 'number');

    const upcomingOnly = await api('GET', '/api/registrations/mine?when=upcoming', { token: state.participant });
    const today = new Date().toISOString().slice(0, 10);
    check('when=upcoming filter works on my registrations', upcomingOnly.json.data.every((r) => r.event.date >= today));

    const detail = await api('GET', `/api/registrations/${state.reg1}`, { token: state.participant });
    check('participant can read their own registration', detail.status === 200);

    const foreignRead = await api('GET', `/api/registrations/${state.reg1}`, { token: state.participant2 });
    check('participant cannot read someone else’s registration (403)', foreignRead.status === 403, foreignRead.json);

    const eventWithMine = await api('GET', `/api/events/${state.testEventId}`, { token: state.participant });
    check('event detail reports myRegistration for the caller', eventWithMine.json.data.myRegistration?.status === 'approved', eventWithMine.json.data.myRegistration);

    const cancel = await api('DELETE', `/api/registrations/${state.reg1}`, { token: state.participant });
    check('participant cancels their registration', cancel.status === 200 && cancel.json.data.status === 'cancelled', cancel.json);

    const reRegister = await api('POST', '/api/registrations', {
      token: state.participant,
      body: { eventId: state.testEventId },
    });
    check('re-registering after cancelling works', reRegister.status === 201 && reRegister.json.data.status === 'pending', reRegister.json);

    const pDash = await api('GET', '/api/dashboard/participant', { token: state.participant });
    check('participant dashboard returns stats', pDash.status === 200 && typeof pDash.json.data.stats.totalRegistrations === 'number', pDash.json?.message);
    check('participant dashboard suggests events', Array.isArray(pDash.json.data.recommended));
  }

  /* --------------------------------------------------------- dashboard */
  section('Organizer dashboard & reports');
  {
    const d = await api('GET', '/api/dashboard', { token: state.organizer });
    check('GET /api/dashboard returns 200', d.status === 200, d.json?.message);
    check('dashboard has headline stats', d.json.data.stats.totalEvents > 0 && typeof d.json.data.stats.fillRate === 'number');
    check('dashboard has registrationsPerEvent series', Array.isArray(d.json.data.charts.registrationsPerEvent) && d.json.data.charts.registrationsPerEvent.length > 0);
    check('dashboard has category series', d.json.data.charts.byCategory.length > 0);
    check('dashboard has status series', d.json.data.charts.byStatus.length === 4);
    check('dashboard has a 14-day trend', d.json.data.charts.trend.length === 14);
    check('dashboard lists upcoming events', Array.isArray(d.json.data.upcoming));
    check('dashboard lists recent registrations', Array.isArray(d.json.data.recentRegistrations));

    const forbidden = await api('GET', '/api/dashboard', { token: state.participant });
    check('participant cannot open the organizer dashboard (403)', forbidden.status === 403);

    const report = await api('GET', `/api/dashboard/report/${state.testEventId}`, { token: state.organizer });
    check('per-event report works', report.status === 200 && report.json.data.event._id === state.testEventId, report.json?.message);

    const foreignReport = await api('GET', `/api/dashboard/report/${state.testEventId}`, { token: state.organizer2 });
    check('report is owner-only (403)', foreignReport.status === 403);
  }

  /* ------------------------------------------------------------ venues */
  section('Venue management');
  {
    const created = await api('POST', '/api/venues', {
      token: state.organizer,
      body: { name: 'Smoke Test Hall', address: '1 Test Road', city: 'Chennai', capacity: 75, facilities: 'Wi-Fi, Projector' },
    });
    check('organizer creates a venue (201)', created.status === 201, created.json);
    check('facilities parsed from a comma string', created.json?.data?.facilities?.length === 2);
    state.venueId = created.json?.data?._id;

    const byParticipant = await api('POST', '/api/venues', {
      token: state.participant,
      body: { name: 'Nope', city: 'X', capacity: 10 },
    });
    check('participant cannot create a venue (403)', byParticipant.status === 403);

    const invalid = await api('POST', '/api/venues', { token: state.organizer, body: { name: 'A', city: '', capacity: 0 } });
    check('venue validation returns 422', invalid.status === 422, invalid.json);

    const updated = await api('PUT', `/api/venues/${state.venueId}`, { token: state.organizer, body: { capacity: 90 } });
    check('venue update works', updated.status === 200 && updated.json.data.capacity === 90, updated.json);

    const foreign = await api('PUT', `/api/venues/${state.venueId}`, { token: state.organizer2, body: { capacity: 1 } });
    check('another organizer cannot edit the venue (403)', foreign.status === 403);

    const inUse = await api('GET', '/api/venues');
    const used = inUse.json.data.find((v) => v.eventCount > 0);
    const delUsed = await api('DELETE', `/api/venues/${used._id}`, { token: state.organizer });
    check('venue in use cannot be deleted (400)', delUsed.status === 400, delUsed.json);

    const del = await api('DELETE', `/api/venues/${state.venueId}`, { token: state.organizer });
    check('unused venue can be deleted', del.status === 200, del.json);
  }

  /* --------------------------------------------------- delete + cascade */
  section('Event deletion & cascade');
  {
    const guarded = await api('DELETE', `/api/events/${state.testEventId}`, { token: state.organizer });
    check('event with registrations is protected (400)', guarded.status === 400, guarded.json);

    const forced = await api('DELETE', `/api/events/${state.testEventId}?force=true`, { token: state.organizer });
    check('force=true deletes the event', forced.status === 200, forced.json);

    const gone = await api('GET', `/api/events/${state.testEventId}`);
    check('deleted event returns 404', gone.status === 404);

    const orphan = await api('GET', `/api/registrations/${state.reg3}`, { token: state.organizer });
    check('registrations were cascade-deleted', orphan.status === 404, orphan.json);
  }

  /* ---------------------------------------------------- static frontend */
  section('Static frontend delivery');
  {
    const home = await fetch(`${BASE}/`);
    const html = await home.text();
    check('GET / serves the HTML shell', home.status === 200 && /<html/i.test(html));
    check('index.html has a root container', /id="app"|id="root"|<main/i.test(html));

    const css = await fetch(`${BASE}/css/styles.css`);
    check('stylesheet is served', css.status === 200 && (css.headers.get('content-type') || '').includes('css'));

    const js = await fetch(`${BASE}/js/api.js`);
    check('client JS is served', js.status === 200 && (js.headers.get('content-type') || '').includes('javascript'));

    const traversal = await fetch(`${BASE}/../package.json`);
    check('path traversal is blocked', traversal.status !== 200 || !(await traversal.text()).includes('"name": "cloud-based-event'));

    const deep = await fetch(`${BASE}/some/client/route`);
    check('unknown non-API path falls back to the shell', deep.status === 200);
  }

  /* ------------------------------------------------------------- finish */
  server.close();
  fs.rmSync(TMP_DATA, { recursive: true, force: true });

  console.log(`\n${'-'.repeat(60)}`);
  if (failed === 0) {
    console.log(`\x1b[32m\x1b[1m  ALL ${passed} CHECKS PASSED\x1b[0m`);
  } else {
    console.log(`\x1b[31m\x1b[1m  ${failed} FAILED\x1b[0m, ${passed} passed`);
    console.log('\n  Failures:');
    for (const f of failures) console.log(`    - ${f}`);
  }
  console.log(`${'-'.repeat(60)}\n`);

  process.exit(failed === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error('\n\x1b[31mTest runner crashed:\x1b[0m', err);
  fs.rmSync(TMP_DATA, { recursive: true, force: true });
  process.exit(1);
});
