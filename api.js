/**
 * frontend/js/api.js
 * ---------------------------------------------------------------------------
 * Thin REST client for the CBEMS API, plus the browser-side session store.
 *
 * Every backend response uses the envelope
 *     { success, message, data, pagination?, meta?, errors? }
 * so `request()` resolves with the whole envelope and callers read the part
 * they need. Failures reject with an ApiError carrying the HTTP status and
 * the per-field `errors` map produced by the server's validator.
 *
 * No build step, no bundler: this file is a classic script that hangs a small
 * namespace off `window`.
 * ---------------------------------------------------------------------------
 */

(function (global) {
  'use strict';

  const API_BASE = '/api';
  const TOKEN_KEY = 'cbems.token';
  const USER_KEY = 'cbems.user';

  /* ------------------------------------------------------------------ error */

  class ApiError extends Error {
    constructor(message, status, body) {
      super(message || 'Request failed');
      this.name = 'ApiError';
      this.status = status || 0;
      this.body = body || null;
      /** Field-level validation messages: { fieldName: 'message' } */
      this.errors = (body && body.errors) || null;
    }

    get isAuth() {
      return this.status === 401;
    }

    get isForbidden() {
      return this.status === 403;
    }

    get isValidation() {
      return this.status === 422 || Boolean(this.errors);
    }

    get isOffline() {
      return this.status === 0;
    }
  }

  /* ---------------------------------------------------------------- session */

  const listeners = new Set();

  function readJSON(key) {
    try {
      const raw = global.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }

  function writeJSON(key, value) {
    try {
      if (value === null || value === undefined) global.localStorage.removeItem(key);
      else global.localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
      /* private browsing / storage disabled - session simply won't persist */
    }
  }

  const session = {
    /** @returns {string|null} */
    get token() {
      try {
        return global.localStorage.getItem(TOKEN_KEY) || null;
      } catch (err) {
        return null;
      }
    },

    /** @returns {object|null} */
    get user() {
      return readJSON(USER_KEY);
    },

    get isSignedIn() {
      return Boolean(this.token);
    },

    get role() {
      const user = this.user;
      return user ? user.role : null;
    },

    /** Organizers and admins can create and moderate. */
    get canOrganize() {
      const role = this.role;
      return role === 'organizer' || role === 'admin';
    },

    /** @param {{token:string, user:object}} payload */
    start(payload) {
      try {
        global.localStorage.setItem(TOKEN_KEY, payload.token);
      } catch (err) {
        /* ignore */
      }
      writeJSON(USER_KEY, payload.user);
      this.emit();
    },

    /** Refresh the cached user without touching the token. */
    setUser(user) {
      writeJSON(USER_KEY, user);
      this.emit();
    },

    end() {
      try {
        global.localStorage.removeItem(TOKEN_KEY);
      } catch (err) {
        /* ignore */
      }
      writeJSON(USER_KEY, null);
      this.emit();
    },

    /** @param {Function} fn called whenever the session changes */
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    emit() {
      listeners.forEach((fn) => {
        try {
          fn(this.user);
        } catch (err) {
          console.error('session listener failed', err);
        }
      });
    },
  };

  /* --------------------------------------------------------------- transport */

  function buildQuery(params) {
    if (!params) return '';
    const search = new URLSearchParams();
    Object.keys(params).forEach((key) => {
      const value = params[key];
      if (value === undefined || value === null || value === '') return;
      search.set(key, String(value));
    });
    const qs = search.toString();
    return qs ? `?${qs}` : '';
  }

  /**
   * @param {string} method
   * @param {string} path      e.g. '/events' or '/events/abc123'
   * @param {object} [options] { body, params, auth }
   * @returns {Promise<object>} the response envelope
   */
  async function request(method, path, options = {}) {
    const url = `${API_BASE}${path}${buildQuery(options.params)}`;
    const headers = {};
    const init = { method, headers };

    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(options.body);
    }

    // Attach the bearer token unless the caller explicitly opted out.
    const token = options.auth === false ? null : session.token;
    if (token) headers.Authorization = `Bearer ${token}`;

    let response;
    try {
      response = await fetch(url, init);
    } catch (err) {
      throw new ApiError('Cannot reach the server. Is it still running?', 0, null);
    }

    let body = null;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        body = await response.json();
      } catch (err) {
        body = null;
      }
    }

    if (!response.ok) {
      const message = (body && body.message) || `${response.status} ${response.statusText}`;
      const error = new ApiError(message, response.status, body);

      // An expired or tampered token should not leave a half-signed-in UI.
      if (error.status === 401 && session.isSignedIn) {
        session.end();
      }
      throw error;
    }

    return body || { success: true, data: null };
  }

  const get = (path, params) => request('GET', path, { params });
  const post = (path, body) => request('POST', path, { body });
  const put = (path, body) => request('PUT', path, { body });
  const patch = (path, body) => request('PATCH', path, { body });
  const del = (path, params) => request('DELETE', path, { params });

  /* -------------------------------------------------------------- endpoints */

  const api = {
    ApiError,
    session,
    request,

    health: () => get('/health'),
    config: () => get('/auth/config'),

    auth: {
      register: (payload) => post('/auth/register', payload),
      login: (payload) => post('/auth/login', payload),
      me: () => get('/auth/me'),
      updateProfile: (payload) => put('/auth/me', payload),
      changePassword: (payload) => put('/auth/password', payload),
    },

    events: {
      /** @param {object} params search|category|city|status|when|availability|sort|order|page|limit|mine */
      list: (params) => get('/events', params),
      categories: () => get('/events/categories'),
      getOne: (id) => get(`/events/${encodeURIComponent(id)}`),
      create: (payload) => post('/events', payload),
      update: (id, payload) => put(`/events/${encodeURIComponent(id)}`, payload),
      setStatus: (id, status) => patch(`/events/${encodeURIComponent(id)}/status`, { status }),
      remove: (id, force) => del(`/events/${encodeURIComponent(id)}`, force ? { force: 'true' } : null),
      registrations: (id, params) => get(`/events/${encodeURIComponent(id)}/registrations`, params),
    },

    venues: {
      list: (params) => get('/venues', params),
      getOne: (id) => get(`/venues/${encodeURIComponent(id)}`),
      create: (payload) => post('/venues', payload),
      update: (id, payload) => put(`/venues/${encodeURIComponent(id)}`, payload),
      remove: (id) => del(`/venues/${encodeURIComponent(id)}`),
    },

    registrations: {
      create: (payload) => post('/registrations', payload),
      mine: (params) => get('/registrations/mine', params),
      forOrganizer: (params) => get('/registrations', params),
      getOne: (id) => get(`/registrations/${encodeURIComponent(id)}`),
      decide: (id, status) => patch(`/registrations/${encodeURIComponent(id)}/decision`, { status }),
      bulkDecide: (ids, status) => post('/registrations/bulk-decision', { ids, status }),
      cancel: (id) => del(`/registrations/${encodeURIComponent(id)}`),
    },

    dashboard: {
      organizer: () => get('/dashboard'),
      participant: () => get('/dashboard/participant'),
      report: (eventId) => get(`/dashboard/report/${encodeURIComponent(eventId)}`),
      platform: () => get('/dashboard/platform'),
    },
  };

  global.CBEMS = global.CBEMS || {};
  global.CBEMS.api = api;
  global.CBEMS.session = session;
  global.CBEMS.ApiError = ApiError;
})(window);
