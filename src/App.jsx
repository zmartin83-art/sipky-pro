
import React, { useEffect, useState } from 'react';
import {
  Activity, Bell, CalendarDays, ChevronRight,
  CircleUserRound, Club, LayoutDashboard, LogOut, Menu, Settings, ShieldCheck,
  Target, Trophy, Users, X
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

export default function App() {
  const [active, setActive] = useState('Prehľad');
  const [session, setSession] = useState(null);
  const [club, setClub] = useState('Sibírka');
  const [counts, setCounts] = useState({ players: '—', tournaments: '—', matches: '—' });
  const [menu, setMenu] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [register, setRegister] = useState(false);

  useEffect(() => {
    if (!supabaseConfigured) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    async function load() {
      if (!session?.user || !supabase) return;
      const { data } = await supabase
        .from('club_members')
        .select('club_id, clubs(name)')
        .eq('user_id', session.user.id)
        .limit(1)
        .maybeSingle();

      if (!data) return;
      setClub(data.clubs?.name || 'Môj klub');
      const id = data.club_id;
      const [p, t, m] = await Promise.all([
        supabase.from('players').select('id', { count: 'exact', head: true }).eq('club_id', id),
        supabase.from('tournaments').select('id', { count: 'exact', head: true }).eq('club_id', id),
        supabase.from('matches').select('id', { count: 'exact', head: true }).eq('club_id', id)
      ]);
      setCounts({
        players: p.count ?? '—',
        tournaments: t.count ?? '—',
        matches: m.count ?? '—'
      });
    }
    load();
  }, [session]);

  async function authenticate(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (!supabaseConfigured) throw new Error('Supabase ešte nie je nakonfigurovaný.');
      if (register) {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMessage(data.session ? 'Účet bol vytvorený.' : 'Skontroluj e-mail a potvrď registráciu.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!session) return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="brand-mark"><Target /></div>
          <div><strong>ŠIPKY <span>PRO</span></strong><small>KLUBOVÁ PLATFORMA</small></div>
        </div>
        <div className="eyebrow">VSTUP DO PLATFORMY</div>
        <h1>{register ? 'Vytvorenie účtu' : 'Prihlásenie'}</h1>
        <p className="auth-intro">Vitaj v systéme Šipky Pro.</p>
        <form className="auth-form" onSubmit={authenticate}>
          <label>E-mail</label>
          <input type="email" required value={email} onChange={e => setEmail(e.target.value)} />
          <label>Heslo</label>
          <input type="password" required minLength="6" value={password} onChange={e => setPassword(e.target.value)} />
          <button className="auth-submit" disabled={busy}>
            {busy ? 'Pracujem…' : register ? 'Vytvoriť účet' : 'Prihlásiť sa'}
          </button>
        </form>
        {error && <div className="auth-alert error">{error}</div>}
        {message && <div className="auth-alert success">{message}</div>}
        <button className="auth-switch" onClick={() => setRegister(!register)}>
          {register ? 'Už mám účet – prihlásiť sa' : 'Nemám účet – registrácia'}
        </button>
      </div>
    </div>
  );

  return (
    <div className="app-shell">
      <aside className={`sidebar ${menu ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-mark"><Target /></div>
          <div><strong>ŠIPKY <span>PRO</span></strong><small>KLUBOVÁ PLATFORMA</small></div>
          <button className="mobile-close" onClick={() => setMenu(false)}><X /></button>
        </div>
        <div className="club-switch">
          <div className="club-avatar"><Club /></div>
          <div className="club-meta"><small>AKTUÁLNY KLUB</small><strong>{club}</strong></div>
          <ChevronRight />
        </div>
        <div className="nav-label">MENU</div>
        <nav>
          {navigation.map(([label, Icon]) => (
            <button key={label}
              className={`nav-item ${active === label ? 'selected' : ''}`}
              onClick={() => { setActive(label); setMenu(false); }}>
              <Icon size={18} /><span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="online"><span /> Systém pripravený</div>
          <div className="user-card">
            <div className="user-avatar"><CircleUserRound /></div>
            <div className="user-info"><strong>{session.user.email}</strong><small>Prihlásený používateľ</small></div>
            <button className="icon-button" onClick={() => supabase.auth.signOut()}><LogOut size={16} /></button>
          </div>
        </div>
      </aside>
      {menu && <button className="scrim" onClick={() => setMenu(false)} />}
      <main className="main">
        <header className="topbar">
          <button className="menu-button" onClick={() => setMenu(true)}><Menu /></button>
          <div className="crumb">Klub <ChevronRight size={14} /> <strong>{active}</strong></div>
          <div className="top-actions">
            <span className="date"><CalendarDays size={15} /> Klubový panel</span>
            <button className="icon-button"><Bell /></button>
          </div>
        </header>
        <div className="content">
          <div className="welcome-row">
            <div>
              <div className="eyebrow">KLUBOVÝ PANEL</div>
              <h1>{active === 'Prehľad' ? 'Dobrý deň!' : active}</h1>
              <p>Vitaj v systéme Šipky Pro. Klub <b>{club}</b>.</p>
            </div>
            <div className="welcome-mark"><Target size={42} /></div>
          </div>

          <div className="notice"><span className="notice-dot" /> Klubové rozhranie Šípky Pro</div>
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
          <footer>ŠIPKY PRO • Platforma pre šípkarské kluby</footer>
        </div>
      </main>
    </div>
  );
}

function Stat({ icon, label, value }) {
  return <div className="stat-card">
    <div className="stat-top"><span className="stat-icon">{icon}</span><span className="stat-trend">KLUB</span></div>
    <div className="stat-value">{value}</div>
    <div className="stat-label">{label}</div>
  </div>;
}

function Quick({ icon, title, onClick }) {
  return <button className="quick-card" onClick={onClick}>
    <span className="quick-icon">{icon}</span><strong>{title}</strong><ChevronRight />
  </button>;
}
