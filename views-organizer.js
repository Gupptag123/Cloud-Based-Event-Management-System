/**
 * frontend/js/views-organizer.js
 * ---------------------------------------------------------------------------
 * Organizer-only screens: the analytics dashboard, event management (list +
 * create/edit form), venue management, the approve/reject queue, and the
 * printable per-event report.
 * ---------------------------------------------------------------------------
 */

(function (global) {
  'use strict';

  const { ui, api, session } = global.CBEMS;
  const { h, fmt, toast, empty, skeleton, field, applyFieldErrors } = ui;
  const { statCard } = global.CBEMS.viewHelpers;

  const views = {};

  const CATEGORIES = ['Technical', 'Cultural', 'Sports', 'Workshop', 'Seminar', 'Conference', 'Hackathon', 'Other'];
  const EVENT_STATUSES = ['draft', 'published', 'cancelled', 'completed'];

  /** Today as YYYY-MM-DD in local time, for date input minimums. */
  function todayISO() {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }

  /* ====================================================================== */
  /* Organizer dashboard                                                     */
  /* ====================================================================== */

  views.organizerDashboard = async function organizerDashboard(ctx) {
    const user = session.user || {};

    const statHost = h('div.grid.grid--4', skeleton('stat', 4));
    const statHost2 = h('div.grid.grid--4', { style: { marginTop: '1rem' } }, skeleton('stat', 4));
    const barsHost = h('div', skeleton('stat', 2));
    const trendHost = h('div', skeleton('stat', 1));
    const categoryHost = h('div', skeleton('stat', 1));
    const statusHost = h('div', skeleton('stat', 1));
    const upcomingHost = h('div.timeline', skeleton('row', 3));
    const activityHost = h('div', skeleton('row', 4));

    const page = h('div',
      h('section.section.section--tight',
        h('div.wrap',
          h('p.eyebrow', `${user.organization || 'Organizer'} · ${user.email || ''}`),
          h('div.section__head',
            h('h1.h1', 'Dashboard'),
            h('div.btn-group',
              h('a.btn', { href: '#/manage/venues' }, 'Venues'),
              h('a.btn', { href: '#/manage/registrations' }, 'Approvals'),
              h('a.btn.btn--primary', { href: '#/manage/events/new' }, '+ New event')
            )
          ),
          statHost,
          statHost2
        )
      ),

      h('section.section',
        h('div.wrap',
          h('div.detail-grid',
            h('div.stack.stack--lg',
              h('div.panel',
                h('div.panel__head',
                  h('h2.panel__title', 'Registrations per event'),
                  h('a.data', { href: '#/manage/events' }, 'Manage events →')
                ),
                h('div.panel__body', barsHost)
              ),
              h('div.panel',
                h('div.panel__head', h('h2.panel__title', 'Registration trend · last 14 days')),
                h('div.panel__body', trendHost)
              ),
              h('div.panel',
                h('div.panel__head',
                  h('h2.panel__title', 'Latest activity'),
                  h('a.data', { href: '#/manage/registrations' }, 'Full queue →')
                ),
                h('div', activityHost)
              )
            ),
            h('div.stack',
              h('div.panel',
                h('div.panel__head', h('h2.panel__title', 'Next up')),
                h('div.panel__body', upcomingHost)
              ),
              h('div.panel',
                h('div.panel__head', h('h2.panel__title', 'Events by category')),
                h('div.panel__body', categoryHost)
              ),
              h('div.panel',
                h('div.panel__head', h('h2.panel__title', 'Registration status')),
                h('div.panel__body', statusHost)
              )
            )
          )
        )
      )
    );

    (async () => {
      try {
        const res = await api.dashboard.organizer();
        const d = res.data || {};
        const s = d.stats || {};
        const charts = d.charts || {};

        ui.mount(statHost, [
          statCard('Events', s.totalEvents, `${s.publishedEvents || 0} published · ${s.draftEvents || 0} draft`, 'var(--ink)'),
          statCard('Registrations', s.totalRegistrations, `${s.approvedRegistrations || 0} approved`, 'var(--signal)'),
          statCard('Pending', s.pendingRegistrations, 'need your decision', 'var(--wait)'),
          statCard('Upcoming', s.upcomingEvents, 'still to run', 'var(--flag)'),
        ]);

        ui.mount(statHost2, [
          statCard('Fill rate', `${s.fillRate || 0}%`, `${fmt.number(s.seatsFilled)} of ${fmt.number(s.totalSeats)} seats`, 'var(--ok)'),
          statCard('Approval rate', `${s.approvalRate || 0}%`, 'of all requests', 'var(--signal)'),
          statCard('Revenue', fmt.money(s.revenue), 'from approved seats', 'var(--ink-2)'),
          statCard('Venues', d.venueCount, 'available to book', 'var(--ink-3)'),
        ]);

        // The number stat cards render text, so re-render the two that need
        // string values rather than counts.
        ui.mount(barsHost, (charts.registrationsPerEvent || []).length
          ? ui.chart.bars(charts.registrationsPerEvent, { label: 'Registrations per event' })
          : empty('No registrations yet', 'Publish an event and approvals will chart here.'));

        ui.mount(trendHost, (charts.trend || []).length
          ? ui.chart.line(charts.trend, { label: 'Registrations over the last 14 days' })
          : empty('No trend yet', 'Two weeks of activity fills this chart.'));

        ui.mount(categoryHost, ui.chart.donut(charts.byCategory || [], { centerLabel: 'Events' }));
        ui.mount(statusHost, ui.chart.donut(charts.byStatus || [], { centerLabel: 'Requests' }));

        const up = d.upcoming || [];
        ui.mount(upcomingHost, up.length
          ? up.map((e) => {
              const stub = fmt.stub(e.date);
              return h('a.timeline__item', { href: `#/events/${e._id}`, style: { color: 'inherit', textDecoration: 'none' } },
                h('div.timeline__when', h('span.m', stub.mon), h('span.d', stub.day)),
                h('div.timeline__what',
                  h('div.timeline__title', e.title),
                  h('div.timeline__sub',
                    `${fmt.time(e.time)} · ${e.capacity > 0 ? `${e.seatsTaken}/${e.capacity} seats` : 'open entry'}`),
                  e.capacity > 0 ? ui.gauge(e.seatsTaken, e.capacity) : null
                )
              );
            })
          : empty('Nothing scheduled', 'Create an event to fill your calendar.',
              h('a.btn.btn--primary.btn--sm', { href: '#/manage/events/new' }, 'New event')));

        const recent = d.recentRegistrations || [];
        ui.mount(activityHost, recent.length
          ? h('div.table-scroll', h('table.table',
              h('thead', h('tr', h('th', 'Participant'), h('th', 'Event'), h('th', 'Status'), h('th', 'When'))),
              h('tbody', recent.map((r) => h('tr',
                h('td', h('div.person', ui.avatar(r.participant ? r.participant.name : '?'),
                  h('div',
                    h('div.table__primary', r.participant ? r.participant.name : 'Unknown'),
                    h('div.table__sub', r.participant ? r.participant.email : '')
                  ))),
                h('td', r.event ? h('a', { href: `#/events/${r.event._id}` }, r.event.title) : '—'),
                h('td', ui.stamp(r.status)),
                h('td.nowrap.data.muted', fmt.ago(r.regDate))
              )))
            ))
          : h('div', { style: { padding: '1rem' } }, empty('No activity yet', 'Registrations appear here as they arrive.')));
      } catch (err) {
        ui.mount(statHost, empty('Could not load the dashboard', err.message));
      }
    })();

    return page;
  };

  /* ====================================================================== */
  /* Manage events                                                           */
  /* ====================================================================== */

  views.manageEvents = async function manageEvents(ctx) {
    const state = { status: ctx.query.status || '', search: ctx.query.search || '', sort: 'date', order: 'asc' };
    const listHost = h('div', skeleton('row', 5));
    const countHost = h('span.toolbar__count', 'Loading…');

    const searchInput = h('input.input', {
      type: 'search', placeholder: 'Search your events…', value: state.search, 'aria-label': 'Search your events',
    });
    searchInput.addEventListener('input', ui.debounce(() => {
      state.search = searchInput.value.trim();
      load();
    }, 280));

    const statusSelect = h('select.select', {
      'aria-label': 'Filter by status',
      onChange: (e) => { state.status = e.target.value; load(); },
    },
      h('option', { value: '', selected: !state.status }, 'All statuses'),
      EVENT_STATUSES.map((s) => h('option', { value: s, selected: state.status === s }, fmt.titleCase(s))));

    const page = h('div',
      h('section.section.section--tight',
        h('div.wrap',
          h('p.eyebrow', 'Event management'),
          h('div.section__head',
            h('h1.h1', 'My events'),
            h('a.btn.btn--primary', { href: '#/manage/events/new' }, '+ New event')
          ),
          h('div.toolbar',
            h('div.search', searchInput),
            statusSelect,
            h('div.spacer'),
            countHost
          )
        )
      ),
      h('section.section', { style: { paddingTop: '1.25rem' } }, h('div.wrap', listHost))
    );

    async function load() {
      ui.mount(listHost, skeleton('row', 5));
      countHost.textContent = 'Loading…';
      ctx.setQuery({ status: state.status || undefined, search: state.search || undefined });

      try {
        const res = await api.events.list({
          mine: 'true', status: state.status, search: state.search,
          when: 'all', sort: state.sort, order: state.order, limit: 100,
        });
        const rows = res.data || [];
        countHost.textContent = `${rows.length} event${rows.length === 1 ? '' : 's'}`;

        if (!rows.length) {
          ui.mount(listHost, empty(
            state.search || state.status ? 'No events match' : 'You have not created any events',
            state.search || state.status
              ? 'Try clearing the filters.'
              : 'Create your first event — pick a venue, set a capacity and a registration deadline, and publish.',
            h('a.btn.btn--primary', { href: '#/manage/events/new' }, 'Create an event')));
          return;
        }

        ui.mount(listHost, h('div.panel', h('div.table-scroll', h('table.table',
          h('thead', h('tr',
            h('th', 'Event'), h('th', 'Date'), h('th', 'Venue'),
            h('th', 'Seats'), h('th', 'Pending'), h('th', 'Status'), h('th', { class: 'actions' }, 'Actions')
          )),
          h('tbody', rows.map((e) => eventRow(e)))
        ))));
      } catch (err) {
        ui.mount(listHost, empty('Could not load your events', err.message));
        countHost.textContent = '';
      }
    }

    function eventRow(e) {
      return h('tr',
        h('td',
          h('a.table__primary', { href: `#/events/${e._id}` }, e.title),
          h('div.table__sub', `${e.category} · ${fmt.money(e.fee)}`)
        ),
        h('td.nowrap',
          h('div', fmt.date(e.date)),
          h('div.table__sub', fmt.time(e.time))
        ),
        h('td', e.venue ? h('div', e.venue.name, h('div.table__sub', e.venue.city || '')) : h('span.muted', '—')),
        h('td', { style: { minWidth: '9rem' } },
          e.capacity > 0
            ? ui.gauge(e.seatsTaken, e.capacity)
            : h('span.data.muted', `${e.registrations.activeRows} registered`)),
        h('td.num',
          e.registrations.pending > 0
            ? h('a.stamp.stamp--pending', { href: `#/manage/registrations?eventId=${e._id}&status=pending` },
                String(e.registrations.pending))
            : h('span.muted', '0')),
        h('td', ui.stamp(e.status)),
        h('td', { class: 'actions' },
          h('div.btn-group',
            h('a.btn.btn--sm', { href: `#/manage/events/${e._id}` }, 'Edit'),
            h('button.btn.btn--sm', {
              type: 'button',
              onClick: (ev) => openStatusMenu(ev.currentTarget, e),
            }, 'Status ▾'),
            h('a.btn.btn--sm', { href: `#/report/${e._id}` }, 'Report'),
            h('button.btn.btn--sm.btn--danger', {
              type: 'button',
              onClick: () => removeEvent(e),
            }, 'Delete')
          )
        )
      );
    }

    async function openStatusMenu(anchor, event) {
      const ref = ui.modal({
        size: 'sm',
        title: 'Change status',
        body: h('div.stack.stack--sm',
          h('p', { style: { margin: 0, color: 'var(--ink-2)', fontSize: '0.875rem' } },
            `“${event.title}” is currently `, ui.stamp(event.status), '.'),
          h('div.stack.stack--sm', { style: { marginTop: '0.5rem' } },
            EVENT_STATUSES.map((s) => h('button.btn.btn--block', {
              type: 'button',
              disabled: s === event.status,
              onClick: async () => {
                ref.close();
                try {
                  await api.events.setStatus(event._id, s);
                  toast.ok(`Marked as ${s}`);
                  load();
                } catch (err) { toast.error(err.message); }
              },
            }, statusDescription(s))))
        ),
      });
    }

    function statusDescription(s) {
      return {
        draft: 'Draft — hidden from participants',
        published: 'Published — open to registration',
        cancelled: 'Cancelled — visible but closed',
        completed: 'Completed — event has taken place',
      }[s] || s;
    }

    async function removeEvent(e) {
      const hasRegistrations = e.registrations.activeRows > 0;
      const ok = await ui.confirmDialog({
        title: 'Delete this event?',
        message: hasRegistrations
          ? `“${e.title}” has ${e.registrations.activeRows} active registration(s) holding ${e.seatsTaken} seat(s). Deleting removes the event and every registration attached to it. Consider cancelling instead.`
          : `“${e.title}” will be permanently removed.`,
        confirmText: hasRegistrations ? 'Delete anyway' : 'Delete',
        danger: true,
      });
      if (!ok) return;
      try {
        await api.events.remove(e._id, hasRegistrations);
        toast.ok('Event deleted');
        load();
      } catch (err) { toast.error(err.message); }
    }

    load();
    return page;
  };

  /* ====================================================================== */
  /* Event form (create + edit)                                              */
  /* ====================================================================== */

  views.eventForm = async function eventForm(ctx) {
    const id = ctx.params.id;
    const isEdit = Boolean(id) && id !== 'new';

    let event = null;
    let venues = [];

    try {
      const [venueRes, eventRes] = await Promise.all([
        api.venues.list(),
        isEdit ? api.events.getOne(id) : Promise.resolve(null),
      ]);
      venues = venueRes.data || [];
      if (eventRes) event = eventRes.data;
    } catch (err) {
      return h('section.section', h('div.wrap.wrap--narrow',
        empty('Could not open this event', err.message,
          h('a.btn.btn--primary', { href: '#/manage/events' }, 'Back to my events'))));
    }

    if (isEdit && event && !event.isOwner) {
      return h('section.section', h('div.wrap.wrap--narrow',
        empty('Not your event', 'You can only edit events you organize.',
          h('a.btn.btn--primary', { href: '#/manage/events' }, 'Back to my events'))));
    }

    const v = (key, fallback) => (event && event[key] !== undefined && event[key] !== null ? event[key] : fallback);

    const titleInput = h('input.input', { id: 'title', value: v('title', ''), maxlength: '120', required: true, placeholder: 'Annual Technology Summit' });
    const descInput = h('textarea.textarea', { id: 'description', maxlength: '2000', rows: '6', placeholder: 'What happens, who it is for, what to bring…' }, v('description', ''));
    const categorySelect = h('select.select', { id: 'category', required: true },
      CATEGORIES.map((c) => h('option', { value: c, selected: v('category', 'Technical') === c }, c)));
    const dateInput = h('input.input', { id: 'date', type: 'date', value: v('date', ''), required: true });
    const timeInput = h('input.input', { id: 'time', type: 'time', value: v('time', '09:00'), required: true });
    const endTimeInput = h('input.input', { id: 'endTime', type: 'time', value: v('endTime', '') });
    const deadlineInput = h('input.input', { id: 'registrationDeadline', type: 'date', value: v('registrationDeadline', '') });
    const capacityInput = h('input.input', { id: 'capacity', type: 'number', min: '0', value: String(v('capacity', 50)) });
    const feeInput = h('input.input', { id: 'fee', type: 'number', min: '0', value: String(v('fee', 0)) });
    const tagsInput = h('input.input', { id: 'tags', value: (v('tags', []) || []).join(', '), placeholder: 'cloud, teams, prizes' });
    const statusSelect = h('select.select', { id: 'status' },
      EVENT_STATUSES.map((s) => h('option', { value: s, selected: v('status', 'published') === s }, fmt.titleCase(s))));

    const venueSelect = h('select.select', { id: 'venueId' },
      h('option', { value: '' }, 'No venue selected'),
      venues.map((venue) => h('option', {
        value: venue._id,
        selected: v('venueId', '') === venue._id,
      }, `${venue.name} — ${venue.city} (holds ${fmt.number(venue.capacity)})`)));

    const capacityHint = h('span.field__hint');

    /** Capacity can never exceed the chosen room. Say so before the server does. */
    function syncCapacityHint() {
      const venue = venues.find((x) => x._id === venueSelect.value);
      if (!venue) {
        capacityHint.textContent = 'Set 0 for unlimited seating.';
        capacityInput.removeAttribute('max');
        return;
      }
      capacityInput.setAttribute('max', String(venue.capacity));
      const over = Number(capacityInput.value) > venue.capacity;
      capacityHint.textContent = over
        ? `${venue.name} holds ${fmt.number(venue.capacity)} — capacity will be rejected above that.`
        : `${venue.name} holds up to ${fmt.number(venue.capacity)}.`;
      capacityHint.style.color = over ? 'var(--no)' : 'var(--ink-3)';
    }
    venueSelect.addEventListener('change', syncCapacityHint);
    capacityInput.addEventListener('input', syncCapacityHint);
    syncCapacityHint();

    // The deadline defaults to the event date and can never be later.
    dateInput.addEventListener('change', () => {
      deadlineInput.setAttribute('max', dateInput.value || '');
      if (!deadlineInput.value) deadlineInput.value = dateInput.value;
    });
    if (dateInput.value) deadlineInput.setAttribute('max', dateInput.value);
    if (!isEdit) dateInput.setAttribute('min', todayISO());

    const submit = h('button.btn.btn--primary.btn--lg', { type: 'submit' }, isEdit ? 'Save changes' : 'Create event');
    const errorHost = h('div');

    const form = h('form', {
      novalidate: true,
      onSubmit: async (e) => {
        e.preventDefault();
        ui.mount(errorHost, null);
        applyFieldErrors(form, null);
        submit.disabled = true;
        submit.textContent = 'Saving…';

        const payload = {
          title: titleInput.value.trim(),
          description: descInput.value.trim(),
          category: categorySelect.value,
          date: dateInput.value,
          time: timeInput.value,
          endTime: endTimeInput.value,
          registrationDeadline: deadlineInput.value || dateInput.value,
          venueId: venueSelect.value || '',
          capacity: Number(capacityInput.value) || 0,
          fee: Number(feeInput.value) || 0,
          status: statusSelect.value,
          tags: tagsInput.value,
        };

        try {
          const res = isEdit
            ? await api.events.update(id, payload)
            : await api.events.create(payload);
          toast.ok(res.message || 'Saved');
          ctx.navigate(`/events/${res.data._id}`);
        } catch (err) {
          ui.mount(errorHost, h('div.notice.notice--stop',
            h('div', h('div.notice__title', 'Could not save the event'), err.message)));
          applyFieldErrors(form, err.errors);
          submit.disabled = false;
          submit.textContent = isEdit ? 'Save changes' : 'Create event';
          errorHost.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      },
    },
      h('div.stack',
        errorHost,

        h('div.card.card--pad-lg',
          h('p.eyebrow', 'The basics'),
          h('div.stack',
            field({ label: 'Event title', name: 'title', required: true, control: titleInput }),
            field({ label: 'Description', name: 'description', control: descInput,
              hint: 'Leave a blank line between paragraphs.' }),
            h('div.form-grid',
              field({ label: 'Category', name: 'category', required: true, control: categorySelect }),
              field({ label: 'Tags', name: 'tags', control: tagsInput, hint: 'Comma separated, up to 10.' })
            )
          )
        ),

        h('div.card.card--pad-lg',
          h('p.eyebrow', 'When'),
          h('div.form-grid',
            field({ label: 'Event date', name: 'date', required: true, control: dateInput }),
            field({ label: 'Start time', name: 'time', required: true, control: timeInput }),
            field({ label: 'End time', name: 'endTime', control: endTimeInput, hint: 'Must be after the start time.' }),
            field({ label: 'Registration deadline', name: 'registrationDeadline', control: deadlineInput,
              hint: 'On or before the event date. Registration closes automatically.' })
          )
        ),

        h('div.card.card--pad-lg',
          h('p.eyebrow', 'Where and how many'),
          h('div.stack',
            field({ label: 'Venue', name: 'venueId', control: venueSelect,
              hint: h('span', 'Missing a venue? ', h('a', { href: '#/manage/venues' }, 'Add one first')) }),
            h('div.form-grid',
              h('div.field', { dataset: { field: 'capacity' } },
                h('label.field__label', { for: 'capacity' }, 'Capacity'),
                capacityInput,
                capacityHint),
              field({ label: 'Fee (₹)', name: 'fee', control: feeInput, hint: '0 makes the event free.' })
            )
          )
        ),

        h('div.card.card--pad-lg',
          h('p.eyebrow', 'Visibility'),
          field({ label: 'Status', name: 'status', control: statusSelect,
            hint: 'Draft events are hidden from participants until you publish them.' })
        ),

        h('div.row',
          submit,
          h('a.btn', { href: isEdit ? `#/events/${id}` : '#/manage/events' }, 'Cancel'),
          isEdit && event
            ? h('span.data.muted', { style: { marginLeft: 'auto' } },
                `${event.registrations.activeRows} registration(s) · ${event.seatsTaken} seat(s) held · created ${fmt.ago(event.createdAt)}`)
            : null
        )
      )
    );

    return h('div',
      h('section.section.section--tight',
        h('div.wrap.wrap--mid',
          h('div.row', { style: { marginBottom: '0.75rem' } },
            h('a.data.muted', { href: '#/manage/events' }, '← My events')),
          h('p.eyebrow', isEdit ? 'Edit event' : 'New event'),
          h('h1.h1', isEdit && event ? event.title : 'Create an event')
        )
      ),
      h('section.section', { style: { paddingTop: '1.25rem' } },
        h('div.wrap.wrap--mid', form))
    );
  };

  /* ====================================================================== */
  /* Manage venues                                                           */
  /* ====================================================================== */

  views.manageVenues = async function manageVenues(ctx) {
    const listHost = h('div.grid', skeleton('pass', 4));
    const searchInput = h('input.input', { type: 'search', placeholder: 'Search venues…', 'aria-label': 'Search venues' });
    searchInput.addEventListener('input', ui.debounce(() => load(), 280));

    const page = h('div',
      h('section.section.section--tight',
        h('div.wrap',
          h('p.eyebrow', 'Venue management'),
          h('div.section__head',
            h('h1.h1', 'Venues'),
            h('button.btn.btn--primary', { type: 'button', onClick: () => openForm(null) }, '+ Add venue')
          ),
          h('div.toolbar', h('div.search', searchInput))
        )
      ),
      h('section.section', { style: { paddingTop: '1.25rem' } }, h('div.wrap', listHost))
    );

    async function load() {
      ui.mount(listHost, skeleton('pass', 4));
      try {
        const res = await api.venues.list({ search: searchInput.value.trim() });
        const rows = res.data || [];
        if (!rows.length) {
          listHost.className = '';
          ui.mount(listHost, empty('No venues yet',
            'A venue caps how many people an event can hold, so add the rooms you use.',
            h('button.btn.btn--primary', { type: 'button', onClick: () => openForm(null) }, 'Add your first venue')));
          return;
        }
        listHost.className = 'grid';
        ui.mount(listHost, rows.map(venueCard));
      } catch (err) {
        listHost.className = '';
        ui.mount(listHost, empty('Could not load venues', err.message));
      }
    }

    function venueCard(venue) {
      return h('div.card',
        h('div.row.row--between', { style: { alignItems: 'flex-start' } },
          h('div', { style: { minWidth: 0 } },
            h('h3.h3', venue.name),
            h('p.data.muted', { style: { margin: '0.15rem 0 0' } },
              [venue.address, venue.city].filter(Boolean).join(', '))
          ),
          h('div', { style: { textAlign: 'right', flex: 'none' } },
            h('div', { style: { fontFamily: 'var(--display)', fontSize: '1.5rem', lineHeight: 1 } },
              fmt.number(venue.capacity)),
            h('div.data.muted', 'capacity')
          )
        ),
        (venue.facilities && venue.facilities.length)
          ? h('div.tags', { style: { marginTop: '0.75rem' } }, venue.facilities.map((f) => h('span.tag', f)))
          : null,
        h('div.row.row--between', { style: { marginTop: '1rem' } },
          h('span.data.muted', venue.eventCount
            ? `Used by ${venue.eventCount} active event${venue.eventCount === 1 ? '' : 's'}`
            : 'Not in use'),
          h('div.btn-group',
            h('button.btn.btn--sm', { type: 'button', onClick: () => openForm(venue) }, 'Edit'),
            h('button.btn.btn--sm.btn--danger', {
              type: 'button',
              onClick: async () => {
                const ok = await ui.confirmDialog({
                  title: 'Delete venue?',
                  message: `“${venue.name}” will be removed. Venues used by active events cannot be deleted.`,
                  confirmText: 'Delete', danger: true,
                });
                if (!ok) return;
                try {
                  await api.venues.remove(venue._id);
                  toast.ok('Venue deleted');
                  load();
                } catch (err) { toast.error(err.message); }
              },
            }, 'Delete'))
        )
      );
    }

    function openForm(venue) {
      const isEdit = Boolean(venue);
      const nameInput = h('input.input', { id: 'name', value: isEdit ? venue.name : '', required: true, placeholder: 'Main Auditorium' });
      const addressInput = h('input.input', { id: 'address', value: isEdit ? venue.address || '' : '', placeholder: 'Academic Block A, Ground Floor' });
      const cityInput = h('input.input', { id: 'city', value: isEdit ? venue.city || '' : '', required: true, placeholder: 'Bengaluru' });
      const capacityInput = h('input.input', { id: 'capacity', type: 'number', min: '1', value: isEdit ? String(venue.capacity) : '100', required: true });
      const facilitiesInput = h('input.input', { id: 'facilities', value: isEdit ? (venue.facilities || []).join(', ') : '', placeholder: 'Projector, Air Conditioning, Wi-Fi' });

      const submit = h('button.btn.btn--primary', { type: 'submit' }, isEdit ? 'Save venue' : 'Add venue');
      const errorHost = h('div');

      const form = h('form.stack', {
        novalidate: true,
        onSubmit: async (e) => {
          e.preventDefault();
          ui.mount(errorHost, null);
          applyFieldErrors(form, null);
          submit.disabled = true;
          const payload = {
            name: nameInput.value.trim(),
            address: addressInput.value.trim(),
            city: cityInput.value.trim(),
            capacity: Number(capacityInput.value) || 0,
            facilities: facilitiesInput.value,
          };
          try {
            if (isEdit) await api.venues.update(venue._id, payload);
            else await api.venues.create(payload);
            toast.ok(isEdit ? 'Venue updated' : 'Venue added');
            ref.close();
            load();
          } catch (err) {
            ui.mount(errorHost, h('div.notice.notice--stop', h('div', err.message)));
            applyFieldErrors(form, err.errors);
            submit.disabled = false;
          }
        },
      },
        errorHost,
        field({ label: 'Venue name', name: 'name', required: true, control: nameInput }),
        field({ label: 'Address', name: 'address', control: addressInput }),
        h('div.form-grid',
          field({ label: 'City', name: 'city', required: true, control: cityInput }),
          field({ label: 'Capacity', name: 'capacity', required: true, control: capacityInput,
            hint: 'Events here cannot exceed this.' })
        ),
        field({ label: 'Facilities', name: 'facilities', control: facilitiesInput, hint: 'Comma separated.' })
      );

      const ref = ui.modal({
        title: isEdit ? 'Edit venue' : 'Add a venue',
        body: form,
        foot: [
          h('button.btn', { type: 'button', onClick: () => ref.close() }, 'Cancel'),
          submit,
        ],
      });
      // The footer button lives outside <form>, so wire it up manually.
      submit.addEventListener('click', (e) => {
        e.preventDefault();
        form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { cancelable: true }));
      });
    }

    load();
    return page;
  };

  /* ====================================================================== */
  /* Approval queue                                                          */
  /* ====================================================================== */

  views.manageRegistrations = async function manageRegistrations(ctx) {
    const state = {
      status: ctx.query.status || 'pending',
      eventId: ctx.query.eventId || '',
      search: ctx.query.search || '',
    };
    const selected = new Set();

    const summaryHost = h('div.grid.grid--4', skeleton('stat', 4));
    const listHost = h('div', skeleton('row', 5));
    const bulkBar = h('div.toolbar', { hidden: true });
    const filterHost = h('div.chips');

    const searchInput = h('input.input', {
      type: 'search', placeholder: 'Search participant name, email or event…',
      value: state.search, 'aria-label': 'Search registrations',
    });
    searchInput.addEventListener('input', ui.debounce(() => {
      state.search = searchInput.value.trim();
      load();
    }, 280));

    const eventSelect = h('select.select', { 'aria-label': 'Filter by event' },
      h('option', { value: '' }, 'All my events'));
    eventSelect.addEventListener('change', (e) => { state.eventId = e.target.value; load(); });

    const STATUS_FILTERS = [
      { value: 'pending', label: 'Pending' },
      { value: 'approved', label: 'Approved' },
      { value: 'rejected', label: 'Rejected' },
      { value: 'cancelled', label: 'Cancelled' },
      { value: '', label: 'All' },
    ];

    function renderFilters() {
      ui.mount(filterHost, STATUS_FILTERS.map((f) => h('button.chip', {
        type: 'button',
        'aria-pressed': state.status === f.value ? 'true' : 'false',
        onClick: () => { state.status = f.value; selected.clear(); load(); },
      }, f.label)));
    }

    const page = h('div',
      h('section.section.section--tight',
        h('div.wrap',
          h('p.eyebrow', 'Approve or reject'),
          h('div.section__head',
            h('h1.h1', 'Registrations'),
            h('a.btn', { href: '#/dashboard' }, 'Back to dashboard')
          ),
          summaryHost
        )
      ),
      h('section.section', { style: { paddingTop: '1.25rem' } },
        h('div.wrap',
          h('div.toolbar', { style: { marginBottom: '0.75rem' } },
            h('div.search', searchInput),
            eventSelect
          ),
          h('div.row.row--between', { style: { marginBottom: '1rem' } }, filterHost),
          bulkBar,
          listHost
        )
      )
    );

    renderFilters();

    /* Populate the event dropdown once. */
    (async () => {
      try {
        const res = await api.events.list({ mine: 'true', when: 'all', limit: 100, sort: 'date' });
        (res.data || []).forEach((e) => {
          eventSelect.appendChild(h('option', {
            value: e._id, selected: e._id === state.eventId,
          }, `${e.title} (${e.registrations.pending} pending)`));
        });
      } catch (err) { /* keep the single option */ }
    })();

    function renderBulkBar() {
      if (!selected.size) {
        bulkBar.hidden = true;
        return;
      }
      bulkBar.hidden = false;
      ui.mount(bulkBar, [
        h('span.toolbar__count', `${selected.size} selected`),
        h('div.spacer'),
        h('div.btn-group',
          h('button.btn.btn--ok.btn--sm', { type: 'button', onClick: () => bulk('approved') }, 'Approve selected'),
          h('button.btn.btn--danger.btn--sm', { type: 'button', onClick: () => bulk('rejected') }, 'Reject selected'),
          h('button.btn.btn--ghost.btn--sm', {
            type: 'button',
            onClick: () => { selected.clear(); load(); },
          }, 'Clear selection'))
      ]);
    }

    async function bulk(status) {
      const ids = [...selected];
      const ok = await ui.confirmDialog({
        title: status === 'approved' ? 'Approve selected?' : 'Reject selected?',
        message: `${ids.length} registration(s) will be marked as ${status}. Approvals that would exceed an event's capacity are skipped.`,
        confirmText: status === 'approved' ? 'Approve all' : 'Reject all',
        danger: status === 'rejected',
      });
      if (!ok) return;
      try {
        const res = await api.registrations.bulkDecide(ids, status);
        toast.ok(res.message || 'Done');
        const failed = res.data && res.data.failed;
        if (failed && failed.length) {
          toast.error(`${failed.length} could not be updated: ${failed[0].message}`, 7000);
        }
        selected.clear();
        load();
      } catch (err) { toast.error(err.message); }
    }

    async function decide(row, status) {
      try {
        await api.registrations.decide(row._id, status);
        toast.ok(`${row.participant ? row.participant.name : 'Registration'} ${status}`);
        load();
      } catch (err) { toast.error(err.message, 6000); }
    }

    async function load() {
      renderFilters();
      renderBulkBar();
      ui.mount(listHost, skeleton('row', 5));
      ctx.setQuery({
        status: state.status || undefined,
        eventId: state.eventId || undefined,
        search: state.search || undefined,
      });

      try {
        const res = await api.registrations.forOrganizer({
          status: state.status, eventId: state.eventId, search: state.search,
        });
        const rows = res.data || [];
        const summary = (res.meta && res.meta.summary) || {};

        ui.mount(summaryHost, [
          statCard('Pending', summary.pending, 'awaiting decision', 'var(--wait)'),
          statCard('Approved', summary.approved, 'confirmed seats', 'var(--ok)'),
          statCard('Rejected', summary.rejected, 'declined', 'var(--no)'),
          statCard('Withdrawn', summary.cancelled, 'by participants', 'var(--off)'),
        ]);

        if (!rows.length) {
          ui.mount(listHost, empty(
            state.status === 'pending' ? 'Nothing waiting on you' : 'No registrations here',
            state.status === 'pending'
              ? 'Every request has been decided. New ones will appear here.'
              : 'Try a different status filter or event.'));
          return;
        }

        const allSelected = rows.every((r) => selected.has(r._id));
        const selectAll = h('input', {
          type: 'checkbox', checked: allSelected, 'aria-label': 'Select all',
          onChange: (e) => {
            if (e.target.checked) rows.forEach((r) => selected.add(r._id));
            else rows.forEach((r) => selected.delete(r._id));
            load();
          },
        });

        ui.mount(listHost, h('div.panel', h('div.table-scroll', h('table.table',
          h('thead', h('tr',
            h('th', { style: { width: '2.5rem' } }, selectAll),
            h('th', 'Participant'), h('th', 'Event'), h('th', 'Seats'),
            h('th', 'Status'), h('th', 'Submitted'), h('th', { class: 'actions' }, 'Decision')
          )),
          h('tbody', rows.map(registrationRow))
        ))));
        renderBulkBar();
      } catch (err) {
        ui.mount(listHost, empty('Could not load registrations', err.message));
      }
    }

    function registrationRow(r) {
      const p = r.participant || {};
      const ev = r.event || {};
      return h('tr',
        h('td', h('input', {
          type: 'checkbox',
          checked: selected.has(r._id),
          'aria-label': `Select ${p.name || 'registration'}`,
          onChange: (e) => {
            if (e.target.checked) selected.add(r._id); else selected.delete(r._id);
            renderBulkBar();
          },
        })),
        h('td', h('div.person', ui.avatar(p.name),
          h('div', { style: { minWidth: 0 } },
            h('div.table__primary', p.name || 'Unknown'),
            h('div.table__sub', p.email || ''),
            r.notes ? h('div.table__sub', { style: { color: 'var(--signal-dark)' } }, `“${r.notes}”`) : null
          ))),
        h('td', ev._id
          ? h('div',
              h('a', { href: `#/events/${ev._id}` }, ev.title),
              h('div.table__sub', `${fmt.date(ev.date)} · ${fmt.time(ev.time)}`))
          : h('span.muted', 'Deleted event')),
        h('td.num', String(r.seats || 1)),
        h('td', ui.stamp(r.status)),
        h('td.nowrap.data.muted', fmt.ago(r.regDate)),
        h('td', { class: 'actions' },
          h('div.btn-group',
            r.status !== 'approved'
              ? h('button.btn.btn--sm.btn--ok', { type: 'button', onClick: () => decide(r, 'approved') }, 'Approve')
              : null,
            r.status !== 'rejected'
              ? h('button.btn.btn--sm.btn--danger', { type: 'button', onClick: () => decide(r, 'rejected') }, 'Reject')
              : null,
            r.status !== 'pending' && r.status !== 'cancelled'
              ? h('button.btn.btn--sm.btn--ghost', { type: 'button', onClick: () => decide(r, 'pending') }, 'Undo')
              : null
          ))
      );
    }

    load();
    return page;
  };

  /* ====================================================================== */
  /* Event report                                                            */
  /* ====================================================================== */

  views.report = async function report(ctx) {
    let data;
    try {
      const res = await api.dashboard.report(ctx.params.id);
      data = res.data;
    } catch (err) {
      return h('section.section', h('div.wrap.wrap--narrow',
        empty('Could not open the report', err.message,
          h('a.btn.btn--primary', { href: '#/manage/events' }, 'Back to my events'))));
    }

    const event = data.event;
    const counts = data.counts || {};
    const rows = data.registrations || [];

    const statusSlices = [
      { label: 'Approved', value: counts.approved || 0, color: '#059669' },
      { label: 'Pending', value: counts.pending || 0, color: '#d97706' },
      { label: 'Rejected', value: counts.rejected || 0, color: '#dc2626' },
      { label: 'Cancelled', value: counts.cancelled || 0, color: '#64748b' },
    ];

    /** Export the participant list as CSV — built entirely client-side. */
    function exportCSV() {
      const header = ['Name', 'Email', 'Phone', 'Organization', 'Seats', 'Status', 'Registered on', 'Notes'];
      const escape = (val) => `"${String(val == null ? '' : val).replace(/"/g, '""')}"`;
      const lines = [header.map(escape).join(',')];
      rows.forEach((r) => {
        const p = r.participant || {};
        lines.push([
          p.name, p.email, p.phone, p.organization,
          r.seats || 1, r.status, r.regDate, r.notes,
        ].map(escape).join(','));
      });
      const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = h('a', {
        href: url,
        download: `${event.title.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').toLowerCase()}-registrations.csv`,
      });
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.ok(`Exported ${rows.length} registration(s)`);
    }

    return h('div',
      h('section.section.section--tight',
        h('div.wrap',
          h('div.row', { style: { marginBottom: '0.75rem' } },
            h('a.data.muted', { href: '#/manage/events' }, '← My events')),
          h('p.eyebrow', 'Event report'),
          h('div.section__head',
            h('div',
              h('h1.h1', event.title),
              h('p.data.muted', { style: { margin: '0.35rem 0 0' } },
                `${fmt.dateLong(event.date)} · ${fmt.timeRange(event.time, event.endTime)} · ${event.venue ? event.venue.name : 'No venue'}`)
            ),
            h('div.btn-group',
              h('button.btn', { type: 'button', onClick: exportCSV }, 'Export CSV'),
              h('button.btn', { type: 'button', onClick: () => global.print() }, 'Print'),
              h('a.btn.btn--primary', { href: `#/manage/events/${event._id}` }, 'Edit event')
            )
          ),
          h('div.grid.grid--4', { style: { marginTop: '1.25rem' } },
            statCard('Capacity', event.capacity || '∞', 'total seats', 'var(--ink)'),
            statCard('Taken', event.seatsTaken, `${event.percentFull}% full`, 'var(--signal)'),
            statCard('Approved', counts.approved, 'confirmed', 'var(--ok)'),
            statCard('Revenue', fmt.money((Number(event.fee) || 0) * (counts.approved || 0)), 'approved × fee', 'var(--ink-2)')
          )
        )
      ),

      h('section.section',
        h('div.wrap',
          h('div.detail-grid',
            h('div.panel',
              h('div.panel__head',
                h('h2.panel__title', `Participant list · ${rows.length}`),
                h('span.data.muted', `Generated ${fmt.ago(data.generatedAt)}`)
              ),
              rows.length
                ? h('div.table-scroll', h('table.table',
                    h('thead', h('tr',
                      h('th', '#'), h('th', 'Participant'), h('th', 'Contact'),
                      h('th', 'Seats'), h('th', 'Status'), h('th', 'Registered')
                    )),
                    h('tbody', rows.map((r, i) => {
                      const p = r.participant || {};
                      return h('tr',
                        h('td.num', String(i + 1)),
                        h('td', h('div.person', ui.avatar(p.name),
                          h('div',
                            h('div.table__primary', p.name || 'Unknown'),
                            p.organization ? h('div.table__sub', p.organization) : null))),
                        h('td', h('div', p.email || '—'), p.phone ? h('div.table__sub', p.phone) : null),
                        h('td.num', String(r.seats || 1)),
                        h('td', ui.stamp(r.status)),
                        h('td.nowrap.data.muted', fmt.date(r.regDate))
                      );
                    }))
                  ))
                : h('div', { style: { padding: '1rem' } },
                    empty('No registrations', 'Nobody has registered for this event yet.'))
            ),
            h('div.stack',
              h('div.panel',
                h('div.panel__head', h('h2.panel__title', 'Status breakdown')),
                h('div.panel__body', ui.chart.donut(statusSlices, { centerLabel: 'Requests' }))
              ),
              h('div.panel',
                h('div.panel__head', h('h2.panel__title', 'Event details')),
                h('div.panel__body',
                  h('div.spec',
                    h('div.spec__row', h('span.spec__k', 'Category'), h('span.spec__v', event.category)),
                    h('div.spec__row', h('span.spec__k', 'Status'), h('span.spec__v', ui.stamp(event.status))),
                    h('div.spec__row', h('span.spec__k', 'Fee'), h('span.spec__v', fmt.money(event.fee))),
                    h('div.spec__row', h('span.spec__k', 'Deadline'),
                      h('span.spec__v', fmt.dateLong(event.registrationDeadline))),
                    h('div.spec__row', h('span.spec__k', 'Venue'),
                      h('span.spec__v', event.venue ? `${event.venue.name}, ${event.venue.city || ''}` : '—')),
                    h('div.spec__row', h('span.spec__k', 'Fill rate'),
                      h('span.spec__v', `${event.percentFull}%`))
                  ),
                  event.capacity > 0
                    ? h('div', { style: { marginTop: '1rem' } }, ui.gauge(event.seatsTaken, event.capacity))
                    : null
                )
              )
            )
          )
        )
      )
    );
  };

  global.CBEMS = global.CBEMS || {};
  global.CBEMS.views = Object.assign(global.CBEMS.views || {}, views);
})(window);
