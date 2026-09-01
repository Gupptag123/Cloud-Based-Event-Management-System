# Cloud-Based Event Management System

A complete, working web application for publishing events, taking registrations, approving
attendees and tracking capacity in real time.

Built to run with **zero setup**: no database server to install, no build step, no bundler.
Clone it, run two commands, and the whole system — REST API and web interface — is live on
your machine.

```
npm install
npm start
```

Then open **http://localhost:5000** and sign in with `organizer@demo.com` / `demo1234`.

---

## Table of contents

1. [What it does](#what-it-does)
2. [Screens](#screens)
3. [Technology](#technology)
4. [Quick start](#quick-start)
5. [Demo accounts](#demo-accounts)
6. [Folder structure](#folder-structure)
7. [Configuration](#configuration)
8. [REST API reference](#rest-api-reference)
9. [Business rules](#business-rules)
10. [Data model](#data-model)
11. [Testing](#testing)
12. [Moving to MongoDB](#moving-to-mongodb)
13. [Troubleshooting](#troubleshooting)

---

## What it does

The system serves three kinds of user, and the interface changes to match the role of
whoever is signed in.

**Participants** discover events through search, category, city, date-window and
availability filters, register for the ones they want (optionally requesting several seats
and leaving a note for the organizer), then track every request from a personal dashboard.
They can withdraw a registration to release the seat at any time before the event.

**Organizers** create and publish events against a venue, set a capacity and a registration
deadline, then work through the incoming requests from an approval queue — approving or
rejecting individually or in bulk. An analytics dashboard shows fill rate, approval rate,
revenue, a per-event registration chart, a fourteen-day trend line and category/status
breakdowns. Every event has a printable report with the full participant list and a CSV
export.

**Admins** are organizers with platform-wide reach: they see and moderate every event
rather than only their own.

Four capabilities were treated as core requirements and are enforced end to end, in the
API as well as the interface:

- **Capacity and deadline enforcement.** Registration is refused once seats run out or the
  deadline passes, and an approval that would push an event past its capacity is rejected
  even in a bulk action.
- **Approve / reject workflow.** Every registration starts as `pending` and only becomes a
  confirmed seat when the organizer approves it.
- **Search, filter and sort.** Free-text search across title, venue, city, organizer and
  tags, combined with category, city, time-window and availability filters and four sort
  orders — all reflected in the URL so any view can be bookmarked or shared.
- **Organizer dashboard with charts.** Hand-drawn SVG bar, donut and trend charts, with no
  charting library and no network access required.

## Screens

| Route | Who | What |
| --- | --- | --- |
| `/` | anyone | Landing page: live platform stats, category shortcuts, upcoming events |
| `/events` | anyone | Event discovery — search, filters, sort, pagination |
| `/events/:id` | anyone | Event detail with the capacity gauge and the register action |
| `/login`, `/signup` | guests | Authentication, with one-click demo logins |
| `/home` | participant | Personal dashboard: stats, upcoming timeline, recommendations |
| `/my-registrations` | participant | Every request with its status, and the withdraw action |
| `/profile` | signed in | Edit details, change password, sign out |
| `/dashboard` | organizer | Analytics: headline stats and four charts |
| `/manage/events` | organizer | Event table with status control, edit, report and delete |
| `/manage/events/new`, `/manage/events/:id` | organizer | Create / edit event form |
| `/manage/venues` | organizer | Venue cards with add, edit and delete |
| `/manage/registrations` | organizer | The approval queue, with bulk decisions |
| `/report/:id` | organizer | Printable per-event report and CSV export |

## Technology

| Layer | Choice | Why |
| --- | --- | --- |
| Runtime | Node.js 18+ | `fetch`, `crypto` and the test runner are all built in |
| HTTP framework | `express-lite` (bundled in `lib/`) | Express-compatible routing, middleware and static serving with no `node_modules` — the app automatically prefers real Express if it happens to be installed |
| Database | JSON file store (`lib/database.js`) | Collection API modelled on Mongoose so the storage layer can be swapped for MongoDB without touching controllers |
| Auth | Signed JWTs + `scrypt` password hashing (`lib/security.js`) | Both are in Node's `crypto` module; no `jsonwebtoken`, no `bcrypt` |
| Frontend | Plain HTML, CSS and ES2020 JavaScript | No framework, no bundler, no CDN — the whole interface works offline |
| Charts | Hand-generated inline SVG (`frontend/js/ui.js`) | Removes the last external dependency |

The result is a `dependencies` block that is genuinely empty:

```json
"dependencies": {}
```

`npm install` therefore downloads nothing and cannot fail behind a firewall or a proxy.

## Quick start

**Requirements:** Node.js 18 or newer. Check with `node --version`.

```bash
# 1. install (installs nothing — the project has no dependencies)
npm install

# 2. load the demo accounts, venues, events and registrations
npm run seed

# 3. start the server
npm start
```

The server prints its address, the storage location and a record count on boot:

```
  Cloud-Based Event Management System
  ------------------------------------------------------------
  ● Server ready       http://localhost:5000
  ● API base           http://localhost:5000/api
  ● Framework          express-lite (bundled, zero-dependency)
  ● Storage            JSON file database (./data)
  ● Records            8 users · 14 events · 7 venues · 38 registrations
```

### Every command

| Command | What it does |
| --- | --- |
| `npm start` | Start the server on port 5000 |
| `npm run dev` | Same, with `--watch` so edits restart the server |
| `npm run seed` | Load demo data (skips if data already exists) |
| `npm run reset` | Wipe the database and re-seed from scratch |
| `npm test` | 124 API smoke tests against a throwaway database |
| `npm run test:ui` | 67 frontend render tests (real views, headless DOM) |
| `npm run test:all` | Both suites |

## Demo accounts

`npm run seed` creates these. The sign-in page has one-click buttons for the first three.

| Role | Email | Password |
| --- | --- | --- |
| Organizer | `organizer@demo.com` | `demo1234` |
| Organizer | `rahul@demo.com` | `demo1234` |
| Participant | `participant@demo.com` | `demo1234` |
| Participant | `arjun@demo.com` | `demo1234` |
| Admin | `admin@demo.com` | `admin1234` |

Sign in as the organizer to see the dashboard, the approval queue with real pending
requests, and the event management screens. Sign in as the participant to see discovery,
registration and the personal tracker.

## Folder structure

```
Cloud-Based Event Management System/
├── server.js                  Entry point — boots the HTTP server
├── app.js                     Middleware chain, static hosting, SPA fallback
├── package.json               Scripts and metadata (no dependencies)
│
├── config/
│   └── config.js              Central config, .env loader, categories, statuses
│
├── lib/                       The zero-dependency platform
│   ├── express-lite.js        Express-compatible router, middleware, static files
│   ├── framework.js           Picks real Express when installed, else express-lite
│   ├── database.js            JSON file database with a Mongoose-like collection API
│   ├── security.js            JWT sign/verify and scrypt password hashing
│   ├── validate.js            Declarative request validator
│   └── errors.js              Typed HTTP errors (badRequest, notFound, conflict, …)
│
├── models/                    Data access and business rules
│   ├── user.model.js
│   ├── venue.model.js
│   ├── event.model.js         Availability decoration, capacity, deadline state
│   └── registration.model.js  Duplicate, capacity and deadline enforcement
│
├── controllers/               Request handlers, one per resource
│   ├── auth.controller.js
│   ├── event.controller.js
│   ├── venue.controller.js
│   ├── registration.controller.js
│   └── dashboard.controller.js
│
├── middleware/
│   ├── auth.js                authenticate / optionalAuth / authorize(role)
│   └── common.js              Body parsing, logging, CORS, rate limiting, errors
│
├── routes/
│   └── index.js               Every API route in one readable table
│
├── frontend/                  The web interface (served as static files)
│   ├── index.html             The shell: #app, stylesheet, six scripts
│   ├── css/
│   │   └── styles.css         Design tokens and every component
│   └── js/
│       ├── api.js             REST client + session store
│       ├── ui.js              DOM builder, formatters, modals, SVG charts
│       ├── views-public.js    Home, browse, event detail, login, signup
│       ├── views-account.js   Participant dashboard, registrations, profile
│       ├── views-organizer.js Dashboard, event/venue management, queue, report
│       └── app.js             Hash router, route guards, masthead, footer
│
├── scripts/
│   └── seed.js                Demo data generator
│
├── tests/
│   ├── smoke.test.js          124 end-to-end API checks
│   ├── render.test.js         67 frontend render checks
│   └── dom-shim.js            Minimal DOM so the real views run in Node
│
└── data/                      Created at runtime — the JSON database
    ├── users.json
    ├── venues.json
    ├── events.json
    └── registrations.json
```

## Configuration

Everything has a working default, so no configuration is required. To override, create a
`.env` file in the project root (see `.env.example`):

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `5000` | HTTP port |
| `HOST` | `0.0.0.0` | Bind address |
| `NODE_ENV` | `development` | Set to `production` to harden defaults |
| `DATA_DIR` | `./data` | Where the JSON database lives |
| `JWT_SECRET` | development secret | **Change this for any real deployment** |
| `JWT_EXPIRES_IN_SECONDS` | `28800` (8 h) | Token lifetime |
| `DB_DRIVER` | `json` | `json` or `mongodb` (see below) |
| `MONGO_URI` | — | Connection string when `DB_DRIVER=mongodb` |
| `CORS_ORIGIN` | `*` | Restrict API access to one origin |

## REST API reference

Base URL `/api`. Every response uses the same envelope:

```json
{
  "success": true,
  "message": "Event created",
  "data": { },
  "pagination": { "page": 1, "pages": 3, "total": 28, "hasNext": true, "hasPrev": false },
  "meta": { },
  "errors": { "title": "Title is required" }
}
```

Authenticated calls send `Authorization: Bearer <token>`. **Auth** column: `—` public,
`user` any signed-in user, `organizer` organizer or admin.

### Authentication

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| `POST` | `/api/auth/register` | — | Create an account, returns a token |
| `POST` | `/api/auth/login` | — | Sign in, returns a token and the user |
| `GET` | `/api/auth/me` | user | The signed-in user |
| `PUT` | `/api/auth/me` | user | Update name, phone, organization |
| `PUT` | `/api/auth/password` | user | Change password |
| `GET` | `/api/auth/config` | — | Categories, statuses and limits for the client |

### Events

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/api/events` | — | List with search, filters, sort and pagination |
| `GET` | `/api/events/categories` | — | Categories with live event counts |
| `GET` | `/api/events/:id` | — | One event, decorated with availability |
| `POST` | `/api/events` | organizer | Create an event |
| `PUT` | `/api/events/:id` | organizer | Update an event (owner only) |
| `PATCH` | `/api/events/:id/status` | organizer | Draft / publish / cancel / complete |
| `DELETE` | `/api/events/:id` | organizer | Delete; `?force=true` cascades registrations |
| `GET` | `/api/events/:id/registrations` | organizer | Registrations for one event |

`GET /api/events` accepts `search`, `category`, `city`, `status`, `when`
(`upcoming` \| `past` \| `all`), `availability` (`open` \| `full`), `mine=true`,
`sort` (`date` \| `title` \| `popularity` \| `created`), `order` (`asc` \| `desc`),
`page` and `limit`.

### Venues

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/api/venues` | — | List venues, with `search` |
| `GET` | `/api/venues/:id` | — | One venue |
| `POST` | `/api/venues` | organizer | Create a venue |
| `PUT` | `/api/venues/:id` | organizer | Update a venue (owner only) |
| `DELETE` | `/api/venues/:id` | organizer | Delete, refused while events use it |

### Registrations

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| `POST` | `/api/registrations` | user | Register for an event |
| `GET` | `/api/registrations/mine` | user | The caller's registrations |
| `GET` | `/api/registrations` | organizer | The approval queue |
| `GET` | `/api/registrations/:id` | user | One registration (participant or organizer) |
| `PATCH` | `/api/registrations/:id/decision` | organizer | Approve, reject or reset to pending |
| `POST` | `/api/registrations/bulk-decision` | organizer | Decide many at once |
| `DELETE` | `/api/registrations/:id` | user | Withdraw and release the seat |

### Dashboard and reporting

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/api/dashboard` | organizer | Stats plus four chart series |
| `GET` | `/api/dashboard/participant` | user | Personal stats, upcoming, recommendations |
| `GET` | `/api/dashboard/report/:eventId` | organizer | Full participant list for one event |
| `GET` | `/api/dashboard/platform` | — | Public counters for the landing page |
| `GET` | `/api/health` | — | Liveness, version and storage driver |

### Trying the API by hand

```bash
# sign in and keep the token
TOKEN=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"organizer@demo.com","password":"demo1234"}' \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).data.token')

# the approval queue
curl -s http://localhost:5000/api/registrations?status=pending \
  -H "Authorization: Bearer $TOKEN"

# search and sort
curl -s 'http://localhost:5000/api/events?search=cloud&sort=popularity&order=desc'
```

## Business rules

These are enforced in the models, so they hold no matter which client calls the API.

**Registration is refused** when the participant has already registered for that event,
when the event is not `published`, when the registration deadline has passed, when the
event date has passed, or when the requested seats exceed the seats left.

**Approval is refused** when confirming it would take the approved seat count past the
event's capacity — including inside a bulk decision, where the offending rows are reported
back individually in `data.failed` while the rest still succeed.

**Capacity is bounded by the venue.** An event's capacity can never exceed the capacity of
the venue it is booked into; the form warns before the server refuses.

**The deadline cannot follow the event.** `registrationDeadline` must fall on or before
`date`, and defaults to the event date when left blank.

**Seats are counted from approved plus pending** registrations, so a pending request holds
a provisional seat and two participants cannot be promised the same chair.

**Withdrawing releases the seat** immediately, and the participant may register again
later if the event is still open.

**Ownership is checked on every mutation.** Organizers can only edit their own events and
venues, and only decide registrations for their own events. Admins bypass this.

**Deleting an event with registrations is refused** unless `?force=true` is passed, which
cascades the deletion to its registrations.

## Data model

```
User            _id, name, email (unique), passwordHash, role, phone,
                organization, createdAt

Venue           _id, name, address, city, capacity, facilities[], createdBy, createdAt

Event           _id, title, description, category, date, time, endTime,
                registrationDeadline, venueId, organizerId, capacity, fee,
                status, tags[], bannerColor, createdAt, updatedAt

Registration    _id, eventId, participantId, seats, notes, status,
                regDate, decidedAt, decidedBy
```

Events are **decorated** on the way out with everything a client needs to make a decision
without a second call: `venue`, `organizer`, `registrations{total,pending,approved,
rejected,cancelled,occupied}`, `seatsTaken`, `seatsLeft`, `percentFull`, `isFull`,
`deadlinePassed`, `eventPassed`, `daysUntilEvent`, `registrationOpen` and, when closed, a
human-readable `closedReason`.

Relationships are by id — `Event.venueId → Venue`, `Event.organizerId → User`,
`Registration.eventId → Event`, `Registration.participantId → User` — which is exactly the
shape MongoDB references take, so the migration below is mechanical.

## Testing

```bash
npm run test:all
```

**`npm test`** — 124 end-to-end API checks. Boots the real server on port 5099 against a
temporary data directory, so your `/data` is never touched. Covers registration and login,
token handling, validation errors, role permissions, ownership rules, the full
search/filter/sort matrix, pagination, capacity and deadline enforcement, the approve /
reject / bulk flows, cascade deletion, and static file delivery.

**`npm run test:ui`** — 67 frontend render checks. Loads the real `frontend/js/*.js` files
into a small DOM implementation (`tests/dom-shim.js`) and walks every route as a guest, a
participant and an organizer, asserting each screen builds without throwing and shows the
right content. It also drives real interactions: clicking **Approve** in the queue, using a
status filter chip, and typing in the search box. Both suites use only Node built-ins —
there is no test framework to install.

## Moving to MongoDB

The project is deliberately arranged so that swapping the storage engine touches one
folder. Controllers never see the database: they call model functions, and the models call
a collection API that was written to mirror Mongoose.

```js
// lib/database.js — the surface a driver has to provide
collection.find(filter, options)     collection.findById(id)
collection.findOne(filter)           collection.insertOne(doc)
collection.updateById(id, changes)   collection.deleteById(id)
collection.count(filter)             collection.deleteMany(filter)
```

To migrate:

1. `npm install mongoose` — the first real dependency.
2. Add Mongoose schemas for the four collections in `models/`. The field lists above are
   already schema-shaped; `_id` becomes an `ObjectId` and the `…Id` fields become
   `{ type: Schema.Types.ObjectId, ref: '…' }`.
3. Write `lib/database.mongo.js` exposing the same eight methods, and have
   `lib/database.js` return it when `config.storage.driver === 'mongodb'`.
4. Set `DB_DRIVER=mongodb` and `MONGO_URI=mongodb://localhost:27017/cbems` in `.env`.
5. Replace the manual joins in the models with `.populate()` where you prefer — the
   decorated response shape stays identical, so **no controller and no frontend file
   changes**.
6. Run `npm test`. The suite is storage-agnostic; if it passes, the migration is complete.

A `scripts/migrate.js` that reads the four JSON files and `insertMany`s them is the only
extra piece needed to carry the demo data across.

## Troubleshooting

**`EADDRINUSE: address already in use :::5000`** — another process holds the port. Start on
a different one: `PORT=5050 npm start`.

**The pages load but everything is empty** — the database has no records. Run
`npm run seed`.

**"Cannot reach the server. Is it still running?"** — the interface is open but the API is
not responding. Check the terminal running `npm start`.

**Sign-in fails with the demo accounts** — the database was seeded with different data, or
a password was changed. Run `npm run reset` to wipe and re-seed.

**I want to start completely fresh** — stop the server, delete the `data/` folder, then
`npm run seed`.

**Node version errors** — the project needs Node 18+ for built-in `fetch`. Check with
`node --version`.

---

## License

MIT. Built as an academic project.
