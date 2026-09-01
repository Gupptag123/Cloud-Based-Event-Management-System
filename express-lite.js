/**
 * express-lite.js
 * ---------------------------------------------------------------------------
 * A tiny, dependency-free implementation of the subset of the Express.js API
 * used by this project. It exists so that the Cloud-Based Event Management
 * System runs with **zero installation** (`node server.js`) on any machine
 * that has Node.js 18+, even with no internet access.
 *
 * The application code (routes, controllers, middleware) is written in normal
 * Express idiom, so if you run `npm install express` the project will
 * automatically use the real Express package instead (see lib/framework.js).
 *
 * Supported surface:
 *   app.use([path], fn)            router / middleware mounting
 *   app.get|post|put|patch|delete(path, ...handlers)
 *   app.listen(port, cb)
 *   Router()                       nestable routers with the same verbs
 *   express.json()                 JSON body parser
 *   express.urlencoded()           form body parser
 *   express.static(dir, opts)      static file server
 *   req.params / req.query / req.body / req.path / req.method / req.headers
 *   res.status() / res.json() / res.send() / res.set() / res.type()
 *   res.sendFile() / res.redirect() / res.end()
 *   4-argument error handling middleware (err, req, res, next)
 * ---------------------------------------------------------------------------
 */

'use strict';

const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { URL } = require('node:url');

const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'];

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf',
  '.map': 'application/json; charset=utf-8',
};

function mimeFor(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

/* -------------------------------------------------------------------------- */
/* Path pattern compiler ("/api/events/:id" -> RegExp + param names)          */
/* -------------------------------------------------------------------------- */

function compilePath(pattern, { end = true } = {}) {
  if (pattern instanceof RegExp) return { regexp: pattern, keys: [] };

  const keys = [];
  // Escape regex characters, then translate :param and * wildcards.
  let source = String(pattern)
    .replace(/\/+$/, '') // drop trailing slash
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\/:([A-Za-z0-9_]+)/g, (_m, name) => {
      keys.push(name);
      return '/([^/]+)';
    })
    .replace(/\*/g, '.*');

  if (source === '') source = '/';
  const suffix = end ? '/?$' : '(?=/|$)';
  return { regexp: new RegExp('^' + source + suffix), keys };
}

/* -------------------------------------------------------------------------- */
/* Router                                                                     */
/* -------------------------------------------------------------------------- */

function Router() {
  const layers = [];

  const router = function routerMiddleware(req, res, next) {
    let index = 0;
    const basePath = req.baseUrl || '';
    // Path relative to where this router was mounted.
    const relPath = req.url_path.slice(basePath.length) || '/';

    function step(err) {
      const layer = layers[index++];
      if (!layer) return next(err);

      const isErrorHandler = layer.handler.length === 4;

      // Method filter (null method === middleware, matches everything).
      if (layer.method && layer.method !== req.method.toLowerCase()) return step(err);

      let match = null;
      if (layer.compiled) {
        match = layer.compiled.regexp.exec(relPath === '' ? '/' : relPath);
        if (!match) return step(err);
      }

      if (err && !isErrorHandler) return step(err);
      if (!err && isErrorHandler) return step(err);

      // Populate params for this layer.
      if (match && layer.compiled.keys.length) {
        const params = { ...req.params };
        layer.compiled.keys.forEach((key, i) => {
          params[key] = decodeURIComponent(match[i + 1]);
        });
        req.params = params;
      }

      // For mounted sub-routers, extend baseUrl while descending.
      const previousBase = req.baseUrl;
      if (layer.mounted && layer.mountPath && layer.mountPath !== '/') {
        req.baseUrl = basePath + layer.mountPath;
      }

      const done = (nextErr) => {
        req.baseUrl = previousBase;
        step(nextErr);
      };

      try {
        if (isErrorHandler) layer.handler(err, req, res, done);
        else layer.handler(req, res, done);
      } catch (thrown) {
        req.baseUrl = previousBase;
        step(thrown);
      }
    }

    step();
  };

  router.stack = layers;

  router.use = function use(pathOrFn, ...handlers) {
    let mountPath = '/';
    let fns = handlers;
    if (typeof pathOrFn === 'function') {
      fns = [pathOrFn, ...handlers];
    } else {
      mountPath = String(pathOrFn).replace(/\/+$/, '') || '/';
    }
    for (const fn of fns.flat()) {
      if (typeof fn !== 'function') continue;
      layers.push({
        method: null,
        mountPath,
        mounted: true,
        compiled: mountPath === '/' ? null : compilePath(mountPath, { end: false }),
        handler: fn,
      });
    }
    return router;
  };

  for (const method of METHODS) {
    router[method] = function verb(routePath, ...handlers) {
      for (const fn of handlers.flat()) {
        layers.push({
          method,
          compiled: compilePath(routePath),
          handler: fn,
        });
      }
      return router;
    };
  }

  router.all = function all(routePath, ...handlers) {
    for (const fn of handlers.flat()) {
      layers.push({ method: null, compiled: compilePath(routePath), handler: fn });
    }
    return router;
  };

  return router;
}

/* -------------------------------------------------------------------------- */
/* Request / response decoration                                              */
/* -------------------------------------------------------------------------- */

function decorateRequest(req) {
  const parsed = new URL(req.url, 'http://localhost');
  req.url_path = decodeURIComponent(parsed.pathname).replace(/\/{2,}/g, '/').replace(/(.)\/+$/, '$1');
  req.path = req.url_path;
  req.originalUrl = req.url;
  req.baseUrl = '';
  req.params = {};
  req.query = Object.fromEntries(parsed.searchParams.entries());
  req.body = undefined;
  req.get = (name) => req.headers[String(name).toLowerCase()];
  return req;
}

function decorateResponse(res) {
  res.locals = {};
  res.statusCode = 200;

  res.status = function status(code) {
    res.statusCode = code;
    return res;
  };

  res.set = res.header = function set(field, value) {
    if (typeof field === 'object') {
      for (const [k, v] of Object.entries(field)) res.setHeader(k, v);
    } else {
      res.setHeader(field, value);
    }
    return res;
  };

  res.type = function type(value) {
    const ext = value.startsWith('.') ? value : '.' + value;
    res.setHeader('Content-Type', MIME_TYPES[ext] || value);
    return res;
  };

  res.json = function json(payload) {
    if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(payload));
    return res;
  };

  res.send = function send(payload) {
    if (payload === undefined || payload === null) return res.end();
    if (Buffer.isBuffer(payload)) {
      if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/octet-stream');
      return res.end(payload);
    }
    if (typeof payload === 'object') return res.json(payload);
    if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(String(payload));
    return res;
  };

  res.redirect = function redirect(codeOrUrl, maybeUrl) {
    const code = typeof codeOrUrl === 'number' ? codeOrUrl : 302;
    const location = typeof codeOrUrl === 'number' ? maybeUrl : codeOrUrl;
    res.statusCode = code;
    res.setHeader('Location', location);
    res.end();
    return res;
  };

  res.sendStatus = function sendStatus(code) {
    res.statusCode = code;
    res.end(http.STATUS_CODES[code] || String(code));
    return res;
  };

  res.sendFile = function sendFile(filePath, callback) {
    fsp
      .readFile(filePath)
      .then((buf) => {
        if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', mimeFor(filePath));
        res.end(buf);
        if (callback) callback();
      })
      .catch((err) => {
        if (callback) return callback(err);
        res.statusCode = 404;
        res.end('Not Found');
      });
    return res;
  };

  return res;
}

/* -------------------------------------------------------------------------- */
/* Built-in middleware                                                        */
/* -------------------------------------------------------------------------- */

function readBody(req, limitBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limitBytes) {
        reject(Object.assign(new Error('Request body too large'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function jsonBodyParser({ limit = 1024 * 1024 } = {}) {
  return function jsonParser(req, res, next) {
    const type = (req.headers['content-type'] || '').toLowerCase();
    if (!type.includes('application/json')) return next();
    readBody(req, limit)
      .then((raw) => {
        if (!raw) {
          req.body = {};
          return next();
        }
        try {
          req.body = JSON.parse(raw);
          next();
        } catch {
          next(Object.assign(new Error('Invalid JSON body'), { statusCode: 400 }));
        }
      })
      .catch(next);
  };
}

function urlencodedBodyParser({ limit = 1024 * 1024 } = {}) {
  return function urlencodedParser(req, res, next) {
    const type = (req.headers['content-type'] || '').toLowerCase();
    if (!type.includes('application/x-www-form-urlencoded')) return next();
    readBody(req, limit)
      .then((raw) => {
        req.body = Object.fromEntries(new URLSearchParams(raw).entries());
        next();
      })
      .catch(next);
  };
}

function staticMiddleware(root, { index = 'index.html', extensions = ['html'] } = {}) {
  const rootDir = path.resolve(root);

  return function serveStatic(req, res, next) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();

    const relative = req.url_path.slice((req.baseUrl || '').length) || '/';
    // Resolve and confirm the result stays inside the root (path traversal guard).
    const target = path.resolve(rootDir, '.' + path.posix.normalize(relative));
    if (target !== rootDir && !target.startsWith(rootDir + path.sep)) return next();

    const candidates = [target];
    if (!path.extname(target)) {
      for (const ext of extensions) candidates.push(`${target}.${ext}`);
      candidates.push(path.join(target, index));
    }

    (async () => {
      for (const candidate of candidates) {
        try {
          const stat = await fsp.stat(candidate);
          if (stat.isDirectory()) {
            const indexFile = path.join(candidate, index);
            const indexStat = await fsp.stat(indexFile).catch(() => null);
            if (!indexStat) continue;
            return streamFile(indexFile, indexStat);
          }
          return streamFile(candidate, stat);
        } catch {
          /* try next candidate */
        }
      }
      next();
    })();

    function streamFile(filePath, stat) {
      res.setHeader('Content-Type', mimeFor(filePath));
      res.setHeader('Content-Length', stat.size);
      res.setHeader('Cache-Control', 'no-cache');
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(filePath).on('error', next).pipe(res);
    }
  };
}

/* -------------------------------------------------------------------------- */
/* Application factory                                                        */
/* -------------------------------------------------------------------------- */

function createApplication() {
  const router = Router();
  const settings = new Map();

  const app = function handle(req, res) {
    decorateRequest(req);
    decorateResponse(res);

    router(req, res, (err) => {
      if (err) {
        const status = err.statusCode || err.status || 500;
        if (status >= 500) console.error('[express-lite] Unhandled error:', err);
        if (res.headersSent) return res.end();
        res.statusCode = status;
        return res.json({ success: false, message: err.message || 'Internal Server Error' });
      }
      if (res.headersSent) return;
      res.statusCode = 404;
      res.json({ success: false, message: `Cannot ${req.method} ${req.url_path}` });
    });
  };

  app.use = (...args) => (router.use(...args), app);
  app.all = (...args) => (router.all(...args), app);
  for (const method of METHODS) {
    app[method] = (...args) => (router[method](...args), app);
  }

  app.set = (key, value) => (settings.set(key, value), app);
  app.get_setting = (key) => settings.get(key);
  app.enable = (key) => (settings.set(key, true), app);
  app.disable = (key) => (settings.set(key, false), app);

  app.listen = function listen(port, ...rest) {
    const callback = rest.find((a) => typeof a === 'function');
    const host = typeof rest[0] === 'string' ? rest[0] : undefined;
    const server = http.createServer(app);
    server.listen(port, host, callback);
    return server;
  };

  return app;
}

const express = createApplication;
express.Router = Router;
express.json = jsonBodyParser;
express.urlencoded = urlencodedBodyParser;
express.static = staticMiddleware;
express.__isExpressLite = true;

module.exports = express;
