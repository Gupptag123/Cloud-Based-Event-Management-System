/**
 * frontend/js/views-public.js
 * ---------------------------------------------------------------------------
 * Views anyone can reach: the landing page, event discovery (search / filter /
 * sort), a single event page with the registration action, and the sign-in /
 * sign-up screens.
 *
 * Every view exports `async render(ctx) -> Node`. `ctx` carries { params,
 * query, navigate } from the router.
 * ---------------------------------------------------------------------------
 */

(function (global) {
  'use strict';

  const { ui, api, session } = global.CBEMS;
  const { h, fmt, toast, passCard, empty, skeleton, field, applyFieldErrors } = ui;

  const views = {};

  /** Where a signed-in user belongs: organizers get analytics, participants their tracker. */
  function homePath() {
    return session.canOrganize ? '/dashboard' : '/home';
  }

  /* ====================================================================== */
  /* Home                                                                    */
  /* ====================================================================== */

  views.home = async function home(ctx) {
    const page = h('div');

    /* --- hero ---------------------------------------------------------- */
    const board = h('div.board',
      h('div.board__head',
        h('span', 'Next on campus'),
        h('span.board__live', h('span.board__dot'), 'Live')
      ),
      h('div', skeleton('row', 4))
    );

    const statsLine = h('div.hero__stats');

    const hero = h('section.hero',
      h('div.wrap',
        h('div.hero__inner',
          h('div',
            h('p.eyebrow', 'Cloud-Based Event Management System'),
            h('h1.display',
              'Every campus event,',
              h('br'),
              'one ', h('span.amp', 'pass'), '.'
            ),
            h('div.hero__rule'),
            h('p.lead',
              'Publish an event, take registrations, approve them, and watch the seats fill — ' +
              'all from a single cloud-hosted system. No spreadsheets, no double bookings, ' +
              'no counting chairs by hand.'
            ),
            h('div.row', { style: { marginTop: '1.5rem' } },
              h('a.btn.btn--primary.btn--lg', { href: '#/events' }, 'Browse events'),
              session.isSignedIn
                ? h('a.btn.btn--lg', { href: `#${homePath()}` }, 'Go to dashboard')
                : h('a.btn.btn--lg', { href: '#/signup' }, 'Create an account')
            ),
            statsLine
          ),
          h('div', board)
        )
      )
    );
    page.appendChild(hero);

    /* --- categories ---------------------------------------------------- */
    const categoryStrip = h('div.chips');
    page.appendChild(
      h('section.section.section--tight',
        h('div.wrap',
          h('p.eyebrow', 'Browse by category'),
          categoryStrip
        )
      )
    );

    /* --- upcoming grid ------------------------------------------------- */
    const upcomingGrid = h('div.grid', skeleton('pass', 6));
    page.appendChild(
      h('section.section',
        h('div.wrap',
          h('div.section__head',
            h('div',
              h('p.eyebrow', 'Open for registration'),
              h('h2.h2', 'Happening soon')
            ),
            h('a.btn', { href: '#/events' }, 'See all events →')
          ),
          upcomingGrid
        )
      )
    );

    /* --- how it works -------------------------------------------------- */
    page.appendChild(
      h('section.section',
        h('div.wrap',
          h('p.eyebrow', 'How it works'),
          h('h2.h2.mb-3', 'Two roles, one workflow'),
          h('div.grid--2.grid',
            h('div.card.card--pad-lg',
              h('p.eyebrow', 'For organizers'),
              h('h3.h3.mb-1', 'Create, publish, approve'),
              h('p', { style: { color: 'var(--ink-2)', margin: 0 } },
                'Pick a venue and the system caps your capacity to the room that holds it. ' +
                'Set a registration deadline and it closes itself. Approve or reject requests ' +
                'in a queue, and the dashboard tracks fill rate, revenue and demand per event.'
              ),
              h('div.row', { style: { marginTop: '1rem' } },
                h('a.btn.btn--sm', { href: '#/register?role=organizer' }, 'Register as organizer')
              )
            ),
            h('div.card.card--pad-lg',
              h('p.eyebrow', 'For participants'),
              h('h3.h3.mb-1', 'Find it, take a seat'),
              h('p', { style: { color: 'var(--ink-2)', margin: 0 } },
                'Search across titles, venues, cities and tags; filter by category or ' +
                'availability. Register in one click and track the status of every request — ' +
                'pending, approved or rejected — from one page.'
              ),
              h('div.row', { style: { marginTop: '1rem' } },
                h('a.btn.btn--sm', { href: '#/register?role=participant' }, 'Register as participant')
              )
            )
          )
        )
      )
    );

    /* --- data loading -------------------------------------------------- */
    (async () => {
      try {
        const [platform, categories, upcoming] = await Promise.all([
          api.dashboard.platform(),
          api.events.categories(),
          api.events.list({ when: 'upcoming', sort: 'date', order: 'asc', limit: 6, status: 'published' }),
        ]);

        const s = platform.data || {};
        ui.mount(statsLine, [
          h('span', h('b', fmt.number(s.upcomingEvents || 0)), ' upcoming events'),
          h('span', h('b', fmt.number(s.totalRegistrations || 0)), ' registrations'),
          h('span', h('b', fmt.number(s.totalVenues || 0)), ' venues'),
          h('span', h('b', fmt.number(s.totalParticipants || 0)), ' participants'),
        ]);

        const cats = (categories.data || []).filter((c) => c.count > 0);
        ui.mount(categoryStrip, cats.length
          ? cats.map((c) => h('a.chip', { href: `#/events?category=${encodeURIComponent(c.name)}` },
              h('span.chip__swatch', { style: { '--cat': c.color } }),
              c.name,
              h('span.chip__count', String(c.count))
            ))
          : h('span.muted', 'No published events yet.'));

        const rows = upcoming.data || [];
        ui.mount(upcomingGrid, rows.length
          ? rows.map((e) => passCard(e, { href: `#/events/${e._id}` }))
          : empty('No upcoming events', 'Once an organizer publishes an event it shows up here.',
              h('a.btn.btn--primary', { href: '#/events' }, 'Browse all events')));

        // Departures board: the next few events, in time order.
        const boardRows = rows.slice(0, 5);
        ui.mount(board, [
          h('div.board__head',
            h('span', 'Next on campus'),
            h('span.board__live', h('span.board__dot'), 'Live')
          ),
          boardRows.length
            ? boardRows.map((e) => h('a.board__row', { href: `#/events/${e._id}` },
                h('div.board__when',
                  h('div.board__time', fmt.time(e.time)),
                  h('div.board__date', fmt.date(e.date))
                ),
                h('div.board__what',
                  h('div.board__title', e.title),
                  h('div.board__where', e.venue ? `${e.venue.name} · ${e.venue.city || ''}` : 'Venue TBA')
                ),
                h('div.board__seats',
                  e.capacity > 0
                    ? [h('b', e.isFull ? 'FULL' : String(e.seatsLeft)), e.isFull ? 'no seats' : 'seats left']
                    : [h('b', '—'), 'open entry']
                )
              ))
            : h('div', { style: { padding: '1.5rem 1rem', color: '#99a2ba', fontSize: '0.875rem' } },
                'Nothing scheduled yet. Sign in as an organizer to publish the first event.'),
          h('div.board__foot', h('a', { href: '#/events' }, 'Full schedule →')),
        ]);
      } catch (err) {
        ui.mount(board, h('div', { style: { padding: '1.25rem' } },
          h('div.notice.notice--stop', h('div', h('div.notice__title', 'Could not load events'), err.message))
        ));
        ui.mount(upcomingGrid, empty('Could not load events', err.message));
      }
    })();

    return page;
  };

  /* ====================================================================== */
  /* Browse events                                                           */
  /* ====================================================================== */

  const SORTS = [
    { value: 'date', label: 'Date' },
    { value: 'title', label: 'Title (A–Z)' },
    { value: 'popularity', label: 'Most registered' },
    { value: 'seatsLeft', label: 'Fewest seats left' },
    { value: 'created', label: 'Recently added' },
    { value: 'category', label: 'Category' },
  ];

  const WHENS = [
    { value: 'upcoming', label: 'Upcoming' },
    { value: 'today', label: 'Today' },
    { value: 'week', label: 'Next 7 days' },
    { value: 'month', label: 'Next 31 days' },
    { value: 'past', label: 'Past events' },
    { value: 'all', label: 'Any date' },
  ];

  const AVAILABILITY = [
    { value: '', label: 'Any availability' },
    { value: 'open', label: 'Registration open' },
    { value: 'available', label: 'Seats available' },
    { value: 'full', label: 'Full' },
  ];

  views.browse = async function browse(ctx) {
    // Filter state seeded from the URL so links and reloads are shareable.
    const state = {
      search: ctx.query.search || '',
      category: ctx.query.category || '',
      city: ctx.query.city || '',
      when: ctx.query.when || 'upcoming',
      availability: ctx.query.availability || '',
      sort: ctx.query.sort || 'date',
      order: ctx.query.order || 'asc',
      page: Number(ctx.query.page) || 1,
      limit: 12,
    };

    const resultsHost = h('div.grid', skeleton('pass', 6));
    const countHost = h('span.toolbar__count', 'Loading…');
    const pagerHost = h('div');
    const chipHost = h('div.chips', { style: { marginTop: '0.75rem' } });

    const searchInput = h('input.input', {
      type: 'search',
      placeholder: 'Search title, venue, city, organizer or tag…',
      value: state.search,
      'aria-label': 'Search events',
    });

    const select = (name, options, value) =>
      h('select.select', {
        'aria-label': name,
        onChange: (e) => {
          state[name] = e.target.value;
          state.page = 1;
          load();
        },
      }, options.map((o) => h('option', { value: o.value, selected: String(o.value) === String(value) }, o.label)));

    const categorySelect = h('select.select', { 'aria-label': 'Category' },
      h('option', { value: '' }, 'All categories'));
    const citySelect = h('select.select', { 'aria-label': 'City' },
      h('option', { value: '' }, 'All cities'));

    categorySelect.addEventListener('change', (e) => {
      state.category = e.target.value;
      state.page = 1;
      load();
    });
    citySelect.addEventListener('change', (e) => {
      state.city = e.target.value;
      state.page = 1;
      load();
    });

    const orderBtn = h('button.btn', {
      type: 'button',
      title: 'Toggle sort direction',
      onClick: () => {
        state.order = state.order === 'asc' ? 'desc' : 'asc';
        orderBtn.replaceChildren(document.createTextNode(state.order === 'asc' ? '↑ Asc' : '↓ Desc'));
        load();
      },
    }, state.order === 'asc' ? '↑ Asc' : '↓ Desc');

    const onSearch = ui.debounce(() => {
      state.search = searchInput.value.trim();
      state.page = 1;
      load();
    }, 280);
    searchInput.addEventListener('input', onSearch);

    const resetBtn = h('button.btn.btn--ghost.btn--sm', {
      type: 'button',
      onClick: () => {
        state.search = '';
        state.category = '';
        state.city = '';
        state.when = 'upcoming';
        state.availability = '';
        state.sort = 'date';
        state.order = 'asc';
        state.page = 1;
        searchInput.value = '';
        categorySelect.value = '';
        citySelect.value = '';
        whenSelect.value = 'upcoming';
        availabilitySelect.value = '';
        sortSelect.value = 'date';
        load();
      },
    }, 'Clear filters');

    const whenSelect = select('when', WHENS, state.when);
    const availabilitySelect = select('availability', AVAILABILITY, state.availability);
    const sortSelect = select('sort', SORTS, state.sort);

    const page = h('div',
      h('section.section.section--tight',
        h('div.wrap',
          h('div.section__head',
            h('div',
              h('p.eyebrow', 'Event discovery'),
              h('h1.h1', 'Browse events')
            ),
            session.canOrganize
              ? h('a.btn.btn--primary', { href: '#/manage/events/new' }, '+ New event')
              : null
          ),
          h('div.toolbar',
            h('div.search', searchInput),
            h('div.toolbar__group', categorySelect, citySelect, whenSelect, availabilitySelect),
            h('div.spacer'),
            h('div.toolbar__group',
              h('span.eyebrow', { style: { margin: 0 } }, 'Sort'),
              sortSelect,
              orderBtn
            )
          ),
          chipHost,
          h('div.row.row--between', { style: { marginTop: '1rem' } }, countHost, resetBtn)
        )
      ),
      h('section.section', { style: { paddingTop: 0, borderTop: 'none' } },
        h('div.wrap', resultsHost, pagerHost)
      )
    );

    /* Populate the category and city dropdowns once. */
    (async () => {
      try {
        const [cats, venues] = await Promise.all([api.events.categories(), api.venues.list()]);
        (cats.data || []).forEach((c) => {
          categorySelect.appendChild(h('option', {
            value: c.name, selected: c.name === state.category,
          }, c.count ? `${c.name} (${c.count})` : c.name));
        });
        const cities = [...new Set((venues.data || []).map((v) => v.city).filter(Boolean))].sort();
        cities.forEach((city) => {
          citySelect.appendChild(h('option', { value: city, selected: city === state.city }, city));
        });
      } catch (err) {
        /* dropdowns simply stay minimal */
      }
    })();

    /** Active-filter chips, each one removable. */
    function renderChips() {
      const active = [];
      const chipFor = (label, clear) =>
        h('button.chip.chip--active', { type: 'button', onClick: clear },
          label, h('span', { style: { opacity: 0.7 } }, '✕'));

      if (state.search) active.push(chipFor(`“${state.search}”`, () => {
        state.search = ''; searchInput.value = ''; state.page = 1; load();
      }));
      if (state.category) active.push(chipFor(state.category, () => {
        state.category = ''; categorySelect.value = ''; state.page = 1; load();
      }));
      if (state.city) active.push(chipFor(state.city, () => {
        state.city = ''; citySelect.value = ''; state.page = 1; load();
      }));
      if (state.availability) {
        const label = (AVAILABILITY.find((a) => a.value === state.availability) || {}).label;
        active.push(chipFor(label, () => {
          state.availability = ''; availabilitySelect.value = ''; state.page = 1; load();
        }));
      }
      if (state.when && state.when !== 'upcoming') {
        const label = (WHENS.find((w) => w.value === state.when) || {}).label;
        active.push(chipFor(label, () => {
          state.when = 'upcoming'; whenSelect.value = 'upcoming'; state.page = 1; load();
        }));
      }
      ui.mount(chipHost, active);
      chipHost.style.display = active.length ? 'flex' : 'none';
    }

    async function load() {
      renderChips();
      ui.mount(resultsHost, skeleton('pass', 6));
      resultsHost.className = 'grid';
      ui.mount(pagerHost, null);
      countHost.textContent = 'Loading…';

      // Keep the address bar in step with the filters.
      ctx.setQuery({
        search: state.search || undefined,
        category: state.category || undefined,
        city: state.city || undefined,
        when: state.when !== 'upcoming' ? state.when : undefined,
        availability: state.availability || undefined,
        sort: state.sort !== 'date' ? state.sort : undefined,
        order: state.order !== 'asc' ? state.order : undefined,
        page: state.page > 1 ? state.page : undefined,
      });

      try {
        const res = await api.events.list({
          search: state.search,
          category: state.category,
          city: state.city,
          when: state.when,
          availability: state.availability,
          sort: state.sort,
          order: state.order,
          page: state.page,
          limit: state.limit,
          status: 'published',
        });

        const items = res.data || [];
        const p = res.pagination || {};
        countHost.textContent = p.total
          ? `${fmt.number(p.total)} event${p.total === 1 ? '' : 's'} found`
          : 'No events match these filters';

        if (!items.length) {
          resultsHost.className = '';
          ui.mount(resultsHost, empty(
            'No events match',
            'Try a broader date range, clear the category filter, or search for a different term.',
            h('button.btn.btn--primary', { type: 'button', onClick: () => resetBtn.click() }, 'Clear all filters')
          ));
          return;
        }

        ui.mount(resultsHost, items.map((e) => passCard(e, { href: `#/events/${e._id}` })));
        ui.mount(pagerHost, ui.pager(p, (next) => {
          state.page = next;
          load();
          global.scrollTo({ top: 0, behavior: 'smooth' });
        }));
      } catch (err) {
        resultsHost.className = '';
        ui.mount(resultsHost, empty('Could not load events', err.message));
        countHost.textContent = '';
      }
    }

    load();
    return page;
  };

  /* ====================================================================== */
  /* Event detail                                                            */
  /* ====================================================================== */

  views.eventDetail = async function eventDetail(ctx) {
    const id = ctx.params.id;
    let res;
    try {
      res = await api.events.getOne(id);
    } catch (err) {
      return h('section.section', h('div.wrap.wrap--narrow',
        empty('Event not found', err.message, h('a.btn.btn--primary', { href: '#/events' }, 'Back to all events'))
      ));
    }

    const event = res.data;
    const sidebarHost = h('div.sticky-side');

    function renderSidebar() {
      const parts = [];

      /* --- capacity panel --------------------------------------------- */
      parts.push(h('div.card',
        h('p.eyebrow', 'Availability'),
        h('div.row.row--between', { style: { alignItems: 'baseline', marginBottom: '0.75rem' } },
          h('span', { style: { fontFamily: 'var(--display)', fontSize: '1.75rem', lineHeight: 1 } },
            event.capacity > 0 ? (event.isFull ? 'FULL' : fmt.number(event.seatsLeft)) : '∞'),
          h('span.data.muted', event.capacity > 0 ? 'seats left' : 'open entry')
        ),
        event.capacity > 0 ? ui.gauge(event.seatsTaken, event.capacity) : null,
        h('div.spec', { style: { marginTop: '0.75rem' } },
          h('div.spec__row', h('span.spec__k', 'Fee'), h('span.spec__v', fmt.money(event.fee))),
          h('div.spec__row', h('span.spec__k', 'Closes'),
            h('span.spec__v', event.registrationDeadline ? fmt.dateLong(event.registrationDeadline) : '—')),
          h('div.spec__row', h('span.spec__k', 'Status'), h('span.spec__v', ui.stamp(event.status)))
        )
      ));

      /* --- the action -------------------------------------------------- */
      parts.push(renderAction());

      /* --- organizer --------------------------------------------------- */
      if (event.organizer) {
        parts.push(h('div.card',
          h('p.eyebrow', 'Organized by'),
          h('div.person',
            ui.avatar(event.organizer.name, { lg: true }),
            h('div',
              h('div', { style: { fontWeight: 650 } }, event.organizer.name),
              event.organizer.organization
                ? h('div.data.muted', event.organizer.organization)
                : null
            )
          )
        ));
      }

      ui.mount(sidebarHost, h('div.stack', parts));
    }

    /** The single most important control on the page. */
    function renderAction() {
      const box = h('div.card');

      // Organizer looking at their own event: management shortcuts instead.
      if (event.isOwner) {
        return h('div.card',
          h('p.eyebrow', 'You organize this event'),
          h('div.stack.stack--sm',
            h('a.btn.btn--primary.btn--block', { href: `#/manage/events/${event._id}` }, 'Edit event'),
            h('a.btn.btn--block', { href: `#/manage/registrations?eventId=${event._id}` },
              `Review registrations (${event.registrations.pending} pending)`),
            h('a.btn.btn--block', { href: `#/report/${event._id}` }, 'Open report')
          )
        );
      }

      if (!session.isSignedIn) {
        return h('div.card',
          h('p.eyebrow', 'Registration'),
          h('p', { style: { margin: '0 0 0.75rem', color: 'var(--ink-2)', fontSize: '0.875rem' } },
            'Sign in to reserve a seat for this event.'),
          h('a.btn.btn--primary.btn--block', { href: `#/login?next=${encodeURIComponent(`#/events/${event._id}`)}` },
            'Sign in to register'),
          h('div', { style: { marginTop: '0.5rem', textAlign: 'center' } },
            h('a.data', { href: '#/register' }, 'or create an account'))
        );
      }

      const mine = event.myRegistration;

      // Already holding an active registration.
      if (mine && (mine.status === 'pending' || mine.status === 'approved')) {
        return h('div.card',
          h('p.eyebrow', 'Your registration'),
          h('div', { style: { textAlign: 'center', padding: '0.5rem 0 0.9rem' } },
            ui.stamp(mine.status, { mark: true })),
          h('p.data.muted', { style: { textAlign: 'center', margin: '0 0 0.9rem' } },
            `Submitted ${fmt.ago(mine.regDate)}`),
          mine.status === 'pending'
            ? h('p', { style: { fontSize: '0.8125rem', color: 'var(--ink-3)', margin: '0 0 0.75rem' } },
                'The organizer has not decided yet. You will see the stamp change here once they do.')
            : h('p', { style: { fontSize: '0.8125rem', color: 'var(--ink-3)', margin: '0 0 0.75rem' } },
                'Your seat is confirmed. Bring a student ID to the venue.'),
          h('button.btn.btn--danger.btn--block', {
            type: 'button',
            onClick: async (e) => {
              const ok = await ui.confirmDialog({
                title: 'Withdraw registration?',
                message: `This releases your seat for “${event.title}”. You can register again later if seats remain.`,
                confirmText: 'Withdraw',
                danger: true,
              });
              if (!ok) return;
              e.target.disabled = true;
              try {
                await api.registrations.cancel(mine._id);
                toast.ok('Registration withdrawn');
                ctx.reload();
              } catch (err) {
                toast.error(err.message);
                e.target.disabled = false;
              }
            },
          }, 'Withdraw registration'),
          h('a.btn.btn--ghost.btn--block', { href: '#/my-registrations', style: { marginTop: '0.375rem' } },
            'All my registrations')
        );
      }

      // Registration is closed for a structural reason.
      if (!event.registrationOpen) {
        return h('div.card',
          h('p.eyebrow', 'Registration'),
          h('div.notice.notice--warn',
            h('div',
              h('div.notice__title', 'Closed'),
              event.closedReason || 'Registration is not open for this event.'
            )
          ),
          mine && mine.status === 'rejected'
            ? h('p', { style: { fontSize: '0.8125rem', color: 'var(--ink-3)', marginTop: '0.75rem', marginBottom: 0 } },
                'Your earlier request for this event was rejected.')
            : null,
          h('a.btn.btn--block', { href: '#/events', style: { marginTop: '0.75rem' } }, 'Find another event')
        );
      }

      // Open: show the register form.
      const seatsInput = h('input.input', {
        type: 'number', min: '1', max: String(Math.min(10, event.seatsLeft || 1)), value: '1', id: 'seats',
      });
      const notesInput = h('textarea.textarea', {
        id: 'notes', rows: '3', maxlength: '500',
        placeholder: 'Anything the organizer should know? (optional)',
        style: { minHeight: '4.5rem' },
      });
      const submit = h('button.btn.btn--primary.btn--block.btn--lg', { type: 'submit' }, 'Register for this event');

      const form = h('form.stack.stack--sm', {
        onSubmit: async (e) => {
          e.preventDefault();
          submit.disabled = true;
          submit.textContent = 'Submitting…';
          try {
            await api.registrations.create({
              eventId: event._id,
              seats: Number(seatsInput.value) || 1,
              notes: notesInput.value.trim(),
            });
            toast.ok('Registration submitted — awaiting the organizer’s decision');
            ctx.reload();
          } catch (err) {
            toast.error(err.message);
            applyFieldErrors(form, err.errors);
            submit.disabled = false;
            submit.textContent = 'Register for this event';
          }
        },
      },
        mine && mine.status === 'rejected'
          ? h('div.notice.notice--warn', { style: { marginBottom: '0.25rem' } },
              h('div', 'A previous request was rejected. Submitting again sends a fresh request.'))
          : null,
        mine && mine.status === 'cancelled'
          ? h('div.notice.notice--info', { style: { marginBottom: '0.25rem' } },
              h('div', 'You withdrew earlier. Registering again reopens your request.'))
          : null,
        field({ label: 'Seats', name: 'seats', control: seatsInput,
          hint: event.capacity > 0 ? `${event.seatsLeft} available` : null }),
        field({ label: 'Notes', name: 'notes', control: notesInput }),
        submit,
        h('p', { style: { fontSize: '0.75rem', color: 'var(--ink-3)', margin: '0.25rem 0 0', textAlign: 'center' } },
          event.fee > 0 ? `${fmt.money(event.fee)} per seat, payable at check-in.` : 'This event is free to attend.')
      );

      return h('div.card', h('p.eyebrow', 'Registration'), form);
    }

    renderSidebar();

    const stubDate = fmt.stub(event.date);

    const page = h('div',
      /* --- header ------------------------------------------------------ */
      h('section.detail-hero',
        h('div.wrap',
          h('div.row', { style: { marginBottom: '1rem' } },
            h('a.data.muted', { href: '#/events' }, '← All events')
          ),
          h('div.row', { style: { gap: '1.5rem', alignItems: 'flex-start', flexWrap: 'nowrap' } },
            // Oversized date block, echoing the pass stub.
            h('div', {
              style: {
                flex: 'none', textAlign: 'center', padding: '0.5rem 0.9rem',
                border: '1px solid var(--rule-strong)', borderRadius: 'var(--radius)',
                background: 'var(--card)',
              },
            },
              h('div', { style: { fontFamily: 'var(--mono)', fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.14em', color: 'var(--flag)' } }, stubDate.mon),
              h('div', { style: { fontFamily: 'var(--display)', fontSize: '2.5rem', lineHeight: 0.9, fontVariantNumeric: 'tabular-nums' } }, stubDate.day),
              h('div', { style: { fontFamily: 'var(--mono)', fontSize: '0.625rem', color: 'var(--ink-3)' } },
                String(ui.parseDate(event.date) ? ui.parseDate(event.date).getFullYear() : ''))
            ),
            h('div', { style: { minWidth: 0 } },
              h('div.row.row--tight', { style: { marginBottom: '0.4rem' } },
                h('span.pass__cat', { style: { '--cat': ui.categoryColor(event.category) } }, event.category),
                ui.stamp(event.status),
                event.registrationOpen
                  ? h('span.stamp.stamp--approved', 'Open')
                  : h('span.stamp.stamp--cancelled', 'Closed')
              ),
              h('h1.h1', event.title),
              h('p.data.muted', { style: { marginTop: '0.5rem', marginBottom: 0 } },
                `${fmt.dateLong(event.date)} · ${fmt.timeRange(event.time, event.endTime)} · ${fmt.until(event.date)}`)
            )
          )
        )
      ),

      /* --- body -------------------------------------------------------- */
      h('section.section',
        h('div.wrap',
          h('div.detail-grid',
            h('div.stack.stack--lg',
              h('div',
                h('p.eyebrow', 'About this event'),
                h('div.prose', (event.description || 'No description was provided for this event.')
                  .split(/\n{2,}/).map((para) => h('p', para)))
              ),
              (event.tags && event.tags.length)
                ? h('div', h('p.eyebrow', 'Tags'), h('div.tags', event.tags.map((t) => h('span.tag', t))))
                : null,
              h('div',
                h('p.eyebrow', 'Details'),
                h('div.card',
                  h('div.spec',
                    h('div.spec__row', h('span.spec__k', 'Date'), h('span.spec__v', fmt.dateLong(event.date))),
                    h('div.spec__row', h('span.spec__k', 'Time'), h('span.spec__v', fmt.timeRange(event.time, event.endTime))),
                    h('div.spec__row', h('span.spec__k', 'Venue'),
                      h('span.spec__v', event.venue
                        ? h('div',
                            h('div', { style: { fontWeight: 600 } }, event.venue.name),
                            h('div.data.muted', [event.venue.address, event.venue.city].filter(Boolean).join(', ')),
                            event.venue.capacity ? h('div.data.muted', `Room capacity ${fmt.number(event.venue.capacity)}`) : null
                          )
                        : 'To be announced')),
                    h('div.spec__row', h('span.spec__k', 'Category'), h('span.spec__v', event.category)),
                    h('div.spec__row', h('span.spec__k', 'Fee'), h('span.spec__v', fmt.money(event.fee))),
                    h('div.spec__row', h('span.spec__k', 'Capacity'),
                      h('span.spec__v', event.capacity > 0
                        ? `${fmt.number(event.capacity)} seats · ${event.seatsTaken} taken · ${event.percentFull}% full`
                        : 'Not limited')),
                    h('div.spec__row', h('span.spec__k', 'Deadline'),
                      h('span.spec__v', event.registrationDeadline
                        ? `${fmt.dateLong(event.registrationDeadline)}${event.deadlinePassed ? ' (passed)' : ''}`
                        : '—'))
                  )
                )
              ),
              (event.venue && event.venue.facilities && event.venue.facilities.length)
                ? h('div',
                    h('p.eyebrow', 'Venue facilities'),
                    h('div.tags', event.venue.facilities.map((f) => h('span.tag', f)))
                  )
                : null
            ),
            sidebarHost
          )
        )
      )
    );

    return page;
  };

  /* ====================================================================== */
  /* Sign in                                                                 */
  /* ====================================================================== */

  const DEMO_ACCOUNTS = [
    { role: 'Organizer', email: 'organizer@demo.com', password: 'demo1234' },
    { role: 'Participant', email: 'participant@demo.com', password: 'demo1234' },
    { role: 'Admin', email: 'admin@demo.com', password: 'admin1234' },
  ];

  views.login = async function login(ctx) {
    // Empty means "decide by role once we know who signed in".
    const next = ctx.query.next || '';

    const emailInput = h('input.input', { type: 'email', id: 'email', autocomplete: 'email', placeholder: 'you@college.edu', required: true });
    const passwordInput = h('input.input', { type: 'password', id: 'password', autocomplete: 'current-password', placeholder: '••••••••', required: true });
    const submit = h('button.btn.btn--primary.btn--block.btn--lg', { type: 'submit' }, 'Sign in');
    const errorHost = h('div');

    const form = h('form.stack', {
      novalidate: true,
      onSubmit: async (e) => {
        e.preventDefault();
        ui.mount(errorHost, null);
        applyFieldErrors(form, null);
        submit.disabled = true;
        submit.textContent = 'Signing in…';
        try {
          const res = await api.auth.login({
            email: emailInput.value.trim(),
            password: passwordInput.value,
          });
          session.start(res.data);
          toast.ok(res.message || 'Signed in');
          ctx.navigate(next ? (next.startsWith('#') ? next.slice(1) : next) : homePath());
        } catch (err) {
          ui.mount(errorHost, h('div.notice.notice--stop',
            h('div', h('div.notice__title', 'Could not sign in'), err.message)));
          applyFieldErrors(form, err.errors);
          submit.disabled = false;
          submit.textContent = 'Sign in';
          passwordInput.select();
        }
      },
    },
      errorHost,
      field({ label: 'Email', name: 'email', required: true, control: emailInput }),
      field({ label: 'Password', name: 'password', required: true, control: passwordInput }),
      submit
    );

    /** One click fills the form with a demo account — useful in a viva. */
    const demoStrip = h('div.demo-keys',
      DEMO_ACCOUNTS.map((acct) =>
        h('button.demo-key', {
          type: 'button',
          onClick: () => {
            emailInput.value = acct.email;
            passwordInput.value = acct.password;
            passwordInput.focus();
            toast.info(`Filled the ${acct.role.toLowerCase()} demo account — press Sign in`);
          },
        },
          h('span.role', acct.role),
          h('span', acct.email),
          h('span.muted', acct.password)
        ))
    );

    return h('section.auth',
      h('div.wrap',
        h('div.auth__card',
          h('div.auth__head',
            h('p.eyebrow', 'Welcome back'),
            h('h1.h2', 'Sign in')
          ),
          h('div.auth__body',
            form,
            h('div', { style: { marginTop: '1.25rem' } },
              h('p.eyebrow', 'Demo accounts'),
              demoStrip
            )
          ),
          h('div.auth__foot',
            'New here? ', h('a', { href: '#/register' }, 'Create an account')
          )
        )
      )
    );
  };

  /* ====================================================================== */
  /* Sign up                                                                 */
  /* ====================================================================== */

  views.signup = async function signup(ctx) {
    const presetRole = ctx.query.role === 'organizer' ? 'organizer' : 'participant';

    const nameInput = h('input.input', { type: 'text', id: 'name', autocomplete: 'name', placeholder: 'Priya Nair', required: true });
    const emailInput = h('input.input', { type: 'email', id: 'email', autocomplete: 'email', placeholder: 'you@college.edu', required: true });
    const passwordInput = h('input.input', { type: 'password', id: 'password', autocomplete: 'new-password', placeholder: 'At least 6 characters', required: true });
    const phoneInput = h('input.input', { type: 'tel', id: 'phone', autocomplete: 'tel', placeholder: '+91 98765 43210' });
    const orgInput = h('input.input', { type: 'text', id: 'organization', placeholder: 'Dept. of Computer Science' });

    const roleField = h('fieldset',
      h('legend.field__label', { style: { marginBottom: '0.35rem' } }, 'I am registering as'),
      h('div.role-pick',
        h('input', { type: 'radio', name: 'role', id: 'role-participant', value: 'participant', checked: presetRole === 'participant' }),
        h('label', { for: 'role-participant' },
          h('strong', 'Participant'),
          h('span', 'Discover events and register for them')),
        h('input', { type: 'radio', name: 'role', id: 'role-organizer', value: 'organizer', checked: presetRole === 'organizer' }),
        h('label', { for: 'role-organizer' },
          h('strong', 'Organizer'),
          h('span', 'Create events and approve registrations'))
      )
    );

    const submit = h('button.btn.btn--primary.btn--block.btn--lg', { type: 'submit' }, 'Create account');
    const errorHost = h('div');

    const form = h('form.stack', {
      novalidate: true,
      onSubmit: async (e) => {
        e.preventDefault();
        ui.mount(errorHost, null);
        applyFieldErrors(form, null);
        submit.disabled = true;
        submit.textContent = 'Creating account…';

        const role = form.querySelector('input[name="role"]:checked');
        try {
          const res = await api.auth.register({
            name: nameInput.value.trim(),
            email: emailInput.value.trim(),
            password: passwordInput.value,
            role: role ? role.value : 'participant',
            phone: phoneInput.value.trim(),
            organization: orgInput.value.trim(),
          });
          session.start(res.data);
          toast.ok('Account created — welcome!');
          ctx.navigate(homePath());
        } catch (err) {
          ui.mount(errorHost, h('div.notice.notice--stop',
            h('div', h('div.notice__title', 'Could not create the account'), err.message)));
          applyFieldErrors(form, err.errors);
          submit.disabled = false;
          submit.textContent = 'Create account';
        }
      },
    },
      errorHost,
      roleField,
      field({ label: 'Full name', name: 'name', required: true, control: nameInput }),
      field({ label: 'Email', name: 'email', required: true, control: emailInput }),
      field({ label: 'Password', name: 'password', required: true, control: passwordInput, hint: 'Minimum 6 characters' }),
      field({ label: 'Phone', name: 'phone', control: phoneInput }),
      field({ label: 'Department / organization', name: 'organization', control: orgInput }),
      submit
    );

    return h('section.auth',
      h('div.wrap',
        h('div.auth__card', { style: { maxWidth: '30rem' } },
          h('div.auth__head',
            h('p.eyebrow', 'Get started'),
            h('h1.h2', 'Create an account')
          ),
          h('div.auth__body', form),
          h('div.auth__foot',
            'Already registered? ', h('a', { href: '#/login' }, 'Sign in')
          )
        )
      )
    );
  };

  global.CBEMS = global.CBEMS || {};
  global.CBEMS.views = Object.assign(global.CBEMS.views || {}, views);
})(window);
