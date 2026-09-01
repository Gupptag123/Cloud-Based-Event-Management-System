/**
 * lib/database.js
 * ---------------------------------------------------------------------------
 * A small, dependency-free document store backed by JSON files in /data.
 *
 * It deliberately mirrors the shape of a Mongoose model (find / findById /
 * create / updateById / deleteById) so the project can be migrated to MongoDB
 * Atlas by replacing this single module - the controllers do not change.
 *
 * Durability strategy: the whole collection lives in memory and is flushed to
 * disk atomically (write to a temp file, then rename) after every mutation.
 * This is more than adequate for a coursework / demo workload and removes any
 * need to install a database server.
 * ---------------------------------------------------------------------------
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const config = require('../config/config');

const COLLECTIONS = ['users', 'venues', 'events', 'registrations'];

/** Monotonic-ish, sortable, collision-resistant id (Mongo ObjectId-like). */
function generateId() {
  const timestamp = Math.floor(Date.now() / 1000)
    .toString(16)
    .padStart(8, '0');
  return timestamp + crypto.randomBytes(8).toString('hex');
}

function deepClone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

class Collection {
  constructor(name, store) {
    this.name = name;
    this.store = store;
    this.filePath = path.join(store.dataDir, `${name}.json`);
    this.docs = [];
    this.index = new Map();
    this._load();
  }

  /* ----------------------------- persistence ----------------------------- */

  _load() {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw);
      this.docs = Array.isArray(parsed) ? parsed : [];
    } catch {
      this.docs = [];
      this._flush();
    }
    this._reindex();
  }

  _reindex() {
    this.index = new Map(this.docs.map((doc) => [doc._id, doc]));
  }

  _flush() {
    const tmp = `${this.filePath}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.docs, null, 2), 'utf8');
    fs.renameSync(tmp, this.filePath);
  }

  /* -------------------------------- reads -------------------------------- */

  /** All documents (deep copies, so callers cannot mutate the store). */
  all() {
    return deepClone(this.docs);
  }

  count(predicate) {
    return predicate ? this.docs.filter(predicate).length : this.docs.length;
  }

  /**
   * @param {object|function} [query] plain object (exact match on each key) or predicate
   * @param {object}          [opts]  { sort, order, skip, limit }
   */
  find(query, opts = {}) {
    let results = this.docs;

    if (typeof query === 'function') {
      results = results.filter(query);
    } else if (query && typeof query === 'object') {
      const entries = Object.entries(query);
      results = results.filter((doc) => entries.every(([k, v]) => doc[k] === v));
    }

    results = results.slice();

    if (opts.sort) {
      const dir = opts.order === 'desc' ? -1 : 1;
      const key = opts.sort;
      results.sort((a, b) => {
        const av = a[key];
        const bv = b[key];
        if (av === bv) return 0;
        if (av === undefined || av === null) return 1;
        if (bv === undefined || bv === null) return -1;
        if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
        return String(av).localeCompare(String(bv)) * dir;
      });
    }

    const skip = Number(opts.skip) > 0 ? Number(opts.skip) : 0;
    if (skip) results = results.slice(skip);
    if (Number(opts.limit) > 0) results = results.slice(0, Number(opts.limit));

    return deepClone(results);
  }

  findOne(query) {
    const [doc] = this.find(query, { limit: 1 });
    return doc || null;
  }

  findById(id) {
    const doc = this.index.get(id);
    return doc ? deepClone(doc) : null;
  }

  exists(query) {
    return this.findOne(query) !== null;
  }

  /* ------------------------------- writes -------------------------------- */

  create(payload) {
    const now = new Date().toISOString();
    const doc = {
      _id: payload._id || generateId(),
      ...payload,
      createdAt: payload.createdAt || now,
      updatedAt: now,
    };
    doc._id = payload._id || doc._id;
    this.docs.push(doc);
    this.index.set(doc._id, doc);
    this._flush();
    return deepClone(doc);
  }

  insertMany(payloads) {
    return payloads.map((p) => this.create(p));
  }

  updateById(id, patch) {
    const doc = this.index.get(id);
    if (!doc) return null;
    Object.assign(doc, patch, { _id: doc._id, updatedAt: new Date().toISOString() });
    this._flush();
    return deepClone(doc);
  }

  deleteById(id) {
    const position = this.docs.findIndex((doc) => doc._id === id);
    if (position === -1) return false;
    this.docs.splice(position, 1);
    this.index.delete(id);
    this._flush();
    return true;
  }

  deleteMany(predicate) {
    const before = this.docs.length;
    this.docs = this.docs.filter((doc) => !predicate(doc));
    this._reindex();
    if (this.docs.length !== before) this._flush();
    return before - this.docs.length;
  }

  /** Remove every document (used by the seed script). */
  clear() {
    this.docs = [];
    this.index.clear();
    this._flush();
  }
}

class Database {
  constructor(dataDir) {
    this.dataDir = dataDir;
    fs.mkdirSync(this.dataDir, { recursive: true });
    this.collections = {};
    for (const name of COLLECTIONS) {
      this.collections[name] = new Collection(name, this);
    }
  }

  collection(name) {
    if (!this.collections[name]) throw new Error(`Unknown collection: ${name}`);
    return this.collections[name];
  }

  get users() {
    return this.collections.users;
  }

  get venues() {
    return this.collections.venues;
  }

  get events() {
    return this.collections.events;
  }

  get registrations() {
    return this.collections.registrations;
  }

  stats() {
    return COLLECTIONS.reduce((acc, name) => {
      acc[name] = this.collections[name].count();
      return acc;
    }, {});
  }
}

const db = new Database(config.dataDir);

module.exports = db;
module.exports.generateId = generateId;
module.exports.COLLECTIONS = COLLECTIONS;
