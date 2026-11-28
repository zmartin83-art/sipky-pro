
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarDays, ChevronLeft, ChevronRight, Plus, Clock,
  MapPin, Users, CheckCircle2, XCircle, HelpCircle,
  Pencil, Ban, ClipboardCheck, RefreshCw
} from 'lucide-react';

const pad = value => String(value).padStart(2, '0');

const dateKey = date =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const isoWeekday = date => date.getDay() === 0 ? 7 : date.getDay();

const emptyForm = {
  title: '',
  description: '',
  location: '',
  date: dateKey(new Date()),
  start_time: '18:00',
  end_time: '20:00',
  recurring: false,
  weekdays: [1],
  until: dateKey(new Date(Date.now() + 90 * 86400000)),
};

const WEEKDAYS = [
  [1, 'Po'], [2, 'Ut'], [3, 'St'], [4, 'Št'],
  [5, 'Pi'], [6, 'So'], [7, 'Ne'],
];

const responseLabels = {
  attending: 'Prídem',
  not_attending: 'Neprídem',
  maybe: 'Ešte neviem',
};

const attendanceLabels = {
  present: 'Prítomný',
  absent: 'Neprítomný',
  excused: 'Ospravedlnený',
};

function Calendar({ supabase, club, role, userId }) {
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const [events, setEvents] = useState([]);
  const [responses, setResponses] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [myResponse, setMyResponse] = useState('maybe');
  const [myAttendance, setMyAttendance] = useState('present');
  const [attendanceMode, setAttendanceMode] = useState(false);

  const canManage = ['admin', 'organizer'].includes(
    String(role || '').toLowerCase()
  );

  const monthStart = dateKey(month);
  const monthEnd = dateKey(new Date(
    month.getFullYear(),
    month.getMonth() + 1,
    0
  ));

  const loadEvents = useCallback(async () => {
    if (!club?.id) return;

    setLoading(true);
    setMessage('');

    const { data, error } = await supabase
      .from('club_events')
      .select('*')
      .eq('club_id', club.id)
      .gte('occurrence_date', monthStart)
      .lte('occurrence_date', monthEnd)
      .order('starts_at', { ascending: true });

    if (error) {
      setMessage('Kalendár sa nepodarilo načítať: ' + error.message);
      setEvents([]);
    } else {
      setEvents(data || []);
    }

    setLoading(false);
  }, [supabase, club?.id, monthStart, monthEnd]);

  const loadEventDetails = useCallback(async event => {
    if (!event?.id) return;

    setSelectedEvent(event);
    setAttendanceMode(false);

    const [responseResult, attendanceResult] = await Promise.all([
      supabase
        .from('club_event_responses')
        .select('*')
        .eq('event_id', event.id)
        .eq('user_id', userId)
        .maybeSingle(),

      supabase
        .from('club_event_attendance')
        .select('*')
        .eq('event_id', event.id)
        .eq('user_id', userId)
        .maybeSingle(),
    ]);

    if (responseResult.error) {
      setMessage('Nepodarilo sa načítať tvoju odpoveď.');
    } else {
      setMyResponse(responseResult.data?.response || 'maybe');
    }

    if (!attendanceResult.error && attendanceResult.data) {
      setMyAttendance(attendanceResult.data.attendance_status);
    }

    if (canManage) {
      const [allResponses, allAttendance] = await Promise.all([
        supabase
          .from('club_event_responses')
          .select('*')
          .eq('event_id', event.id),

        supabase
          .from('club_event_attendance')
          .select('*')
          .eq('event_id', event.id),
      ]);

      setResponses(allResponses.data || []);
      setAttendance(allAttendance.data || []);
    } else {
      setResponses([]);
      setAttendance([]);
    }
  }, [supabase, userId, canManage]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const calendarDays = useMemo(() => {
    const year = month.getFullYear();
    const monthIndex = month.getMonth();
    const first = new Date(year, monthIndex, 1);
    const last = new Date(year, monthIndex + 1, 0);
    const offset = (first.getDay() + 6) % 7;
    const days = [];

    for (let i = 0; i < offset; i++) {
      days.push(null);
    }

    for (let day = 1; day <= last.getDate(); day++) {
      days.push(new Date(year, monthIndex, day));
    }

    while (days.length % 7 !== 0) days.push(null);

    return days;
  }, [month]);

  const eventsByDate = useMemo(() => {
    const grouped = {};
    events.forEach(event => {
      const key = event.occurrence_date;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(event);
    });
    return grouped;
  }, [events]);

  async function saveEvent(event) {
    event.preventDefault();

    if (!form.title.trim()) {
      setMessage('Zadaj názov tréningu alebo udalosti.');
      return;
    }

    if (form.end_time <= form.start_time) {
      setMessage('Koniec musí byť po začiatku.');
      return;
    }

    setSaving(true);
    setMessage('');

    try {
      if (form.recurring) {
        if (!form.weekdays.length) {
          throw new Error('Vyber aspoň jeden deň v týždni.');
        }

        if (form.until < form.date) {
          throw new Error('Dátum ukončenia musí byť po začiatku série.');
        }

        const { data: series, error: seriesError } = await supabase
          .from('club_training_series')
          .insert({
            club_id: club.id,
            title: form.title.trim(),
            description: form.description.trim() || null,
            location: form.location.trim() || null,
            starts_on: form.date,
            start_time: form.start_time,
            end_time: form.end_time,
            weekdays: form.weekdays,
            timezone: 'Europe/Bratislava',
            is_active: true,
            created_by: userId,
          })
          .select('id')
          .single();

        if (seriesError) throw seriesError;

        const { error: generateError } = await supabase.rpc(
          'sp_generate_club_training_events',
          {
            p_series_id: series.id,
            p_until: form.until,
          }
        );

        if (generateError) throw generateError;

        setMessage('Pravidelný tréning bol vytvorený.');
      } else {
        const start = new Date(`${form.date}T${form.start_time}:00`);
        const end = new Date(`${form.date}T${form.end_time}:00`);

        const { error } = await supabase
          .from('club_events')
          .insert({
            club_id: club.id,
            occurrence_date: form.date,
            event_type: 'event',
            title: form.title.trim(),
            description: form.description.trim() || null,
            location: form.location.trim() || null,
            starts_at: start.toISOString(),
            ends_at: end.toISOString(),
            status: 'scheduled',
            created_by: userId,
          });

        if (error) throw error;

        setMessage('Udalosť bola vytvorená.');
      }

      setShowForm(false);
      setForm({
        ...emptyForm,
        date: dateKey(new Date()),
        until: dateKey(new Date(Date.now() + 90 * 86400000)),
      });

      await loadEvents();
    } catch (error) {
      setMessage('Uloženie sa nepodarilo: ' + error.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveResponse() {
    if (!selectedEvent) return;

    const { error } = await supabase
      .from('club_event_responses')
      .upsert({
        event_id: selectedEvent.id,
        user_id: userId,
        response: myResponse,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'event_id,user_id',
      });

    if (error) {
      setMessage('Odpoveď sa nepodarilo uložiť: ' + error.message);
    } else {
      setMessage('Tvoja odpoveď bola uložená.');
      await loadEventDetails(selectedEvent);
    }
  }

  async function saveMyAttendance() {
    if (!selectedEvent || !canManage) return;

    const { error } = await supabase
      .from('club_event_attendance')
      .upsert({
        event_id: selectedEvent.id,
        user_id: userId,
        attendance_status: myAttendance,
        recorded_by: userId,
        recorded_at: new Date().toISOString(),
      }, {
        onConflict: 'event_id,user_id',
      });

    if (error) {
      setMessage('Dochádzku sa nepodarilo uložiť: ' + error.message);
    } else {
      setMessage('Dochádzka bola uložená.');
      await loadEventDetails(selectedEvent);
    }
  }

  async function cancelEvent(event) {
    if (!canManage || !event) return;

    const confirmed = window.confirm(
      'Naozaj chceš zrušiť tento termín?'
    );
    if (!confirmed) return;

    const { error } = await supabase.rpc(
      'sp_cancel_club_training_event',
      { p_event_id: event.id }
    );

    if (error) {
      setMessage('Termín sa nepodarilo zrušiť: ' + error.message);
    } else {
      setMessage('Termín bol zrušený.');
      setSelectedEvent(null);
      await loadEvents();
    }
  }

  function toggleWeekday(day) {
    setForm(current => ({
      ...current,
      weekdays: current.weekdays.includes(day)
        ? current.weekdays.filter(value => value !== day)
        : [...current.weekdays, day].sort(),
    }));
  }

  function changeMonth(amount) {
    setMonth(current => new Date(
      current.getFullYear(),
      current.getMonth() + amount,
      1
    ));
    setSelectedEvent(null);
  }

  function formatTime(value) {
    if (!value) return '';
    return new Date(value).toLocaleTimeString('sk-SK', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  const monthName = month.toLocaleDateString('sk-SK', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="sp-calendar">
      <div className="sp-calendar-heading">
        <div>
          <span className="sp-kicker">KLUBOVÝ SYSTÉM</span>
          <h1>Kalendár klubu</h1>
          <p>Tréningy, klubové udalosti a dochádzka.</p>
        </div>

        {canManage && (
          <button
            className="sp-primary"
            onClick={() => {
              setForm({
                ...emptyForm,
                date: dateKey(new Date()),
                until: dateKey(new Date(Date.now() + 90 * 86400000)),
              });
              setShowForm(true);
            }}
          >
            <Plus size={18} /> Pridať udalosť
          </button>
        )}
      </div>

      {message && (
        <div className="sp-cal-message">
          {message}
          <button onClick={() => setMessage('')}>×</button>
        </div>
      )}

      <div className="sp-cal-panel">
        <div className="sp-cal-monthbar">
          <button onClick={() => changeMonth(-1)} aria-label="Predchádzajúci mesiac">
            <ChevronLeft />
          </button>
          <h2>{monthName}</h2>
          <button onClick={() => changeMonth(1)} aria-label="Nasledujúci mesiac">
            <ChevronRight />
          </button>
        </div>

        <div className="sp-cal-grid">
          {['Po', 'Ut', 'St', 'Št', 'Pi', 'So', 'Ne'].map(day => (
            <div className="sp-cal-weekday" key={day}>{day}</div>
          ))}

          {calendarDays.map((date, index) => {
            if (!date) {
              return <div className="sp-cal-day empty" key={`empty-${index}`} />;
            }

            const key = dateKey(date);
            const dayEvents = eventsByDate[key] || [];
            const today = key === dateKey(new Date());

            return (
              <button
                className={`sp-cal-day ${today ? 'today' : ''}`}
                key={key}
                onClick={() => {
                  if (dayEvents.length) loadEventDetails(dayEvents[0]);
                }}
              >
                <span className="sp-cal-day-number">{date.getDate()}</span>
                {dayEvents.slice(0, 2).map(item => (
                  <span
                    className={`sp-cal-dot ${item.status}`}
                    key={item.id}
                    title={item.title}
                  >
                    {item.title}
                  </span>
                ))}
                {dayEvents.length > 2 && (
                  <small>+{dayEvents.length - 2} ďalšie</small>
                )}
              </button>
            );
          })}
        </div>

        <div className="sp-cal-legend">
          <span><i className="planned" /> Naplánované</span>
          <span><i className="cancelled" /> Zrušené</span>
        </div>
      </div>

      <div className="sp-cal-panel">
        <div className="sp-cal-section-title">
          <h2>Udalosti v mesiaci</h2>
          <button className="sp-cal-refresh" onClick={loadEvents}>
            <RefreshCw size={15} /> Obnoviť
          </button>
        </div>

        {loading ? (
          <p className="sp-cal-empty">Načítavam kalendár…</p>
        ) : events.length === 0 ? (
          <p className="sp-cal-empty">V tomto mesiaci nie sú naplánované žiadne udalosti.</p>
        ) : (
          <div className="sp-cal-event-list">
            {events.map(event => (
              <button
                className={`sp-cal-event ${event.status}`}
                key={event.id}
                onClick={() => loadEventDetails(event)}
              >
                <div className="sp-cal-event-date">
                  <strong>{new Date(`${event.occurrence_date}T12:00:00`).getDate()}</strong>
                  <small>
                    {new Date(`${event.occurrence_date}T12:00:00`)
                      .toLocaleDateString('sk-SK', { month: 'short' })}
                  </small>
                </div>

                <div className="sp-cal-event-info">
                  <strong>{event.title}</strong>
                  <span>
                    <Clock size={13} />
                    {formatTime(event.starts_at)} – {formatTime(event.ends_at)}
                  </span>
                  {event.location && (
                    <span><MapPin size={13} /> {event.location}</span>
                  )}
                </div>

                <span className={`sp-cal-status ${event.status}`}>
                  {event.status === 'cancelled' ? 'Zrušené' :
                    event.status === 'completed' ? 'Ukončené' : 'Naplánované'}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedEvent && (
        <div className="sp-cal-overlay" onClick={() => setSelectedEvent(null)}>
          <div className="sp-cal-modal" onClick={e => e.stopPropagation()}>
            <div className="sp-cal-modal-head">
              <div>
                <span className="sp-kicker">
                  {selectedEvent.event_type === 'training' ? 'KLUBOVÝ TRÉNING' : 'KLUBOVÁ UDALOSŤ'}
                </span>
                <h2>{selectedEvent.title}</h2>
              </div>
              <button onClick={() => setSelectedEvent(null)}>×</button>
            </div>

            <div className="sp-cal-detail-meta">
              <span><CalendarDays size={16} /> {selectedEvent.occurrence_date}</span>
              <span><Clock size={16} /> {formatTime(selectedEvent.starts_at)} – {formatTime(selectedEvent.ends_at)}</span>
              {selectedEvent.location && (
                <span><MapPin size={16} /> {selectedEvent.location}</span>
              )}
            </div>

            {selectedEvent.description && (
              <p className="sp-cal-description">{selectedEvent.description}</p>
            )}

            {selectedEvent.status === 'cancelled' ? (
              <p className="sp-cal-warning">Tento termín bol zrušený.</p>
            ) : (
              <>
                <div className="sp-cal-subsection">
                  <h3><Users size={17} /> Tvoja účasť</h3>
                  <div className="sp-cal-choice-row">
                    {[
                      ['attending', 'Prídem', CheckCircle2],
                      ['not_attending', 'Neprídem', XCircle],
                      ['maybe', 'Ešte neviem', HelpCircle],
                    ].map(([value, label, Icon]) => (
                      <button
                        key={value}
                        className={myResponse === value ? 'active' : ''}
                        onClick={() => setMyResponse(value)}
                      >
                        <Icon size={16} /> {label}
                      </button>
                    ))}
                  </div>
                  <button className="sp-primary sp-cal-save" onClick={saveResponse}>
                    Potvrdiť účasť
                  </button>
                </div>

                {canManage && (
                  <>
                    <div className="sp-cal-subsection">
                      <h3><ClipboardCheck size={17} /> Evidencia dochádzky</h3>
                      <p className="sp-cal-hint">
                        Skutočnú dochádzku zaznamenáva organizátor po tréningu.
                      </p>
                      <div className="sp-cal-choice-row">
                        {Object.entries(attendanceLabels).map(([value, label]) => (
                          <button
                            key={value}
                            className={myAttendance === value ? 'active' : ''}
                            onClick={() => setMyAttendance(value)}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      <button className="sp-outline sp-cal-save" onClick={saveMyAttendance}>
                        Uložiť moju dochádzku
                      </button>
                    </div>

                    <div className="sp-cal-subsection">
                      <h3>Prehľad odpovedí členov</h3>
                      <div className="sp-cal-counts">
                        <span>Prídu: {responses.filter(r => r.response === 'attending').length}</span>
                        <span>Neprídu: {responses.filter(r => r.response === 'not_attending').length}</span>
                        <span>Nevedia: {responses.filter(r => r.response === 'maybe').length}</span>
                      </div>
                      <h3>Zapísaná dochádzka</h3>
                      <div className="sp-cal-counts">
                        <span>Prítomní: {attendance.filter(a => a.attendance_status === 'present').length}</span>
                        <span>Neprítomní: {attendance.filter(a => a.attendance_status === 'absent').length}</span>
                        <span>Ospravedlnení: {attendance.filter(a => a.attendance_status === 'excused').length}</span>
                      </div>
                      <p className="sp-cal-hint">
                        Záznamy členov sú v tejto verzii dostupné cez databázu; mená členov doplníme po prepojení používateľských profilov.
                      </p>
                    </div>
                  </>
                )}
              </>
            )}

            {canManage && selectedEvent.event_type === 'training' &&
              selectedEvent.status === 'scheduled' && (
                <button
                  className="sp-cal-cancel"
                  onClick={() => cancelEvent(selectedEvent)}
                >
                  <Ban size={16} /> Zrušiť tento termín
                </button>
              )}
          </div>
        </div>
      )}

      {showForm && (
        <div className="sp-cal-overlay" onClick={() => setShowForm(false)}>
          <form className="sp-cal-modal" onSubmit={saveEvent} onClick={e => e.stopPropagation()}>
            <div className="sp-cal-modal-head">
              <div>
                <span className="sp-kicker">KLUBOVÝ KALENDÁR</span>
                <h2>Nová udalosť</h2>
              </div>
              <button type="button" onClick={() => setShowForm(false)}>×</button>
            </div>

            <label>Názov
              <input
                value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })}
                placeholder="Napr. Pravidelný tréning"
                required
              />
            </label>

            <label>Popis
              <textarea
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                rows={3}
                placeholder="Podrobnosti o tréningu..."
              />
            </label>

            <label>Miesto
              <input
                value={form.location}
                onChange={e => setForm({ ...form, location: e.target.value })}
                placeholder="Miesto konania"
              />
            </label>

            <label>Dátum začiatku
              <input
                type="date"
                value={form.date}
                onChange={e => setForm({ ...form, date: e.target.value })}
                required
              />
            </label>

            <div className="sp-cal-form-grid">
              <label>Začiatok
                <input
                  type="time"
                  value={form.start_time}
                  onChange={e => setForm({ ...form, start_time: e.target.value })}
                  required
                />
              </label>
              <label>Koniec
                <input
                  type="time"
                  value={form.end_time}
                  onChange={e => setForm({ ...form, end_time: e.target.value })}
                  required
                />
              </label>
            </div>

            <label className="sp-cal-check">
              <input
                type="checkbox"
                checked={form.recurring}
                onChange={e => setForm({ ...form, recurring: e.target.checked })}
              />
              Opakovať tréning každý týždeň
            </label>

            {form.recurring && (
              <>
                <label>Dni tréningu</label>
                <div className="sp-cal-weekday-select">
                  {WEEKDAYS.map(([day, label]) => (
                    <button
                      type="button"
                      key={day}
                      className={form.weekdays.includes(day) ? 'active' : ''}
                      onClick={() => toggleWeekday(day)}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <label>Vytvoriť termíny do dátumu
                  <input
                    type="date"
                    min={form.date}
                    value={form.until}
                    onChange={e => setForm({ ...form, until: e.target.value })}
                    required
                  />
                </label>
                <p className="sp-cal-hint">
                  Termíny sa vytvoria do zvoleného dátumu. Neskôr bude možné sériu predĺžiť.
                </p>
              </>
            )}

            <div className="sp-cal-form-actions">
              <button type="button" className="sp-outline" onClick={() => setShowForm(false)}>
                Zrušiť
              </button>
              <button className="sp-primary" disabled={saving}>
                {saving ? 'Ukladám…' : 'Uložiť udalosť'}
              </button>
            </div>
          </form>
        </div>
      )}

      <style>{`
        .sp-calendar { color:#f5f7fb; }
        .sp-calendar-heading {
          display:flex; justify-content:space-between; align-items:center;
          gap:18px; margin-bottom:24px;
        }
        .sp-calendar-heading h1 { margin:7px 0; font-size:32px; }
        .sp-calendar-heading p { color:#9eacc1; margin:0; font-size:13px; }
        .sp-cal-panel {
          background:linear-gradient(145deg,#14243b,#101c30);
          border:1px solid rgba(255,255,255,.09);
          border-radius:15px; padding:20px; margin-bottom:20px;
        }
        .sp-cal-monthbar {
          display:flex; align-items:center; justify-content:space-between;
          margin-bottom:18px;
        }
        .sp-cal-monthbar h2 { text-transform:capitalize; margin:0; font-size:19px; }
        .sp-cal-monthbar button,.sp-cal-modal-head>button {
          border:1px solid rgba(217,180,92,.3); color:#f1d58d;
          background:#172944; border-radius:9px; padding:7px 10px;
        }
        .sp-cal-grid {
          display:grid; grid-template-columns:repeat(7,minmax(0,1fr));
          gap:6px;
        }
        .sp-cal-weekday { text-align:center; color:#9eacc1; font-size:11px; padding:8px 0; }
        .sp-cal-day {
          min-width:0; min-height:82px; padding:7px;
          border:1px solid rgba(255,255,255,.07); border-radius:9px;
          background:#0d192b; color:#f5f7fb; text-align:left;
          display:flex; flex-direction:column; gap:4px;
        }
        .sp-cal-day.empty { background:transparent; border-color:transparent; }
        .sp-cal-day.today { border-color:#d9b45c; }
        .sp-cal-day-number { font-size:12px; font-weight:800; }
        .sp-cal-dot {
          display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
          border-radius:4px; padding:3px 4px; font-size:9px;
          background:#193657; color:#9fcaff;
        }
        .sp-cal-dot.cancelled { background:#48242b; color:#ff9ca3; text-decoration:line-through; }
        .sp-cal-day small { color:#9eacc1; font-size:9px; }
        .sp-cal-legend { display:flex; gap:18px; margin-top:14px; color:#9eacc1; font-size:11px; }
        .sp-cal-legend span { display:flex; align-items:center; gap:6px; }
        .sp-cal-legend i { width:8px; height:8px; border-radius:50%; background:#559be8; }
        .sp-cal-legend i.cancelled { background:#e36b72; }
        .sp-cal-section-title { display:flex; justify-content:space-between; align-items:center; }
        .sp-cal-section-title h2 { font-size:17px; }
        .sp-cal-refresh { display:flex; align-items:center; gap:6px; background:none; border:0; color:#f1d58d; }
        .sp-cal-event-list { display:grid; gap:8px; }
        .sp-cal-event {
          display:flex; align-items:center; gap:14px; width:100%;
          text-align:left; padding:12px; border:1px solid rgba(255,255,255,.08);
          border-radius:11px; background:#0d192b; color:#f5f7fb;
        }
        .sp-cal-event.cancelled { opacity:.65; }
        .sp-cal-event-date {
          min-width:43px; height:48px; display:grid; place-content:center;
          text-align:center; border-radius:9px; background:#172944;
        }
        .sp-cal-event-date strong { font-size:19px; }
        .sp-cal-event-date small { color:#d9b45c; text-transform:capitalize; }
        .sp-cal-event-info { flex:1; display:grid; gap:5px; min-width:0; }
        .sp-cal-event-info>strong { font-size:13px; }
        .sp-cal-event-info span { display:flex; align-items:center; gap:6px; color:#9eacc1; font-size:11px; }
        .sp-cal-status { font-size:10px; color:#8fc5ff; }
        .sp-cal-status.cancelled { color:#ff9ca3; }
        .sp-cal-status.completed { color:#b4c4d9; }
        .sp-cal-empty { text-align:center; color:#9eacc1; padding:25px; }
        .sp-cal-overlay {
          position:fixed; inset:0; z-index:80; background:#030914dd;
          display:grid; place-items:center; padding:16px; overflow:auto;
        }
        .sp-cal-modal {
          width:min(620px,100%); max-height:94vh; overflow:auto;
          display:grid; gap:14px; padding:23px;
          background:#101e33; border:1px solid rgba(217,180,92,.3);
          border-radius:17px; box-shadow:0 25px 80px #0009;
        }
        .sp-cal-modal-head { display:flex; align-items:center; justify-content:space-between; }
        .sp-cal-modal-head h2 { margin:5px 0 0; font-size:21px; }
        .sp-cal-modal-head>button { font-size:23px; line-height:1; }
        .sp-cal-detail-meta { display:grid; gap:9px; color:#c2cee0; font-size:12px; }
        .sp-cal-detail-meta span { display:flex; align-items:center; gap:8px; }
        .sp-cal-detail-meta svg,.sp-cal-subsection h3 svg { color:#d9b45c; }
        .sp-cal-description,.sp-cal-hint { color:#9eacc1; font-size:12px; line-height:1.5; }
        .sp-cal-subsection { border-top:1px solid rgba(255,255,255,.09); padding-top:14px; }
        .sp-cal-subsection h3 { display:flex; align-items:center; gap:8px; font-size:14px; }
        .sp-cal-choice-row { display:flex; flex-wrap:wrap; gap:7px; }
        .sp-cal-choice-row button,.sp-cal-weekday-select button {
          border:1px solid rgba(217,180,92,.25); background:#0d192b;
          color:#c2cee0; border-radius:8px; padding:9px 10px; font-size:11px;
          display:flex; align-items:center; gap:6px;
        }
        .sp-cal-choice-row button.active,.sp-cal-weekday-select button.active {
          border-color:#d9b45c; color:#f1d58d; background:#26354a;
        }
        .sp-cal-save { margin-top:12px; }
        .sp-cal-counts { display:flex; flex-wrap:wrap; gap:8px; }
        .sp-cal-counts span { background:#172944; padding:8px; border-radius:7px; font-size:11px; color:#dce5f2; }
        .sp-cal-cancel {
          display:flex; align-items:center; justify-content:center; gap:8px;
          border:1px solid #a94c57; background:#48242b; color:#ffb0b5;
          padding:11px; border-radius:9px;
        }
        .sp-cal-warning { color:#ff9ca3; }
        .sp-cal-form-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
        .sp-cal-check { display:flex; align-items:center; gap:9px; }
        .sp-cal-check input { width:auto; }
        .sp-cal-weekday-select { display:flex; flex-wrap:wrap; gap:7px; }
        .sp-cal-form-actions { display:flex; justify-content:flex-end; gap:9px; margin-top:8px; }
        .sp-cal-message {
          display:flex; justify-content:space-between; gap:12px;
          background:#172944; color:#f1d58d; border:1px solid rgba(217,180,92,.3);
          border-radius:9px; padding:12px; margin-bottom:16px; font-size:12px;
        }
        .sp-cal-message button { border:0; background:none; color:#f1d58d; }
        @media(max-width:650px) {
          .sp-calendar-heading { align-items:stretch; flex-direction:column; }
          .sp-calendar-heading .sp-primary { width:100%; }
          .sp-cal-panel { padding:12px; }
          .sp-cal-day { min-height:62px; padding:5px 3px; }
          .sp-cal-dot { font-size:8px; }
          .sp-cal-event { gap:9px; padding:9px; }
          .sp-cal-status { display:none; }
          .sp-cal-form-grid { grid-template-columns:1fr; }
          .sp-cal-modal { padding:17px; }
        }
      `}</style>
    </div>
  );
}

export default Calendar;
