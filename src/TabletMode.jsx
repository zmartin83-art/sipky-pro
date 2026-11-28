import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';
import LiveScore from './LiveScore';
import { Monitor, Target, RefreshCw, ArrowLeft, LogOut } from 'lucide-react';

export default function TabletMode({ club, tournaments, players }) {
  const [tournamentId, setTournamentId] = useState('');
  const [boardNumber, setBoardNumber] = useState('');
  const [matches, setMatches] = useState([]);
  const [activeMatch, setActiveMatch] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);

  const selectedTournament = useMemo(
    () => tournaments.find(t => t.id === tournamentId),
    [tournaments, tournamentId]
  );

  const boardCount = Math.max(
    1,
    Number(selectedTournament?.board_count || 1)
  );

  const playerMap = useMemo(
    () => Object.fromEntries(players.map(p => [p.id, p.name])),
    [players]
  );

  const loadMatches = useCallback(async () => {
    if (!club?.id || !tournamentId || !boardNumber) {
      setMatches([]);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { data, error: queryError } = await supabase
        .from('matches')
        .select(`
          id,
          tournament_id,
          board_number,
          player1_id,
          player2_id,
          score1,
          score2,
          status,
          round_number,
          match_number,
          live_status,
          live_remaining1,
          live_remaining2,
          live_legs1,
          live_legs2
        `)
        .eq('club_id', club.id)
        .eq('tournament_id', tournamentId)
        .eq('board_number', Number(boardNumber))
        .order('round_number', { ascending: true })
        .order('match_number', { ascending: true });

      if (queryError) throw queryError;

      setMatches(data || []);
      setLastUpdated(new Date());
    } catch (err) {
      setError(`Rozpis sa nepodarilo načítať: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [club?.id, tournamentId, boardNumber]);

  useEffect(() => {
    if (!tournamentId || !boardNumber) {
      setMatches([]);
      return;
    }

    loadMatches();

    const channel = supabase
      .channel(`tablet-board-${club.id}-${tournamentId}-${boardNumber}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'matches',
          filter: `club_id=eq.${club.id}`,
        },
        () => loadMatches()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [club.id, tournamentId, boardNumber, loadMatches]);

  const boardMatches = useMemo(() => {
    return [...matches].sort((a, b) => {
      const roundA = Number(a.round_number || 0);
      const roundB = Number(b.round_number || 0);

      if (roundA !== roundB) return roundA - roundB;

      return Number(a.match_number || 0) -
        Number(b.match_number || 0);
    });
  }, [matches]);

  const isCompleted = match =>
    match.status === 'completed' ||
    match.live_status === 'finished';

  const isRunning = match =>
    match.status === 'ongoing' &&
    match.live_status !== 'finished';

  function openMatch(match) {
    if (!match.player1_id || !match.player2_id) {
      setError('Tento zápas ešte nemá priradených oboch hráčov.');
      return;
    }

    if (isCompleted(match)) {
      setError('Tento zápas je už ukončený.');
      return;
    }

    setError('');
    setActiveMatch(match);
  }

  function closeMatch() {
    setActiveMatch(null);
    loadMatches();
  }

  function leaveTabletMode() {
    const url = new URL(window.location.href);
    url.searchParams.delete('tablet');
    window.location.href = url.toString();
  }

  if (activeMatch) {
    return (
      <div className="sp-tablet-live">
        <LiveScore
          matchId={activeMatch.id}
          player1={playerMap[activeMatch.player1_id] || 'Hráč 1'}
          player2={playerMap[activeMatch.player2_id] || 'Hráč 2'}
          onFinish={result => {
            setActiveMatch(null);

            if (result?.cancelled) {
              loadMatches();
              return;
            }

            loadMatches();
          }}
        />
      </div>
    );
  }

  return (
    <div className="sp-tablet">
      <header className="sp-tablet-header">
        <div className="sp-tablet-brand">
          <div className="sp-tablet-logo">SP</div>
          <div>
            <strong>ŠÍPKY PRO</strong>
            <span>TABLETOVÝ REŽIM</span>
          </div>
        </div>

        <div className="sp-tablet-club">
          {club.name}
        </div>

        <button
          className="sp-tablet-exit"
          onClick={leaveTabletMode}
        >
          <LogOut size={17} />
          Hlavná aplikácia
        </button>
      </header>

      <main className="sp-tablet-content">
        <div className="sp-tablet-heading">
          <div>
            <span>RIADENIE ZÁPASOV</span>
            <h1>Rozpis terča</h1>
            <p>Vyber turnaj a terč, na ktorom bude tablet zapisovať zápasy.</p>
          </div>

          <button
            className="sp-tablet-refresh"
            onClick={loadMatches}
            disabled={loading}
          >
            <RefreshCw size={17} />
            Obnoviť
          </button>
        </div>

        <section className="sp-tablet-selectors">
          <label>
            Turnaj
            <select
              value={tournamentId}
              onChange={e => {
                setTournamentId(e.target.value);
                setBoardNumber('');
                setMatches([]);
              }}
            >
              <option value="">Vyber turnaj</option>
              {tournaments.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Číslo terča
            <select
              value={boardNumber}
              onChange={e => setBoardNumber(e.target.value)}
              disabled={!tournamentId}
            >
              <option value="">Vyber terč</option>
              {Array.from({ length: boardCount }, (_, i) => i + 1).map(n => (
                <option key={n} value={n}>
                  Terč {n}
                </option>
              ))}
            </select>
          </label>
        </section>

        {error && (
          <div className="sp-tablet-error">
            {error}
          </div>
        )}

        {!tournamentId || !boardNumber ? (
          <div className="sp-tablet-empty">
            <Monitor size={42} />
            <h2>Tablet čaká na výber</h2>
            <p>Najskôr vyber turnaj a číslo terča.</p>
          </div>
        ) : (
          <>
            <div className="sp-tablet-board-title">
              <div>
                <span>{selectedTournament?.name}</span>
                <h2><Target size={24} /> TERČ {boardNumber}</h2>
              </div>

              <div className="sp-tablet-update">
                {loading
                  ? 'Načítavam zápasy…'
                  : lastUpdated
                    ? `Aktualizované ${lastUpdated.toLocaleTimeString('sk-SK')}`
                    : 'Čakám na dáta'}
              </div>
            </div>

            <section className="sp-tablet-match-list">
              {boardMatches.map((match, index) => {
                const completed = isCompleted(match);
                const running = isRunning(match);

                return (
                  <article
                    key={match.id}
                    className={`sp-tablet-match ${
                      completed ? 'completed' : running ? 'running' : ''
                    }`}
                  >
                    <div className="sp-tablet-match-number">
                      <span>ZÁPAS</span>
                      <strong>{index + 1}</strong>
                    </div>

                    <div className="sp-tablet-match-players">
                      <strong>
                        {playerMap[match.player1_id] || 'Čaká sa na hráča'}
                      </strong>
                      <span>VS</span>
                      <strong>
                        {playerMap[match.player2_id] || 'Čaká sa na hráča'}
                      </strong>
                    </div>

                    <div className="sp-tablet-match-info">
                      <span>
                        Kolo {match.round_number || '—'}
                      </span>
                      <span>
                        {completed
                          ? 'UKONČENÝ'
                          : running
                            ? 'PREBIEHA'
                            : 'ČAKÁ NA ZÁPAS'}
                      </span>
                      {completed && (
                        <strong>
                          {match.score1 ?? 0} : {match.score2 ?? 0}
                        </strong>
                      )}
                    </div>

                    <button
                      className="sp-tablet-start"
                      disabled={completed || !match.player1_id || !match.player2_id}
                      onClick={() => openMatch(match)}
                    >
                      {completed
                        ? 'Dokončené'
                        : running
                          ? 'Pokračovať'
                          : 'Otvoriť zápas'}
                    </button>
                  </article>
                );
              })}

              {!loading && boardMatches.length === 0 && (
                <div className="sp-tablet-empty">
                  <Target size={42} />
                  <h2>Na tomto terči zatiaľ nie sú zápasy</h2>
                  <p>
                    Zápasy sa zobrazia po ich vytvorení a priradení
                    k turnaju a terču {boardNumber}.
                  </p>
                </div>
              )}
            </section>
          </>
        )}
      </main>

      <style>{`
        .sp-tablet {
          min-height:100vh;
          background:#081426;
          color:#f5f7fb;
          font-family:Inter,system-ui,sans-serif;
          padding-bottom:30px;
        }
        .sp-tablet-header {
          min-height:76px;
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:18px;
          padding:14px 28px;
          background:#0a1221;
          border-bottom:1px solid #293b53;
        }
        .sp-tablet-brand {
          display:flex;
          align-items:center;
          gap:12px;
        }
        .sp-tablet-logo {
          width:44px;
          height:44px;
          display:grid;
          place-items:center;
          border-radius:12px;
          background:#d9b45c;
          color:#101827;
          font-weight:950;
          font-size:18px;
        }
        .sp-tablet-brand strong,
        .sp-tablet-brand span {
          display:block;
        }
        .sp-tablet-brand strong {
          letter-spacing:1px;
          font-size:17px;
        }
        .sp-tablet-brand span {
          color:#d9b45c;
          font-size:9px;
          letter-spacing:2px;
          margin-top:4px;
        }
        .sp-tablet-club {
          color:#f1d58d;
          font-weight:800;
        }
        .sp-tablet-exit,
        .sp-tablet-refresh {
          display:flex;
          align-items:center;
          justify-content:center;
          gap:8px;
          border:1px solid #52647d;
          border-radius:10px;
          padding:11px 14px;
          color:white;
          background:#172943;
          font-weight:700;
        }
        .sp-tablet-content {
          max-width:1250px;
          margin:auto;
          padding:30px 24px;
        }
        .sp-tablet-heading,
        .sp-tablet-board-title {
          display:flex;
          justify-content:space-between;
          align-items:center;
          gap:15px;
        }
        .sp-tablet-heading > div > span,
        .sp-tablet-board-title > div > span {
          color:#d9b45c;
          font-size:11px;
          font-weight:800;
          letter-spacing:2px;
        }
        .sp-tablet-heading h1 {
          font-size:32px;
          margin:7px 0;
        }
        .sp-tablet-heading p {
          color:#9eacc1;
          margin:0;
        }
        .sp-tablet-selectors {
          display:grid;
          grid-template-columns:2fr 1fr;
          gap:16px;
          margin:28px 0;
          padding:20px;
          border:1px solid #293b53;
          border-radius:15px;
          background:#111f35;
        }
        .sp-tablet-selectors label {
          display:grid;
          gap:8px;
          color:#c2cee0;
          font-size:13px;
          font-weight:700;
        }
        .sp-tablet-selectors select {
          min-height:50px;
          background:#0d192b;
          border:1px solid #52647d;
          border-radius:9px;
          color:white;
          padding:10px 12px;
          font-size:16px;
        }
        .sp-tablet-board-title {
          margin:28px 0 15px;
        }
        .sp-tablet-board-title h2 {
          display:flex;
          align-items:center;
          gap:10px;
          color:#f1d58d;
          font-size:27px;
          margin:7px 0 0;
        }
        .sp-tablet-update {
          color:#9eacc1;
          font-size:12px;
        }
        .sp-tablet-match-list {
          display:grid;
          gap:11px;
        }
        .sp-tablet-match {
          display:grid;
          grid-template-columns:75px minmax(0,1fr) 150px 170px;
          align-items:center;
          gap:18px;
          padding:17px;
          background:#111f35;
          border:1px solid #293b53;
          border-radius:14px;
        }
        .sp-tablet-match.running {
          border-color:#d9b45c;
          box-shadow:inset 4px 0 #d9b45c;
        }
        .sp-tablet-match.completed {
          opacity:.65;
        }
        .sp-tablet-match-number {
          display:grid;
          justify-items:center;
          gap:3px;
          border-right:1px solid #293b53;
          padding-right:12px;
        }
        .sp-tablet-match-number span {
          color:#9eacc1;
          font-size:9px;
          letter-spacing:1px;
        }
        .sp-tablet-match-number strong {
          font-size:25px;
          color:#f1d58d;
        }
        .sp-tablet-match-players {
          display:grid;
          grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);
          align-items:center;
          gap:12px;
        }
        .sp-tablet-match-players strong {
          font-size:17px;
          overflow-wrap:anywhere;
        }
        .sp-tablet-match-players span {
          color:#d9b45c;
          font-weight:900;
          font-size:12px;
        }
        .sp-tablet-match-info {
          display:grid;
          gap:5px;
          color:#9eacc1;
          font-size:11px;
        }
        .sp-tablet-match-info span:last-of-type {
          color:#d9b45c;
          font-weight:800;
        }
        .sp-tablet-start {
          min-height:48px;
          border:0;
          border-radius:10px;
          padding:10px 13px;
          background:linear-gradient(135deg,#f1d58d,#bd903c);
          color:#101827;
          font-weight:900;
        }
        .sp-tablet-start:disabled {
          opacity:.45;
          cursor:not-allowed;
        }
        .sp-tablet-empty {
          display:grid;
          justify-items:center;
          text-align:center;
          gap:10px;
          padding:65px 20px;
          border:1px dashed #52647d;
          border-radius:16px;
          color:#9eacc1;
          margin-top:22px;
        }
        .sp-tablet-empty svg {
          color:#d9b45c;
        }
        .sp-tablet-empty h2 {
          color:white;
          margin:4px 0;
        }
        .sp-tablet-error {
          margin:15px 0;
          padding:13px;
          border:1px solid #9b444b;
          background:#3a202a;
          border-radius:10px;
          color:#ffb4b8;
        }
        .sp-tablet-live {
          min-height:100vh;
        }
        @media(max-width:750px) {
          .sp-tablet-header {
            padding:12px 14px;
            flex-wrap:wrap;
          }
          .sp-tablet-club {
            order:3;
            width:100%;
          }
          .sp-tablet-content {
            padding:22px 13px;
          }
          .sp-tablet-heading {
            align-items:flex-start;
          }
          .sp-tablet-heading h1 {
            font-size:26px;
          }
          .sp-tablet-selectors {
            grid-template-columns:1fr;
            padding:14px;
          }
          .sp-tablet-match {
            grid-template-columns:55px minmax(0,1fr);
            gap:12px;
          }
          .sp-tablet-match-number {
            grid-row:span 2;
          }
          .sp-tablet-match-players {
            grid-column:2;
          }
          .sp-tablet-match-info {
            grid-column:2;
          }
          .sp-tablet-start {
            grid-column:1/-1;
            width:100%;
          }
        }
      `}</style>
    </div>
  );
}
