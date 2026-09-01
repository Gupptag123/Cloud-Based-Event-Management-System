/**
 * scripts/seed.js
 * ---------------------------------------------------------------------------
 * Loads demo data: user accounts, venues, events and registrations.
 *
 *   npm run seed            seed only if the database is empty
 *   npm run reset           wipe and re-seed  (node scripts/seed.js --force)
 * ---------------------------------------------------------------------------
 */

'use strict';

const db = require('../lib/database');
const userModel = require('../models/user.model');
const eventModel = require('../models/event.model');

const FORCE = process.argv.includes('--force') || process.argv.includes('-f');

/* -------------------------------------------------------------------------- */
/* Date helpers - all demo dates are relative to today so the data never      */
/* goes stale.                                                               */
/* -------------------------------------------------------------------------- */

function isoDaysFromNow(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const offsetMs = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - offsetMs).toISOString().slice(0, 10);
}

function isoTimestampDaysAgo(days, hour = 10) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, Math.floor(Math.random() * 60), 0, 0);
  return d.toISOString();
}

/* -------------------------------------------------------------------------- */

const USERS = [
  {
    key: 'organizer',
    name: 'Ananya Sharma',
    email: 'organizer@demo.com',
    password: 'demo1234',
    role: 'organizer',
    phone: '+91 98765 43210',
    organization: 'TechFest Committee',
  },
  {
    key: 'organizer2',
    name: 'Rahul Verma',
    email: 'rahul@demo.com',
    password: 'demo1234',
    role: 'organizer',
    phone: '+91 91234 56780',
    organization: 'Cultural Society',
  },
  {
    key: 'participant',
    name: 'Priya Nair',
    email: 'participant@demo.com',
    password: 'demo1234',
    role: 'participant',
    phone: '+91 90000 11122',
    organization: 'Dept. of Computer Science',
  },
  {
    key: 'p2',
    name: 'Arjun Mehta',
    email: 'arjun@demo.com',
    password: 'demo1234',
    role: 'participant',
    phone: '+91 90000 22233',
    organization: 'Dept. of Electronics',
  },
  {
    key: 'p3',
    name: 'Sneha Iyer',
    email: 'sneha@demo.com',
    password: 'demo1234',
    role: 'participant',
    phone: '+91 90000 33344',
    organization: 'Dept. of Mechanical',
  },
  {
    key: 'p4',
    name: 'Karthik Reddy',
    email: 'karthik@demo.com',
    password: 'demo1234',
    role: 'participant',
    phone: '+91 90000 44455',
    organization: 'Dept. of Civil',
  },
  {
    key: 'p5',
    name: 'Meera Joseph',
    email: 'meera@demo.com',
    password: 'demo1234',
    role: 'participant',
    phone: '+91 90000 55566',
    organization: 'Dept. of Information Technology',
  },
  {
    key: 'admin',
    name: 'System Administrator',
    email: 'admin@demo.com',
    password: 'admin1234',
    role: 'admin',
    phone: '+91 90000 00000',
    organization: 'CBEMS',
  },
];

const VENUES = [
  {
    key: 'audi',
    name: 'Main Auditorium',
    address: 'Academic Block A, Ground Floor',
    city: 'Bengaluru',
    capacity: 500,
    facilities: ['Projector', 'Air Conditioning', 'Sound System', 'Stage Lighting', 'Wheelchair Access'],
  },
  {
    key: 'seminar',
    name: 'Seminar Hall 2',
    address: 'Academic Block B, 2nd Floor',
    city: 'Bengaluru',
    capacity: 120,
    facilities: ['Projector', 'Air Conditioning', 'Whiteboard', 'Wi-Fi'],
  },
  {
    key: 'lab',
    name: 'Innovation Lab',
    address: 'Research Wing, 1st Floor',
    city: 'Bengaluru',
    capacity: 60,
    facilities: ['Workstations', 'High-speed Wi-Fi', '3D Printer', 'Power Outlets'],
  },
  {
    key: 'ground',
    name: 'Central Sports Ground',
    address: 'North Campus',
    city: 'Bengaluru',
    capacity: 1500,
    facilities: ['Floodlights', 'Seating Stands', 'First Aid Room', 'Changing Rooms'],
  },
  {
    key: 'openair',
    name: 'Open Air Theatre',
    address: 'Behind Central Library',
    city: 'Bengaluru',
    capacity: 800,
    facilities: ['Stage', 'Sound System', 'Tiered Seating'],
  },
  {
    key: 'conf',
    name: 'Cyber Convention Centre',
    address: '14 MG Road',
    city: 'Pune',
    capacity: 300,
    facilities: ['Projector', 'Air Conditioning', 'Video Conferencing', 'Catering'],
  },
  {
    key: 'incubator',
    name: 'Startup Incubation Hub',
    address: 'Tech Park Phase 2',
    city: 'Hyderabad',
    capacity: 80,
    facilities: ['Meeting Pods', 'Wi-Fi', 'Coffee Bar'],
  },
];

const EVENTS = [
  {
    key: 'hack',
    organizer: 'organizer',
    title: 'CloudHack 2026 — 24 Hour Hackathon',
    description:
      'A 24-hour team hackathon focused on building cloud-native applications. Teams of up to four compete across three tracks: sustainability, accessibility and developer tooling. Mentors from industry are available throughout, and the top three teams share a prize pool of ₹1,00,000. Laptops, power and overnight refreshments are provided; bring your own peripherals.',
    category: 'Hackathon',
    date: isoDaysFromNow(12),
    time: '09:00',
    endTime: '21:00',
    venue: 'lab',
    capacity: 60,
    deadlineOffset: 9,
    fee: 250,
    tags: ['cloud', 'teams', 'prizes', 'overnight'],
    status: 'published',
  },
  {
    key: 'aiworkshop',
    organizer: 'organizer',
    title: 'Hands-on Workshop: Deploying Node.js APIs to AWS',
    description:
      'A practical, laptop-required workshop covering the full deployment path for a Node.js REST API: containerising the service, provisioning an EC2 instance, wiring up an application load balancer, storing secrets safely and setting up basic CloudWatch monitoring. Participants finish with a live public endpoint of their own.',
    category: 'Workshop',
    date: isoDaysFromNow(5),
    time: '10:00',
    endTime: '16:00',
    venue: 'seminar',
    capacity: 45,
    deadlineOffset: 3,
    fee: 150,
    tags: ['aws', 'nodejs', 'devops', 'hands-on'],
    status: 'published',
  },
  {
    key: 'techsummit',
    organizer: 'organizer',
    title: 'Annual Technology Summit',
    description:
      'The flagship one-day summit brings together speakers from cloud infrastructure, machine learning and product engineering. The programme includes four keynote sessions, a panel discussion on the future of platform engineering, a student project showcase and an evening networking session with recruiting partners.',
    category: 'Conference',
    date: isoDaysFromNow(26),
    time: '09:30',
    endTime: '18:00',
    venue: 'audi',
    capacity: 400,
    deadlineOffset: 20,
    fee: 0,
    tags: ['keynote', 'networking', 'placements'],
    status: 'published',
  },
  {
    key: 'cultural',
    organizer: 'organizer2',
    title: 'Rangotsav — Cultural Night',
    description:
      'An evening of music, classical and contemporary dance, drama and stand-up from across every department. Entry is free for registered students; the headline performance begins at 19:30. Food stalls open from 17:00 on the lawn beside the theatre.',
    category: 'Cultural',
    date: isoDaysFromNow(18),
    time: '17:00',
    endTime: '22:00',
    venue: 'openair',
    capacity: 700,
    deadlineOffset: 15,
    fee: 0,
    tags: ['music', 'dance', 'drama', 'food stalls'],
    status: 'published',
  },
  {
    key: 'sports',
    organizer: 'organizer2',
    title: 'Inter-Department Sports Meet',
    description:
      'Three days of athletics, football, basketball, volleyball and cricket between departmental teams. Register as an individual for athletics events or as a team captain for the team sports. A valid student ID and a medical fitness declaration are required at check-in.',
    category: 'Sports',
    date: isoDaysFromNow(33),
    time: '07:00',
    endTime: '18:00',
    venue: 'ground',
    capacity: 600,
    deadlineOffset: 27,
    fee: 100,
    tags: ['athletics', 'football', 'cricket', 'teams'],
    status: 'published',
  },
  {
    key: 'seminar1',
    organizer: 'organizer',
    title: 'Seminar: Careers in Cloud Security',
    description:
      'A ninety-minute seminar with two practising cloud security engineers covering the day-to-day reality of the role, the certifications that actually matter to employers, how to build a home lab, and a live walk-through of a misconfigured storage bucket investigation.',
    category: 'Seminar',
    date: isoDaysFromNow(2),
    time: '14:00',
    endTime: '15:30',
    venue: 'seminar',
    capacity: 100,
    deadlineOffset: 1,
    fee: 0,
    tags: ['careers', 'security', 'certifications'],
    status: 'published',
  },
  {
    key: 'iot',
    organizer: 'organizer',
    title: 'IoT & Edge Computing Bootcamp',
    description:
      'A two-day bootcamp building a complete sensor-to-dashboard pipeline: flashing an ESP32, publishing over MQTT, buffering at the edge, and streaming into a cloud time-series store with alerting. Hardware kits are provided and may be kept by participants who complete both days.',
    category: 'Technical',
    date: isoDaysFromNow(40),
    time: '09:00',
    endTime: '17:00',
    venue: 'incubator',
    capacity: 30,
    deadlineOffset: 34,
    fee: 500,
    tags: ['iot', 'esp32', 'mqtt', 'hardware'],
    status: 'published',
  },
  {
    key: 'startup',
    organizer: 'organizer2',
    title: 'Startup Pitch Day',
    description:
      'Student founders pitch to a panel of angel investors and alumni entrepreneurs. Each team gets six minutes to present and four minutes of questions. Two teams are selected for a three-month incubation placement with desk space and mentoring.',
    category: 'Conference',
    date: isoDaysFromNow(21),
    time: '11:00',
    endTime: '16:00',
    venue: 'conf',
    capacity: 200,
    deadlineOffset: 17,
    fee: 0,
    tags: ['startups', 'pitching', 'investors'],
    status: 'published',
  },
  {
    key: 'datasci',
    organizer: 'organizer',
    title: 'Data Science with Python — Beginner Track',
    description:
      'An introductory session for students with no prior data science experience. Covers loading and cleaning a real dataset with pandas, producing meaningful visualisations, and fitting a first regression model. Anaconda should be installed beforehand; a setup guide is emailed on registration.',
    category: 'Workshop',
    date: isoDaysFromNow(8),
    time: '13:00',
    endTime: '17:00',
    venue: 'lab',
    capacity: 40,
    deadlineOffset: 6,
    fee: 100,
    tags: ['python', 'pandas', 'beginner'],
    status: 'published',
  },
  {
    key: 'robotics',
    organizer: 'organizer2',
    title: 'Robotics Challenge — Line Follower Finals',
    description:
      'Teams race self-built line-following robots through a timed obstacle course. Scoring combines completion time, accuracy at junctions and design documentation quality. Rulebook and track layout are published two weeks before the event.',
    category: 'Technical',
    date: isoDaysFromNow(15),
    time: '10:00',
    endTime: '18:00',
    venue: 'audi',
    capacity: 24,
    deadlineOffset: 11,
    fee: 300,
    tags: ['robotics', 'competition', 'hardware'],
    status: 'published',
  },
  {
    key: 'past1',
    organizer: 'organizer',
    title: 'Intro to Version Control with Git',
    description:
      'A completed introductory session on branching strategies, resolving merge conflicts, writing useful commit messages and collaborating through pull requests on GitHub.',
    category: 'Workshop',
    date: isoDaysFromNow(-14),
    time: '10:00',
    endTime: '13:00',
    venue: 'seminar',
    capacity: 80,
    deadlineOffset: 16,
    fee: 0,
    tags: ['git', 'github', 'collaboration'],
    status: 'completed',
  },
  {
    key: 'past2',
    organizer: 'organizer2',
    title: 'Freshers Welcome Evening',
    description:
      'A completed orientation and welcome evening for the incoming cohort, including departmental introductions, a club fair and a performance from the college band.',
    category: 'Cultural',
    date: isoDaysFromNow(-30),
    time: '16:00',
    endTime: '20:00',
    venue: 'openair',
    capacity: 600,
    deadlineOffset: 33,
    fee: 0,
    tags: ['orientation', 'clubs'],
    status: 'completed',
  },
  {
    key: 'draft1',
    organizer: 'organizer',
    title: 'Kubernetes Deep Dive (Planning)',
    description:
      'Draft event, not yet published. Intended as a full-day deep dive into pod scheduling, services and ingress, config maps and secrets, horizontal autoscaling and rolling deployments.',
    category: 'Technical',
    date: isoDaysFromNow(55),
    time: '09:00',
    endTime: '17:00',
    venue: 'lab',
    capacity: 50,
    deadlineOffset: 48,
    fee: 400,
    tags: ['kubernetes', 'containers'],
    status: 'draft',
  },
  {
    key: 'closed',
    organizer: 'organizer',
    title: 'Resume Clinic — Registration Closed',
    description:
      'A one-to-one resume review clinic with alumni reviewers. Registration for this event has already closed, which demonstrates the deadline enforcement rule in the system.',
    category: 'Seminar',
    date: isoDaysFromNow(4),
    time: '11:00',
    endTime: '15:00',
    venue: 'seminar',
    capacity: 30,
    deadlineOffset: 5, // deadline was yesterday -> registration closed
    fee: 0,
    tags: ['careers', 'resume', 'alumni'],
    status: 'published',
  },
];

/**
 * Registrations: [eventKey, userKey, status, daysAgo]
 * Deliberately includes a mixture of pending / approved / rejected / cancelled
 * so the dashboard charts and the approve-reject queue are populated.
 */
const REGISTRATIONS = [
  ['hack', 'participant', 'approved', 6],
  ['hack', 'p2', 'approved', 5],
  ['hack', 'p3', 'pending', 3],
  ['hack', 'p4', 'pending', 2],
  ['hack', 'p5', 'approved', 5],

  ['aiworkshop', 'participant', 'approved', 8],
  ['aiworkshop', 'p2', 'pending', 4],
  ['aiworkshop', 'p3', 'approved', 7],
  ['aiworkshop', 'p4', 'rejected', 6],

  ['techsummit', 'participant', 'pending', 1],
  ['techsummit', 'p2', 'approved', 9],
  ['techsummit', 'p3', 'approved', 9],
  ['techsummit', 'p4', 'approved', 8],
  ['techsummit', 'p5', 'pending', 1],

  ['cultural', 'participant', 'approved', 4],
  ['cultural', 'p3', 'approved', 4],
  ['cultural', 'p4', 'cancelled', 5],
  ['cultural', 'p5', 'pending', 2],

  ['sports', 'p2', 'approved', 3],
  ['sports', 'p4', 'pending', 1],

  ['seminar1', 'participant', 'approved', 2],
  ['seminar1', 'p5', 'approved', 2],
  ['seminar1', 'p2', 'pending', 1],

  ['iot', 'p3', 'pending', 1],
  ['iot', 'p5', 'approved', 3],

  ['startup', 'participant', 'approved', 5],
  ['startup', 'p2', 'approved', 5],

  ['datasci', 'p3', 'approved', 4],
  ['datasci', 'p4', 'approved', 4],
  ['datasci', 'p5', 'pending', 2],
  ['datasci', 'participant', 'pending', 1],

  ['robotics', 'p2', 'approved', 7],
  ['robotics', 'p4', 'rejected', 6],

  ['past1', 'participant', 'approved', 20],
  ['past1', 'p2', 'approved', 20],
  ['past1', 'p3', 'approved', 19],
  ['past2', 'p4', 'approved', 35],
  ['past2', 'p5', 'approved', 34],
];

/* -------------------------------------------------------------------------- */

function seed() {
  const existing = db.stats();
  const hasData = Object.values(existing).some((n) => n > 0);

  if (hasData && !FORCE) {
    console.log('\n  Database already contains data:');
    console.log(
      `    ${existing.users} users · ${existing.events} events · ${existing.venues} venues · ${existing.registrations} registrations`
    );
    console.log('\n  Run "npm run reset" to wipe it and load fresh demo data.\n');
    return;
  }

  if (hasData) {
    console.log('\n  --force given: clearing existing data…');
    for (const name of ['registrations', 'events', 'venues', 'users']) db.collection(name).clear();
  }

  console.log('\n  Seeding demo data…\n');

  /* users */
  const userIds = {};
  for (const spec of USERS) {
    const user = userModel.create(spec);
    userIds[spec.key] = user._id;
  }
  console.log(`    ✓ ${USERS.length} users`);

  /* venues */
  const venueIds = {};
  for (const spec of VENUES) {
    const venue = db.venues.create({
      name: spec.name,
      address: spec.address,
      city: spec.city,
      capacity: spec.capacity,
      facilities: spec.facilities,
      createdBy: userIds.organizer,
    });
    venueIds[spec.key] = venue._id;
  }
  console.log(`    ✓ ${VENUES.length} venues`);

  /* events */
  const eventIds = {};
  for (const spec of EVENTS) {
    const eventDate = spec.date;
    const deadline = (() => {
      const d = new Date(`${eventDate}T00:00:00`);
      d.setDate(d.getDate() - spec.deadlineOffset);
      const offsetMs = d.getTimezoneOffset() * 60_000;
      return new Date(d.getTime() - offsetMs).toISOString().slice(0, 10);
    })();

    const event = eventModel.create({
      organizerId: userIds[spec.organizer],
      title: spec.title,
      description: spec.description,
      category: spec.category,
      date: eventDate,
      time: spec.time,
      endTime: spec.endTime,
      venueId: venueIds[spec.venue],
      capacity: spec.capacity,
      registrationDeadline: deadline,
      status: spec.status,
      fee: spec.fee,
      tags: spec.tags,
    });
    eventIds[spec.key] = event._id;
  }
  console.log(`    ✓ ${EVENTS.length} events`);

  /* registrations */
  let created = 0;
  for (const [eventKey, userKey, status, daysAgo] of REGISTRATIONS) {
    const eventId = eventIds[eventKey];
    const userId = userIds[userKey];
    if (!eventId || !userId) continue;
    db.registrations.create({
      eventId,
      userId,
      status,
      seats: 1,
      notes: '',
      regDate: isoTimestampDaysAgo(daysAgo),
      decidedAt: status === 'pending' ? null : isoTimestampDaysAgo(Math.max(0, daysAgo - 1), 15),
      decidedBy: status === 'pending' ? null : userIds[EVENTS.find((e) => e.key === eventKey).organizer],
    });
    created += 1;
  }
  console.log(`    ✓ ${created} registrations`);

  console.log('\n  Demo accounts (password shown):\n');
  console.log('    Role         Email                    Password');
  console.log('    ---------------------------------------------------');
  console.log('    Organizer    organizer@demo.com       demo1234');
  console.log('    Organizer    rahul@demo.com           demo1234');
  console.log('    Participant  participant@demo.com     demo1234');
  console.log('    Participant  arjun@demo.com           demo1234');
  console.log('    Admin        admin@demo.com           admin1234');
  console.log('\n  Start the server with "npm start" and open http://localhost:5000\n');
}

if (require.main === module) seed();

module.exports = { seed };
