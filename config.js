/**
 * config/config.js
 * ---------------------------------------------------------------------------
 * Central application configuration.
 *
 * Values are read from environment variables when present (see .env.example)
 * and fall back to sensible development defaults, so the project runs with no
 * configuration at all.
 * ---------------------------------------------------------------------------
 */

'use strict';

const path = require('node:path');
const fs = require('node:fs');

/* ---------------------------------------------------------------------------
 * Minimal .env loader (avoids a dotenv dependency).
 * ------------------------------------------------------------------------- */
function loadDotEnv(file) {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    /* no .env file - use defaults */
  }
}

const ROOT_DIR = path.resolve(__dirname, '..');
loadDotEnv(path.join(ROOT_DIR, '.env'));

const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 5000),
  host: process.env.HOST || '0.0.0.0',

  rootDir: ROOT_DIR,
  dataDir: process.env.DATA_DIR || path.join(ROOT_DIR, 'data'),
  publicDir: path.join(ROOT_DIR, 'frontend'),

  auth: {
    // Change this in production. A random secret is generated if left as the
    // default and NODE_ENV is 'production'.
    jwtSecret: process.env.JWT_SECRET || 'cbems-development-secret-change-me',
    jwtExpiresIn: Number(process.env.JWT_EXPIRES_IN_SECONDS || 60 * 60 * 8), // 8 hours
    scryptKeyLength: 64,
  },

  /**
   * Storage driver.
   *   'json'    -> bundled file database in /data (default, zero setup)
   *   'mongodb' -> reserved for a future Mongoose implementation
   */
  storage: {
    driver: process.env.DB_DRIVER || 'json',
    mongoUri: process.env.MONGO_URI || '',
  },

  limits: {
    maxTitleLength: 120,
    maxDescriptionLength: 2000,
    maxPageSize: 100,
    defaultPageSize: 12,
  },

  eventCategories: [
    'Technical',
    'Cultural',
    'Sports',
    'Workshop',
    'Seminar',
    'Conference',
    'Hackathon',
    'Other',
  ],

  eventStatuses: ['draft', 'published', 'cancelled', 'completed'],
  registrationStatuses: ['pending', 'approved', 'rejected', 'cancelled'],
  roles: ['organizer', 'participant', 'admin'],
};

module.exports = config;
