/**
 * frontend/js/views-account.js
 * ---------------------------------------------------------------------------
 * Signed-in views that belong to every user regardless of role: the profile
 * page and password change, plus the participant's dashboard and the
 * "my registrations" tracker.
 * ---------------------------------------------------------------------------
 */

(function (global) {
  'use strict';

  const { ui, api, session } = global.CBEMS;
  const { h, fmt, toast, passCard, empty, skeleton, field, applyFieldErrors } = ui;

  const views = {};

  /* ====================================================================== */
  /* Participant dashboard                                                   */
  /* ====================================================================== */

  views.participantDashboard = async function participantDashboard(ctx) {
    const user = session.user || {};
    const statHost = h('div.grid.grid--4', skeleton('stat', 4));
    const upcomingHost = h('div.stack.stack--sm', skeleton('row', 3));
    const recommendedHost = h('div.grid', skeleton('pass', 3));
    const chartHost = h('div', skeleton('stat', 1));

    const page = h('div',
      h('section.section.section--tight',
        h('div.wrap',
          h('p.eyebrow', `Signed in as ${user.email || ''}`),
          h('div.section__head',
            h('h1.h1', `Hello, ${(user.name || 'there').split(' ')[0]}`),
            h('a.btn.btn--primary', { href: '#/events' }, 'Find events')
          ),
          statHost
        )
      ),
      h('section.section',
        h('div.wrap',
          h('div.detail-grid',
            h('div.stack.stack--lg',
              h('div',
                h('div.section__head',
                  h('h2.h2', 'Your upcoming events'),
                  h('a.data', { href: '#/my-registrations' }, 'All registrations →')
                ),
                upcomingHost
              ),
              h('div',
                h('h2.h2.mb-3', 'Recommended for you'),
                recommendedHost
              )
            ),
            h('div.sticky-side',
              h('div.panel',
                h('div.panel__head', h('h3.panel__title', 'Where you register')),
                h('div.panel__body', chartHost)
              )
            )
          )
        )
      )
    );

    (async () => {
      try {
        const res = await api.dashboard.participant();
        const d = res.data || {};
        const s = d.stats || {};

        ui.mount(statHost, [
          statCard('Registered', s.totalRegistrations, 'events joined', 'var(--ink)'),
          statCard('Approved', s.approved, 'confirmed seats', 'var(--ok)'),
          statCard('Pending', s.pending, 'awaiting review', 'var(--wait)'),
          statCard('Upcoming', s.upcoming, 'still to attend', 'var(--signal)'),
        ]);

        const up = d.upcoming || [];
        ui.mount(upcomingHost, up.length
          ? up.map((r) => registrationRow(r, ctx))
          : empty('Nothing on your calendar', 'Register for an event and it will appear here.',
              h('a.btn.btn--primary', { href: '#/events' }, 'Browse events')));

        const rec = d.recommended || [];
        ui.mount(recommendedHost, rec.length
          ? rec.map((e) => passCard(e, { href: `#/events/${e._id}` }))
          : empty('No suggestions yet', 'Once there are open events you have not joined, they show up here.'));

        ui.mount(chartHost, ui.chart.donut(d.charts ? d.charts.byCategory : [], { centerLabel: 'Events', emptyText: 'Register for events to see your mix by category.' }));
      } catch (err) {
        ui.mount(statHost, empty('Could not load your dashboard', err.message));
      }
    })();

    return page;
  };

  function statCard(label, value, note, accent) {
    return h('div.stat', { style: { '--accent': accent || 'var(--rule-strong)' } },
      h('span.stat__label', label),
      h('span.stat__value', fmt.number(value || 0)),
      note ? h('span.stat__note', note) : null
    );
  }

  /** A compact registration line with its event and a status stamp. */
  function registrationRow(r, ctx) {
    const ev = r.event || {};
    const stub = fmt.stub(ev.date);
    return h('a.timeline__item', { href: `#/events/${ev._id || ''}`, style: { textDecoration: 'none', color: 'inherit' } },
      h('div.timeline__when',
        h('span.m', stub.mon),
        h('span.d', stub.day)
      ),
      h('div.timeline__what',
        h('div.row.row--between',
          h('span.timeline__title', ev.title || 'Event'),
          ui.stamp(r.status)
        ),
        h('div.timeline__sub',
          `${fmt.time(ev.time)} · ${ev.venue ? ev.venue.name : 'Venue TBA'}${ev.venue && ev.venue.city ? `, ${ev.venue.city}` : ''}`)
      )
    );
  }

  /* ====================================================================== */
  /* My registrations                                                        */
  /* ====================================================================== */

  const REG_FILTERS = [
    { value: '', label: 'All' },
    { value: 'pending', label: 'Pending' },
    { value: 'approved', label: 'Approved' },
    { value: 'rejected', label: 'Rejected' },
    { value: 'cancelled', label: 'Cancelled' },
  ];

  views.myRegistrations = async function myRegistrations(ctx) {
    const state = { status: ctx.query.status || '', when: ctx.query.when || 'all' };

    const summaryHost = h('div.grid.grid--4', skeleton('stat', 4));
    const listHost = h('div', skeleton('row', 4));
    const filterHost = h('div.chips');

    function renderFilters() {
      ui.mount(filterHost, REG_FILTERS.map((f) =>
        h('button.chip', {
          type: 'button',
          'aria-pressed': state.status === f.value ? 'true' : 'false',
          onClick: () => { state.status = f.value; load(); },
        }, f.label)));
    }

    const page = h('div',
      h('section.section.section--tight',
        h('div.wrap',
          h('p.eyebrow', 'Your activity'),
          h('div.section__head',
            h('h1.h1', 'My registrations'),
            h('a.btn.btn--primary', { href: '#/events' }, 'Register for more')
          ),
          summaryHost
        )
      ),
      h('section.section', { style: { paddingTop: '1.5rem' } },
        h('div.wrap',
          h('div.row.row--between', { style: { marginBottom: '1rem' } },
            filterHost,
            h('select.select', {
              'aria-label': 'Time filter',
              style: { maxWidth: '12rem' },
              onChange: (e) => { state.when = e.target.value; load(); },
            },
              h('option', { value: 'all', selected: state.when === 'all' }, 'Any time'),
              h('option', { value: 'upcoming', selected: state.when === 'upcoming' }, 'Upcoming only'),
              h('option', { value: 'past', selected: state.when === 'past' }, 'Past only'))
          ),
          listHost
        )
      )
    );

    renderFilters();

    async function load() {
      renderFilters();
      ui.mount(listHost, skeleton('row', 4));
      ctx.setQuery({ status: state.status || undefined, when: state.when !== 'all' ? state.when : undefined });

      try {
        const res = await api.registrations.mine({ status: state.status, when: state.when });
        const rows = res.data || [];
        const summary = (res.meta && res.meta.summary) || {};

        ui.mount(summaryHost, [
          statCard('Total', (res.meta && res.meta.total) || rows.length, 'registrations', 'var(--ink)'),
          statCard('Approved', summary.approved, 'confirmed', 'var(--ok)'),
          statCard('Pending', summary.pending, 'in review', 'var(--wait)'),
          statCard('Rejected', summary.rejected, 'declined', 'var(--no)'),
        ]);

        if (!rows.length) {
          ui.mount(listHost, empty('No registrations here',
            state.status ? 'No registrations match this filter.' : 'You have not registered for any events yet.',
            h('a.btn.btn--primary', { href: '#/events' }, 'Browse events')));
          return;
        }

        ui.mount(listHost, h('div.panel',
          h('div.table-scroll',
            h('table.table',
              h('thead', h('tr',
                h('th', 'Event'),
                h('th', 'When'),
                h('th', 'Venue'),
                h('th', 'Seats'),
                h('th', 'Status'),
                h('th', 'Submitted'),
                h('th', { class: 'actions' }, '')
              )),
              h('tbody', rows.map((r) => registrationTableRow(r, ctx)))
            )
          )
        ));
      } catch (err) {
        ui.mount(listHost, empty('Could not load registrations', err.message));
      }
    }

    function registrationTableRow(r, ctx) {
      const ev = r.event || {};
      const canWithdraw = r.status === 'pending' || r.status === 'approved';
      return h('tr',
        h('td',
          h('a.table__primary', { href: `#/events/${ev._id || ''}` }, ev.title || 'Event'),
          ev.category ? h('div.table__sub', ev.category) : null
        ),
        h('td.nowrap', ev.date ? h('div', fmt.date(ev.date), h('div.table__sub', fmt.time(ev.time))) : '—'),
        h('td', ev.venue ? h('div', ev.venue.name, ev.venue.city ? h('div.table__sub', ev.venue.city) : null) : '—'),
        h('td.num', String(r.seats || 1)),
        h('td', ui.stamp(r.status)),
        h('td.nowrap.data.muted', fmt.ago(r.regDate)),
        h('td', { class: 'actions' },
          canWithdraw
            ? h('button.btn.btn--danger.btn--sm', {
                type: 'button',
                onClick: async () => {
                  const ok = await ui.confirmDialog({
                    title: 'Withdraw registration?',
                    message: `Release your seat for “${ev.title}”?`,
                    confirmText: 'Withdraw', danger: true,
                  });
                  if (!ok) return;
                  try {
                    await api.registrations.cancel(r._id);
                    toast.ok('Registration withdrawn');
                    load();
                  } catch (err) { toast.error(err.message); }
                },
              }, 'Withdraw')
            : h('span.data.muted', '—')
        )
      );
    }

    load();
    return page;
  };

  /* ====================================================================== */
  /* Profile                                                                 */
  /* ====================================================================== */

  views.profile = async function profile(ctx) {
    let user = session.user || {};
    // Refresh from the server so the form is never stale.
    try {
      const res = await api.auth.me();
      user = res.data.user;
      session.setUser(user);
    } catch (err) {
      /* fall back to cached user */
    }

    /* --- profile form -------------------------------------------------- */
    const nameInput = h('input.input', { id: 'name', value: user.name || '', required: true });
    const phoneInput = h('input.input', { id: 'phone', type: 'tel', value: user.phone || '' });
    const orgInput = h('input.input', { id: 'organization', value: user.organization || '' });
    const profileSubmit = h('button.btn.btn--primary', { type: 'submit' }, 'Save changes');

    const profileForm = h('form.stack', {
      novalidate: true,
      onSubmit: async (e) => {
        e.preventDefault();
        applyFieldErrors(profileForm, null);
        profileSubmit.disabled = true;
        try {
          const res = await api.auth.updateProfile({
            name: nameInput.value.trim(),
            phone: phoneInput.value.trim(),
            organization: orgInput.value.trim(),
          });
          session.setUser(res.data.user);
          toast.ok('Profile updated');
          ctx.refreshChrome();
        } catch (err) {
          toast.error(err.message);
          applyFieldErrors(profileForm, err.errors);
        } finally {
          profileSubmit.disabled = false;
        }
      },
    },
      field({ label: 'Full name', name: 'name', required: true, control: nameInput }),
      field({ label: 'Email', name: 'email',
        control: h('input.input', { value: user.email || '', disabled: true }),
        hint: 'Your email address cannot be changed.' }),
      field({ label: 'Phone', name: 'phone', control: phoneInput }),
      field({ label: 'Department / organization', name: 'organization', control: orgInput }),
      h('div.row', profileSubmit)
    );

    /* --- password form ------------------------------------------------- */
    const currentInput = h('input.input', { id: 'currentPassword', type: 'password', autocomplete: 'current-password', required: true });
    const newInput = h('input.input', { id: 'newPassword', type: 'password', autocomplete: 'new-password', required: true });
    const pwSubmit = h('button.btn.btn--primary', { type: 'submit' }, 'Change password');

    const pwForm = h('form.stack', {
      novalidate: true,
      onSubmit: async (e) => {
        e.preventDefault();
        applyFieldErrors(pwForm, null);
        pwSubmit.disabled = true;
        try {
          await api.auth.changePassword({
            currentPassword: currentInput.value,
            newPassword: newInput.value,
          });
          toast.ok('Password changed');
          pwForm.reset();
        } catch (err) {
          toast.error(err.message);
          applyFieldErrors(pwForm, err.errors);
        } finally {
          pwSubmit.disabled = false;
        }
      },
    },
      field({ label: 'Current password', name: 'currentPassword', required: true, control: currentInput }),
      field({ label: 'New password', name: 'newPassword', required: true, control: newInput, hint: 'Minimum 6 characters' }),
      h('div.row', pwSubmit)
    );

    return h('div',
      h('section.section.section--tight',
        h('div.wrap.wrap--mid',
          h('p.eyebrow', 'Account'),
          h('div.row', { style: { gap: '1rem', alignItems: 'center' } },
            ui.avatar(user.name, { lg: true }),
            h('div',
              h('h1.h1', user.name || 'Your profile'),
              h('p.data.muted', { style: { margin: 0 } },
                `${fmt.titleCase(user.role || 'participant')} · ${user.email || ''}`)
            )
          )
        )
      ),
      h('section.section', { style: { paddingTop: '1.5rem' } },
        h('div.wrap.wrap--mid',
          h('div.grid--2.grid',
            h('div.card.card--pad-lg',
              h('p.eyebrow', 'Profile details'),
              h('h2.h3.mb-2', 'Edit your information'),
              profileForm
            ),
            h('div.card.card--pad-lg',
              h('p.eyebrow', 'Security'),
              h('h2.h3.mb-2', 'Change password'),
              pwForm
            )
          ),
          h('div', { style: { marginTop: '1.5rem' } },
            h('button.btn.btn--danger', {
              type: 'button',
              onClick: () => {
                session.end();
                toast.info('Signed out');
                ctx.navigate('/');
              },
            }, 'Sign out of this device')
          )
        )
      )
    );
  };

  global.CBEMS = global.CBEMS || {};
  global.CBEMS.views = Object.assign(global.CBEMS.views || {}, views);
  global.CBEMS.viewHelpers = Object.assign(global.CBEMS.viewHelpers || {}, { statCard });
})(window);
