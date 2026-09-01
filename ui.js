/**
 * frontend/js/ui.js
 * ---------------------------------------------------------------------------
 * The view toolkit: a tiny hyperscript DOM builder, formatters, toasts, a
 * modal/confirm layer, status stamps, the signature "pass" card, and a set of
 * hand-rolled SVG charts. No framework, no CDN — everything the dashboard
 * draws is generated here so the app runs fully offline.
 * ---------------------------------------------------------------------------
 */

(function (global) {
  'use strict';

  /* ----------------------------------------------------------- DOM builder */
  /* h('div.card#id', { attrs }, ...children) -> HTMLElement                  */

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const SVG_TAGS = new Set([
    'svg', 'g', 'path', 'rect', 'circle', 'line', 'polyline', 'polygon',
    'text', 'tspan', 'defs', 'clipPath', 'title',
  ]);

  function h(spec, props, ...children) {
    // Parse "tag.class.class#id"
    let tag = 'div';
    const classes = [];
    let id = null;

    const m = String(spec).match(/^([a-zA-Z0-9]+)?/);
    if (m && m[1]) tag = m[1];
    const rest = String(spec).slice((m && m[1] ? m[1] : '').length);
    rest.replace(/([.#])([\w-]+)/g, (_, sym, name) => {
      if (sym === '.') classes.push(name);
      else id = name;
      return '';
    });

    const isSvg = SVG_TAGS.has(tag);
    const el = isSvg ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);

    if (classes.length) el.setAttribute('class', classes.join(' '));
    if (id) el.setAttribute('id', id);

    if (props && typeof props === 'object' && !isNode(props) && !Array.isArray(props)) {
      applyProps(el, props, isSvg);
    } else if (props !== undefined && props !== null) {
      children.unshift(props);
    }

    appendChildren(el, children);
    return el;
  }

  function isNode(x) {
    return x && typeof x === 'object' && typeof x.nodeType === 'number';
  }

  function applyProps(el, props, isSvg) {
    Object.keys(props).forEach((key) => {
      const value = props[key];
      if (value === null || value === undefined || value === false) return;

      if (key === 'class' || key === 'className') {
        el.setAttribute('class', Array.isArray(value) ? value.filter(Boolean).join(' ') : value);
      } else if (key === 'style' && typeof value === 'object') {
        Object.assign(el.style, value);
      } else if (key === 'dataset' && typeof value === 'object') {
        Object.keys(value).forEach((d) => {
          if (value[d] !== undefined && value[d] !== null) el.dataset[d] = value[d];
        });
      } else if (key === 'html') {
        el.innerHTML = value;
      } else if (key.startsWith('on') && typeof value === 'function') {
        el.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (key === 'value') {
        el.value = value;
      } else if (value === true) {
        el.setAttribute(key, '');
      } else if (isSvg) {
        el.setAttribute(key, value);
      } else {
        el.setAttribute(key, value);
      }
    });
  }

  function appendChildren(el, children) {
    children.flat(Infinity).forEach((child) => {
      if (child === null || child === undefined || child === false || child === true) return;
      el.appendChild(isNode(child) ? child : document.createTextNode(String(child)));
    });
  }

  /** Replace all children of `parent` with `content`. */
  function mount(parent, content) {
    const node = typeof parent === 'string' ? document.getElementById(parent) : parent;
    if (!node) return null;
    node.replaceChildren();
    if (content !== null && content !== undefined) {
      appendChildren(node, Array.isArray(content) ? content : [content]);
    }
    return node;
  }

  function frag(children) {
    const f = document.createDocumentFragment();
    appendChildren(f, Array.isArray(children) ? children : [children]);
    return f;
  }

  /* ------------------------------------------------------------- utilities */

  function escapeHTML(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function debounce(fn, wait) {
    let t;
    const wrapped = (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
    wrapped.cancel = () => clearTimeout(t);
    return wrapped;
  }

  function initials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  /* ------------------------------------------------------------ formatters */

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  /** Parse a plain YYYY-MM-DD as a *local* date (no UTC shift). */
  function parseDate(value) {
    if (!value) return null;
    if (value instanceof Date) return value;
    const s = String(value);
    const dateOnly = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateOnly) return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const fmt = {
    /** 'Wed 12 Aug' */
    date(value) {
      const d = parseDate(value);
      if (!d) return '—';
      return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
    },

    /** 'Wed 12 Aug 2026' */
    dateLong(value) {
      const d = parseDate(value);
      if (!d) return '—';
      return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    },

    /** { day:'12', mon:'AUG' } for the pass stub */
    stub(value) {
      const d = parseDate(value);
      if (!d) return { day: '--', mon: '' };
      return { day: String(d.getDate()).padStart(2, '0'), mon: MONTHS[d.getMonth()].toUpperCase() };
    },

    /** '09:00' -> '9:00 AM' */
    time(value) {
      if (!value) return '';
      const m = String(value).match(/^(\d{1,2}):(\d{2})/);
      if (!m) return String(value);
      let hour = Number(m[1]);
      const min = m[2];
      const ampm = hour >= 12 ? 'PM' : 'AM';
      hour = hour % 12 || 12;
      return `${hour}:${min} ${ampm}`;
    },

    timeRange(start, end) {
      const a = fmt.time(start);
      const b = end ? fmt.time(end) : '';
      return b ? `${a} – ${b}` : a;
    },

    /** Indian rupee. fee 0 -> 'Free'. */
    money(value) {
      const n = Number(value) || 0;
      if (n === 0) return 'Free';
      return `₹${n.toLocaleString('en-IN')}`;
    },

    number(value) {
      return Number(value || 0).toLocaleString('en-IN');
    },

    /** 'in 3 days' / 'today' / '2 days ago' from a YYYY-MM-DD event date. */
    until(value) {
      const d = parseDate(value);
      if (!d) return '';
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const diff = Math.round((d - today) / 86400000);
      if (diff === 0) return 'Today';
      if (diff === 1) return 'Tomorrow';
      if (diff === -1) return 'Yesterday';
      if (diff > 0) return `In ${diff} days`;
      return `${Math.abs(diff)} days ago`;
    },

    /** Relative time from an ISO timestamp: 'just now', '5m ago', '3h ago'. */
    ago(value) {
      if (!value) return '';
      const then = new Date(value).getTime();
      if (Number.isNaN(then)) return '';
      const secs = Math.round((Date.now() - then) / 1000);
      if (secs < 45) return 'just now';
      if (secs < 3600) return `${Math.round(secs / 60)}m ago`;
      if (secs < 86400) return `${Math.round(secs / 3600)}h ago`;
      const days = Math.round(secs / 86400);
      if (days < 30) return `${days}d ago`;
      return fmt.date(value);
    },

    titleCase(str) {
      return String(str || '').replace(/\b\w/g, (c) => c.toUpperCase());
    },
  };

  /* ---------------------------------------------------------------- toasts */

  let toastHost = null;

  function ensureToastHost() {
    if (!toastHost) {
      toastHost = document.getElementById('toasts');
      if (!toastHost) {
        toastHost = h('div.toasts#toasts', { 'aria-live': 'polite', 'aria-atomic': 'false' });
        document.body.appendChild(toastHost);
      }
    }
    return toastHost;
  }

  const TOAST_MARK = { ok: 'OK', error: 'ERR', info: 'i' };

  function toast(message, kind = 'info', timeout = 4200) {
    const host = ensureToastHost();
    const node = h(
      `div.toast.toast--${kind}`,
      { role: 'status' },
      h('span.toast__mark', TOAST_MARK[kind] || 'i'),
      h('div', message)
    );
    host.appendChild(node);

    const remove = () => {
      node.classList.add('toast--out');
      setTimeout(() => node.remove(), 220);
    };
    const timer = setTimeout(remove, timeout);
    node.addEventListener('click', () => {
      clearTimeout(timer);
      remove();
    });
    return node;
  }

  toast.ok = (m, t) => toast(m, 'ok', t);
  toast.error = (m, t) => toast(m, 'error', t);
  toast.info = (m, t) => toast(m, 'info', t);

  /* ----------------------------------------------------------------- modal */

  let modalHost = null;
  let lastFocus = null;

  function ensureModalHost() {
    if (!modalHost) {
      modalHost = document.getElementById('modal');
      if (!modalHost) {
        modalHost = h('div.modal#modal', { hidden: true });
        document.body.appendChild(modalHost);
      }
    }
    return modalHost;
  }

  /**
   * Open a modal.
   * @param {object} opts { title, body:Node, foot:Node|Node[], size:'sm'|null, onClose }
   * @returns {{ close: Function, el: HTMLElement }}
   */
  function modal(opts = {}) {
    const host = ensureModalHost();
    lastFocus = document.activeElement;

    const close = () => {
      host.setAttribute('hidden', '');
      host.replaceChildren();
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      if (opts.onClose) opts.onClose();
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    };

    const onKey = (e) => {
      if (e.key === 'Escape') close();
    };

    const panel = h(
      `div.modal__panel${opts.size === 'sm' ? '.modal__panel--sm' : ''}`,
      { role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.title || 'Dialog' },
      h(
        'div.modal__head',
        h('h2.modal__title', opts.title || ''),
        h('button.modal__close', { type: 'button', 'aria-label': 'Close', onClick: close }, '✕')
      ),
      h('div.modal__body', opts.body || ''),
      opts.foot ? h('div.modal__foot', opts.foot) : null
    );

    // Click on the backdrop (not the panel) closes.
    host.replaceChildren(panel);
    host.onclick = (e) => {
      if (e.target === host) close();
    };
    host.removeAttribute('hidden');
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);

    const firstField = panel.querySelector('input, select, textarea, button:not(.modal__close)');
    if (firstField) setTimeout(() => firstField.focus(), 30);

    return { close, el: panel };
  }

  /**
   * A yes/no confirmation. Resolves true on confirm, false on cancel.
   * @param {object} opts { title, message, confirmText, cancelText, danger }
   */
  function confirmDialog(opts = {}) {
    return new Promise((resolve) => {
      let decided = false;
      const done = (value) => {
        if (decided) return;
        decided = true;
        ref.close();
        resolve(value);
      };
      const ref = modal({
        size: 'sm',
        title: opts.title || 'Are you sure?',
        body: h('p', { style: { margin: 0, color: 'var(--ink-2)' } }, opts.message || ''),
        foot: [
          h('button.btn', { type: 'button', onClick: () => done(false) }, opts.cancelText || 'Cancel'),
          h(
            `button.btn.${opts.danger ? 'btn--danger' : 'btn--primary'}`,
            { type: 'button', onClick: () => done(true) },
            opts.confirmText || 'Confirm'
          ),
        ],
        onClose: () => done(false),
      });
    });
  }

  /* ------------------------------------------------------- status + pieces */

  const REG_LABEL = {
    approved: 'Approved',
    pending: 'Pending',
    rejected: 'Rejected',
    cancelled: 'Cancelled',
  };

  const EVENT_LABEL = {
    published: 'Published',
    draft: 'Draft',
    cancelled: 'Cancelled',
    completed: 'Completed',
  };

  /** Small status stamp. `kind` is a registration or event status string. */
  function stamp(kind, opts = {}) {
    const label = REG_LABEL[kind] || EVENT_LABEL[kind] || fmt.titleCase(kind);
    return h(`span.stamp.stamp--${kind}${opts.mark ? '.stamp--mark' : ''}`, label);
  }

  const CATEGORY_COLORS = {
    Technical: '#2563eb',
    Cultural: '#db2777',
    Sports: '#059669',
    Workshop: '#d97706',
    Seminar: '#7c3aed',
    Conference: '#0891b2',
    Hackathon: '#dc2626',
    Other: '#475569',
  };

  function categoryColor(name) {
    return CATEGORY_COLORS[name] || CATEGORY_COLORS.Other;
  }

  function avatar(name, opts = {}) {
    return h(`span.avatar${opts.lg ? '.avatar--lg' : ''}`, { title: name || '' }, initials(name));
  }

  /** A capacity gauge with a caption. */
  function gauge(seatsTaken, capacity) {
    const cap = Number(capacity) || 0;
    const taken = Number(seatsTaken) || 0;
    const pct = cap > 0 ? Math.min(100, Math.round((taken / cap) * 100)) : 0;
    const mod = pct >= 100 ? 'gauge--full' : pct >= 80 ? 'gauge--warn' : '';
    return h(
      `div.gauge.${mod}`,
      h('div.gauge__track', h('div.gauge__fill', { style: { width: `${pct}%` } })),
      h('div.gauge__label', cap > 0 ? `${taken} / ${cap} seats · ${pct}% full` : `${taken} registered`)
    );
  }

  /* ------------------------------------------------------------- pass card */

  /**
   * The signature event card: a dated pass with a punched stub.
   * @param {object} event decorated event from the API
   * @param {object} [opts] { href, onClick, closed }
   */
  function passCard(event, opts = {}) {
    const stubDate = fmt.stub(event.date);
    const closed = opts.closed !== undefined ? opts.closed : event.registrationOpen === false;
    const venueName = event.venue ? event.venue.name : 'Venue TBA';
    const cityText = event.venue && event.venue.city ? event.venue.city : '';

    const body = h(
      'div.pass__body',
      h('span.pass__cat', { style: { '--cat': categoryColor(event.category) } }, event.category || 'Event'),
      h('h3.pass__title', event.title),
      h(
        'div.pass__meta',
        h('div.pass__meta-row', h('span.k', 'When'), h('span.v', `${fmt.date(event.date)} · ${fmt.time(event.time)}`)),
        h('div.pass__meta-row', h('span.k', 'Where'), h('span.v', cityText ? `${venueName}, ${cityText}` : venueName)),
        typeof event.seatsLeft === 'number'
          ? h(
              'div.pass__meta-row',
              h('span.k', 'Seats'),
              h('span.v', event.capacity > 0 ? (event.isFull ? 'Full' : `${event.seatsLeft} left`) : 'Open entry')
            )
          : null
      )
    );

    const stubEl = h(
      'div.pass__stub',
      h('span.pass__mon', stubDate.mon),
      h('span.pass__day', stubDate.day),
      h('span.pass__hour', fmt.time(event.time))
    );

    const attrs = { class: `pass${closed ? ' pass--closed' : ''}` };
    if (opts.href) {
      attrs.href = opts.href;
      return h('a', attrs, body, stubEl);
    }
    if (opts.onClick) {
      attrs.role = 'button';
      attrs.tabindex = '0';
      attrs.onClick = opts.onClick;
      attrs.onKeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          opts.onClick(e);
        }
      };
    }
    return h('div', attrs, body, stubEl);
  }

  /* ---------------------------------------------------------- empty/skel */

  function empty(title, text, action) {
    return h(
      'div.empty',
      h('div.empty__glyph', '⊘'),
      h('div.empty__title', title || 'Nothing here yet'),
      text ? h('p.empty__text', text) : null,
      action || null
    );
  }

  function skeleton(kind, count = 1) {
    const items = [];
    for (let i = 0; i < count; i += 1) items.push(h(`div.skeleton.skeleton--${kind}`));
    return items;
  }

  /* --------------------------------------------------------------- charts */
  /* All charts are plain SVG generated here. Responsive via viewBox.         */

  const chart = {};

  /**
   * Horizontal bars — good for "registrations per event". Each row can carry
   * an approved / pending split.
   * @param {Array} rows [{ label, title?, approved, pending, capacity }]
   */
  chart.bars = function bars(rows, opts = {}) {
    if (!rows || !rows.length) return empty('No data yet', 'Charts appear once there is activity.');

    const width = 640;
    const rowH = 34;
    const gap = 10;
    const labelW = 150;
    const valueW = 46;
    const trackW = width - labelW - valueW;
    const height = rows.length * (rowH + gap);
    const max = Math.max(1, ...rows.map((r) => Math.max(Number(r.approved || 0) + Number(r.pending || 0), Number(r.capacity || 0))));

    const svg = h('svg.chart__svg', {
      viewBox: `0 0 ${width} ${height}`,
      role: 'img',
      'aria-label': opts.label || 'Bar chart',
      preserveAspectRatio: 'xMidYMid meet',
    });

    rows.forEach((r, i) => {
      const y = i * (rowH + gap);
      const approved = Number(r.approved || 0);
      const pending = Number(r.pending || 0);
      const total = approved + pending;
      const cap = Number(r.capacity || 0);
      const barY = y + 6;
      const barH = rowH - 12;

      // Capacity ghost
      if (cap > 0) {
        svg.appendChild(h('rect', {
          x: labelW, y: barY, width: trackW, height: barH, rx: 3,
          fill: 'var(--card-2)', stroke: 'var(--rule)', 'stroke-width': 1,
        }));
        const capW = (cap / max) * trackW;
        svg.appendChild(h('rect', { x: labelW, y: barY, width: capW, height: barH, rx: 3, fill: 'transparent', stroke: 'var(--rule-strong)', 'stroke-width': 1, 'stroke-dasharray': '3 3' }));
      }

      const approvedW = (approved / max) * trackW;
      const pendingW = (pending / max) * trackW;

      svg.appendChild(h('rect', { x: labelW, y: barY, width: Math.max(0, approvedW), height: barH, rx: 3, fill: 'var(--signal)' }));
      svg.appendChild(h('rect', { x: labelW + approvedW, y: barY, width: Math.max(0, pendingW), height: barH, rx: 3, fill: 'var(--wait)' }));

      // Row label (truncated by the caller to ~26 chars)
      svg.appendChild(h('text.chart__bar-label', {
        x: 0, y: y + rowH / 2, 'dominant-baseline': 'middle',
      }, r.label || r.title || ''));

      // Value at the end
      svg.appendChild(h('text.chart__value', {
        x: labelW + Math.max(approvedW + pendingW, 2) + 6, y: y + rowH / 2,
        'dominant-baseline': 'middle',
      }, String(total)));
    });

    return h('div.chart', svg,
      h('div.legend',
        h('span.legend__item', h('span.legend__swatch', { style: { background: 'var(--signal)' } }), 'Approved'),
        h('span.legend__item', h('span.legend__swatch', { style: { background: 'var(--wait)' } }), 'Pending'),
        h('span.legend__item', h('span.legend__swatch', { style: { background: 'transparent', border: '1px dashed var(--rule-strong)' } }), 'Capacity')
      )
    );
  };

  /**
   * Donut for categorical breakdowns (events by category, status split).
   * @param {Array} slices [{ label, value, color }]
   */
  chart.donut = function donut(slices, opts = {}) {
    const data = (slices || []).filter((s) => Number(s.value) > 0);
    const total = data.reduce((sum, s) => sum + Number(s.value), 0);
    if (!total) return empty('No data yet', opts.emptyText || 'This chart fills in as records are added.');

    const size = 180;
    const cx = size / 2;
    const cy = size / 2;
    const r = 70;
    const inner = 44;
    const circumference = 2 * Math.PI * r;

    const svg = h('svg', {
      viewBox: `0 0 ${size} ${size}`,
      role: 'img',
      'aria-label': opts.label || 'Donut chart',
      width: size,
      height: size,
      style: { maxWidth: `${size}px`, margin: '0 auto' },
    });

    let offset = 0;
    data.forEach((s) => {
      const fraction = Number(s.value) / total;
      const dash = fraction * circumference;
      svg.appendChild(h('circle', {
        cx, cy, r,
        fill: 'none',
        stroke: s.color || 'var(--ink-3)',
        'stroke-width': size / 2 - inner,
        'stroke-dasharray': `${dash} ${circumference - dash}`,
        'stroke-dashoffset': -offset,
        transform: `rotate(-90 ${cx} ${cy})`,
      }));
      offset += dash;
    });

    // Center total
    svg.appendChild(h('text', {
      x: cx, y: cy - 4, 'text-anchor': 'middle', 'dominant-baseline': 'middle',
      style: { font: '700 22px var(--display)', fill: 'var(--ink)' },
    }, String(total)));
    svg.appendChild(h('text', {
      x: cx, y: cy + 16, 'text-anchor': 'middle',
      style: { font: '600 8px var(--mono)', fill: 'var(--ink-3)', letterSpacing: '0.1em' },
    }, (opts.centerLabel || 'TOTAL').toUpperCase()));

    const legend = h('div.legend',
      data.map((s) => h('span.legend__item',
        h('span.legend__swatch', { style: { background: s.color || 'var(--ink-3)' } }),
        s.label,
        h('span.legend__value', String(s.value))
      ))
    );

    return h('div.chart', { style: { display: 'grid', gap: '0.5rem', justifyItems: 'center' } }, svg, legend);
  };

  /**
   * Sparkline / area line for a time trend.
   * @param {Array} points [{ label, value }]
   */
  chart.line = function line(points, opts = {}) {
    const data = points || [];
    if (data.length < 2) return empty('Not enough data', 'The trend needs a few days of activity.');

    const width = 640;
    const height = 160;
    const padX = 8;
    const padTop = 12;
    const padBottom = 22;
    const max = Math.max(1, ...data.map((p) => Number(p.value || 0)));
    const stepX = (width - padX * 2) / (data.length - 1);
    const scaleY = (v) => padTop + (1 - Number(v || 0) / max) * (height - padTop - padBottom);

    const coords = data.map((p, i) => [padX + i * stepX, scaleY(p.value)]);
    const linePath = coords.map((c, i) => `${i ? 'L' : 'M'}${c[0].toFixed(1)} ${c[1].toFixed(1)}`).join(' ');
    const areaPath = `${linePath} L${coords[coords.length - 1][0].toFixed(1)} ${height - padBottom} L${coords[0][0].toFixed(1)} ${height - padBottom} Z`;

    const svg = h('svg', {
      viewBox: `0 0 ${width} ${height}`,
      role: 'img',
      'aria-label': opts.label || 'Trend line',
      preserveAspectRatio: 'none',
      style: { width: '100%', height: 'auto' },
    });

    const gradId = `spark-${Math.random().toString(36).slice(2, 8)}`;
    const defs = h('defs');
    defs.appendChild(h('linearGradient', { id: gradId, x1: '0', y1: '0', x2: '0', y2: '1' },
      h('stop', { offset: '0%', 'stop-color': 'var(--signal)', 'stop-opacity': '0.22' }),
      h('stop', { offset: '100%', 'stop-color': 'var(--signal)', 'stop-opacity': '0' })
    ));
    svg.appendChild(defs);

    // baseline
    svg.appendChild(h('line', { x1: padX, y1: height - padBottom, x2: width - padX, y2: height - padBottom, class: 'chart__axis' }));
    svg.appendChild(h('path', { d: areaPath, fill: `url(#${gradId})` }));
    svg.appendChild(h('path', { d: linePath, fill: 'none', stroke: 'var(--signal)', 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));

    // point dots + sparse labels
    const labelEvery = Math.ceil(data.length / 7);
    data.forEach((p, i) => {
      const [x, y] = coords[i];
      if (Number(p.value) > 0) {
        svg.appendChild(h('circle', { cx: x, cy: y, r: 2.5, fill: 'var(--signal)' }));
      }
      if (i % labelEvery === 0 || i === data.length - 1) {
        svg.appendChild(h('text', {
          x, y: height - 6, 'text-anchor': 'middle',
          style: { font: '10px var(--mono)', fill: 'var(--ink-3)' },
        }, p.label));
      }
    });

    return h('div.chart', svg);
  };

  /* ------------------------------------------------------------ pagination */

  function pager(pagination, onGo) {
    if (!pagination || pagination.pages <= 1) return null;
    const { page, pages, hasPrev, hasNext, total } = pagination;
    return h(
      'div.pager',
      h('button.btn.btn--sm', { type: 'button', disabled: !hasPrev, onClick: () => onGo(page - 1) }, '‹ Prev'),
      h('span.pager__info', `Page ${page} of ${pages} · ${fmt.number(total)} total`),
      h('button.btn.btn--sm', { type: 'button', disabled: !hasNext, onClick: () => onGo(page + 1) }, 'Next ›')
    );
  }

  /* ----------------------------------------------------------------- forms */

  /**
   * Build a labelled field wrapper.
   * @param {object} opts { label, name, required, hint, control:Node }
   */
  function field(opts) {
    return h(
      'div.field',
      { dataset: { field: opts.name || '' } },
      opts.label
        ? h('label.field__label', { for: opts.name || undefined },
            opts.label, opts.required ? h('span.req', ' *') : null)
        : null,
      opts.control,
      opts.hint ? h('span.field__hint', opts.hint) : null
    );
  }

  /** Paint server-side validation errors onto a form built with `field`. */
  function applyFieldErrors(formEl, errors) {
    formEl.querySelectorAll('.field--invalid').forEach((f) => {
      f.classList.remove('field--invalid');
      const e = f.querySelector('.field__error');
      if (e) e.remove();
    });
    if (!errors) return;
    Object.keys(errors).forEach((name) => {
      const wrap = formEl.querySelector(`.field[data-field="${name}"]`);
      if (!wrap) return;
      wrap.classList.add('field--invalid');
      wrap.appendChild(h('span.field__error', errors[name]));
    });
  }

  /* --------------------------------------------------------------- exports */

  const ui = {
    h,
    mount,
    frag,
    escapeHTML,
    debounce,
    initials,
    parseDate,
    fmt,
    toast,
    modal,
    confirmDialog,
    stamp,
    avatar,
    gauge,
    passCard,
    empty,
    skeleton,
    chart,
    pager,
    field,
    applyFieldErrors,
    categoryColor,
    CATEGORY_COLORS,
    REG_LABEL,
    EVENT_LABEL,
  };

  global.CBEMS = global.CBEMS || {};
  global.CBEMS.ui = ui;
})(window);
