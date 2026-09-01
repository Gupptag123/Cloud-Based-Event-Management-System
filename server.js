/**
 * server.js
 * ---------------------------------------------------------------------------
 * Cloud-Based Event Management System - HTTP server entry point.
 *
 *   node server.js          start on http://localhost:5000
 *   npm start               same
 *   npm run seed            load demo data
 *
 * No installation step is required: the project ships a dependency-free
 * Express-compatible layer and a JSON file database.
 * ---------------------------------------------------------------------------
 */

'use strict';

const os = require('node:os');

const app = require('./app');
const config = require('./config/config');
const framework = require('./lib/framework');
const db = require('./lib/database');

const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

function localIPv4() {
  for (const interfaces of Object.values(os.networkInterfaces())) {
    for (const details of interfaces || []) {
      if (details.family === 'IPv4' && !details.internal) return details.address;
    }
  }
  return null;
}

function banner(port) {
  const counts = db.stats();
  const lan = localIPv4();

  console.log('');
  console.log(`${CYAN}${BOLD}  Cloud-Based Event Management System${RESET}`);
  console.log(`${DIM}  ------------------------------------------------------------${RESET}`);
  console.log(`  ${GREEN}●${RESET} Server ready       ${BOLD}http://localhost:${port}${RESET}`);
  if (lan) console.log(`  ${DIM}●${RESET} On your network    ${DIM}http://${lan}:${port}${RESET}`);
  console.log(`  ${DIM}●${RESET} API base           ${DIM}http://localhost:${port}/api${RESET}`);
  console.log(`  ${DIM}●${RESET} Framework          ${DIM}${framework.flavour}${RESET}`);
  console.log(`  ${DIM}●${RESET} Storage            ${DIM}JSON file database (${config.dataDir})${RESET}`);
  console.log(
    `  ${DIM}●${RESET} Records            ${DIM}${counts.users} users · ${counts.events} events · ${counts.venues} venues · ${counts.registrations} registrations${RESET}`
  );

  if (counts.users === 0) {
    console.log('');
    console.log(`  ${YELLOW}!${RESET} No data yet. Run ${BOLD}npm run seed${RESET} to load the demo accounts and events.`);
  }

  console.log(`${DIM}  ------------------------------------------------------------${RESET}`);
  console.log(`${DIM}  Press Ctrl+C to stop${RESET}`);
  console.log('');
}

function start(port = config.port) {
  const server = app.listen(port, () => banner(port));

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n  \x1b[31m✗\x1b[0m Port ${port} is already in use.`);
      console.error(`    Either stop the other process or start on a different port:\n`);
      console.error(`      PORT=${Number(port) + 1} npm start          (macOS / Linux)`);
      console.error(`      set PORT=${Number(port) + 1} && npm start   (Windows CMD)`);
      console.error(`      $env:PORT=${Number(port) + 1}; npm start    (Windows PowerShell)\n`);
      process.exit(1);
    }
    throw err;
  });

  const shutdown = (signal) => {
    console.log(`\n  ${DIM}${signal} received - shutting down.${RESET}`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  process.on('unhandledRejection', (reason) => {
    console.error('\x1b[31m[unhandledRejection]\x1b[0m', reason);
  });

  return server;
}

if (require.main === module) start();

module.exports = { app, start };
