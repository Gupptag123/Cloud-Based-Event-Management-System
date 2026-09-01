/**
 * tests/dom-shim.js
 * ---------------------------------------------------------------------------
 * A very small DOM implementation, just large enough to run the real frontend
 * (frontend/js/*.js) inside Node so the views can be rendered and asserted on
 * without a browser and without any npm dependency.
 *
 * It implements only what the app actually touches: element creation (HTML and
 * SVG), attributes, classList, dataset, style, children, textContent, a subset
 * of CSS selector matching for querySelector/querySelectorAll, events,
 * localStorage, location + history (hash only), and fetch pointed at a live
 * server.
 *
 * This is a test harness, not a browser. Layout, CSS and rendering are out of
 * scope — the point is to prove every view builds its DOM without throwing and
 * puts the expected content on screen.
 * ---------------------------------------------------------------------------
 */

'use strict';

const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

/* ========================================================================== */
/* Selector matching                                                           */
/* ========================================================================== */

/** Parse one compound selector such as `a.btn[data-x="1"]:not(.off)`. */
function parseCompound(source) {
  const out = { tag: null, id: null, classes: [], attrs: [], nots: [] };
  const token = /:not\(([^)]*)\)|\[([\w-]+)(?:="([^"]*)")?\]|\.([\w-]+)|#([\w-]+)|([a-zA-Z][\w-]*)/g;
  let m;
  while ((m = token.exec(source)) !== null) {
    if (m[1] !== undefined) out.nots.push(parseCompound(m[1]));
    else if (m[2] !== undefined) out.attrs.push({ name: m[2], value: m[3] });
    else if (m[4] !== undefined) out.classes.push(m[4]);
    else if (m[5] !== undefined) out.id = m[5];
    else if (m[6] !== undefined) out.tag = m[6].toLowerCase();
  }
  return out;
}

function matchesCompound(el, c) {
  if (el.nodeType !== 1) return false;
  if (c.tag && el.tagName.toLowerCase() !== c.tag) return false;
  if (c.id && el.getAttribute('id') !== c.id) return false;
  for (const cls of c.classes) if (!el.classList.contains(cls)) return false;
  for (const a of c.attrs) {
    if (!el.hasAttribute(a.name)) return false;
    if (a.value !== undefined && el.getAttribute(a.name) !== a.value) return false;
  }
  for (const n of c.nots) if (matchesCompound(el, n)) return false;
  return true;
}

/** Split a selector into comma groups, then each group into descendant parts. */
function parseSelector(selector) {
  return String(selector).split(',').map((group) => group.trim().split(/\s+/).filter(Boolean).map(parseCompound));
}

function matchesSelector(el, groups) {
  return groups.some((parts) => {
    if (!matchesCompound(el, parts[parts.length - 1])) return false;
    let i = parts.length - 2;
    let node = el.parentNode;
    while (i >= 0 && node) {
      if (node.nodeType === 1 && matchesCompound(node, parts[i])) i -= 1;
      node = node.parentNode;
    }
    return i < 0;
  });
}

/* ========================================================================== */
/* Nodes                                                                       */
/* ========================================================================== */

class ShimNode {
  constructor() {
    this.childNodes = [];
    this.parentNode = null;
    this._listeners = new Map();
  }

  get children() {
    return this.childNodes.filter((n) => n.nodeType === 1);
  }

  get firstChild() {
    return this.childNodes[0] || null;
  }

  appendChild(child) {
    if (!child) return child;
    // A fragment donates its children rather than itself.
    if (child.nodeType === 11) {
      child.childNodes.slice().forEach((c) => this.appendChild(c));
      child.childNodes = [];
      return child;
    }
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }

  removeChild(child) {
    const i = this.childNodes.indexOf(child);
    if (i !== -1) this.childNodes.splice(i, 1);
    child.parentNode = null;
    return child;
  }

  remove() {
    if (this.parentNode) this.parentNode.removeChild(this);
  }

  replaceChildren(...nodes) {
    this.childNodes.slice().forEach((c) => this.removeChild(c));
    nodes.forEach((n) => this.appendChild(n));
  }

  get textContent() {
    return this.childNodes.map((n) => n.textContent).join('');
  }

  set textContent(value) {
    this.replaceChildren();
    if (value !== '' && value !== null && value !== undefined) {
      this.appendChild(new ShimText(String(value)));
    }
  }

  addEventListener(type, fn) {
    if (!this._listeners.has(type)) this._listeners.set(type, new Set());
    this._listeners.get(type).add(fn);
  }

  removeEventListener(type, fn) {
    const set = this._listeners.get(type);
    if (set) set.delete(fn);
  }

  /** Fire listeners for `type` on this node only (no real bubbling). */
  dispatchEvent(event) {
    const set = this._listeners.get(event.type);
    if (set) [...set].forEach((fn) => fn(event));
    const inline = this[`on${event.type}`];
    if (typeof inline === 'function') inline(event);
    return true;
  }

  /** Test helper: synthesise a DOM event on this element. */
  fire(type, extra = {}) {
    const event = Object.assign({
      type,
      target: this,
      currentTarget: this,
      preventDefault() {},
      stopPropagation() {},
    }, extra);
    return this.dispatchEvent(event);
  }

  querySelectorAll(selector) {
    const groups = parseSelector(selector);
    const found = [];
    const walk = (node) => {
      node.childNodes.forEach((child) => {
        if (child.nodeType === 1) {
          if (matchesSelector(child, groups)) found.push(child);
          walk(child);
        }
      });
    };
    walk(this);
    return found;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }
}

class ShimText extends ShimNode {
  constructor(data) {
    super();
    this.nodeType = 3;
    this.data = String(data);
  }

  get textContent() {
    return this.data;
  }

  set textContent(value) {
    this.data = String(value);
  }
}

class ShimFragment extends ShimNode {
  constructor() {
    super();
    this.nodeType = 11;
  }
}

class ShimElement extends ShimNode {
  constructor(tagName, namespace) {
    super();
    this.nodeType = 1;
    this.tagName = String(tagName).toUpperCase();
    this.namespaceURI = namespace || null;
    this.attributes = new Map();
    this.style = makeStyle();
    this.value = '';
    this.checked = false;
    this.disabled = false;
    this._innerHTML = null;

    const self = this;
    // dataset writes must land in attributes so [data-field="x"] selectors work.
    this.dataset = new Proxy({}, {
      get: (_, key) => self.getAttribute(`data-${camelToDash(key)}`),
      set: (_, key, value) => {
        self.setAttribute(`data-${camelToDash(key)}`, String(value));
        return true;
      },
      has: (_, key) => self.hasAttribute(`data-${camelToDash(key)}`),
    });

    this.classList = {
      add: (...names) => {
        const set = new Set(self._classes());
        names.forEach((n) => set.add(n));
        self.setAttribute('class', [...set].join(' '));
      },
      remove: (...names) => {
        const set = new Set(self._classes());
        names.forEach((n) => set.delete(n));
        self.setAttribute('class', [...set].join(' '));
      },
      contains: (name) => self._classes().includes(name),
      toggle: (name, force) => {
        const has = self._classes().includes(name);
        const want = force === undefined ? !has : Boolean(force);
        if (want) self.classList.add(name);
        else self.classList.remove(name);
        return want;
      },
    };
  }

  _classes() {
    return String(this.getAttribute('class') || '').split(/\s+/).filter(Boolean);
  }

  get className() {
    return this.getAttribute('class') || '';
  }

  set className(value) {
    this.setAttribute('class', value);
  }

  setAttribute(name, value) {
    this.attributes.set(String(name), String(value));
  }

  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }

  hasAttribute(name) {
    return this.attributes.has(name);
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  /** `hidden` is a real property in browsers; mirror it onto the attribute. */
  get hidden() {
    return this.hasAttribute('hidden');
  }

  set hidden(value) {
    if (value) this.setAttribute('hidden', '');
    else this.removeAttribute('hidden');
  }

  get innerHTML() {
    return this._innerHTML !== null ? this._innerHTML : this.textContent;
  }

  /** Good enough for the app's one use: injecting a static string. */
  set innerHTML(value) {
    this._innerHTML = String(value);
    this.replaceChildren();
    const text = String(value).replace(/<[^>]*>/g, '');
    if (text) this.appendChild(new ShimText(text));
  }

  focus() {
    this.ownerDocument_activeElement = true;
  }

  blur() {}

  select() {}

  click() {
    this.fire('click');
  }

  scrollIntoView() {}

  requestSubmit() {
    this.fire('submit');
  }

  getBoundingClientRect() {
    return { top: 0, left: 0, width: 640, height: 320, right: 640, bottom: 320 };
  }
}

function camelToDash(key) {
  return String(key).replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

/** A style object that also tolerates Object.assign and setProperty. */
function makeStyle() {
  const store = {};
  return new Proxy(store, {
    get: (t, key) => {
      if (key === 'setProperty') return (k, v) => { t[k] = v; };
      if (key === 'removeProperty') return (k) => { delete t[k]; };
      if (key === 'getPropertyValue') return (k) => t[k] || '';
      return t[key];
    },
    set: (t, key, value) => {
      t[key] = value;
      return true;
    },
  });
}

/* ========================================================================== */
/* Document + window                                                           */
/* ========================================================================== */

const SVG_NS = 'http://www.w3.org/2000/svg';

function createDocument() {
  const doc = new ShimNode();
  doc.nodeType = 9;
  doc.readyState = 'complete';

  doc.createElement = (tag) => new ShimElement(tag, null);
  doc.createElementNS = (ns, tag) => new ShimElement(tag, ns);
  doc.createTextNode = (data) => new ShimText(data);
  doc.createDocumentFragment = () => new ShimFragment();

  doc.documentElement = new ShimElement('html');
  doc.body = new ShimElement('body');
  doc.head = new ShimElement('head');
  doc.documentElement.appendChild(doc.head);
  doc.documentElement.appendChild(doc.body);
  doc.appendChild(doc.documentElement);
  doc.activeElement = doc.body;
  doc.title = '';

  doc.getElementById = (id) => doc.querySelector(`[id="${id}"]`);
  doc.getElementsByTagName = (tag) => doc.querySelectorAll(tag);

  return doc;
}

/**
 * Build a sandbox that behaves enough like a browser window to run the app.
 * @param {object} opts { url } — base URL of the live server for fetch().
 */
function createWindow(opts = {}) {
  const base = opts.url || 'http://127.0.0.1:5099';
  const doc = createDocument();
  const storage = new Map();

  let hash = '';
  const location = {
    get href() { return `${base}/${hash}`; },
    get origin() { return base; },
    get pathname() { return '/'; },
    get search() { return ''; },
    get hash() { return hash; },
    set hash(value) {
      const next = String(value).startsWith('#') ? String(value) : `#${value}`;
      if (next === hash) return;
      hash = next;
      win.dispatchEvent({ type: 'hashchange' });
    },
    replace(value) {
      const next = String(value).startsWith('#') ? String(value) : `#${value}`;
      if (next === hash) return;
      hash = next;
      win.dispatchEvent({ type: 'hashchange' });
    },
    assign(value) { location.hash = value; },
    reload() {},
  };

  const history = {
    replaceState(_state, _title, url) {
      const i = String(url).indexOf('#');
      hash = i === -1 ? '' : String(url).slice(i);
      // Browsers do fire hashchange for a replaceState that changes the hash;
      // app.js relies on that and suppresses it, so mirror the behaviour.
      win.dispatchEvent({ type: 'hashchange' });
    },
    pushState(_state, _title, url) {
      history.replaceState(_state, _title, url);
    },
  };

  const winListeners = new Map();

  const win = {
    document: doc,
    location,
    history,
    navigator: { userAgent: 'cbems-dom-shim', language: 'en-IN' },
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    queueMicrotask,
    URL,
    URLSearchParams,
    Blob,
    FormData: global.FormData,
    Promise,
    Map,
    Set,
    Date,
    Math,
    JSON,
    Number,
    String,
    Boolean,
    Object,
    Array,
    Error,
    isNaN,
    parseInt,
    parseFloat,
    Intl,

    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    scrollTo() {},
    scroll() {},
    print() { win.__printed = (win.__printed || 0) + 1; },
    alert() {},
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    requestAnimationFrame: (fn) => setTimeout(() => fn(Date.now()), 0),

    localStorage: {
      getItem: (k) => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: (k) => storage.delete(k),
      clear: () => storage.clear(),
      key: (i) => [...storage.keys()][i] || null,
      get length() { return storage.size; },
    },
    sessionStorage: null,

    addEventListener(type, fn) {
      if (!winListeners.has(type)) winListeners.set(type, new Set());
      winListeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      const set = winListeners.get(type);
      if (set) set.delete(fn);
    },
    dispatchEvent(event) {
      const set = winListeners.get(event.type);
      if (set) [...set].forEach((fn) => fn(event));
      return true;
    },

    /** All app requests are relative ('/api/...'), so resolve against base. */
    fetch(input, init) {
      const url = String(input).startsWith('http') ? String(input) : `${base}${input}`;
      return global.fetch(url, init);
    },
  };

  // Minimal Event constructor for form.dispatchEvent(new Event('submit')).
  win.Event = class ShimEvent {
    constructor(type, options = {}) {
      this.type = type;
      this.bubbles = Boolean(options.bubbles);
      this.cancelable = Boolean(options.cancelable);
      this.defaultPrevented = false;
    }

    preventDefault() { this.defaultPrevented = true; }

    stopPropagation() {}
  };

  win.window = win;
  win.self = win;
  win.globalThis = win;
  win.top = win;
  win.SVG_NS = SVG_NS;

  // URL.createObjectURL is used by the CSV export path.
  win.URL = Object.assign(function ShimURL(...args) { return new URL(...args); }, URL, {
    createObjectURL: () => 'blob:shim',
    revokeObjectURL: () => {},
  });

  doc.defaultView = win;
  doc.addEventListener = win.addEventListener;
  doc.removeEventListener = win.removeEventListener;
  doc.dispatchEvent = win.dispatchEvent;

  return win;
}

/**
 * Evaluate the real frontend scripts inside a shim window.
 * @param {string[]} files absolute paths, in load order
 * @param {object} win     from createWindow()
 */
function loadScripts(files, win) {
  const context = vm.createContext(win);
  files.forEach((file) => {
    const code = fs.readFileSync(file, 'utf8');
    vm.runInContext(code, context, { filename: path.basename(file) });
  });
  return win;
}

module.exports = {
  createWindow,
  createDocument,
  loadScripts,
  ShimElement,
  ShimText,
  parseSelector,
  matchesSelector,
};
