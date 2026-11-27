
import React, { useEffect, useState, useCallback } from 'react';
import {
  Activity, Bell, CalendarDays, ChevronRight,
  CircleUserRound, Club, LayoutDashboard, LogOut, Menu, Settings,
  ShieldCheck, Target, Trophy, Users, X, Search, Plus,
  Pencil, UserCheck, UserX, Save, RefreshCw, MapPin, Clock,
  Calendar, Monitor
} from 'lucide-react';
import { supabase, supabaseConfigured } from './supabase.js';

const navigation = [
  ['Prehľad', LayoutDashboard],
  ['Hráči', Users],
  ['Turnaje', Trophy],
  ['Zápasy', Target],
  ['Štatistiky', Activity],
  ['Členovia klubu', ShieldCheck],
  ['Nastavenia', Settings]
];

const emptyTournament = {
  name: '',
  game_type: '501',
  format: 'single_elimination',
  status: 'planned',
  event_date: '',
  start_time: '',
  registration_opens_at: '',
  registration_closes_at: '',
  max_players: '32',
  entry_fee: '0',
  location: '',
  board_count: '8'
};

const tournamentStatuses = [
  { value: 'planned', label: 'Pripravovaný' },
  { value: 'ongoing', label: 'Prebieha' },
  { value: 'completed', label: 'Ukončený' },
  { value: 'cancelled', label: 'Zrušený' }
];

const tournamentFormats = [
  { value: 'single_elimination', label: 'Vyraďovací pavúk' },
  { value: 'round_robin', label: 'Každý s každým' },
  { value: 'groups_playoff', label: 'Skupiny + playoff' }
];

function localDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000)
    .toISOString().slice(0, 16);
}

function statusLabel(status) {
  return tournamentStatuses.find(s => s.value === status)?.label || status || 'Neznámy';
}

function formatLabel(format) {
  return tournamentFormats.find(f => f.value === format)?.label || format || 'Neuvedený';
}

function dateLabel(value) {
  if (!value) return 'Dátum neurčený';
  return new Date(value + 'T00:00:00').toLocaleDateString('sk-SK');
}

export default function App() {
  const [active, setActive] = useState('Prehľad');
  const [session, setSession] = useState(null);
  const [club, setClub] = useState('Sibírka');
  const [clubId, setClubId] = useState(null);
  const [role, setRole] = useState('');
  const [counts, setCounts] = useState({
    players: '—', tournaments: '—', matches: '—'
  });

  const [menu, setMenu] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [register, setRegister] = useState(false);

  // HRACI
  const [playerRows, setPlayerRows] = useState([]);
  const [playersLoading, setPlayersLoading] = useState(false);
  const [playersError, setPlayersError] = useState('');
  const [playerSearch, setPlayerSearch] = useState('');
  const [editingPlayer, setEditingPlayer] = useState(null);
  const [playerName, setPlayerName] = useState('');
  const [playerNickname, setPlayerNickname] = useState('');
  const [savingPlayer, setSavingPlayer] = useState(false);
  const [playerMessage, setPlayerMessage] = useState('');

  // TURNAJE
  const [tournamentRows, setTournamentRows] = useState([]);
  const [tournamentsLoading, setTournamentsLoading] = useState(false);
  const [tournamentsError, setTournamentsError] = useState('');
  const [tournamentSearch, setTournamentSearch] = useState('');
  const [editingTournament, setEditingTournament] = useState(null);
  const [tournamentForm, setTournamentForm] = useState(emptyTournament);
  const [savingTournament, setSavingTournament] = useState(false);
  const [tournamentMessage, setTournamentMessage] = useState('');
  const [showTournamentForm, setShowTournamentForm] = useState(false);
  const [tournamentFilter, setTournamentFilter] = useState('all');

  const canManagePlayers = ['owner', 'admin'].includes(
    String(role || '').toLowerCase()
  );

  const canManageTournaments = [
    'owner', 'admin', 'organizer'
  ].includes(String(role || '').toLowerCase());

  // PRIHLASENIE
  useEffect(() => {
    if (!supabaseConfigured) return;

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });

    const { data } = supabase.auth.onAuthStateChange((_, s) => {
      setSession(s);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  // NACITANIE HRACOV
  const loadPlayers = useCallback(async () => {
    if (!clubId || !supabase) return;

    setPlayersLoading(true);
    setPlayersError('');

    const { data, error } = await supabase
      .from('players')
      .select('id, club_id, name, nickname, active')
      .eq('club_id', clubId)
      .order('name', { ascending: true });

    if (error) {
      setPlayersError(error.message);
      setPlayerRows([]);
    } else {
      setPlayerRows(data || []);
    }

    setPlayersLoading(false);
  }, [clubId]);

  // NACITANIE TURNAJOV
  const loadTournaments = useCallback(async () => {
    if (!clubId || !supabase) return;

    setTournamentsLoading(true);
    setTournamentsError('');

    const { data, error } = await supabase
      .from('tournaments')
      .select(`
        id,
        club_id,
        name,
        game_type,
        format,
        status,
        event_date,
        start_time,
        registration_opens_at,
        registration_closes_at,
        max_players,
        entry_fee,
        location,
        board_count
      `)
      .eq('club_id', clubId)
      .order('event_date', { ascending: true, nullsFirst: false });

    if (error) {
      setTournamentsError(error.message);
      setTournamentRows([]);
    } else {
      setTournamentRows(data || []);
    }

    setTournamentsLoading(false);
  }, [clubId]);

  // NACITANIE KLUBU A PREHLADU
  useEffect(() => {
    async function loadClub() {
      if (!session?.user || !supabase) return;

      const { data, error } = await supabase
        .from('club_members')
        .select('club_id, role, clubs(name)')
        .eq('user_id', session.user.id)
        .limit(1)
        .maybeSingle();

      if (error || !data) {
        setClubId(null);
        return;
      }

      setClubId(data.club_id);
      setClub(data.clubs?.name || 'Môj klub');
      setRole(data.role || '');

      const id = data.club_id;

      const [p, t, m] = await Promise.all([
        supabase.from('players')
          .select('id', { count: 'exact', head: true })
          .eq('club_id', id),
        supabase.from('tournaments')
          .select('id', { count: 'exact', head: true })
          .eq('club_id', id),
        supabase.from('matches')
          .select('id', { count: 'exact', head: true })
          .eq('club_id', id)
      ]);

      setCounts({
        players: p.count ?? '—',
        tournaments: t.count ?? '—',
        matches: m.count ?? '—'
      });
    }

    loadClub();
  }, [session]);

  useEffect(() => {
    if (active === 'Hráči' && clubId) loadPlayers();
  }, [active, clubId, loadPlayers]);

  useEffect(() => {
    if (active === 'Turnaje' && clubId) loadTournaments();
  }, [active, clubId, loadTournaments]);

  // PRIHLASENIE / REGISTRACIA
  async function authenticate(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');

    try {
      if (!supabaseConfigured) {
        throw new Error('Supabase ešte nie je nakonfigurovaný.');
      }

      if (register) {
        const { data, error } = await supabase.auth.signUp({
          email, password
        });
        if (error) throw error;

        setMessage(data.session
          ? 'Účet bol vytvorený.'
          : 'Skontroluj e-mail a potvrď registráciu.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email, password
        });
        if (error) throw error;
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // HRACI - FORMULAR
  function openNewPlayer() {
    setEditingPlayer(null);
    setPlayerName('');
    setPlayerNickname('');
    setPlayerMessage('');
  }

  function openEditPlayer(player) {
    setEditingPlayer(player);
    setPlayerName(player.name || '');
    setPlayerNickname(player.nickname || '');
    setPlayerMessage('');
  }

  async function savePlayer(e) {
    e.preventDefault();

    if (!canManagePlayers) {
      setPlayerMessage('Na túto operáciu nemáš oprávnenie.');
      return;
    }

    if (!playerName.trim() || !clubId) return;

    setSavingPlayer(true);
    setPlayerMessage('');

    const values = {
      name: playerName.trim(),
      nickname: playerNickname.trim() || null
    };

    let result;

    if (editingPlayer) {
      result = await supabase
        .from('players')
        .update(values)
        .eq('id', editingPlayer.id)
        .eq('club_id', clubId);
    } else {
      result = await supabase
        .from('players')
        .insert({
          ...values,
          club_id: clubId,
          active: true
        });
    }

    if (result.error) {
      setPlayerMessage('Chyba: ' + result.error.message);
    } else {
      setPlayerMessage(
        editingPlayer ? 'Údaje hráča boli uložené.' : 'Hráč bol pridaný.'
      );
      setEditingPlayer(null);
      setPlayerName('');
      setPlayerNickname('');
      await loadPlayers();

      const { count } = await supabase
        .from('players')
        .select('id', { count: 'exact', head: true })
        .eq('club_id', clubId);

      setCounts(prev => ({ ...prev, players: count ?? prev.players }));
    }

    setSavingPlayer(false);
  }

  async function togglePlayer(player) {
    if (!canManagePlayers) return;

    const { error } = await supabase
      .from('players')
      .update({ active: !player.active })
      .eq('id', player.id)
      .eq('club_id', clubId);

    if (error) {
      setPlayersError(error.message);
    } else {
      await loadPlayers();
    }
  }

  // TURNAJE - FORMULAR
  function openNewTournament() {
    setEditingTournament(null);
    setTournamentForm({ ...emptyTournament });
    setTournamentMessage('');
    setShowTournamentForm(true);
  }

  function openEditTournament(tournament) {
    setEditingTournament(tournament);

    setTournamentForm({
      name: tournament.name || '',
      game_type: tournament.game_type || '501',
      format: tournament.format || 'single_elimination',
      status: tournament.status || 'planned',
      event_date: tournament.event_date || '',
      start_time: tournament.start_time?.slice(0, 5) || '',
      registration_opens_at: localDateTime(tournament.registration_opens_at),
      registration_closes_at: localDateTime(tournament.registration_closes_at),
      max_players: tournament.max_players ?? '',
      entry_fee: tournament.entry_fee ?? '0',
      location: tournament.location || '',
      board_count: String(tournament.board_count ?? 8)
    });

    setTournamentMessage('');
    setShowTournamentForm(true);
  }

  function updateTournamentField(field, value) {
    setTournamentForm(prev => ({ ...prev, [field]: value }));
  }

  async function saveTournament(e) {
    e.preventDefault();

    if (!canManageTournaments) {
      setTournamentMessage('Na správu turnajov nemáš oprávnenie.');
      return;
    }

    if (!clubId || !tournamentForm.name.trim()) return;

    const boardCount = Number(tournamentForm.board_count);
    const maxPlayers = tournamentForm.max_players === ''
      ? null : Number(tournamentForm.max_players);
    const entryFee = tournamentForm.entry_fee === ''
      ? null : Number(tournamentForm.entry_fee);

    if (!Number.isInteger(boardCount) || boardCount < 1) {
      setTournamentMessage('Počet terčov musí byť minimálne 1.');
      return;
    }

    if (
      maxPlayers !== null &&
      (!Number.isInteger(maxPlayers) || maxPlayers < 2)
    ) {
      setTournamentMessage('Kapacita musí byť minimálne 2 hráči.');
      return;
    }

    if (entryFee !== null && (!Number.isFinite(entryFee) || entryFee < 0)) {
      setTournamentMessage('Štartovné nemôže byť záporné.');
      return;
    }

    const opens = tournamentForm.registration_opens_at
      ? new Date(tournamentForm.registration_opens_at).toISOString()
      : null;

    const closes = tournamentForm.registration_closes_at
      ? new Date(tournamentForm.registration_closes_at).toISOString()
      : null;

    if ((opens && !closes) || (!opens && closes)) {
      setTournamentMessage(
        'Vyplň začiatok aj koniec registrácie, alebo nechaj obe polia prázdne.'
      );
      return;
    }

    if (opens && closes && new Date(opens) >= new Date(closes)) {
      setTournamentMessage(
        'Začiatok registrácie musí byť pred jej ukončením.'
      );
      return;
    }

    setSavingTournament(true);
    setTournamentMessage('');

    const values = {
      club_id: clubId,
      name: tournamentForm.name.trim(),
      game_type: tournamentForm.game_type,
      format: tournamentForm.format,
      status: tournamentForm.status,
      event_date: tournamentForm.event_date || null,
      start_time: tournamentForm.start_time || null,
      registration_opens_at: opens,
      registration_closes_at: closes,
      max_players: maxPlayers,
      entry_fee: entryFee,
      location: tournamentForm.location.trim() || null,
      board_count: boardCount
    };

    let result;

    if (editingTournament) {
      result = await supabase
        .from('tournaments')
        .update(values)
        .eq('id', editingTournament.id)
        .eq('club_id', clubId);
    } else {
      result = await supabase
        .from('tournaments')
        .insert(values);
    }

    if (result.error) {
      setTournamentMessage('Chyba: ' + result.error.message);
    } else {
      setTournamentMessage(
        editingTournament
          ? 'Turnaj bol úspešne upravený.'
          : 'Turnaj bol úspešne vytvorený.'
      );

      setShowTournamentForm(false);
      setEditingTournament(null);
      setTournamentForm({ ...emptyTournament });

      await loadTournaments();

      const { count } = await supabase
        .from('tournaments')
        .select('id', { count: 'exact', head: true })
        .eq('club_id', clubId);

      setCounts(prev => ({
        ...prev,
        tournaments: count ?? prev.tournaments
      }));
    }

    setSavingTournament(false);
  }

  async function changeTournamentStatus(tournament, status) {
    if (!canManageTournaments) return;

    const { error } = await supabase
      .from('tournaments')
      .update({ status })
      .eq('id', tournament.id)
      .eq('club_id', clubId);

    if (error) {
      setTournamentsError(error.message);
    } else {
      await loadTournaments();
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    setActive('Prehľad');
    setPlayerRows([]);
    setTournamentRows([]);
    setClubId(null);
    setRole('');
  }

  // PRIHLASOVACIA OBRAZOVKA
  if (!session) return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="brand-mark"><Target /></div>
          <div>
            <strong>ŠIPKY <span>PRO</span></strong>
            <small>KLUBOVÁ PLATFORMA</small>
          </div>
        </div>

        <div className="eyebrow">VSTUP DO PLATFORMY</div>
        <h1>{register ? 'Vytvorenie účtu' : 'Prihlásenie'}</h1>
        <p className="auth-intro">Vitaj v systéme Šipky Pro.</p>

        <form className="auth-form" onSubmit={authenticate}>
          <label>E-mail</label>
          <input
            type="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
          />
          <label>Heslo</label>
          <input
            type="password"
            required
            minLength="6"
            value={password}
            onChange={e => setPassword(e.target.value)}
          />
          <button className="auth-submit" disabled={busy}>
            {busy ? 'Pracujem…' : register ? 'Vytvoriť účet' : 'Prihlásiť sa'}
          </button>
        </form>

        {error && <div className="auth-alert error">{error}</div>}
        {message && <div className="auth-alert success">{message}</div>}

        <button
          className="auth-switch"
          onClick={() => setRegister(!register)}
        >
          {register
            ? 'Už mám účet – prihlásiť sa'
            : 'Nemám účet – registrácia'}
        </button>
      </div>
    </div>
  );

  const filteredPlayers = playerRows.filter(player => {
    const term = playerSearch.toLowerCase().trim();
    return !term ||
      (player.name || '').toLowerCase().includes(term) ||
      (player.nickname || '').toLowerCase().includes(term);
  });

  const filteredTournaments = tournamentRows.filter(tournament => {
    const term = tournamentSearch.toLowerCase().trim();
    const matchesSearch =
      !term ||
      (tournament.name || '').toLowerCase().includes(term) ||
      (tournament.location || '').toLowerCase().includes(term);

    const matchesFilter =
      tournamentFilter === 'all' ||
      tournament.status === tournamentFilter;

    return matchesSearch && matchesFilter;
  });

  const activeTournamentCount = tournamentRows.filter(
    t => t.status === 'planned' || t.status === 'ongoing'
  ).length;

  return (
    <div className="app-shell">
      <aside className={`sidebar ${menu ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-mark"><Target /></div>
          <div>
            <strong>ŠIPKY <span>PRO</span></strong>
            <small>KLUBOVÁ PLATFORMA</small>
          </div>
          <button className="mobile-close" onClick={() => setMenu(false)}>
            <X />
          </button>
        </div>

        <div className="club-switch">
          <div className="club-avatar"><Club /></div>
          <div className="club-meta">
            <small>AKTUÁLNY KLUB</small>
            <strong>{club}</strong>
          </div>
          <ChevronRight />
        </div>

        <div className="nav-label">MENU</div>
        <nav>
          {navigation.map(([label, Icon]) => (
            <button
              key={label}
              className={`nav-item ${active === label ? 'selected' : ''}`}
              onClick={() => {
                setActive(label);
                setMenu(false);
              }}
            >
              <Icon size={18} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="online"><span /> Systém pripravený</div>
          <div className="user-card">
            <div className="user-avatar"><CircleUserRound /></div>
            <div className="user-info">
              <strong>{session.user.email}</strong>
              <small>{role || 'Prihlásený používateľ'}</small>
            </div>
            <button className="icon-button" onClick={logout}>
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {menu && <button className="scrim" onClick={() => setMenu(false)} />}

      <main className="main">
        <header className="topbar">
          <button className="menu-button" onClick={() => setMenu(true)}>
            <Menu />
          </button>
          <div className="crumb">
            Klub <ChevronRight size={14} /> <strong>{active}</strong>
          </div>
          <div className="top-actions">
            <span className="date">
              <CalendarDays size={15} /> Klubový panel
            </span>
            <button className="icon-button"><Bell /></button>
          </div>
        </header>

        <div className="content">

          {/* MODUL HRACI */}
          {active === 'Hráči' && (
            <>
              <div className="welcome-row">
                <div>
                  <div className="eyebrow">SPRÁVA KLUBU</div>
                  <h1>Hráči</h1>
                  <p>Správa hráčov klubu <b>{club}</b>.</p>
                </div>
                <div className="welcome-mark"><Users size={42} /></div>
              </div>

              <div className="player-summary">
                <div>
                  <span>CELKOVÝ POČET HRÁČOV</span>
                  <strong>{playerRows.length}</strong>
                </div>
                <div>
                  <span>AKTÍVNI HRÁČI</span>
                  <strong>{playerRows.filter(p => p.active).length}</strong>
                </div>
                <div>
                  <span>NEAKTÍVNI HRÁČI</span>
                  <strong>{playerRows.filter(p => !p.active).length}</strong>
                </div>
              </div>

              <section className="panel players-panel">
                <div className="players-toolbar">
                  <div>
                    <div className="eyebrow">ČLENSKÁ ZÁKLADŇA</div>
                    <h2>Zoznam hráčov</h2>
                  </div>
                  {canManagePlayers && (
                    <button className="player-primary" onClick={openNewPlayer}>
                      <Plus size={17} /> Pridať hráča
                    </button>
                  )}
                </div>

                <div className="player-search">
                  <Search size={18} />
                  <input
                    placeholder="Vyhľadať hráča alebo prezývku..."
                    value={playerSearch}
                    onChange={e => setPlayerSearch(e.target.value)}
                  />
                  <button
                    className="icon-button"
                    title="Obnoviť zoznam"
                    onClick={loadPlayers}
                  >
                    <RefreshCw size={16} />
                  </button>
                </div>

                {playersError && (
                  <div className="player-alert error">{playersError}</div>
                )}

                {playerMessage && (
                  <div className="player-alert">{playerMessage}</div>
                )}

                {playersLoading ? (
                  <div className="player-empty">Načítavam hráčov...</div>
                ) : filteredPlayers.length === 0 ? (
                  <div className="player-empty">
                    <Users size={30} />
                    <strong>
                      {playerRows.length === 0
                        ? 'Zatiaľ tu nie sú žiadni hráči.'
                        : 'Nenašli sa žiadni hráči.'}
                    </strong>
                    <span>
                      {playerRows.length === 0
                        ? 'Hráčov môžeš pridať pomocou tlačidla Pridať hráča.'
                        : 'Skús zmeniť hľadaný výraz.'}
                    </span>
                  </div>
                ) : (
                  <div className="players-list">
                    {filteredPlayers.map(player => (
                      <div className="player-row" key={player.id}>
                        <div className="player-avatar">
                          <CircleUserRound size={21} />
                        </div>
                        <div className="player-details">
                          <strong>{player.name}</strong>
                          <span>
                            {player.nickname
                              ? `Prezývka: ${player.nickname}`
                              : 'Bez prezývky'}
                          </span>
                        </div>
                        <span className={`player-status ${player.active ? 'active' : 'inactive'}`}>
                          {player.active ? 'Aktívny' : 'Neaktívny'}
                        </span>
                        {canManagePlayers && (
                          <div className="player-actions">
                            <button
                              className="player-action"
                              title="Upraviť hráča"
                              onClick={() => openEditPlayer(player)}
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              className="player-action"
                              title={player.active ? 'Deaktivovať' : 'Aktivovať'}
                              onClick={() => togglePlayer(player)}
                            >
                              {player.active
                                ? <UserX size={17} />
                                : <UserCheck size={17} />}
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {canManagePlayers ? (
                <section className="panel player-form-panel">
                  <div className="eyebrow">
                    {editingPlayer ? 'ÚPRAVA ZÁZNAMU' : 'NOVÝ ZÁZNAM'}
                  </div>
                  <h2>{editingPlayer ? 'Upraviť hráča' : 'Pridať nového hráča'}</h2>
                  <form className="player-form" onSubmit={savePlayer}>
                    <label>
                      Meno a priezvisko *
                      <input
                        required
                        maxLength="120"
                        value={playerName}
                        onChange={e => setPlayerName(e.target.value)}
                        placeholder="Zadaj meno hráča"
                      />
                    </label>
                    <label>
                      Prezývka
                      <input
                        maxLength="80"
                        value={playerNickname}
                        onChange={e => setPlayerNickname(e.target.value)}
                        placeholder="Zadaj prezývku (nepovinné)"
                      />
                    </label>
                    <div className="player-form-actions">
                      <button
                        type="submit"
                        className="player-primary"
                        disabled={savingPlayer}
                      >
                        <Save size={16} />
                        {savingPlayer
                          ? 'Ukladám...'
                          : editingPlayer ? 'Uložiť zmeny' : 'Pridať hráča'}
                      </button>
                      {(editingPlayer || playerName || playerNickname) && (
                        <button
                          type="button"
                          className="player-secondary"
                          onClick={openNewPlayer}
                        >
                          Zrušiť
                        </button>
                      )}
                    </div>
                  </form>
                </section>
              ) : (
                <div className="player-readonly">
                  <ShieldCheck size={17} />
                  Máš prístup iba na prezeranie hráčov.
                </div>
              )}
            </>
          )}

          {/* MODUL TURNAJE */}
          {active === 'Turnaje' && (
            <>
              <div className="welcome-row">
                <div>
                  <div className="eyebrow">SÚŤAŽNÝ SYSTÉM</div>
                  <h1>Turnaje</h1>
                  <p>Turnaje a súťaže klubu <b>{club}</b>.</p>
                </div>
                <div className="welcome-mark"><Trophy size={42} /></div>
              </div>

              <div className="player-summary">
                <div>
                  <span>VŠETKY TURNAJE</span>
                  <strong>{tournamentRows.length}</strong>
                </div>
                <div>
                  <span>AKTUÁLNE TURNAJE</span>
                  <strong>{activeTournamentCount}</strong>
                </div>
                <div>
                  <span>UKONČENÉ TURNAJE</span>
                  <strong>{tournamentRows.filter(t => t.status === 'completed').length}</strong>
                </div>
              </div>

              <section className="panel players-panel">
                <div className="players-toolbar">
                  <div>
                    <div className="eyebrow">SÚŤAŽNÝ KALENDÁR</div>
                    <h2>Zoznam turnajov</h2>
                  </div>
                  {canManageTournaments && (
                    <button className="player-primary" onClick={openNewTournament}>
                      <Plus size={17} /> Nový turnaj
                    </button>
                  )}
                </div>

                <div className="player-search">
                  <Search size={18} />
                  <input
                    placeholder="Hľadať turnaj alebo miesto..."
                    value={tournamentSearch}
                    onChange={e => setTournamentSearch(e.target.value)}
                  />
                  <button
                    className="icon-button"
                    title="Obnoviť turnaje"
                    onClick={loadTournaments}
                  >
                    <RefreshCw size={16} />
                  </button>
                </div>

                <div className="tournament-filters">
                  {[
                    ['all', 'Všetky'],
                    ['planned', 'Pripravované'],
                    ['ongoing', 'Prebiehajúce'],
                    ['completed', 'Ukončené'],
                    ['cancelled', 'Zrušené']
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      className={`tournament-filter ${tournamentFilter === value ? 'selected' : ''}`}
                      onClick={() => setTournamentFilter(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {tournamentsError && (
                  <div className="player-alert error">{tournamentsError}</div>
                )}

                {tournamentsLoading ? (
                  <div className="player-empty">Načítavam turnaje...</div>
                ) : filteredTournaments.length === 0 ? (
                  <div className="player-empty">
                    <Trophy size={30} />
                    <strong>
                      {tournamentRows.length === 0
                        ? 'Zatiaľ nemáš vytvorený žiadny turnaj.'
                        : 'Nenašli sa žiadne turnaje.'}
                    </strong>
                    <span>
                      {tournamentRows.length === 0
                        ? 'Vytvor prvý turnaj svojho klubu.'
                        : 'Skús zmeniť filter alebo hľadaný výraz.'}
                    </span>
                  </div>
                ) : (
                  <div className="tournaments-list">
                    {filteredTournaments.map(tournament => (
                      <article className="tournament-card" key={tournament.id}>
                        <div className="tournament-card-top">
                          <div className="tournament-icon">
                            <Trophy size={22} />
                          </div>
                          <div className="tournament-title">
                            <strong>{tournament.name}</strong>
                            <span>{tournament.game_type || '501'} • {formatLabel(tournament.format)}</span>
                          </div>
                          <span className={`tournament-status ${tournament.status || 'planned'}`}>
                            {statusLabel(tournament.status)}
                          </span>
                        </div>

                        <div className="tournament-info-grid">
                          <div><Calendar size={15} /><span>{dateLabel(tournament.event_date)}</span></div>
                          <div><Clock size={15} /><span>{tournament.start_time?.slice(0, 5) || 'Čas neurčený'}</span></div>
                          <div><MapPin size={15} /><span>{tournament.location || 'Miesto neurčené'}</span></div>
                          <div><Monitor size={15} /><span>{tournament.board_count} terčov</span></div>
                          <div><Users size={15} /><span>{tournament.max_players || 'Bez limitu'} hráčov</span></div>
                          <div><span className="euro-symbol">€</span><span>{tournament.entry_fee ?? 0} € štartovné</span></div>
                        </div>

                        {canManageTournaments && (
                          <div className="tournament-card-actions">
                            <button
                              className="player-secondary"
                              onClick={() => openEditTournament(tournament)}
                            >
                              <Pencil size={14} /> Upraviť
                            </button>

                            <select
                              className="tournament-status-select"
                              value={tournament.status || 'planned'}
                              onChange={e => changeTournamentStatus(tournament, e.target.value)}
                              aria-label="Zmeniť stav turnaja"
                            >
                              {tournamentStatuses.map(status => (
                                <option key={status.value} value={status.value}>
                                  {status.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
                )}
              </section>

              {showTournamentForm && canManageTournaments && (
                <section className="panel player-form-panel tournament-form-panel">
                  <div className="players-toolbar">
                    <div>
                      <div className="eyebrow">
                        {editingTournament ? 'ÚPRAVA TURNAJA' : 'NOVÝ TURNAJ'}
                      </div>
                      <h2>{editingTournament ? 'Upraviť turnaj' : 'Vytvoriť turnaj'}</h2>
                    </div>
                    <button
                      className="icon-button"
                      onClick={() => setShowTournamentForm(false)}
                      aria-label="Zavrieť formulár"
                    >
                      <X />
                    </button>
                  </div>

                  {tournamentMessage && (
                    <div className="player-alert error">{tournamentMessage}</div>
                  )}

                  <form className="player-form tournament-form" onSubmit={saveTournament}>
                    <label className="full-field">
                      Názov turnaja *
                      <input
                        required
                        maxLength="150"
                        value={tournamentForm.name}
                        onChange={e => updateTournamentField('name', e.target.value)}
                        placeholder="Napríklad Sibírka Open 501"
                      />
                    </label>

                    <label>
                      Typ hry
                      <select
                        value={tournamentForm.game_type}
                        onChange={e => updateTournamentField('game_type', e.target.value)}
                      >
                        <option value="501">501</option>
                        <option value="301">301</option>
                        <option value="701">701</option>
                        <option value="Cricket">Cricket</option>
                      </select>
                    </label>

                    <label>
                      Formát turnaja
                      <select
                        value={tournamentForm.format}
                        onChange={e => updateTournamentField('format', e.target.value)}
                      >
                        {tournamentFormats.map(format => (
                          <option key={format.value} value={format.value}>
                            {format.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      Dátum konania
                      <input
                        type="date"
                        value={tournamentForm.event_date}
                        onChange={e => updateTournamentField('event_date', e.target.value)}
                      />
                    </label>

                    <label>
                      Čas začiatku
                      <input
                        type="time"
                        value={tournamentForm.start_time}
                        onChange={e => updateTournamentField('start_time', e.target.value)}
                      />
                    </label>

                    <label>
                      Miesto konania
                      <input
                        maxLength="200"
                        value={tournamentForm.location}
                        onChange={e => updateTournamentField('location', e.target.value)}
                        placeholder="Adresa alebo názov miesta"
                      />
                    </label>

                    <label>
                      Maximálny počet hráčov
                      <input
                        type="number"
                        min="2"
                        step="1"
                        value={tournamentForm.max_players}
                        onChange={e => updateTournamentField('max_players', e.target.value)}
                        placeholder="Napríklad 32"
                      />
                    </label>

                    <label>
                      Štartovné (€)
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={tournamentForm.entry_fee}
                        onChange={e => updateTournamentField('entry_fee', e.target.value)}
                      />
                    </label>

                    <label>
                      Počet terčov
                      <input
                        type="number"
                        min="1"
                        step="1"
                        required
                        value={tournamentForm.board_count}
                        onChange={e => updateTournamentField('board_count', e.target.value)}
                      />
                    </label>

                    <label>
                      Stav turnaja
                      <select
                        value={tournamentForm.status}
                        onChange={e => updateTournamentField('status', e.target.value)}
                      >
                        {tournamentStatuses.map(status => (
                          <option key={status.value} value={status.value}>
                            {status.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div className="full-field registration-heading">
                      <div className="eyebrow">REGISTRÁCIA</div>
                      <p>Oba dátumy a časy musia byť vyplnené, alebo ponechané prázdne.</p>
                    </div>

                    <label>
                      Začiatok registrácie
                      <input
                        type="datetime-local"
                        value={tournamentForm.registration_opens_at}
                        onChange={e => updateTournamentField('registration_opens_at', e.target.value)}
                      />
                    </label>

                    <label>
                      Koniec registrácie
                      <input
                        type="datetime-local"
                        value={tournamentForm.registration_closes_at}
                        onChange={e => updateTournamentField('registration_closes_at', e.target.value)}
                      />
                    </label>

                    <div className="player-form-actions full-field">
                      <button
                        type="submit"
                        className="player-primary"
                        disabled={savingTournament}
                      >
                        <Save size={16} />
                        {savingTournament
                          ? 'Ukladám...'
                          : editingTournament ? 'Uložiť zmeny' : 'Vytvoriť turnaj'}
                      </button>
                      <button
                        type="button"
                        className="player-secondary"
                        onClick={() => setShowTournamentForm(false)}
                      >
                        Zrušiť
                      </button>
                    </div>
                  </form>
                </section>
              )}

              {!canManageTournaments && (
                <div className="player-readonly">
                  <ShieldCheck size={17} />
                  Máš prístup iba na prezeranie turnajov.
                </div>
              )}
            </>
          )}

          {/* OSTATNE STRANKY */}
          {active !== 'Hráči' && active !== 'Turnaje' && (
            <>
              <div className="welcome-row">
                <div>
                  <div className="eyebrow">KLUBOVÝ PANEL</div>
                  <h1>{active === 'Prehľad' ? 'Dobrý deň!' : active}</h1>
                  <p>Vitaj v systéme Šipky Pro. Klub <b>{club}</b>.</p>
                </div>
                <div className="welcome-mark"><Target size={42} /></div>
              </div>

              <div className="notice">
                <span className="notice-dot" /> Klubové rozhranie Šípky Pro
              </div>

              <section className="stats-grid">
                <Stat icon={<Users />} label="Registrovaní hráči" value={counts.players} />
                <Stat icon={<Trophy />} label="Turnaje" value={counts.tournaments} />
                <Stat icon={<Target />} label="Zápasy" value={counts.matches} />
                <Stat icon={<Activity />} label="Aktivita klubu" value="—" />
              </section>

              <section className="panel-grid">
                <div className="panel main-panel">
                  <div className="eyebrow">RÝCHLY PRÍSTUP</div>
                  <h2>Čo chceš robiť?</h2>
                  <div className="quick-grid">
                    <Quick icon={<Users />} title="Správa hráčov" onClick={() => setActive('Hráči')} />
                    <Quick icon={<Trophy />} title="Nový turnaj" onClick={() => setActive('Turnaje')} />
                    <Quick icon={<Target />} title="Zápasy" onClick={() => setActive('Zápasy')} />
                    <Quick icon={<Activity />} title="Štatistiky" onClick={() => setActive('Štatistiky')} />
                  </div>
                </div>
                <div className="panel side-panel">
                  <div className="eyebrow">VÝVOJ PLATFORMY</div>
                  <h2>Budujeme Šipky Pro</h2>
                  <p>Klubové rozhranie je základom novej platformy.</p>
                </div>
              </section>
            </>
          )}

          <footer>ŠIPKY PRO • Platforma pre šípkarské kluby</footer>
        </div>
      </main>
    </div>
  );
}

function Stat({ icon, label, value }) {
  return (
    <div className="stat-card">
      <div className="stat-top">
        <span className="stat-icon">{icon}</span>
        <span className="stat-trend">KLUB</span>
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function Quick({ icon, title, onClick }) {
  return (
    <button className="quick-card" onClick={onClick}>
      <span className="quick-icon">{icon}</span>
      <strong>{title}</strong>
      <ChevronRight />
    </button>
  );
}
