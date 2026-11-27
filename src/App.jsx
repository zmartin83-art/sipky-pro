
import React, { useEffect, useMemo, useState } from 'react';
import { supabase, supabaseConfigured } from './supabase';
import LiveScore from './LiveScore';
import PublicMatch from './PublicMatch';
import Statistics from './Statistics';
import {
  LayoutDashboard, Users, Trophy, Target, BarChart3, Settings,
  LogOut, Plus, Search, CalendarDays, MapPin, Pencil,
  X, Menu, Shield, UserRound, CheckCircle2, Copy, ExternalLink
} from 'lucide-react';

const NAV = [
  ['Prehľad', LayoutDashboard],
  ['Hráči', Users],
  ['Turnaje', Trophy],
  ['Zápasy', Target],
  ['Štatistiky', BarChart3],
  ['Členovia klubu', Shield],
  ['Nastavenia', Settings],
];

const STATUS = [
  { id: 'all', label: 'Všetky', color: 'gold', icon: Trophy },
  { id: 'planned', label: 'Pripravované', color: 'blue', icon: CalendarDays },
  { id: 'ongoing', label: 'Prebiehajúce', color: 'green', icon: Target },
  { id: 'completed', label: 'Ukončené', color: 'silver', icon: CheckCircle2 },
  { id: 'cancelled', label: 'Zrušené', color: 'red', icon: X },
];

const emptyTournament = {
  name: '',
  game_type: '501',
  format: 'single_elimination',
  status: 'planned',
  event_date: '',
  start_time: '',
  max_players: 32,
  entry_fee: 0,
  location: '',
  board_count: 8,
};

function App() {
  const watchToken = new URLSearchParams(window.location.search).get('watch');

  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authMode, setAuthMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authBusy, setAuthBusy] = useState(false);

  const [page, setPage] = useState('Prehľad');
  const [club, setClub] = useState(null);
  const [role, setRole] = useState('viewer');
  const [players, setPlayers] = useState([]);
  const [tournaments, setTournaments] = useState([]);
  const [search, setSearch] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [playerNickname, setPlayerNickname] = useState('');
  const [tournamentFilter, setTournamentFilter] = useState('all');
  const [showTournamentForm, setShowTournamentForm] = useState(false);
  const [editingTournament, setEditingTournament] = useState(null);
  const [tournamentForm, setTournamentForm] = useState(emptyTournament);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);

  const [matchPlayer1, setMatchPlayer1] = useState('');
  const [matchPlayer2, setMatchPlayer2] = useState('');
  const [matchStarted, setMatchStarted] = useState(false);
  const [liveMatchId, setLiveMatchId] = useState(null);
  const [publicMatchUrl, setPublicMatchUrl] = useState('');
  const [publicLinkError, setPublicLinkError] = useState('');
  const [publicLinkLoading, setPublicLinkLoading] = useState(false);
  const [startingMatch, setStartingMatch] = useState(false);

  // Správu hráčov a turnajov môže vykonávať iba klubový administrátor.
  const canManagePlayers = role === 'admin';
  const canManageTournaments = role === 'admin';

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session?.user) loadClub();
    else {
      setClub(null);
      setPlayers([]);
      setTournaments([]);
    }
  }, [session]);

  async function loadClub() {
    setLoading(true);
    setMessage('');

    const { data, error } = await supabase
      .from('club_members')
      .select('club_id, role, clubs(id, name)')
      .eq('user_id', session.user.id)
      .limit(1)
      .maybeSingle();

    if (error) {
      setMessage('Nepodarilo sa načítať členstvo: ' + error.message);
      setLoading(false);
      return;
    }

    if (!data) {
      setClub(null);
      setMessage('Tento účet zatiaľ nemá priradený klub.');
      setLoading(false);
      return;
    }

    setClub({ id: data.club_id, name: data.clubs?.name || 'Klub' });
    setRole((data.role || 'viewer').toLowerCase());

    await Promise.all([
      loadPlayers(data.club_id),
      loadTournaments(data.club_id),
    ]);

    setLoading(false);
  }

  async function loadPlayers(clubId = club?.id) {
    if (!clubId) return;

    const { data, error } = await supabase
      .from('players')
      .select('id, club_id, name, nickname, active')
      .eq('club_id', clubId)
      .order('name');

    if (error) setMessage('Chyba pri načítaní hráčov: ' + error.message);
    else setPlayers(data || []);
  }

  async function loadTournaments(clubId = club?.id) {
    if (!clubId) return;

    const { data, error } = await supabase
      .from('tournaments')
      .select('*')
      .eq('club_id', clubId)
      .order('event_date', { ascending: true });

    if (error) setMessage('Chyba pri načítaní turnajov: ' + error.message);
    else setTournaments(data || []);
  }

  async function handleAuth(event) {
    event.preventDefault();
    setAuthBusy(true);
    setAuthError('');

    const result = authMode === 'login'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });

    if (result.error) setAuthError(result.error.message);
    else if (authMode === 'register' && !result.data.session) {
      setAuthError('Registrácia prebehla. Potvrď e-mail a potom sa prihlás.');
    }

    setAuthBusy(false);
  }

  async function logout() {
    await supabase.auth.signOut();
    setPage('Prehľad');
    setMatchStarted(false);
    setLiveMatchId(null);
    setPublicMatchUrl('');
    setPublicLinkError('');
    setPublicLinkLoading(false);
  }

  async function addPlayer(event) {
    event.preventDefault();
    if (!canManagePlayers || !playerName.trim() || !club) return;

    const { error } = await supabase.from('players').insert({
      club_id: club.id,
      name: playerName.trim(),
      nickname: playerNickname.trim() || null,
      active: true,
    });

    if (error) setMessage('Hráča sa nepodarilo pridať: ' + error.message);
    else {
      setPlayerName('');
      setPlayerNickname('');
      setMessage('Hráč bol úspešne pridaný.');
      loadPlayers();
    }
  }

  async function togglePlayer(player) {
    if (!canManagePlayers) return;

    const { error } = await supabase
      .from('players')
      .update({ active: !player.active })
      .eq('id', player.id);

    if (error) setMessage(error.message);
    else loadPlayers();
  }

  function openNewTournament() {
    if (!canManageTournaments) return;
    setEditingTournament(null);
    setTournamentForm(emptyTournament);
    setShowTournamentForm(true);
  }

  function openEditTournament(item) {
    if (!canManageTournaments) return;

    setEditingTournament(item.id);
    setTournamentForm({
      name: item.name || '',
      game_type: item.game_type || '501',
      format: item.format || 'single_elimination',
      status: item.status || 'planned',
      event_date: item.event_date || '',
      start_time: item.start_time?.slice(0, 5) || '',
      max_players: item.max_players ?? 32,
      entry_fee: item.entry_fee ?? 0,
      location: item.location || '',
      board_count: item.board_count || 8,
    });
    setShowTournamentForm(true);
  }

  async function saveTournament(event) {
    event.preventDefault();
    if (!canManageTournaments || !club || !tournamentForm.name.trim()) return;

    setBusy(true);

    const payload = {
      ...tournamentForm,
      name: tournamentForm.name.trim(),
      club_id: club.id,
      max_players: tournamentForm.max_players === ''
        ? null
        : Number(tournamentForm.max_players),
      entry_fee: Number(tournamentForm.entry_fee || 0),
      board_count: Number(tournamentForm.board_count || 8),
      event_date: tournamentForm.event_date || null,
      start_time: tournamentForm.start_time || null,
    };

    const result = editingTournament
      ? await supabase.from('tournaments').update(payload).eq('id', editingTournament)
      : await supabase.from('tournaments').insert(payload);

    if (result.error) {
      setMessage('Turnaj sa nepodarilo uložiť: ' + result.error.message);
    } else {
      setMessage(editingTournament ? 'Turnaj bol upravený.' : 'Turnaj bol vytvorený.');
      setShowTournamentForm(false);
      setEditingTournament(null);
      setTournamentForm(emptyTournament);
      await loadTournaments();
    }

    setBusy(false);
  }

  async function createPublicLink(matchId) {
    if (!matchId) {
      setPublicLinkError('Chýba ID živého zápasu.');
      return;
    }

    setPublicLinkLoading(true);
    setPublicLinkError('');

    try {
      const expiresAt = new Date(
        Date.now() + 24 * 60 * 60 * 1000
      ).toISOString();

      const { data, error } = await supabase.rpc(
        'sp_create_match_public_link',
        {
          p_match_id: matchId,
          p_expires_at: expiresAt,
        }
      );

      if (error) throw error;

      const linkResult = Array.isArray(data) ? data[0] : data;
      const token =
        linkResult?.token ||
        linkResult?.public_token ||
        linkResult?.data?.token;

      if (!token) {
        throw new Error(
          linkResult?.message ||
          'Databáza nevrátila platný token verejného odkazu.'
        );
      }

      const url = new URL(window.location.href);
      url.search = '';
      url.searchParams.set('watch', token);

      setPublicMatchUrl(url.toString());
      setPublicLinkError('');
    } catch (error) {
      setPublicLinkError(
        error?.message || 'Verejný odkaz sa nepodarilo vytvoriť.'
      );
    } finally {
      setPublicLinkLoading(false);
    }
  }

  async function startLiveMatch() {
    if (!club || !matchPlayer1 || !matchPlayer2) return;

    if (matchPlayer1 === matchPlayer2) {
      setMessage('Jeden hráč nemôže hrať sám proti sebe.');
      return;
    }

    setStartingMatch(true);
    setMessage('');
    setPublicMatchUrl('');
    setPublicLinkError('');
    setPublicLinkLoading(false);

    try {
      const { data: match, error: matchError } = await supabase
        .from('matches')
        .insert({
          club_id: club.id,
          player1_id: matchPlayer1,
          player2_id: matchPlayer2,
          score1: 501,
          score2: 501,
          live_remaining1: 501,
          live_remaining2: 501,
          live_current_player: 1,
          live_legs1: 0,
          live_legs2: 0,
          live_status: 'playing',
          live_legs_to_win: 3,
          status: 'ongoing',
        })
        .select('id')
        .single();

      if (matchError) throw matchError;
      if (!match?.id) throw new Error('Databáza nevrátila ID zápasu.');

      setLiveMatchId(match.id);
      setMatchStarted(true);
      setMessage('Zápas bol vytvorený. Môžeš spustiť skórovanie.');

      await createPublicLink(match.id);
    } catch (error) {
      setMessage('Zápas sa nepodarilo vytvoriť: ' + error.message);
    } finally {
      setStartingMatch(false);
    }
  }

  async function copyPublicLink() {
    if (!publicMatchUrl) return;

    try {
      await navigator.clipboard.writeText(publicMatchUrl);
      setMessage('Verejný odkaz bol skopírovaný.');
    } catch {
      setMessage('Odkaz sa nepodarilo skopírovať. Označ ho a skopíruj ručne.');
    }
  }

  function leaveLiveMatch() {
    setMatchStarted(false);
    setLiveMatchId(null);
    setPublicMatchUrl('');
    setPublicLinkError('');
    setPublicLinkLoading(false);
  }

  const tournamentStats = useMemo(() => STATUS.map(item => ({
    ...item,
    count: item.id === 'all'
      ? tournaments.length
      : tournaments.filter(t => t.status === item.id).length,
  })), [tournaments]);

  const filteredTournaments = useMemo(() => {
    return tournaments.filter(t => {
      const matchesStatus =
        tournamentFilter === 'all' || t.status === tournamentFilter;

      const matchesSearch = `${t.name} ${t.location || ''}`
        .toLowerCase()
        .includes(search.toLowerCase());

      return matchesStatus && matchesSearch;
    });
  }, [tournaments, tournamentFilter, search]);

  const filteredPlayers = players.filter(p =>
    `${p.name} ${p.nickname || ''}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  const statusLabel = id => ({
    planned: 'Pripravovaný',
    ongoing: 'Prebieha',
    completed: 'Ukončený',
    cancelled: 'Zrušený',
  }[id] || id);

  const formatLabel = id => ({
    single_elimination: 'Vyraďovací pavúk',
    round_robin: 'Každý s každým',
    groups_playoff: 'Skupiny + vyraďovací pavúk',
    groups_then_knockout: 'Skupiny + vyraďovací pavúk',
  }[id] || id);

  if (!supabaseConfigured || !supabase) {
    return (
      <div className="sp-auth">
        <h1>ŠÍPKY PRO</h1>
        <p>Chýba konfigurácia Supabase.</p>
      </div>
    );
  }

  if (watchToken) {
    return <PublicMatch token={watchToken} />;
  }

  if (loading) {
    return (
      <div className="sp-loading">
        <div className="sp-spinner" />
        <p>Načítavam Šípky Pro…</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="sp-auth">
        <form className="sp-auth-card" onSubmit={handleAuth}>
          <div className="sp-logo">ŠÍPKY <span>PRO</span></div>
          <p className="sp-kicker">DARTS MANAGEMENT PLATFORM</p>
          <h1>{authMode === 'login' ? 'Prihlásenie' : 'Vytvoriť účet'}</h1>

          <label>E-mail</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />

          <label>Heslo</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            minLength={6}
          />

          {authError && <p className="sp-error">{authError}</p>}

          <button className="sp-primary" disabled={authBusy}>
            {authBusy
              ? 'Čakaj…'
              : authMode === 'login'
                ? 'Prihlásiť sa'
                : 'Registrovať'}
          </button>

          <button
            type="button"
            className="sp-link"
            onClick={() => {
              setAuthMode(authMode === 'login' ? 'register' : 'login');
              setAuthError('');
            }}
          >
            {authMode === 'login'
              ? 'Nemáš účet? Registrácia'
              : 'Už máš účet? Prihlásenie'}
          </button>
        </form>
      </div>
    );
  }

  if (!club) {
    return (
      <div className="sp-auth">
        <div className="sp-auth-card">
          <div className="sp-logo">ŠÍPKY <span>PRO</span></div>
          <h2>Klub nie je priradený</h2>
          <p>{message || 'Tvoj účet zatiaľ nie je členom žiadneho klubu.'}</p>
          <button className="sp-primary" onClick={logout}>Odhlásiť sa</button>
        </div>
      </div>
    );
  }

  const activePlayers = players.filter(p => p.active);

  return (
    <div className="sp-app">
      <aside className={`sp-sidebar ${mobileMenu ? 'open' : ''}`}>
        <div className="sp-brand">
          <div className="sp-brand-mark">SP</div>
          <div>
            <strong>ŠÍPKY <span>PRO</span></strong>
            <small>DARTS PLATFORM</small>
          </div>
        </div>

        <div className="sp-club">
          <span>AKTUÁLNY KLUB</span>
          <strong>{club.name}</strong>
        </div>

        <nav>
          {NAV.map(([label, Icon]) => (
            <button
              key={label}
              className={page === label ? 'selected' : ''}
              onClick={() => {
                setPage(label);
                setMobileMenu(false);
                setSearch('');
              }}
            >
              <Icon size={19} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="sp-sidebar-bottom">
          <span className="sp-role">{role.toUpperCase()}</span>
          <button onClick={logout}>
            <LogOut size={18} /> Odhlásiť sa
          </button>
        </div>
      </aside>

      <main className="sp-main">
        <header className="sp-topbar">
          <button
            className="sp-menu"
            onClick={() => setMobileMenu(!mobileMenu)}
          >
            <Menu />
          </button>

          <div>
            <span>KLUB</span>
            <strong>{club.name}</strong>
          </div>

          <div className="sp-user">
            <UserRound size={18} />
            <span>{session.user.email}</span>
          </div>
        </header>

        <section className="sp-content">
          {message && (
            <div className="sp-message">
              {message}
              <button onClick={() => setMessage('')}>
                <X size={16} />
              </button>
            </div>
          )}

          {page === 'Prehľad' && (
            <>
              <div className="sp-page-title">
                <div>
                  <span className="sp-kicker">KLUBOVÝ SYSTÉM</span>
                  <h1>Prehľad</h1>
                  <p>Vitaj v platforme Šípky Pro.</p>
                </div>
              </div>

              <div className="sp-overview-grid">
                <div className="sp-overview-card">
                  <Users />
                  <span>Hráči</span>
                  <strong>{players.length}</strong>
                </div>
                <div className="sp-overview-card">
                  <Trophy />
                  <span>Turnaje</span>
                  <strong>{tournaments.length}</strong>
                </div>
                <div className="sp-overview-card">
                  <Target />
                  <span>Prebiehajúce turnaje</span>
                  <strong>{tournaments.filter(t => t.status === 'ongoing').length}</strong>
                </div>
              </div>

              <div className="sp-panel">
                <h2>Posledné turnaje</h2>
                {tournaments.slice(0, 5).map(t => (
                  <div className="sp-list-row" key={t.id}>
                    <strong>{t.name}</strong>
                    <span>{statusLabel(t.status)}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {page === 'Hráči' && (
            <>
              <div className="sp-page-title">
                <div>
                  <span className="sp-kicker">KLUBOVÁ EVIDENCIA</span>
                  <h1>Hráči</h1>
                  <p>Správa hráčov klubu {club.name}.</p>
                </div>
              </div>

              {canManagePlayers && (
                <form className="sp-add-form" onSubmit={addPlayer}>
                  <input
                    placeholder="Meno hráča"
                    value={playerName}
                    onChange={e => setPlayerName(e.target.value)}
                    required
                  />
                  <input
                    placeholder="Prezývka (nepovinné)"
                    value={playerNickname}
                    onChange={e => setPlayerNickname(e.target.value)}
                  />
                  <button className="sp-primary">
                    <Plus size={17} /> Pridať hráča
                  </button>
                </form>
              )}

              <div className="sp-toolbar">
                <div className="sp-search">
                  <Search size={17} />
                  <input
                    placeholder="Hľadať hráča…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                </div>
                <span>{filteredPlayers.length} hráčov</span>
              </div>

              <div className="sp-panel">
                {filteredPlayers.map(p => (
                  <div className="sp-player-row" key={p.id}>
                    <div className="sp-avatar">
                      {p.name?.[0]?.toUpperCase()}
                    </div>
                    <div className="sp-player-info">
                      <strong>{p.name}</strong>
                      <small>{p.nickname || 'Bez prezývky'}</small>
                    </div>
                    <span className={p.active ? 'sp-active' : 'sp-inactive'}>
                      {p.active ? 'Aktívny' : 'Neaktívny'}
                    </span>
                    {canManagePlayers && (
                      <button
                        className="sp-icon-btn"
                        onClick={() => togglePlayer(p)}
                      >
                        {p.active ? 'Deaktivovať' : 'Aktivovať'}
                      </button>
                    )}
                  </div>
                ))}

                {!filteredPlayers.length && (
                  <p className="sp-empty">Nenašli sa žiadni hráči.</p>
                )}
              </div>
            </>
          )}

          {page === 'Turnaje' && (
            <>
              <div className="sp-page-title sp-tournament-title">
                <div>
                  <span className="sp-kicker">ŠÍPKY PRO / SÚŤAŽE</span>
                  <h1>Turnaje</h1>
                  <p>Prehľad a správa všetkých klubových turnajov</p>
                </div>

                {canManageTournaments && (
                  <button className="sp-primary" onClick={openNewTournament}>
                    <Plus size={18} /> Nový turnaj
                  </button>
                )}
              </div>

              <div className="sp-tournament-stats">
                {tournamentStats.map(item => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setTournamentFilter(item.id)}
                      className={`sp-stat ${item.color} ${tournamentFilter === item.id ? 'active' : ''}`}
                    >
                      <Icon size={21} />
                      <strong>{item.count}</strong>
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>

              <div className="sp-toolbar">
                <div className="sp-search">
                  <Search size={17} />
                  <input
                    placeholder="Hľadať turnaj…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                </div>
                <span>{filteredTournaments.length} turnajov</span>
              </div>

              <div className="sp-tournament-list">
                {filteredTournaments.map(t => (
                  <article className="sp-tournament-card" key={t.id}>
                    <div className="sp-tournament-card-top">
                      <span className={`sp-status ${t.status}`}>
                        {statusLabel(t.status)}
                      </span>
                      <span className="sp-game">{t.game_type || '501'}</span>
                    </div>

                    <h2>{t.name}</h2>
                    <p className="sp-format">{formatLabel(t.format)}</p>

                    <div className="sp-tournament-meta">
                      <span>
                        <CalendarDays size={15} />
                        {t.event_date || 'Dátum neurčený'} {t.start_time?.slice(0, 5) || ''}
                      </span>
                      <span>
                        <MapPin size={15} />
                        {t.location || 'Miesto neurčené'}
                      </span>
                      <span>
                        <Users size={15} />
                        {t.max_players || 'Bez limitu'} hráčov
                      </span>
                      <span>
                        <Target size={15} />
                        {t.board_count} terčov
                      </span>
                    </div>

                    <div className="sp-tournament-card-bottom">
                      <span>
                        Štartovné: <strong>{Number(t.entry_fee || 0).toFixed(2)} €</strong>
                      </span>
                      {canManageTournaments && (
                        <button
                          className="sp-outline"
                          onClick={() => openEditTournament(t)}
                        >
                          <Pencil size={15} /> Upraviť
                        </button>
                      )}
                    </div>
                  </article>
                ))}

                {!filteredTournaments.length && (
                  <div className="sp-empty-panel">
                    V tejto kategórii zatiaľ nie sú žiadne turnaje.
                  </div>
                )}
              </div>
            </>
          )}

          {page === 'Zápasy' && (
            <>
              {!matchStarted ? (
                <>
                  <div className="sp-page-title">
                    <div>
                      <span className="sp-kicker">ŠÍPKY PRO / SÚŤAŽE</span>
                      <h1>Zápasy</h1>
                      <p>Príprava a živé skórovanie zápasov.</p>
                    </div>
                  </div>

                  <div className="sp-panel">
                    <h2>Nový živý zápas – 501 Double Out</h2>

                    <div className="sp-form-grid">
                      <label>
                        Prvý hráč
                        <select
                          value={matchPlayer1}
                          onChange={e => setMatchPlayer1(e.target.value)}
                        >
                          <option value="">Vyber hráča</option>
                          {activePlayers.map(p => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label>
                        Druhý hráč
                        <select
                          value={matchPlayer2}
                          onChange={e => setMatchPlayer2(e.target.value)}
                        >
                          <option value="">Vyber hráča</option>
                          {activePlayers.map(p => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <button
                      className="sp-primary"
                      style={{ marginTop: 20 }}
                      disabled={
                        startingMatch ||
                        !matchPlayer1 ||
                        !matchPlayer2 ||
                        matchPlayer1 === matchPlayer2
                      }
                      onClick={startLiveMatch}
                    >
                      <Target size={18} />
                      {startingMatch ? 'Vytváram zápas…' : 'Vytvoriť a spustiť zápas'}
                    </button>

                    {activePlayers.length < 2 && (
                      <p className="sp-empty">
                        Na spustenie zápasu potrebuješ aspoň dvoch aktívnych hráčov.
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <button
                    className="sp-outline"
                    style={{ marginBottom: 15 }}
                    onClick={leaveLiveMatch}
                  >
                    ← Späť na zápasy
                  </button>

                  <div className="sp-public-link">
                    <div>
                      <strong>Verejný odkaz pre divákov</strong>
                      <p>
                        Pošli tento odkaz ľuďom, ktorí chcú sledovať zápas online.
                      </p>

                      {publicMatchUrl ? (
                        <input
                          readOnly
                          value={publicMatchUrl}
                          onFocus={e => e.target.select()}
                        />
                      ) : (
                        <p className="sp-error">
                          {publicLinkLoading
                            ? 'Vytváram verejný odkaz…'
                            : publicLinkError ||
                              'Verejný odkaz zatiaľ nie je vytvorený.'}
                        </p>
                      )}
                    </div>

                    <div className="sp-link-actions">
                      {publicMatchUrl ? (
                        <>
                          <button
                            className="sp-primary"
                            onClick={copyPublicLink}
                          >
                            <Copy size={16} /> Kopírovať odkaz
                          </button>

                          <a
                            className="sp-outline"
                            href={publicMatchUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <ExternalLink size={16} /> Otvoriť
                          </a>
                        </>
                      ) : (
                        <button
                          className="sp-primary"
                          disabled={publicLinkLoading || !liveMatchId}
                          onClick={() => createPublicLink(liveMatchId)}
                        >
                          {publicLinkLoading
                            ? 'Vytváram…'
                            : 'Vytvoriť odkaz'}
                        </button>
                      )}
                    </div>
                  </div>

                  <LiveScore
                    matchId={liveMatchId}
                    player1={players.find(p => p.id === matchPlayer1)?.name || 'Hráč 1'}
                    player2={players.find(p => p.id === matchPlayer2)?.name || 'Hráč 2'}
                    onFinish={result => {
                      setMessage(
                        `Výsledok zápasu: ${result.legs[0]} : ${result.legs[1]}.`
                      );
                      setMatchStarted(false);
                      setPage('Zápasy');
                    }}
                  />
                </>
              )}
            </>
          )}

          {page === 'Štatistiky' ? (
            <Statistics clubId={club?.id} players={players} role={role} />
          ) : page !== 'Prehľad' &&
            page !== 'Hráči' &&
            page !== 'Turnaje' &&
            page !== 'Zápasy' &&
            page !== 'Štatistiky' && (
              <div className="sp-page-title">
                <div>
                  <span className="sp-kicker">ŠÍPKY PRO</span>
                  <h1>{page}</h1>
                  <p>Tento modul bude nasledovať v ďalšej fáze vývoja.</p>
                </div>
              </div>
            )}
        </section>
      </main>

      {showTournamentForm && canManageTournaments && (
        <div
          className="sp-modal-backdrop"
          onClick={() => setShowTournamentForm(false)}
        >
          <form
            className="sp-modal"
            onSubmit={saveTournament}
            onClick={e => e.stopPropagation()}
          >
            <div className="sp-modal-head">
              <div>
                <span className="sp-kicker">SPRÁVA SÚŤAŽÍ</span>
                <h2>{editingTournament ? 'Upraviť turnaj' : 'Nový turnaj'}</h2>
              </div>
              <button
                type="button"
                className="sp-icon-btn"
                onClick={() => setShowTournamentForm(false)}
              >
                <X />
              </button>
            </div>

            <label>
              Názov turnaja
              <input
                value={tournamentForm.name}
                onChange={e => setTournamentForm({
                  ...tournamentForm,
                  name: e.target.value
                })}
                required
              />
            </label>

            <div className="sp-form-grid">
              <label>
                Typ hry
                <select
                  value={tournamentForm.game_type}
                  onChange={e => setTournamentForm({
                    ...tournamentForm,
                    game_type: e.target.value
                  })}
                >
                  <option value="501">501</option>
                  <option value="301">301</option>
                  <option value="701">701</option>
                  <option value="Cricket">Cricket</option>
                </select>
              </label>

              <label>
                Formát
                <select
                  value={tournamentForm.format}
                  onChange={e => setTournamentForm({
                    ...tournamentForm,
                    format: e.target.value
                  })}
                >
                  <option value="single_elimination">Vyraďovací pavúk</option>
                  <option value="round_robin">Každý s každým</option>
                  <option value="groups_playoff">Skupiny + pavúk</option>
                </select>
              </label>

              <label>
                Stav
                <select
                  value={tournamentForm.status}
                  onChange={e => setTournamentForm({
                    ...tournamentForm,
                    status: e.target.value
                  })}
                >
                  <option value="planned">Pripravovaný</option>
                  <option value="ongoing">Prebieha</option>
                  <option value="completed">Ukončený</option>
                  <option value="cancelled">Zrušený</option>
                </select>
              </label>

              <label>
                Dátum
                <input
                  type="date"
                  value={tournamentForm.event_date}
                  onChange={e => setTournamentForm({
                    ...tournamentForm,
                    event_date: e.target.value
                  })}
                />
              </label>

              <label>
                Čas
                <input
                  type="time"
                  value={tournamentForm.start_time}
                  onChange={e => setTournamentForm({
                    ...tournamentForm,
                    start_time: e.target.value
                  })}
                />
              </label>

              <label>
                Počet hráčov
                <input
                  type="number"
                  min="2"
                  value={tournamentForm.max_players}
                  onChange={e => setTournamentForm({
                    ...tournamentForm,
                    max_players: e.target.value
                  })}
                />
              </label>

              <label>
                Štartovné (€)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={tournamentForm.entry_fee}
                  onChange={e => setTournamentForm({
                    ...tournamentForm,
                    entry_fee: e.target.value
                  })}
                />
              </label>

              <label>
                Počet terčov
                <input
                  type="number"
                  min="1"
                  value={tournamentForm.board_count}
                  onChange={e => setTournamentForm({
                    ...tournamentForm,
                    board_count: e.target.value
                  })}
                />
              </label>
            </div>

            <label>
              Miesto konania
              <input
                value={tournamentForm.location}
                onChange={e => setTournamentForm({
                  ...tournamentForm,
                  location: e.target.value
                })}
              />
            </label>

            <div className="sp-modal-actions">
              <button
                type="button"
                className="sp-outline"
                onClick={() => setShowTournamentForm(false)}
              >
                Zrušiť
              </button>
              <button className="sp-primary" disabled={busy}>
                {busy ? 'Ukladám…' : 'Uložiť turnaj'}
              </button>
            </div>
          </form>
        </div>
      )}

      <style>{`
        :root {
          --navy:#0b1425;
          --panel:#111f35;
          --panel2:#172944;
          --gold:#d9b45c;
          --gold2:#f1d58d;
          --white:#f5f7fb;
          --muted:#9eacc1;
          --line:rgba(255,255,255,.09);
        }

        * { box-sizing:border-box; }
        body {
          margin:0;
          background:var(--navy);
          color:var(--white);
          font-family:Inter,system-ui,-apple-system,sans-serif;
        }
        button,input,select { font:inherit; }
        button { cursor:pointer; }

        .sp-app {
          min-height:100vh;
          background:radial-gradient(ellipse at 75% 0%,#172944 0%,#0b1425 48%);
          display:flex;
        }
        .sp-sidebar {
          width:245px;
          flex-shrink:0;
          background:#0a1221;
          border-right:1px solid var(--line);
          padding:25px 16px;
          display:flex;
          flex-direction:column;
          min-height:100vh;
        }
        .sp-brand {
          display:flex;
          align-items:center;
          gap:12px;
          padding:0 8px 27px;
          border-bottom:1px solid var(--line);
        }
        .sp-brand-mark {
          width:43px;
          height:43px;
          border-radius:13px;
          background:linear-gradient(135deg,#f1d58d,#b78935);
          color:#101a2c;
          display:grid;
          place-items:center;
          font-weight:950;
        }
        .sp-brand strong {
          display:block;
          font-size:17px;
          letter-spacing:1px;
        }
        .sp-brand strong span { color:var(--gold); }
        .sp-brand small {
          font-size:9px;
          letter-spacing:2px;
          color:var(--muted);
        }
        .sp-club {
          margin:25px 7px 20px;
          padding:13px;
          background:#111f35;
          border:1px solid var(--line);
          border-radius:12px;
        }
        .sp-club span {
          display:block;
          font-size:9px;
          letter-spacing:1.5px;
          color:var(--muted);
          margin-bottom:7px;
        }
        .sp-club strong { color:var(--gold2); }
        .sp-sidebar nav { display:grid; gap:6px; }
        .sp-sidebar nav button,
        .sp-sidebar-bottom button {
          border:0;
          background:transparent;
          color:#aebbd0;
          display:flex;
          align-items:center;
          gap:12px;
          padding:12px;
          border-radius:10px;
          text-align:left;
        }
        .sp-sidebar nav button.selected {
          background:linear-gradient(100deg,rgba(217,180,92,.2),rgba(217,180,92,.04));
          color:var(--gold2);
          border:1px solid rgba(217,180,92,.25);
        }
        .sp-sidebar nav button:hover,
        .sp-sidebar-bottom button:hover {
          background:#172944;
          color:white;
        }
        .sp-sidebar-bottom {
          margin-top:auto;
          border-top:1px solid var(--line);
          padding-top:18px;
        }
        .sp-role {
          display:inline-block;
          color:var(--gold);
          font-size:10px;
          letter-spacing:1px;
          padding:6px 9px;
          border:1px solid rgba(217,180,92,.25);
          border-radius:7px;
          margin:0 0 10px 8px;
        }

        .sp-main { min-width:0; flex:1; }
        .sp-topbar {
          height:75px;
          border-bottom:1px solid var(--line);
          display:flex;
          align-items:center;
          justify-content:space-between;
          padding:0 34px;
          background:rgba(10,18,33,.7);
        }
        .sp-topbar>div:first-of-type span {
          display:block;
          color:var(--muted);
          font-size:9px;
          letter-spacing:1.5px;
        }
        .sp-topbar>div:first-of-type strong { color:var(--gold2); }
        .sp-user {
          display:flex;
          align-items:center;
          gap:9px;
          color:var(--muted);
          font-size:12px;
        }
        .sp-content {
          padding:32px;
          max-width:1450px;
          margin:auto;
        }
        .sp-page-title {
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:20px;
          margin-bottom:25px;
        }
        .sp-kicker {
          font-size:10px;
          font-weight:800;
          letter-spacing:2px;
          color:var(--gold);
        }
        .sp-page-title h1 {
          font-size:32px;
          margin:7px 0;
          color:white;
        }
        .sp-page-title p {
          margin:0;
          color:var(--muted);
          font-size:13px;
        }
        .sp-primary {
          border:1px solid #f1d58d;
          background:linear-gradient(135deg,#f1d58d,#bd903c);
          color:#101a2c;
          font-weight:850;
          border-radius:11px;
          padding:12px 17px;
          display:inline-flex;
          align-items:center;
          justify-content:center;
          gap:8px;
          text-decoration:none;
        }
        .sp-primary:hover { filter:brightness(1.08); }
        .sp-primary:disabled { opacity:.6; cursor:not-allowed; }

        .sp-tournament-stats {
          display:grid;
          grid-template-columns:repeat(5,minmax(0,1fr));
          gap:13px;
          margin:20px 0 24px;
        }
        .sp-stat {
          min-height:128px;
          border:1px solid rgba(255,255,255,.09);
          border-top:3px solid var(--gold);
          border-radius:15px;
          background:linear-gradient(145deg,#172944,#101c30);
          color:white;
          padding:17px;
          display:flex;
          flex-direction:column;
          align-items:flex-start;
          justify-content:center;
          gap:8px;
          text-align:left;
          transition:.18s;
        }
        .sp-stat strong { font-size:29px; line-height:1; }
        .sp-stat span { font-size:12px; color:#c1cde0; font-weight:700; }
        .sp-stat.gold { border-top-color:#d9b45c; }
        .sp-stat.blue { border-top-color:#559be8; }
        .sp-stat.green { border-top-color:#39bd85; }
        .sp-stat.silver { border-top-color:#91a4bd; }
        .sp-stat.red { border-top-color:#e36b72; }
        .sp-stat.active {
          border-color:var(--gold);
          box-shadow:0 0 0 1px rgba(217,180,92,.25),0 9px 25px #0005;
          transform:translateY(-2px);
        }
        .sp-stat.blue svg { color:#73b5ff; }
        .sp-stat.green svg { color:#54d7a0; }
        .sp-stat.silver svg { color:#b4c4d9; }
        .sp-stat.red svg { color:#ff8188; }
        .sp-stat.gold svg { color:var(--gold2); }

        .sp-toolbar {
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:15px;
          margin:20px 0;
          color:var(--muted);
          font-size:12px;
        }
        .sp-search {
          display:flex;
          align-items:center;
          gap:9px;
          max-width:390px;
          width:100%;
          border:1px solid rgba(217,180,92,.22);
          background:#111f35;
          border-radius:10px;
          padding:0 12px;
          color:var(--gold);
        }
        .sp-search input {
          width:100%;
          border:0!important;
          background:transparent!important;
          color:white!important;
          outline:0;
          padding:12px 0!important;
        }

        .sp-tournament-list {
          display:grid;
          grid-template-columns:repeat(2,minmax(0,1fr));
          gap:15px;
        }
        .sp-tournament-card,.sp-panel {
          background:linear-gradient(145deg,#14243b,#101c30);
          border:1px solid var(--line);
          border-radius:15px;
          padding:20px;
        }
        .sp-tournament-card-top {
          display:flex;
          justify-content:space-between;
          align-items:center;
        }
        .sp-status {
          font-size:10px;
          font-weight:800;
          padding:6px 10px;
          border-radius:20px;
          background:#24354c;
          color:#cbd7e7;
        }
        .sp-status.planned { background:#193657; color:#8fc5ff; }
        .sp-status.ongoing { background:#123d32; color:#70e0b0; }
        .sp-status.completed { background:#29394a; color:#c1d0e2; }
        .sp-status.cancelled { background:#48242b; color:#ff9ca3; }
        .sp-game { font-weight:900; color:var(--gold2); font-size:13px; }
        .sp-tournament-card h2 { font-size:19px; margin:17px 0 5px; }
        .sp-format { font-size:12px; color:var(--gold); margin:0 0 17px; }
        .sp-tournament-meta {
          display:grid;
          grid-template-columns:1fr 1fr;
          gap:11px;
          color:var(--muted);
          font-size:11px;
        }
        .sp-tournament-meta span {
          display:flex;
          align-items:center;
          gap:7px;
        }
        .sp-tournament-meta svg { color:var(--gold); }
        .sp-tournament-card-bottom {
          display:flex;
          align-items:center;
          justify-content:space-between;
          border-top:1px solid var(--line);
          margin-top:18px;
          padding-top:14px;
          color:var(--muted);
          font-size:12px;
        }
        .sp-tournament-card-bottom strong { color:var(--gold2); }
        .sp-outline {
          border:1px solid rgba(217,180,92,.4);
          background:rgba(217,180,92,.07);
          color:var(--gold2);
          padding:8px 11px;
          border-radius:9px;
          display:inline-flex;
          align-items:center;
          gap:7px;
          text-decoration:none;
        }
        .sp-outline:hover { background:rgba(217,180,92,.16); }

        .sp-overview-grid {
          display:grid;
          grid-template-columns:repeat(3,1fr);
          gap:15px;
          margin-bottom:22px;
        }
        .sp-overview-card {
          background:linear-gradient(145deg,#172944,#101c30);
          border:1px solid var(--line);
          border-radius:15px;
          padding:22px;
          display:grid;
          gap:10px;
        }
        .sp-overview-card svg { color:var(--gold); }
        .sp-overview-card span { font-size:12px; color:var(--muted); }
        .sp-overview-card strong { font-size:29px; }
        .sp-panel h2 { font-size:17px; margin:0 0 15px; }
        .sp-list-row,.sp-player-row {
          display:flex;
          align-items:center;
          gap:13px;
          padding:13px 0;
          border-top:1px solid var(--line);
        }
        .sp-list-row span {
          margin-left:auto;
          color:var(--gold);
          font-size:12px;
        }
        .sp-add-form { display:flex; gap:10px; margin:20px 0; }
        .sp-add-form input { flex:1; }
        .sp-player-row { min-height:65px; }
        .sp-avatar {
          width:38px;
          height:38px;
          border-radius:12px;
          background:#263a55;
          color:var(--gold2);
          display:grid;
          place-items:center;
          font-weight:900;
        }
        .sp-player-info { display:grid; gap:4px; flex:1; }
        .sp-player-info small { color:var(--muted); }
        .sp-active { color:#61dba4; font-size:11px; }
        .sp-inactive { color:#f28b91; font-size:11px; }
        .sp-icon-btn {
          border:0;
          background:transparent;
          color:var(--gold2);
          padding:7px;
        }
        .sp-empty { color:var(--muted); text-align:center; padding:35px; }
        .sp-empty-panel {
          color:var(--muted);
          text-align:center;
          padding:35px;
          grid-column:1/-1;
          border:1px dashed rgba(217,180,92,.25);
          border-radius:14px;
        }

        .sp-public-link {
          display:flex;
          justify-content:space-between;
          align-items:center;
          gap:18px;
          padding:18px;
          margin-bottom:20px;
          background:#111f35;
          border:1px solid rgba(217,180,92,.3);
          border-radius:14px;
        }
        .sp-public-link strong { color:var(--gold2); }
        .sp-public-link p {
          color:var(--muted);
          font-size:12px;
          margin:6px 0 12px;
        }
        .sp-public-link input {
          max-width:600px;
          color:#dce5f2;
        }
        .sp-link-actions {
          display:flex;
          flex-wrap:wrap;
          gap:9px;
        }

        input,select {
          width:100%;
          border:1px solid rgba(217,180,92,.24);
          background:#0d192b;
          color:white;
          border-radius:9px;
          padding:11px 12px;
          outline:none;
        }
        input:focus,select:focus { border-color:var(--gold); }
        label {
          display:grid;
          gap:7px;
          color:#c2cee0;
          font-size:12px;
          font-weight:700;
        }
        .sp-modal-backdrop {
          position:fixed;
          inset:0;
          background:#030914d9;
          z-index:50;
          display:grid;
          place-items:center;
          padding:18px;
          overflow:auto;
        }
        .sp-modal {
          width:min(650px,100%);
          max-height:95vh;
          overflow:auto;
          background:#101e33;
          border:1px solid rgba(217,180,92,.3);
          border-radius:18px;
          padding:24px;
          display:grid;
          gap:15px;
          box-shadow:0 25px 80px #0009;
        }
        .sp-modal-head {
          display:flex;
          justify-content:space-between;
          align-items:center;
        }
        .sp-modal-head h2 { margin:5px 0 0; }
        .sp-form-grid {
          display:grid;
          grid-template-columns:1fr 1fr;
          gap:13px;
        }
        .sp-modal-actions {
          display:flex;
          justify-content:flex-end;
          gap:10px;
          margin-top:8px;
        }
        .sp-message {
          padding:12px 15px;
          border:1px solid rgba(217,180,92,.3);
          background:#172944;
          border-radius:10px;
          color:var(--gold2);
          margin-bottom:18px;
          display:flex;
          justify-content:space-between;
          gap:12px;
        }
        .sp-message button {
          border:0;
          background:none;
          color:var(--gold2);
        }

        .sp-auth {
          min-height:100vh;
          background:radial-gradient(ellipse at 50% 0%,#1b3150,#0b1425 65%);
          display:grid;
          place-items:center;
          padding:20px;
        }
        .sp-auth-card {
          width:min(410px,100%);
          background:#111f35;
          border:1px solid rgba(217,180,92,.3);
          border-radius:20px;
          padding:32px;
          display:grid;
          gap:13px;
          box-shadow:0 25px 80px #0006;
        }
        .sp-logo {
          font-size:28px;
          font-weight:950;
          letter-spacing:2px;
        }
        .sp-logo span { color:var(--gold); }
        .sp-auth-card h1 { margin:5px 0; }
        .sp-auth-card label { margin-top:6px; }
        .sp-link {
          background:none;
          border:0;
          color:var(--gold2);
          padding:10px;
        }
        .sp-error { color:#ff999f; font-size:12px; }
        .sp-loading {
          min-height:100vh;
          background:var(--navy);
          display:grid;
          place-content:center;
          justify-items:center;
          color:var(--gold2);
        }
        .sp-spinner {
          width:35px;
          height:35px;
          border:3px solid #34445b;
          border-top-color:var(--gold);
          border-radius:50%;
          animation:sp-spin .8s linear infinite;
        }
        @keyframes sp-spin { to { transform:rotate(360deg); } }
        .sp-menu {
          display:none;
          background:none;
          border:0;
          color:var(--gold);
        }

        @media(max-width:1000px) {
          .sp-tournament-stats { grid-template-columns:repeat(3,1fr); }
        }
        @media(max-width:700px) {
          .sp-sidebar {
            position:fixed;
            z-index:40;
            left:-260px;
            top:0;
            transition:.2s;
          }
          .sp-sidebar.open { left:0; }
          .sp-menu { display:block; }
          .sp-topbar { padding:0 15px; gap:12px; }
          .sp-user span { display:none; }
          .sp-content { padding:20px 14px; }
          .sp-page-title {
            align-items:flex-start;
            flex-direction:column;
          }
          .sp-tournament-title .sp-primary { width:100%; }
          .sp-tournament-stats {
            grid-template-columns:repeat(2,minmax(0,1fr));
            gap:9px;
          }
          .sp-stat { min-height:110px; padding:13px; }
          .sp-stat strong { font-size:25px; }
          .sp-stat span { font-size:11px; }
          .sp-tournament-list { grid-template-columns:1fr; }
          .sp-overview-grid { grid-template-columns:1fr; }
          .sp-add-form { flex-direction:column; }
          .sp-form-grid { grid-template-columns:1fr; }
          .sp-toolbar { align-items:flex-start; }
          .sp-tournament-meta { grid-template-columns:1fr 1fr; }
          .sp-tournament-card { padding:16px; }
          .sp-public-link {
            flex-direction:column;
            align-items:stretch;
          }
          .sp-link-actions { flex-direction:column; }
          .sp-link-actions>* { justify-content:center; }
        }
      `}</style>
    </div>
  );
}

export default App;
