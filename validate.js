/**
 * lib/validate.js
 * ---------------------------------------------------------------------------
 * Field-level input validation helpers. Collects every problem for a request
 * so the API can return all validation messages at once.
 * ---------------------------------------------------------------------------
 */

'use strict';

const { unprocessable } = require('./errors');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;
const PHONE_RE = /^[0-9+\-\s()]{7,20}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

class Validator {
  constructor(source = {}) {
    this.source = source;
    this.errors = {};
    this.values = {};
  }

  _fail(field, message) {
    if (!this.errors[field]) this.errors[field] = message;
  }

  _raw(field) {
    return this.source[field];
  }

  string(field, { required = false, min = 0, max = 5000, trim = true, label } = {}) {
    let value = this._raw(field);
    const name = label || field;
    if (value === undefined || value === null || value === '') {
      if (required) this._fail(field, `${name} is required`);
      return this;
    }
    value = String(value);
    if (trim) value = value.trim();
    if (value.length < min) this._fail(field, `${name} must be at least ${min} characters`);
    else if (value.length > max) this._fail(field, `${name} must be at most ${max} characters`);
    else this.values[field] = value;
    return this;
  }

  email(field, { required = false, label } = {}) {
    const name = label || field;
    let value = this._raw(field);
    if (value === undefined || value === null || value === '') {
      if (required) this._fail(field, `${name} is required`);
      return this;
    }
    value = String(value).trim().toLowerCase();
    if (!EMAIL_RE.test(value)) this._fail(field, `${name} must be a valid email address`);
    else this.values[field] = value;
    return this;
  }

  password(field, { required = false, min = 6, label } = {}) {
    const name = label || field;
    const value = this._raw(field);
    if (value === undefined || value === null || value === '') {
      if (required) this._fail(field, `${name} is required`);
      return this;
    }
    if (String(value).length < min) this._fail(field, `${name} must be at least ${min} characters`);
    else this.values[field] = String(value);
    return this;
  }

  phone(field, { required = false, label } = {}) {
    const name = label || field;
    let value = this._raw(field);
    if (value === undefined || value === null || value === '') {
      if (required) this._fail(field, `${name} is required`);
      return this;
    }
    value = String(value).trim();
    if (!PHONE_RE.test(value)) this._fail(field, `${name} must be a valid phone number`);
    else this.values[field] = value;
    return this;
  }

  date(field, { required = false, label } = {}) {
    const name = label || field;
    const value = this._raw(field);
    if (value === undefined || value === null || value === '') {
      if (required) this._fail(field, `${name} is required`);
      return this;
    }
    const text = String(value).slice(0, 10);
    if (!DATE_RE.test(text) || Number.isNaN(Date.parse(text))) {
      this._fail(field, `${name} must be a valid date (YYYY-MM-DD)`);
    } else {
      this.values[field] = text;
    }
    return this;
  }

  time(field, { required = false, label } = {}) {
    const name = label || field;
    const value = this._raw(field);
    if (value === undefined || value === null || value === '') {
      if (required) this._fail(field, `${name} is required`);
      return this;
    }
    const text = String(value).trim();
    if (!TIME_RE.test(text)) this._fail(field, `${name} must be a valid 24-hour time (HH:MM)`);
    else this.values[field] = text;
    return this;
  }

  integer(field, { required = false, min = -Infinity, max = Infinity, label } = {}) {
    const name = label || field;
    const value = this._raw(field);
    if (value === undefined || value === null || value === '') {
      if (required) this._fail(field, `${name} is required`);
      return this;
    }
    const num = Number(value);
    if (!Number.isInteger(num)) this._fail(field, `${name} must be a whole number`);
    else if (num < min) this._fail(field, `${name} must be at least ${min}`);
    else if (num > max) this._fail(field, `${name} must be at most ${max}`);
    else this.values[field] = num;
    return this;
  }

  oneOf(field, allowed, { required = false, label } = {}) {
    const name = label || field;
    const value = this._raw(field);
    if (value === undefined || value === null || value === '') {
      if (required) this._fail(field, `${name} is required`);
      return this;
    }
    if (!allowed.includes(value)) {
      this._fail(field, `${name} must be one of: ${allowed.join(', ')}`);
    } else {
      this.values[field] = value;
    }
    return this;
  }

  boolean(field, { defaultValue } = {}) {
    const value = this._raw(field);
    if (value === undefined || value === null || value === '') {
      if (defaultValue !== undefined) this.values[field] = defaultValue;
      return this;
    }
    this.values[field] = value === true || value === 'true' || value === 1 || value === '1';
    return this;
  }

  custom(field, message, predicate) {
    if (!predicate()) this._fail(field, message);
    return this;
  }

  get isValid() {
    return Object.keys(this.errors).length === 0;
  }

  /** Throw a 422 with all collected messages, otherwise return clean values. */
  result() {
    if (!this.isValid) {
      const first = Object.values(this.errors)[0];
      throw unprocessable(first, this.errors);
    }
    return this.values;
  }
}

const validator = (source) => new Validator(source);

module.exports = { validator, Validator, EMAIL_RE };
