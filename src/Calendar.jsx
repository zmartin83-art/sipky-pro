
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  CalendarDays, ChevronLeft, ChevronRight, Plus, Clock,
  MapPin, Users, CheckCircle2, XCircle, HelpCircle,
  Ban, ClipboardCheck, RefreshCw, Play, Flag
} from 'lucide-react';

const pad = value => String(value).padStart(2, '0');

const dateKey = date =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const emptyForm = {
  title: '',
  description: '',
  location: '',
  event_type: 'training',
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

const statusLabels = {
  scheduled: 'Naplánované',
  in_progress: 'Prebieha',
  completed: 'Ukončené',
  cancelled: 'Zrušené',
};

function Calendar({ supabase, club, role, userId }) {
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const [events, setEvents] = useState([]);
  const [responses, setResponses] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [members, setMembers] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const [loading, setLoading] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [message, setMessage] = useState('');
  const [myResponse, setMyResponse] = useState('maybe');

  const [attendanceDraft, setAttendanceDraft] = useState({});
  const [attendanceNotes, setAttendanceNotes] = useState({});

  const detailRequest = useRef(0);

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

  // Načítanie členov a ich hráčskych profilov.
  const loadClubMembers = useCallback(async () => {
    if (!club?.id) return [];

    const { data: memberData, error: memberError } = await supabase
      .from('club_members')
      .select('user_id, role')
      .eq('club_id', club.id)
      .order('role');

    if (memberError) {
      throw new Error(
        'Členov klubu sa nepodarilo načítať: ' + memberError.message
      );
    }

    const clubMembers = memberData || [];

    const { data: playerData, error: playerError } = await supabase
      .from('players')
      .select('id, club_id, auth_user_id, name, nickname, active')
      .eq('club_id', club.id);

    if (playerError) {
      throw new Error(
        'Hráčske profily sa nepodarilo načítať: ' + playerError.message
      );
    }

    const players = playerData || [];

    return clubMembers.map(member => {
      const player = players.find(
        item => item.auth_user_id === member.user_id
      );

      return {
        ...member,
        player_id: player?.id || null,
        player_name: player?.name || null,
        nickname: player?.nickname || null,
        active: player?.active ?? null,
      };
    });
  }, [supabase, club?.id]);

  const loadEventDetails = useCallback(async event => {
    if (!event?.id) return;

    const requestId = ++detailRequest.current;

    setSelectedEvent(event);
    setDetailsLoading(true);
    setMessage('');

    setMyResponse('maybe');
    setResponses([]);
    setAttendance([]);
    setMembers([]);
    setAttendanceDraft({});
    setAttendanceNotes({});

    try {
      const requests = [
        supabase
          .from('club_event_responses')
          .select('*')
          .eq('event_id', event.id),

        supabase
          .from('club_event_attendance')
          .select('*')
          .eq('event_id', event.id),
      ];

      if (canManage) {
        requests.push(loadClubMembers());
      } else {
        requests.push(Promise.resolve([]));
      }

      const [responseResult, attendanceResult, memberResult] =
        await Promise.all(requests);

      if (requestId !== detailRequest.current) return;

      if (responseResult.error) {
        throw new Error(
          'Odpovede sa nepodarilo načítať: ' +
          responseResult.error.message
        );
      }

      if (attendanceResult.error) {
        throw new Error(
          'Dochádzku sa nepodarilo načítať: ' +
          attendanceResult.error.message
        );
      }

      const allResponses = responseResult.data || [];
      const allAttendance = attendanceResult.data || [];
      const allMembers = memberResult || [];

      setResponses(allResponses);
      setAttendance(allAttendance);
      setMembers(allMembers);

      const ownResponse = allResponses.find(
        item => item.user_id === userId
      );

      setMyResponse(ownResponse?.response || 'maybe');

      const drafts = {};
      const notes = {};

      allMembers.forEach(member => {
        const record = allAttendance.find(
          item => item.user_id === member.user_id
        );

        drafts[member.user_id] =
          record?.attendance_status || '';

        notes[member.user_id] = record?.note || '';
      });

      setAttendanceDraft(drafts);
      setAttendanceNotes(notes);

    } catch (error) {
      if (requestId === detailRequest.current) {
        setMessage(error.message);
      }
    } finally {
      if (requestId === detailRequest.current) {
        setDetailsLoading(false);
      }
    }
  }, [supabase, userId, canManage, loadClubMembers]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  // Zneplatnenie starého načítavania pri zatvorení alebo odchode.
  useEffect(() => {
    return () => {
      detailRequest.current += 1;
    };
  }, []);

  const calendarDays = useMemo(() => {
    const year = month.getFullYear();
    const monthIndex = month.getMonth();

    const first = new Date(year, monthIndex, 1);
    const last = new Date(year, monthIndex + 1, 0);

    const offset = (first.getDay() + 6) % 7;
    const days = [];

    for (let i = 0; i < offset; i++) days.push(null);

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

  function getMemberName(member) {
    if (member.nickname?.trim()) return member.nickname;
    if (member.player_name?.trim()) return member.player_name;

    if (member.user_id === userId) return 'Tvoj účet';

    return 'Člen bez hráčskeho profilu';
  }

  function getMemberSubtitle(member) {
    if (member.nickname && member.player_name) {
      return member.player_name;
    }

    return member.user_id;
  }

  function getMemberForUser(targetUserId) {
    return members.find(
      member => member.user_id === targetUserId
    );
  }

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

    if (form.recurring && form.event_type !== 'training') {
      setMessage('Opakovať možno iba klubový tréning.');
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
          throw new Error(
            'Dátum ukončenia musí byť po začiatku série.'
          );
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
        const start = new Date(
          `${form.date}T${form.start_time}:00`
        );

        const end = new Date(
          `${form.date}T${form.end_time}:00`
        );

        const { error } = await supabase
          .from('club_events')
          .insert({
            club_id: club.id,
            occurrence_date: form.date,
            event_type: form.event_type,
            title: form.title.trim(),
            description: form.description.trim() || null,
            location: form.location.trim() || null,
            starts_at: start.toISOString(),
            ends_at: end.toISOString(),
            status: 'scheduled',
            created_by: userId,
          });

        if (error) throw error;

        setMessage(
          form.event_type === 'training'
            ? 'Tréning bol vytvorený.'
            : 'Udalosť bola vytvorená.'
        );
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
    if (!selectedEvent || !userId) return;

    setSaving(true);

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
      setMessage(
        'Odpoveď sa nepodarilo uložiť: ' + error.message
      );
    } else {
      setMessage('Tvoja odpoveď bola uložená.');
      await loadEventDetails(selectedEvent);
    }

    setSaving(false);
  }

  function updateAttendanceDraft(targetUserId, value) {
    setAttendanceDraft(current => ({
      ...current,
      [targetUserId]: value,
    }));
  }

  function updateAttendanceNote(targetUserId, value) {
    setAttendanceNotes(current => ({
      ...current,
      [targetUserId]: value,
    }));
  }

  async function saveMemberAttendance(member) {
    if (!selectedEvent || !canManage || !userId) return;

    const selectedStatus = attendanceDraft[member.user_id];

    if (!selectedStatus) {
      setMessage('Najskôr vyber stav dochádzky člena.');
      return;
    }

    setSaving(true);
    setMessage('');

    const { error } = await supabase
      .from('club_event_attendance')
      .upsert({
        event_id: selectedEvent.id,
        user_id: member.user_id,
        attendance_status: selectedStatus,
        note: attendanceNotes[member.user_id]?.trim() || null,
        recorded_by: userId,
        recorded_at: new Date().toISOString(),
      }, {
        onConflict: 'event_id,user_id',
      });

    if (error) {
      setMessage(
        'Dochádzku člena sa nepodarilo uložiť: ' + error.message
      );
      setSaving(false);
      return;
    }

    setMessage(
      'Dochádzka člena ' + getMemberName(member) + ' bola uložená.'
    );

    await loadEventDetails(selectedEvent);
    setSaving(false);
  }

  async function saveAllAttendance() {
    if (!selectedEvent || !canManage || !userId) return;

    const records = members
      .filter(member => attendanceDraft[member.user_id])
      .map(member => ({
        event_id: selectedEvent.id,
        user_id: member.user_id,
        attendance_status: attendanceDraft[member.user_id],
        note: attendanceNotes[member.user_id]?.trim() || null,
        recorded_by: userId,
        recorded_at: new Date().toISOString(),
      }));

    if (!records.length) {
      setMessage('Nie je vybraný žiadny stav dochádzky.');
      return;
    }

    setSaving(true);
    setMessage('');

    const { error } = await supabase
      .from('club_event_attendance')
      .upsert(records, {
        onConflict: 'event_id,user_id',
      });

    if (error) {
      setMessage(
        'Dochádzku sa nepodarilo uložiť: ' + error.message
      );
    } else {
      setMessage(
        `Dochádzka bola uložená pre ${records.length} členov.`
      );

      await loadEventDetails(selectedEvent);
    }

    setSaving(false);
  }

  async function updateEventStatus(event, nextStatus) {
    if (!canManage || !event) return;

    const prompts = {
      in_progress: 'Naozaj chceš označiť tréning ako začatý?',
      completed: 'Naozaj chceš označiť tréning ako ukončený?',
    };

    if (
      prompts[nextStatus] &&
      !window.confirm(prompts[nextStatus])
    ) return;

    const { data, error } = await supabase
      .from('club_events')
      .update({ status: nextStatus })
      .eq('id', event.id)
      .eq('club_id', club.id)
      .select('*')
      .single();

    if (error) {
      setMessage(
        'Stav tréningu sa nepodarilo zmeniť: ' + error.message
      );
      return;
    }

    setSelectedEvent(data);

    setEvents(current =>
      current.map(item => item.id === data.id ? data : item)
    );

    setMessage(
      nextStatus === 'in_progress'
        ? 'Tréning bol spustený.'
        : 'Tréning bol označený ako ukončený.'
    );
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
      setMessage(
        'Termín sa nepodarilo zrušiť: ' + error.message
      );
    } else {
      setMessage('Termín bol zrušený.');

      detailRequest.current += 1;
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

  function closeEventDetails() {
    detailRequest.current += 1;
    setSelectedEvent(null);
    setDetailsLoading(false);
  }

  function changeMonth(amount) {
    detailRequest.current += 1;

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

  function formatDate(value) {
    if (!value) return '';

    return new Date(`${value}T12:00:00`).toLocaleDateString(
      'sk-SK',
      {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }
    );
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
                until: dateKey(
                  new Date(Date.now() + 90 * 86400000)
                ),
              });

              setShowForm(true);
            }}
          >
            <Plus size={18} /> Pridať udalosť
          </button>
        )}
      </div>

      {message && (
        <div className="sp-cal-message" role="status">
          <span>{message}</span>

          <button
            onClick={() => setMessage('')}
            aria-label="Zavrieť správu"
          >
            ×
          </button>
        </div>
      )}

      <div className="sp-cal-panel">
        <div className="sp-cal-monthbar">
          <button
            onClick={() => changeMonth(-1)}
            aria-label="Predchádzajúci mesiac"
          >
            <ChevronLeft />
          </button>

          <h2>{monthName}</h2>

          <button
            onClick={() => changeMonth(1)}
            aria-label="Nasledujúci mesiac"
          >
            <ChevronRight />
          </button>
        </div>

        <div className="sp-cal-grid">
          {['Po', 'Ut', 'St', 'Št', 'Pi', 'So', 'Ne'].map(day => (
            <div className="sp-cal-weekday" key={day}>
              {day}
            </div>
          ))}

          {calendarDays.map((date, index) => {
            if (!date) {
              return (
                <div
                  className="sp-cal-day empty"
                  key={`empty-${index}`}
                />
              );
            }

            const key = dateKey(date);
            const dayEvents = eventsByDate[key] || [];
            const today = key === dateKey(new Date());

            return (
              <button
                className={`sp-cal-day ${today ? 'today' : ''}`}
                key={key}
                onClick={() => {
                  if (dayEvents.length) {
                    loadEventDetails(dayEvents[0]);
                  }
                }}
                aria-label={`${key}, ${dayEvents.length} udalostí`}
              >
                <span className="sp-cal-day-number">
                  {date.getDate()}
                </span>

                {dayEvents.slice(0, 2).map(item => (
                  <span
                    className={`sp-cal-dot ${item.status} ${item.event_type}`}
                    key={item.id}
                    title={`${item.title} – ${
                      statusLabels[item.status] || item.status
                    }`}
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
          <span><i className="progress" /> Prebieha</span>
          <span><i className="completed" /> Ukončené</span>
          <span><i className="cancelled" /> Zrušené</span>
        </div>
      </div>

      <div className="sp-cal-panel">
        <div className="sp-cal-section-title">
          <h2>Udalosti v mesiaci</h2>

          <button
            className="sp-cal-refresh"
            onClick={loadEvents}
            disabled={loading}
          >
            <RefreshCw size={15} />
            {loading ? 'Načítavam…' : 'Obnoviť'}
          </button>
        </div>

        {loading ? (
          <p className="sp-cal-empty">Načítavam kalendár…</p>
        ) : events.length === 0 ? (
          <p className="sp-cal-empty">
            V tomto mesiaci nie sú naplánované žiadne udalosti.
          </p>
        ) : (
          <div className="sp-cal-event-list">
            {events.map(event => (
              <button
                className={`sp-cal-event ${event.status}`}
                key={event.id}
                onClick={() => loadEventDetails(event)}
              >
                <div className="sp-cal-event-date">
                  <strong>
                    {new Date(
                      `${event.occurrence_date}T12:00:00`
                    ).getDate()}
                  </strong>

                  <small>
                    {new Date(
                      `${event.occurrence_date}T12:00:00`
                    ).toLocaleDateString('sk-SK', {
                      month: 'short',
                    })}
                  </small>
                </div>

                <div className="sp-cal-event-info">
                  <strong>{event.title}</strong>

                  <span>
                    <Clock size={13} />
                    {formatTime(event.starts_at)} – {formatTime(event.ends_at)}
                  </span>

                  {event.location && (
                    <span>
                      <MapPin size={13} /> {event.location}
                    </span>
                  )}

                  <small className="sp-cal-event-type">
                    {event.event_type === 'training'
                      ? 'Tréning'
                      : 'Udalosť'}
                  </small>
                </div>

                <span className={`sp-cal-status ${event.status}`}>
                  {statusLabels[event.status] || event.status}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedEvent && (
        <div
          className="sp-cal-overlay"
          onClick={closeEventDetails}
        >
          <div
            className="sp-cal-modal"
            onClick={e => e.stopPropagation()}
          >
            <div className="sp-cal-modal-head">
              <div>
                <span className="sp-kicker">
                  {selectedEvent.event_type === 'training'
                    ? 'KLUBOVÝ TRÉNING'
                    : 'KLUBOVÁ UDALOSŤ'}
                </span>

                <h2>{selectedEvent.title}</h2>
              </div>

              <button
                onClick={closeEventDetails}
                aria-label="Zavrieť"
              >
                ×
              </button>
            </div>

            <div className="sp-cal-detail-meta">
              <span>
                <CalendarDays size={16} />
                {formatDate(selectedEvent.occurrence_date)}
              </span>

              <span>
                <Clock size={16} />
                {formatTime(selectedEvent.starts_at)} – {formatTime(selectedEvent.ends_at)}
              </span>

              {selectedEvent.location && (
                <span>
                  <MapPin size={16} /> {selectedEvent.location}
                </span>
              )}

              <span className={`sp-cal-status ${selectedEvent.status}`}>
                Stav: {statusLabels[selectedEvent.status] || selectedEvent.status}
              </span>
            </div>

            {detailsLoading ? (
              <p className="sp-cal-empty">
                Načítavam údaje tréningu…
              </p>
            ) : (
              <>
                {selectedEvent.description && (
                  <p className="sp-cal-description">
                    {selectedEvent.description}
                  </p>
                )}

                {selectedEvent.status === 'cancelled' ? (
                  <p className="sp-cal-warning">
                    Tento termín bol zrušený.
                  </p>
                ) : (
                  <>
                    <div className="sp-cal-subsection">
                      <h3>
                        <Users size={17} /> Tvoja účasť
                      </h3>

                      <div className="sp-cal-choice-row">
                        {Object.entries(responseLabels).map(
                          ([value, label]) => {
                            const Icon =
                              value === 'attending'
                                ? CheckCircle2
                                : value === 'not_attending'
                                  ? XCircle
                                  : HelpCircle;

                            return (
                              <button
                                key={value}
                                className={
                                  myResponse === value ? 'active' : ''
                                }
                                onClick={() => setMyResponse(value)}
                              >
                                <Icon size={16} /> {label}
                              </button>
                            );
                          }
                        )}
                      </div>

                      <button
                        className="sp-primary sp-cal-save"
                        onClick={saveResponse}
                        disabled={saving}
                      >
                        Potvrdiť účasť
                      </button>
                    </div>

                    {canManage && (
                      <>
                        <div className="sp-cal-subsection">
                          <h3>
                            <ClipboardCheck size={17} />
                            Evidencia dochádzky členov
                          </h3>

                          <p className="sp-cal-hint">
                            Vyber pri každom členovi skutočný stav
                            dochádzky. Zmeny môžeš uložiť jednotlivo
                            alebo naraz.
                          </p>

                          <div className="sp-cal-attendance-summary">
                            <span>
                              Členovia: {members.length}
                            </span>

                            <span>
                              Prítomní: {
                                Object.values(attendanceDraft)
                                  .filter(v => v === 'present').length
                              }
                            </span>

                            <span>
                              Neprítomní: {
                                Object.values(attendanceDraft)
                                  .filter(v => v === 'absent').length
                              }
                            </span>

                            <span>
                              Ospravedlnení: {
                                Object.values(attendanceDraft)
                                  .filter(v => v === 'excused').length
                              }
                            </span>
                          </div>

                          {members.length === 0 ? (
                            <p className="sp-cal-empty">
                              Klub nemá načítaných žiadnych členov.
                            </p>
                          ) : (
                            <div className="sp-cal-roster">
                              {members.map(member => {
                                const currentStatus =
                                  attendanceDraft[member.user_id] || '';

                                const savedRecord = attendance.find(
                                  item =>
                                    item.user_id === member.user_id
                                );

                                return (
                                  <div
                                    className="sp-cal-roster-row"
                                    key={member.user_id}
                                  >
                                    <div className="sp-cal-roster-person">
                                      <strong>
                                        {getMemberName(member)}
                                      </strong>

                                      <small>
                                        {getMemberSubtitle(member)}
                                      </small>

                                      <span className="sp-cal-member-role">
                                        {member.role}
                                        {member.active === false
                                          ? ' · Neaktívny hráč'
                                          : ''}
                                      </span>
                                    </div>

                                    <div className="sp-cal-roster-controls">
                                      <select
                                        value={currentStatus}
                                        onChange={e =>
                                          updateAttendanceDraft(
                                            member.user_id,
                                            e.target.value
                                          )
                                        }
                                      >
                                        <option value="">
                                          Nezaznamenané
                                        </option>

                                        {Object.entries(
                                          attendanceLabels
                                        ).map(([value, label]) => (
                                          <option
                                            key={value}
                                            value={value}
                                          >
                                            {label}
                                          </option>
                                        ))}
                                      </select>

                                      <input
                                        className="sp-cal-note"
                                        value={
                                          attendanceNotes[member.user_id] || ''
                                        }
                                        onChange={e =>
                                          updateAttendanceNote(
                                            member.user_id,
                                            e.target.value
                                          )
                                        }
                                        placeholder="Poznámka (nepovinná)"
                                      />

                                      <button
                                        className="sp-outline sp-cal-row-save"
                                        disabled={
                                          saving || !currentStatus
                                        }
                                        onClick={() =>
                                          saveMemberAttendance(member)
                                        }
                                      >
                                        Uložiť
                                      </button>
                                    </div>

                                    {savedRecord && (
                                      <small className="sp-cal-saved">
                                        Uložené v databáze
                                      </small>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          <button
                            className="sp-primary sp-cal-save"
                            onClick={saveAllAttendance}
                            disabled={saving || members.length === 0}
                          >
                            {saving
                              ? 'Ukladám…'
                              : 'Uložiť dochádzku všetkých vybraných členov'}
                          </button>
                        </div>

                        <div className="sp-cal-subsection">
                          <h3>Prehľad odpovedí členov</h3>

                          <div className="sp-cal-counts">
                            <span>
                              Prídu: {
                                responses.filter(
                                  r => r.response === 'attending'
                                ).length
                              }
                            </span>

                            <span>
                              Neprídu: {
                                responses.filter(
                                  r => r.response === 'not_attending'
                                ).length
                              }
                            </span>

                            <span>
                              Nevedia: {
                                responses.filter(
                                  r => r.response === 'maybe'
                                ).length
                              }
                            </span>
                          </div>

                          <div className="sp-cal-name-list">
                            {responses.length === 0 ? (
                              <p className="sp-cal-hint">
                                Zatiaľ nikto nepotvrdil svoju účasť.
                              </p>
                            ) : (
                              responses.map(response => {
                                const member = getMemberForUser(
                                  response.user_id
                                );

                                return (
                                  <div
                                    className="sp-cal-name-row"
                                    key={response.id}
                                  >
                                    <strong>
                                      {member
                                        ? getMemberName(member)
                                        : 'Používateľ mimo zoznamu členov'}
                                    </strong>

                                    <span>
                                      {responseLabels[response.response] ||
                                        response.response}
                                    </span>
                                  </div>
                                );
                              })
                            )}
                          </div>

                          <h3>Zapísaná dochádzka</h3>

                          <div className="sp-cal-counts">
                            <span>
                              Prítomní: {
                                attendance.filter(
                                  a => a.attendance_status === 'present'
                                ).length
                              }
                            </span>

                            <span>
                              Neprítomní: {
                                attendance.filter(
                                  a => a.attendance_status === 'absent'
                                ).length
                              }
                            </span>

                            <span>
                              Ospravedlnení: {
                                attendance.filter(
                                  a => a.attendance_status === 'excused'
                                ).length
                              }
                            </span>
                          </div>

                          <div className="sp-cal-name-list">
                            {attendance.length === 0 ? (
                              <p className="sp-cal-hint">
                                Zatiaľ nie je zaznamenaná žiadna dochádzka.
                              </p>
                            ) : (
                              attendance.map(record => {
                                const member = getMemberForUser(
                                  record.user_id
                                );

                                return (
                                  <div
                                    className="sp-cal-name-row"
                                    key={record.id}
                                  >
                                    <div>
                                      <strong>
                                        {member
                                          ? getMemberName(member)
                                          : 'Používateľ mimo zoznamu členov'}
                                      </strong>

                                      {record.note && (
                                        <small>{record.note}</small>
                                      )}
                                    </div>

                                    <span>
                                      {attendanceLabels[
                                        record.attendance_status
                                      ] || record.attendance_status}
                                    </span>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </div>
                      </>
                    )}
                  </>
                )}
              </>
            )}

            {canManage &&
              selectedEvent.event_type === 'training' &&
              selectedEvent.status === 'scheduled' && (
                <div className="sp-cal-management-actions">
                  <button
                    className="sp-cal-start"
                    onClick={() =>
                      updateEventStatus(
                        selectedEvent,
                        'in_progress'
                      )
                    }
                  >
                    <Play size={16} /> Spustiť tréning
                  </button>

                  <button
                    className="sp-cal-cancel"
                    onClick={() => cancelEvent(selectedEvent)}
                  >
                    <Ban size={16} /> Zrušiť tento termín
                  </button>
                </div>
              )}

            {canManage &&
              selectedEvent.event_type === 'training' &&
              selectedEvent.status === 'in_progress' && (
                <button
                  className="sp-cal-complete"
                  onClick={() =>
                    updateEventStatus(selectedEvent, 'completed')
                  }
                >
                  <Flag size={16} /> Ukončiť tréning
                </button>
              )}
          </div>
        </div>
      )}

      {showForm && (
        <div
          className="sp-cal-overlay"
          onClick={() => setShowForm(false)}
        >
          <form
            className="sp-cal-modal"
            onSubmit={saveEvent}
            onClick={e => e.stopPropagation()}
          >
            <div className="sp-cal-modal-head">
              <div>
                <span className="sp-kicker">KLUBOVÝ KALENDÁR</span>
                <h2>Nová udalosť</h2>
              </div>

              <button
                type="button"
                onClick={() => setShowForm(false)}
                aria-label="Zavrieť"
              >
                ×
              </button>
            </div>

            <label>Typ
              <select
                value={form.event_type}
                onChange={e => setForm(current => ({
                  ...current,
                  event_type: e.target.value,
                  recurring: e.target.value === 'training'
                    ? current.recurring
                    : false,
                }))}
              >
                <option value="training">Klubový tréning</option>
                <option value="event">Klubová udalosť</option>
              </select>
            </label>

            <label>Názov
              <input
                value={form.title}
                onChange={e => setForm({
                  ...form,
                  title: e.target.value,
                })}
                placeholder="Napr. Pravidelný tréning"
                required
              />
            </label>

            <label>Popis
              <textarea
                value={form.description}
                onChange={e => setForm({
                  ...form,
                  description: e.target.value,
                })}
                rows={3}
                placeholder="Podrobnosti o tréningu alebo udalosti..."
              />
            </label>

            <label>Miesto
              <input
                value={form.location}
                onChange={e => setForm({
                  ...form,
                  location: e.target.value,
                })}
                placeholder="Miesto konania"
              />
            </label>

            <label>Dátum začiatku
              <input
                type="date"
                value={form.date}
                onChange={e => setForm({
                  ...form,
                  date: e.target.value,
                })}
                required
              />
            </label>

            <div className="sp-cal-form-grid">
              <label>Začiatok
                <input
                  type="time"
                  value={form.start_time}
                  onChange={e => setForm({
                    ...form,
                    start_time: e.target.value,
                  })}
                  required
                />
              </label>

              <label>Koniec
                <input
                  type="time"
                  value={form.end_time}
                  onChange={e => setForm({
                    ...form,
                    end_time: e.target.value,
                  })}
                  required
                />
              </label>
            </div>

            {form.event_type === 'training' && (
              <label className="sp-cal-check">
                <input
                  type="checkbox"
                  checked={form.recurring}
                  onChange={e => setForm({
                    ...form,
                    recurring: e.target.checked,
                  })}
                />
                Opakovať tréning každý týždeň
              </label>
            )}

            {form.recurring && form.event_type === 'training' && (
              <>
                <label>Dni tréningu</label>

                <div className="sp-cal-weekday-select">
                  {WEEKDAYS.map(([day, label]) => (
                    <button
                      type="button"
                      key={day}
                      className={
                        form.weekdays.includes(day) ? 'active' : ''
                      }
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
                    onChange={e => setForm({
                      ...form,
                      until: e.target.value,
                    })}
                    required
                  />
                </label>

                <p className="sp-cal-hint">
                  Termíny sa vytvoria do zvoleného dátumu.
                  Neskôr bude možné sériu predĺžiť.
                </p>
              </>
            )}

            <div className="sp-cal-form-actions">
              <button
                type="button"
                className="sp-outline"
                onClick={() => setShowForm(false)}
              >
                Zrušiť
              </button>

              <button className="sp-primary" disabled={saving}>
                {saving
                  ? 'Ukladám…'
                  : form.event_type === 'training'
                    ? 'Uložiť tréning'
                    : 'Uložiť udalosť'}
              </button>
            </div>
          </form>
        </div>
      )}

      <style>{`
        .sp-calendar { color:#f5f7fb; }
        .sp-calendar-heading { display:flex; justify-content:space-between; align-items:center; gap:18px; margin-bottom:24px; }
        .sp-calendar-heading h1 { margin:7px 0; font-size:32px; }
        .sp-calendar-heading p { color:#9eacc1; margin:0; font-size:13px; }
        .sp-cal-panel { background:linear-gradient(145deg,#14243b,#101c30); border:1px solid rgba(255,255,255,.09); border-radius:15px; padding:20px; margin-bottom:20px; }
        .sp-cal-monthbar { display:flex; align-items:center; justify-content:space-between; margin-bottom:18px; }
        .sp-cal-monthbar h2 { text-transform:capitalize; margin:0; font-size:19px; }
        .sp-cal-monthbar button,.sp-cal-modal-head>button { border:1px solid rgba(217,180,92,.3); color:#f1d58d; background:#172944; border-radius:9px; padding:7px 10px; }
        .sp-cal-grid { display:grid; grid-template-columns:repeat(7,minmax(0,1fr)); gap:6px; }
        .sp-cal-weekday { text-align:center; color:#9eacc1; font-size:11px; padding:8px 0; }
        .sp-cal-day { min-width:0; min-height:82px; padding:7px; border:1px solid rgba(255,255,255,.07); border-radius:9px; background:#0d192b; color:#f5f7fb; text-align:left; display:flex; flex-direction:column; gap:4px; }
        .sp-cal-day.empty { background:transparent; border-color:transparent; }
        .sp-cal-day.today { border-color:#d9b45c; }
        .sp-cal-day-number { font-size:12px; font-weight:800; }
        .sp-cal-dot { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; border-radius:4px; padding:3px 4px; font-size:9px; background:#193657; color:#9fcaff; }
        .sp-cal-dot.in_progress { background:#59451d; color:#ffe09a; }
        .sp-cal-dot.completed { background:#234b3b; color:#a7e4c3; }
        .sp-cal-dot.cancelled { background:#48242b; color:#ff9ca3; text-decoration:line-through; }
        .sp-cal-day small { color:#9eacc1; font-size:9px; }
        .sp-cal-legend { display:flex; flex-wrap:wrap; gap:18px; margin-top:14px; color:#9eacc1; font-size:11px; }
        .sp-cal-legend span { display:flex; align-items:center; gap:6px; }
        .sp-cal-legend i { width:8px; height:8px; border-radius:50%; background:#559be8; }
        .sp-cal-legend i.progress { background:#d9b45c; }
        .sp-cal-legend i.completed { background:#58b58a; }
        .sp-cal-legend i.cancelled { background:#e36b72; }
        .sp-cal-section-title { display:flex; justify-content:space-between; align-items:center; }
        .sp-cal-section-title h2 { font-size:17px; }
        .sp-cal-refresh { display:flex; align-items:center; gap:6px; background:none; border:0; color:#f1d58d; }
        .sp-cal-refresh:disabled { opacity:.55; }
        .sp-cal-event-list { display:grid; gap:8px; }
        .sp-cal-event { display:flex; align-items:center; gap:14px; width:100%; text-align:left; padding:12px; border:1px solid rgba(255,255,255,.08); border-radius:11px; background:#0d192b; color:#f5f7fb; }
        .sp-cal-event.cancelled { opacity:.65; }
        .sp-cal-event.in_progress { border-color:rgba(217,180,92,.5); }
        .sp-cal-event-date { min-width:43px; height:48px; display:grid; place-content:center; text-align:center; border-radius:9px; background:#172944; }
        .sp-cal-event-date strong { font-size:19px; }
        .sp-cal-event-date small { color:#d9b45c; text-transform:capitalize; }
        .sp-cal-event-info { flex:1; display:grid; gap:5px; min-width:0; }
        .sp-cal-event-info>strong { font-size:13px; }
        .sp-cal-event-info span { display:flex; align-items:center; gap:6px; color:#9eacc1; font-size:11px; }
        .sp-cal-event-type { color:#d9b45c; font-size:10px; }
        .sp-cal-status { font-size:10px; color:#8fc5ff; white-space:nowrap; }
        .sp-cal-status.cancelled { color:#ff9ca3; }
        .sp-cal-status.completed { color:#8fd2ac; }
        .sp-cal-status.in_progress { color:#f1d58d; }
        .sp-cal-empty { text-align:center; color:#9eacc1; padding:25px; }
        .sp-cal-overlay { position:fixed; inset:0; z-index:80; background:#030914dd; display:grid; place-items:center; padding:16px; overflow:auto; }
        .sp-cal-modal { width:min(620px,100%); max-height:94vh; overflow:auto; display:grid; gap:14px; padding:23px; background:#101e33; border:1px solid rgba(217,180,92,.3); border-radius:17px; box-shadow:0 25px 80px #0009; }
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
        .sp-cal-choice-row button,.sp-cal-weekday-select button { border:1px solid rgba(217,180,92,.25); background:#0d192b; color:#c2cee0; border-radius:8px; padding:9px 10px; font-size:11px; display:flex; align-items:center; gap:6px; }
        .sp-cal-choice-row button.active,.sp-cal-weekday-select button.active { border-color:#d9b45c; color:#f1d58d; background:#26354a; }
        .sp-cal-save { margin-top:12px; }
        .sp-cal-counts { display:flex; flex-wrap:wrap; gap:8px; }
        .sp-cal-counts span,.sp-cal-attendance-summary span { background:#172944; padding:8px; border-radius:7px; font-size:11px; color:#dce5f2; }
        .sp-cal-attendance-summary { display:flex; flex-wrap:wrap; gap:7px; margin:12px 0; }
        .sp-cal-roster { display:grid; gap:9px; margin-top:12px; }
        .sp-cal-roster-row { display:grid; grid-template-columns:minmax(0,1fr) minmax(190px,1fr); gap:9px; padding:12px; background:#0d192b; border:1px solid rgba(255,255,255,.08); border-radius:10px; }
        .sp-cal-roster-person { display:grid; gap:4px; min-width:0; }
        .sp-cal-roster-person strong { font-size:13px; }
        .sp-cal-roster-person small,.sp-cal-name-row small { color:#9eacc1; font-size:10px; overflow-wrap:anywhere; }
        .sp-cal-member-role { color:#d9b45c; font-size:10px; }
        .sp-cal-roster-controls { display:grid; gap:7px; }
        .sp-cal-roster-controls select,.sp-cal-note { width:100%; box-sizing:border-box; border:1px solid rgba(255,255,255,.14); border-radius:7px; padding:8px; background:#172944; color:#f5f7fb; font:inherit; font-size:11px; }
        .sp-cal-row-save { padding:7px 10px; font-size:11px; }
        .sp-cal-row-save:disabled { opacity:.45; }
        .sp-cal-saved { grid-column:1/-1; color:#8fd2ac; font-size:10px; }
        .sp-cal-name-list { display:grid; gap:7px; margin:10px 0 18px; }
        .sp-cal-name-row { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:9px 11px; border-radius:8px; background:#0d192b; font-size:11px; }
        .sp-cal-name-row>div { display:grid; gap:4px; }
        .sp-cal-name-row>span { color:#f1d58d; text-align:right; }
        .sp-cal-management-actions { display:grid; grid-template-columns:1fr 1fr; gap:9px; }
        .sp-cal-start,.sp-cal-complete,.sp-cal-cancel { display:flex; align-items:center; justify-content:center; gap:8px; padding:11px; border-radius:9px; }
        .sp-cal-start { border:1px solid #b48b37; background:#4a3919; color:#ffe09a; }
        .sp-cal-complete { border:1px solid #398b68; background:#173d30; color:#a7e4c3; }
        .sp-cal-cancel { border:1px solid #a94c57; background:#48242b; color:#ffb0b5; }
        .sp-cal-warning { color:#ff9ca3; }
        .sp-cal-form-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
        .sp-cal-check { display:flex; align-items:center; gap:9px; }
        .sp-cal-check input { width:auto; }
        .sp-cal-weekday-select { display:flex; flex-wrap:wrap; gap:7px; }
        .sp-cal-form-actions { display:flex; justify-content:flex-end; gap:9px; margin-top:8px; }
        .sp-cal-message { display:flex; justify-content:space-between; gap:12px; background:#172944; color:#f1d58d; border:1px solid rgba(217,180,92,.3); border-radius:9px; padding:12px; margin-bottom:16px; font-size:12px; }
        .sp-cal-message button { border:0; background:none; color:#f1d58d; }
        .sp-cal-modal label { display:grid; gap:6px; color:#c2cee0; font-size:12px; }
        .sp-cal-modal input:not([type="checkbox"]),.sp-cal-modal textarea,.sp-cal-modal select { width:100%; box-sizing:border-box; border:1px solid rgba(255,255,255,.14); border-radius:8px; padding:10px 11px; background:#0d192b; color:#f5f7fb; font:inherit; }
        @media(max-width:650px) {
          .sp-calendar-heading { align-items:stretch; flex-direction:column; }
          .sp-calendar-heading .sp-primary { width:100%; }
          .sp-cal-panel { padding:12px; }
          .sp-cal-day { min-height:62px; padding:5px 3px; }
          .sp-cal-dot { font-size:8px; }
          .sp-cal-event { gap:9px; padding:9px; }
          .sp-cal-status { display:none; }
          .sp-cal-form-grid,.sp-cal-management-actions { grid-template-columns:1fr; }
          .sp-cal-modal { padding:17px; }
          .sp-cal-roster-row { grid-template-columns:1fr; }
        }
      `}</style>
    </div>
  );
}

export default Calendar;
