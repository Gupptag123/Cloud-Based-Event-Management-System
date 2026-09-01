/**
 * tests/render.test.js
 * ---------------------------------------------------------------------------
 * Frontend render tests. Boots the real server against a throwaway data dir,
 * seeds it, then loads the actual frontend/js/*.js files into a minimal DOM
 * (tests/dom-shim.js) and walks every route as a guest, a participant and an
 * organizer — asserting each screen builds without throwing and shows the
 * content it is supposed to show.
 *
 *   npm run test:ui
 *
 * No browser, no npm dependencies.
 * ---------------------------------------------------------------------------
 */

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const TMP_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'cbems-ui-'));
process.env.DATA_DIR = TMP_DATA;
process.env.NODE_ENV = 'test';
process.env.PORT = process.env.UI_TEST_PORT || '5098';
process.env.JWT_SECRET = 'ui-test-secret';

// eslint-disable-next-line import/order
const { start } = require('../server');
// eslint-disable-next-line import/order
const { seed } = require('../scripts/seed');
const { createWindow, loadScripts } = require('./dom-shim');

const BASE = `http://127.0.0.1:${process.env.PORT}`;
const FRONTEND = path.join(__dirname, '..', 'frontend', 'js');
const SCRIPTS = ['api.js', 'ui.js', 'views-public.js', 'views-account.js', 'views-organizer.js', 'app.js']
  .map((f) => path.join(FRONTEND, f));

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
    console.log(`  \x1b[31m✗\x1b[0m ${name}${extra ? `\n      ${String(extra).slice(0, 400)}` : ''}`);
  }
}

function section(title) {
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}

/** Wait for pending microtasks/timers so a view's background loads settle. */
function settle(ms = 60) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* -------------------------------------------------------------------------- */

async function main() {
  const server = start(Number(process.env.PORT));
  await settle(300);
  seed();

  console.log(`\n\x1b[1mCBEMS frontend render tests\x1b[0m  (${BASE})`);

  /* ------------------------------------------------------- boot the app */
  section('Application boot');

  const win = createWindow({ url: BASE });
  const errors = [];
  win.console = Object.assign({}, console, {
    error: (...args) => {
      errors.push(args.map(String).join(' '));
      // Keep the log quiet; failures are reported through checks below.
    },
  });

  // The shell that index.html provides.
  const app = win.document.createElement('div');
  app.setAttribute('id', 'app');
  win.document.body.appendChild(app);

  win.location.hash = '#/';

  let booted = true;
  try {
    loadScripts(SCRIPTS, win);
  } catch (err) {
    booted = false;
    check('frontend scripts evaluate without throwing', false, err.stack);
  }

  if (!booted) {
    server.close();
    process.exit(1);
  }

  check('frontend scripts evaluate without throwing', true);

  const CBEMS = win.CBEMS;
  check('CBEMS namespace is exposed', Boolean(CBEMS));
  check('api client is registered', Boolean(CBEMS && CBEMS.api && CBEMS.api.events));
  check('ui toolkit is registered', Boolean(CBEMS && CBEMS.ui && CBEMS.ui.h));
  check('router is registered', Boolean(CBEMS && CBEMS.router && CBEMS.router.render));

  const VIEW_NAMES = [
    'home', 'browse', 'eventDetail', 'login', 'signup',
    'participantDashboard', 'myRegistrations', 'profile',
    'organizerDashboard', 'manageEvents', 'eventForm', 'manageVenues',
    'manageRegistrations', 'report',
  ];
  const missing = VIEW_NAMES.filter((n) => typeof CBEMS.views[n] !== 'function');
  check('every route has a view function', missing.length === 0, missing.join(', '));

  // Every route in the table must point at a real view.
  const danglingRoutes = CBEMS.router.ROUTES.filter((r) => typeof CBEMS.views[r.view] !== 'function');
  check('no route points at a missing view', danglingRoutes.length === 0,
    danglingRoutes.map((r) => r.path).join(', '));

  await settle(250);

  const main = () => win.document.getElementById('main');
  const text = () => (main() ? main().textContent : '');
  const html = () => win.document.body.textContent;

  check('masthead renders', html().includes('Event Manager'));
  check('main outlet exists', Boolean(main()));

  /* ---------------------------------------------------------- helper */

  async function go(hash) {
    errors.length = 0;
    win.location.hash = hash;
    await settle(30);
    await CBEMS.router.render();
    await settle(220);
  }

  function checkRoute(label, hash, expectations) {
    return go(hash).then(() => {
      const body = text();
      const missingBits = expectations.filter((needle) => !body.includes(needle));
      check(label, missingBits.length === 0 && errors.length === 0,
        missingBits.length ? `missing: ${missingBits.join(' | ')}` : errors.join(' | '));
      return body;
    });
  }

  /* --------------------------------------------------------- guest routes */
  section('Public routes (signed out)');

  await checkRoute('landing page renders the hero and live stats', '#/',
    ['Browse events', 'Create an account']);
  check('landing page lists upcoming events from the API', text().includes('Seats') || text().includes('Open entry'),
    text().slice(0, 200));

  await checkRoute('browse page renders the filter toolbar', '#/events',
    ['All categories', 'Sort']);
  check('browse page has a search box',
    Boolean(main().querySelector('input[type="search"]')), 'no search input');

  await checkRoute('browse page honours a category filter', '#/events?category=Technical',
    ['Technical']);

  await checkRoute('sign-in page renders with demo accounts', '#/login',
    ['Sign in', 'organizer@demo.com']);

  await checkRoute('sign-up page renders the role picker', '#/signup',
    ['Create', 'Participant', 'Organizer']);

  await checkRoute('unknown route shows the 404 screen', '#/no/such/page',
    ['404', 'does not exist']);

  // A guarded route while signed out must bounce to the sign-in screen.
  await go('#/manage/events');
  check('guarded route redirects a guest to sign-in',
    win.location.hash.startsWith('#/login') && text().includes('Sign in'),
    win.location.hash);

  /* --------------------------------------------------- a real event page */
  section('Event detail');

  const listRes = await fetch(`${BASE}/api/events?limit=5`);
  const listJson = await listRes.json();
  const sample = listJson.data[0];
  check('seeded events are available over the API', Boolean(sample), JSON.stringify(listJson).slice(0, 200));

  await checkRoute('event detail renders title, venue and capacity', `#/events/${sample._id}`,
    [sample.title, 'Sign in to register']);
  check('event detail shows a capacity gauge or open entry',
    text().includes('seats') || text().includes('registered') || text().includes('Open entry'));

  await go('#/events/does-not-exist');
  check('missing event shows a friendly error',
    text().includes('Event not found') && text().includes('Back to all events'),
    text().slice(0, 160));

  /* --------------------------------------------------- participant flows */
  section('Participant routes');

  async function signIn(email, password) {
    const res = await CBEMS.api.auth.login({ email, password });
    CBEMS.session.start(res.data);
    return res.data.user;
  }

  const participant = await signIn('participant@demo.com', 'demo1234');
  check('participant signs in', participant.role === 'participant', JSON.stringify(participant));

  await checkRoute('participant dashboard renders stats and timeline', '#/home',
    ['Registered', 'Approved', 'Pending']);
  check('participant dashboard greets the user by name',
    text().includes(participant.name.split(' ')[0]), text().slice(0, 160));

  await checkRoute('my registrations renders the tracker table', '#/my-registrations',
    ['My registrations', 'Status']);

  await checkRoute('profile renders both forms', '#/profile',
    ['Edit your information', 'Change password', participant.email]);

  await go('#/dashboard');
  check('participant is blocked from the organizer dashboard',
    text().includes('Organizers only'), text().slice(0, 160));

  await go('#/login');
  check('signed-in user is redirected away from sign-in',
    !win.location.hash.startsWith('#/login'), win.location.hash);

  /* ----------------------------------------------------- organizer flows */
  section('Organizer routes');

  const organizer = await signIn('organizer@demo.com', 'demo1234');
  check('organizer signs in', organizer.role === 'organizer', JSON.stringify(organizer));

  await checkRoute('organizer dashboard renders all headline stats', '#/dashboard',
    ['Events', 'Registrations', 'Pending', 'Fill rate', 'Approval rate', 'Revenue']);
  check('organizer dashboard draws the per-event bar chart',
    Boolean(main().querySelector('.chart')), 'no .chart element found');
  check('organizer dashboard draws a donut legend',
    Boolean(main().querySelector('.legend')), 'no .legend element found');
  check('organizer dashboard renders SVG chart nodes',
    main().querySelectorAll('svg').length >= 2,
    `svg count = ${main().querySelectorAll('svg').length}`);

  await checkRoute('manage events renders the table', '#/manage/events',
    ['My events', 'Venue', 'Seats', 'Edit']);
  const eventRows = main().querySelectorAll('tbody tr').length;
  check('manage events lists the organizer\'s events', eventRows > 0, `rows = ${eventRows}`);

  await checkRoute('new event form renders every fieldset', '#/manage/events/new',
    ['Create an event', 'Event title', 'Registration deadline', 'Capacity', 'Venue', 'Status']);
  check('new event form has a date input',
    Boolean(main().querySelector('input[type="date"]')), 'no date input');
  check('venue select is populated from the API',
    main().querySelectorAll('select option').length > 3,
    `options = ${main().querySelectorAll('select option').length}`);

  // Find an event this organizer owns so the edit form has something to load.
  const mineRes = await CBEMS.api.events.list({ mine: 'true', when: 'all', limit: 5 });
  const owned = mineRes.data[0];
  check('organizer owns at least one seeded event', Boolean(owned));

  await checkRoute('edit event form pre-fills the event', `#/manage/events/${owned._id}`,
    [owned.title, 'Save changes']);
  const titleField = main().querySelector('input[id="title"]');
  check('edit form pre-fills the title input', titleField && titleField.value === owned.title,
    titleField ? titleField.value : 'no title input');

  await checkRoute('manage venues renders venue cards', '#/manage/venues',
    ['Venues', 'capacity']);
  check('venue cards are rendered', main().querySelectorAll('.card').length > 0,
    `cards = ${main().querySelectorAll('.card').length}`);

  await checkRoute('approval queue renders the summary and rows', '#/manage/registrations',
    ['Registrations', 'Pending', 'Approved', 'Rejected']);
  const queueRows = main().querySelectorAll('tbody tr').length;
  check('approval queue lists pending registrations', queueRows > 0, `rows = ${queueRows}`);
  check('approval queue offers approve and reject buttons',
    main().textContent.includes('Approve') && main().textContent.includes('Reject'));

  await checkRoute('event report renders the participant list', `#/report/${owned._id}`,
    [owned.title, 'Participant list', 'Export CSV', 'Status breakdown']);

  /* -------------------------------------------------- interactive checks */
  section('Interactions');

  // Approve a pending registration straight through the rendered UI.
  await go('#/manage/registrations?status=pending');
  const firstApprove = main().querySelectorAll('tbody tr')[0];
  if (firstApprove) {
    const approveBtn = firstApprove.querySelectorAll('button').find
      ? firstApprove.querySelectorAll('button').find((b) => b.textContent === 'Approve')
      : null;
    const before = await CBEMS.api.registrations.forOrganizer({ status: 'approved' });
    if (approveBtn) {
      approveBtn.fire('click', { currentTarget: approveBtn });
      await settle(300);
      const after = await CBEMS.api.registrations.forOrganizer({ status: 'approved' });
      check('clicking Approve in the queue approves the registration',
        after.data.length === before.data.length + 1,
        `before ${before.data.length} → after ${after.data.length}`);
    } else {
      check('clicking Approve in the queue approves the registration', false, 'no Approve button found');
    }
  } else {
    check('approval queue had a pending row to act on', false, 'queue was empty');
  }

  // Filter chips must re-query without a full navigation.
  await go('#/manage/registrations');
  const chips = main().querySelectorAll('.chip');
  check('status filter chips render', chips.length >= 4, `chips = ${chips.length}`);
  if (chips.length) {
    const approvedChip = chips.find ? chips.find((c) => c.textContent === 'Approved') : null;
    if (approvedChip) {
      approvedChip.fire('click', { currentTarget: approvedChip });
      await settle(250);
      check('clicking a status chip refilters the queue',
        win.location.hash.includes('status=approved'), win.location.hash);
    }
  }

  // Browse-page search wiring: setQuery must reach the URL.
  await go('#/events');
  const search = main().querySelector('input[type="search"]');
  check('browse page exposes a search input', Boolean(search));
  if (search) {
    search.value = 'Hackathon';
    search.fire('input', { target: search });
    await settle(600);
    check('typing in search updates the URL and reloads results',
      win.location.hash.includes('search=Hackathon'), win.location.hash);
  }

  // Sign out through the masthead.
  CBEMS.session.end();
  await go('#/');
  check('signing out restores the guest masthead',
    win.document.body.textContent.includes('Create account'));
  check('session is cleared from storage', win.localStorage.getItem('cbems.token') === null);

  /* ------------------------------------------------------ toolkit checks */
  section('UI toolkit');

  const { ui } = CBEMS;
  check('h() builds nested elements',
    ui.h('div.card', { id: 'x' }, ui.h('span', 'hi')).querySelector('span').textContent === 'hi');
  check('h() creates SVG in the SVG namespace',
    ui.h('svg', ui.h('circle', { r: 3 })).querySelector('circle').namespaceURI === 'http://www.w3.org/2000/svg');
  check('fmt.date formats a plain date without a UTC shift',
    ui.fmt.date('2026-08-24') === 'Mon 24 Aug', ui.fmt.date('2026-08-24'));
  check('fmt.money renders rupees and Free', ui.fmt.money(250) === '₹250' && ui.fmt.money(0) === 'Free');
  check('fmt.time converts to 12-hour', ui.fmt.time('14:30') === '2:30 PM', ui.fmt.time('14:30'));
  check('gauge reports percent full', ui.gauge(25, 50).textContent.includes('50%'));
  check('gauge handles unlimited capacity', ui.gauge(7, 0).textContent.includes('7 registered'));
  check('donut chart renders an empty state for no data',
    ui.chart.donut([]).textContent.includes('No data'));
  check('bar chart renders rows',
    ui.chart.bars([{ label: 'A', approved: 3, pending: 1, capacity: 10 }]).querySelectorAll('rect').length >= 3);
  check('line chart needs two points',
    ui.chart.line([{ label: 'a', value: 1 }]).textContent.includes('Not enough data'));
  check('pass card shows the punched date stub',
    ui.passCard({ title: 'T', date: '2026-08-24', time: '09:00', category: 'Technical', capacity: 10, seatsLeft: 4 })
      .textContent.includes('AUG'));
  check('applyFieldErrors marks the right field',
    (() => {
      const form = ui.h('form', ui.field({ label: 'Title', name: 'title', control: ui.h('input') }));
      ui.applyFieldErrors(form, { title: 'Required' });
      return form.querySelector('.field--invalid') !== null && form.textContent.includes('Required');
    })());

  /* ------------------------------------------------------------- finish */
  server.close();
  fs.rmSync(TMP_DATA, { recursive: true, force: true });

  console.log(`\n${'-'.repeat(60)}`);
  if (failed === 0) {
    console.log(`\x1b[32m\x1b[1m  ALL ${passed} RENDER CHECKS PASSED\x1b[0m`);
  } else {
    console.log(`\x1b[31m\x1b[1m  ${failed} FAILED\x1b[0m / ${passed + failed} checks`);
    failures.forEach((f) => console.log(`    · ${f}`));
  }
  console.log(`${'-'.repeat(60)}\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\n\x1b[31mRender test crashed\x1b[0m\n', err);
  fs.rmSync(TMP_DATA, { recursive: true, force: true });
  process.exit(1);
});
