/**
 * framework.js
 * ---------------------------------------------------------------------------
 * Resolves the web framework used by the application.
 *
 * The project is written against the Express.js API. If the real `express`
 * package is installed (`npm install`) it is used. If it is not installed,
 * the bundled dependency-free `express-lite` implementation is used instead so
 * that the server always starts with a plain `node server.js`.
 * ---------------------------------------------------------------------------
 */

'use strict';

let express;
let flavour;

try {
  // eslint-disable-next-line global-require, import/no-unresolved
  express = require('express');
  flavour = `express ${require('express/package.json').version} (npm)`;
} catch {
  express = require('./express-lite');
  flavour = 'express-lite (bundled, zero-dependency)';
}

module.exports = express;
module.exports.flavour = flavour;
