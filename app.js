/**
 * app.js
 * ---------------------------------------------------------------------------
 * Builds and configures the application (kept separate from server.js so that
 * tests can mount the app without binding a port).
 * ---------------------------------------------------------------------------
 */

'use strict';

const path = require('node:path');

const express = require('./lib/framework');
const config = require('./config/config');
const apiRoutes = require('./routes');
const {
  requestLogger,
  cors,
  securityHeaders,
  apiNotFound,
  errorHandler,
} = require('./middleware/common');

const app = express();

/* ------------------------------- global middleware ------------------------ */

app.use(cors);
app.use(securityHeaders);
app.use(express.json({ limit: 1024 * 1024 }));
app.use(express.urlencoded({ extended: true }));
if (config.env !== 'test') app.use(requestLogger);

/* ------------------------------------ API --------------------------------- */

app.use('/api', apiRoutes);
app.use('/api', apiNotFound);

/* --------------------------------- frontend ------------------------------- */

app.use(express.static(config.publicDir, { index: 'index.html', extensions: ['html'] }));

// Anything that is not an API call and not a static file falls back to the SPA
// shell so client-side routes (e.g. /event?id=...) always resolve.
//
// A request that clearly asks for an asset — it carries a file extension, or it
// sits under one of the asset folders — must NOT fall back to HTML. Returning
// index.html with a 200 for a mistyped script URL hides the real problem: the
// browser reports a syntax error inside "JavaScript" that is actually markup.
const ASSET_DIR = /^\/(js|css|assets|img|fonts)\//i;

app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  if (req.path.startsWith('/api')) return next();

  const looksLikeAsset = ASSET_DIR.test(req.path) || /\.[a-z0-9]{2,5}$/i.test(req.path);
  if (looksLikeAsset && !req.path.endsWith('.html')) {
    return res.status(404).type('text/plain').send(`Not found: ${req.path}`);
  }

  res.sendFile(path.join(config.publicDir, 'index.html'), (err) => {
    if (err) next();
  });
});

/* ------------------------------- error handler ---------------------------- */

app.use(errorHandler);

module.exports = app;
