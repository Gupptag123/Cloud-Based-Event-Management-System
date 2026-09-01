/**
 * frontend/js/app.js
 * ---------------------------------------------------------------------------
 * The bootstrap: a hash router, the sticky masthead + navigation chrome, route
 * guards for signed-in / organizer-only screens, and the footer.
 *
 * Every view is `async render(ctx) -> Node`, where ctx is
 *   { params, query, path, navigate(path), setQuery(obj), reload(), refreshChrome() }
 * ---------------------------------------------------------------------------
 */

(function (global) {
  'use strict';

  const { ui, api, session } = global.CBEMS;
  const { h, toast, empty, skeleton } = ui;
  const views = global.CBEMS.views;

  /* ====================================================================== */
  /* Route table                                                             */
  /* ====================================================================== */
  /* `guard` is one of: undefined (public) | 'auth' | 'organizer'.           */

  const ROUTES = [
    { path: '/', view: 'home', title: 'Home' },
    { path: '/events', view: 'browse', title: 'Browse events' },
    { path: '/events/:id', view: 'eventDetail', title: 'Event' },
    { path: '/login', view: 'login', title: 'Sign in', guest: true },
    { path: '/signup', view: 'signup', title: 'Create account', guest: true },

    { path: '/home', view: 'participantDashboard', title: 'My dashboard', guard: 'auth' },
    { path: '/my-registrations', view: 'myRegistrations', title: 'My registrations', guard: 'auth' },
    { path: '/profile', view: 'profile', title: 'Profile', guard: 'auth' },

    { path: '/dashboard', view: 'organizerDashboard', title: 'Dashboard', guard: 'organizer' },
    { path: '/manage/events', view: 'manageEvents', title: 'My events', guard: 'organizer' },
    { path: '/manage/events/new', view: 'eventForm', title: 'New event', guard: 'organizer' },
    { path: '/manage/events/:id', view: 'eventForm', title: 'Edit event', guard: 'organizer' },
    { path: '/manage/venues', view: 'manageVenues', title: 'Venues', guard: 'organizer' },
    { path: '/manage/registrations', view: 'manageRegistrations', title: 'Registrations', guard: 'organizer' },
    { path: '/report/:id', view: 'report', title: 'Event report', guard: 'organizer' },
  ];

  const SITE_NAME = 'CBEMS';

  /**
   * Match a path against the route table. Static segments beat params, so
   * '/manage/events/new' wins over '/manage/events/:id'.
   */
  function matchRoute(path) {
    const parts = path.split('/').filter(Boolean);
    let best = null;
    let bestScore = -1;

    ROUTES.forEach((route) => {
      const routeParts = route.path.split('/').filter(Boolean);
      if (routeParts.length !== parts.length) return;

      const params = {};
      let score = 0;
      for (let i = 0; i < routeParts.length; i += 1) {
        const rp = routeParts[i];
        if (rp.startsWith(':')) {
          params[rp.slice(1)] = decodeURIComponent(parts[i]);
        } else if (rp.toLowerCase() === parts[i].toLowerCase()) {
          score += 2;
        } else {
          return;
        }
      }
      if (score > bestScore) {
        bestScore = score;
        best = { route, params };
      }
    });

    return best;
  }

  /* ====================================================================== */
  /* Hash parsing                                                            */
  /* ====================================================================== */

  /** '#/events?category=Technical' -> { path:'/events', query:{category:'Technical'} } */
  function readHash() {
    let raw = global.location.hash.replace(/^#/, '');
    if (!raw) raw = '/';
    if (!raw.startsWith('/')) raw = `/${raw}`;
    const qIndex = raw.indexOf('?');
    const path = qIndex === -1 ? raw : raw.slice(0, qIndex);
    const query = {};
    if (qIndex !== -1) {
      new URLSearchParams(raw.slice(qIndex + 1)).forEach((value, key) => { query[key] = value; });
    }
    return { path: path.replace(/\/+$/, '') || '/', query };
  }

  function buildHash(path, query) {
    const search = new URLSearchParams();
    Object.keys(query || {}).forEach((key) => {
      const value = query[key];
      if (value === undefined || value === null || value === '') return;
      search.set(key, String(value));
    });
    const qs = search.toString();
    return `#${path}${qs ? `?${qs}` : ''}`;
  }

  function navigate(path, opts = {}) {
    const target = buildHash(path.startsWith('/') ? path : `/${path}`, opts.query);
    if (global.location.hash === target) {
      render();
      return;
    }
    if (opts.replace) global.location.replace(target);
    else global.location.hash = target;
  }

  /* ====================================================================== */
  /* Chrome: masthead, navigation, footer                                    */
  /* ====================================================================== */

  const PUBLIC_LINKS = [
    { href: '/', label: 'Home' },
    { href: '/events', label: 'Events' },
  ];

  function navLinksFor(user) {
    const links = PUBLIC_LINKS.slice();
    if (!user) return links;
    if (session.canOrganize) {
      links.push(
        { href: '/dashboard', label: 'Dashboard' },
        { href: '/manage/events', label: 'My events' },
        { href: '/manage/registrations', label: 'Approvals' },
        { href: '/manage/venues', label: 'Venues' }
      );
    } else {
      links.push(
        { href: '/home', label: 'My dashboard' },
        { href: '/my-registrations', label: 'My registrations' }
      );
    }
    return links;
  }

  /** Highlight the nav entry that owns the current path. */
  function isCurrent(href, path) {
    if (href === '/') return path === '/';
    return path === href || path.startsWith(`${href}/`);
  }

  function buildMasthead() {
    const navHost = h('nav.nav', { 'aria-label': 'Main' });
    const actionHost = h('div.row', { style: { gap: '0.5rem', marginLeft: 'auto' } });
    const drawer = h('div.nav-drawer', { hidden: true, id: 'nav-drawer' });

    const toggle = h('button.nav-toggle', {
      type: 'button',
      'aria-label': 'Toggle navigation',
      'aria-expanded': 'false',
      'aria-controls': 'nav-drawer',
      onClick: () => {
        const open = drawer.hidden;
        drawer.hidden = !open;
        toggle.setAttribute('aria-expanded', String(open));
      },
    }, h('span', { 'aria-hidden': 'true' }, '☰'));

    const header = h('header.masthead',
      h('div.wrap',
        h('div.masthead__inner',
          h('a.mark', { href: '#/' },
            h('span.mark__glyph', 'CB'),
            h('span', 'Event Manager'),
            h('span.mark__sub', 'Cloud-Based')
          ),
          navHost,
          actionHost,
          toggle
        ),
        drawer
      )
    );

    /** Redraw the parts of the header that depend on who is signed in. */
    function refresh() {
      const { path } = readHash();
      const user = session.user;
      const links = navLinksFor(user);

      ui.mount(navHost, links.map((l) => h('a.nav__link', {
        href: `#${l.href}`,
        'aria-current': isCurrent(l.href, path) ? 'page' : null,
      }, l.label)));

      ui.mount(drawer, [
        links.map((l) => h('a.nav__link', {
          href: `#${l.href}`,
          'aria-current': isCurrent(l.href, path) ? 'page' : null,
          onClick: () => { drawer.hidden = true; toggle.setAttribute('aria-expanded', 'false'); },
        }, l.label)),
        user
          ? [
              h('a.nav__link', { href: '#/profile', onClick: () => { drawer.hidden = true; } }, 'Profile'),
              h('a.nav__link', {
                href: '#/',
                onClick: (e) => { e.preventDefault(); drawer.hidden = true; signOut(); },
              }, 'Sign out'),
            ]
          : [
              h('a.nav__link', { href: '#/login', onClick: () => { drawer.hidden = true; } }, 'Sign in'),
              h('a.nav__link', { href: '#/signup', onClick: () => { drawer.hidden = true; } }, 'Create account'),
            ],
      ]);

      if (user) {
        const pendingBadge = h('span.nav-badge', { hidden: true });
        ui.mount(actionHost, [
          session.canOrganize
            ? h('a.btn.btn--sm', { href: '#/manage/events/new' }, '+ Event')
            : h('a.btn.btn--sm', { href: '#/events' }, 'Find events'),
          h('a.person', {
            href: '#/profile',
            style: { textDecoration: 'none', color: 'inherit' },
            title: `${user.name} · ${user.role}`,
          },
            ui.avatar(user.name),
            h('span.person__name', user.name.split(' ')[0]),
            pendingBadge
          ),
          h('button.btn.btn--sm.btn--ghost', { type: 'button', onClick: signOut }, 'Sign out'),
        ]);
      } else {
        ui.mount(actionHost, [
          h('a.btn.btn--sm', { href: '#/login' }, 'Sign in'),
          h('a.btn.btn--sm.btn--primary', { href: '#/signup' }, 'Create account'),
        ]);
      }
    }

    return { header, refresh };
  }

  function signOut() {
    session.end();
    toast.info('Signed out');
    navigate('/');
  }

  function buildFooter() {
    const year = new Date().getFullYear();
    const statusDot = h('span.footer__meta', 'checking API…');

    api.health()
      .then((res) => {
        const data = res.data || {};
        statusDot.textContent = `API OK · ${data.database || 'json-store'} · v${data.version || '1.0.0'}`;
        statusDot.style.color = 'var(--ok)';
      })
      .catch(() => {
        statusDot.textContent = 'API unreachable';
        statusDot.style.color = 'var(--no)';
      });

    return h('footer.footer',
      h('div.wrap',
        h('div.footer__inner',
          h('div',
            h('div', { style: { fontFamily: 'var(--display)', color: 'var(--ink)', fontSize: '1rem' } },
              'Cloud-Based Event Management System'),
            h('div', 'Create events, manage registrations, approve attendees — from anywhere.')
          ),
          h('div', { style: { display: 'grid', gap: '0.35rem', textAlign: 'right' } },
            h('div',
              h('a', { href: '#/events' }, 'Events'), ' · ',
              h('a', { href: '#/login' }, 'Sign in'), ' · ',
              h('a', { href: '#/signup' }, 'Register')),
            statusDot,
            h('div.footer__meta', `© ${year} · Academic project`)
          )
        )
      )
    );
  }

  /* ====================================================================== */
  /* Rendering                                                               */
  /* ====================================================================== */

  let chrome = null;
  let outlet = null;
  let footer = null;
  let renderToken = 0;

  function loadingScreen() {
    return h('section.section',
      h('div.wrap',
        h('div.grid.grid--4', skeleton('stat', 4)),
        h('div.grid', { style: { marginTop: '1.5rem' } }, skeleton('pass', 3))
      )
    );
  }

  function notFound() {
    return h('section.section',
      h('div.wrap.wrap--narrow',
        h('div', { style: { textAlign: 'center', paddingBlock: '3rem' } },
          h('p.eyebrow', 'Error 404'),
          h('h1.h1', 'This page does not exist'),
          h('p', { style: { color: 'var(--ink-2)' } },
            'The link may be out of date, or the event may have been removed.'),
          h('div.row', { style: { justifyContent: 'center', marginTop: '1.25rem' } },
            h('a.btn.btn--primary', { href: '#/' }, 'Go home'),
            h('a.btn', { href: '#/events' }, 'Browse events'))
        )
      )
    );
  }

  async function render() {
    const token = ++renderToken;
    const { path, query } = readHash();
    const matched = matchRoute(path);

    chrome.refresh();

    if (!matched) {
      ui.mount(outlet, notFound());
      document.title = `Not found · ${SITE_NAME}`;
      global.scrollTo(0, 0);
      return;
    }

    const { route, params } = matched;

    /* --- guards ------------------------------------------------------- */
    if (route.guard && !session.isSignedIn) {
      toast.info('Please sign in to continue');
      navigate('/login', { query: { next: path }, replace: true });
      return;
    }
    if (route.guard === 'organizer' && !session.canOrganize) {
      ui.mount(outlet, h('section.section', h('div.wrap.wrap--narrow',
        empty('Organizers only',
          'This area is for event organizers. Your account is registered as a participant.',
          h('a.btn.btn--primary', { href: '#/home' }, 'Go to my dashboard')))));
      document.title = `Not permitted · ${SITE_NAME}`;
      global.scrollTo(0, 0);
      return;
    }
    // Signed-in users have no business on the login/signup screens.
    if (route.guest && session.isSignedIn) {
      navigate(session.canOrganize ? '/dashboard' : '/home', { replace: true });
      return;
    }

    const viewFn = views[route.view];
    if (typeof viewFn !== 'function') {
      ui.mount(outlet, notFound());
      return;
    }

    document.title = `${route.title} · ${SITE_NAME}`;
    ui.mount(outlet, loadingScreen());

    const ctx = {
      params,
      query,
      path,
      navigate: (to, opts) => navigate(to, opts),
      /** Merge values into the query string without re-running the view. */
      setQuery(next) {
        const merged = Object.assign({}, readHash().query, next);
        Object.keys(merged).forEach((k) => {
          if (merged[k] === undefined || merged[k] === null || merged[k] === '') delete merged[k];
        });
        const target = buildHash(path, merged);
        if (global.location.hash !== target) {
          suppressNext = true;
          global.history.replaceState(null, '', target);
        }
      },
      reload: () => render(),
      refreshChrome: () => chrome.refresh(),
    };

    try {
      const node = await viewFn(ctx);
      if (token !== renderToken) return; // a newer navigation won
      ui.mount(outlet, node);
      global.scrollTo(0, 0);
      chrome.refresh();
    } catch (err) {
      if (token !== renderToken) return;
      if (err && err.isAuth) {
        toast.error('Your session expired. Please sign in again.');
        navigate('/login', { query: { next: path }, replace: true });
        return;
      }
      console.error('View failed', err);
      ui.mount(outlet, h('section.section', h('div.wrap.wrap--narrow',
        empty('Something went wrong', (err && err.message) || 'Unexpected error',
          h('button.btn.btn--primary', { type: 'button', onClick: () => render() }, 'Try again')))));
    }
  }

  /** setQuery uses replaceState, which still fires hashchange — skip that one. */
  let suppressNext = false;

  /* ====================================================================== */
  /* Boot                                                                    */
  /* ====================================================================== */

  function boot() {
    const app = document.getElementById('app');
    if (!app) {
      console.error('CBEMS: #app container is missing');
      return;
    }

    chrome = buildMasthead();
    outlet = h('main#main', { tabindex: '-1' });
    footer = buildFooter();

    ui.mount(app, [chrome.header, outlet, footer]);

    global.addEventListener('hashchange', () => {
      if (suppressNext) {
        suppressNext = false;
        return;
      }
      render();
    });

    // Signing in or out anywhere re-paints the header immediately.
    session.onChange(() => chrome.refresh());

    if (!global.location.hash) global.location.replace('#/');
    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  global.CBEMS.router = { navigate, render, readHash, ROUTES };
})(window);
