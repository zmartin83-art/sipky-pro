
import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';
import {
  BarChart3, Trophy, Target, Crosshair, Search, RefreshCw
} from 'lucide-react';

const number = value => Number(value) || 0;

const percent = (wins, matches) =>
  matches ? Math.round((wins / matches) * 100) : 0;

export default function Statistics({ clubId, players = [] }) {
  const [matches, setMatches] = useState([]);
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedPlayer, setSelectedPlayer] = useState('all');
  const [search, setSearch] = useState('');

  async function load() {
    if (!clubId) return;

    setLoading(true);
    setError('');

    try {
      const { data: matchRows, error: matchError } = await supabase
        .from('matches')
        .select(`
          id,
          player1_id,
          player2_id,
          score1,
          score2,
          winner_id,
          result_confirmed_at,
          status
        `)
        .eq('club_id', clubId)
        .eq('status', 'finished')
        .not('result_confirmed_at', 'is', null)
        .not('winner_id', 'is', null);

      if (matchError) throw matchError;

      const confirmedMatches = matchRows || [];
      setMatches(confirmedMatches);

      if (!confirmedMatches.length) {
        setVisits([]);
        return;
      }

      const matchIds = confirmedMatches.map(match => match.id);

      const { data: visitRows, error: visitError } = await supabase
        .from('match_visits')
        .select(`
          match_id,
          player_id,
          visit_score,
          is_bust,
          is_checkout,
          darts_thrown
        `)
        .in('match_id', matchIds);

      if (visitError) throw visitError;

      setVisits(visitRows || []);
    } catch (err) {
      setError(err?.message || 'Štatistiky sa nepodarilo načítať.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [clubId]);

  const rows = useMemo(() => {
    const result = players.map(player => ({
      id: player.id,
      name: player.name,
      nickname: player.nickname,
      matches: 0,
      wins: 0,
      losses: 0,
      legsFor: 0,
      legsAgainst: 0,
      points: 0,
      darts: 0,
      visits: 0,
      highVisit: 0,
      checkouts: 0,
      busts: 0,
    }));

    const byId = new Map(result.map(player => [player.id, player]));

    matches.forEach(match => {
      const player1 = byId.get(match.player1_id);
      const player2 = byId.get(match.player2_id);

      if (!player1 || !player2) return;

      player1.matches++;
      player2.matches++;

      if (match.winner_id === player1.id) {
        player1.wins++;
        player2.losses++;
      } else if (match.winner_id === player2.id) {
        player2.wins++;
        player1.losses++;
      }

      player1.legsFor += number(match.score1);
      player1.legsAgainst += number(match.score2);

      player2.legsFor += number(match.score2);
      player2.legsAgainst += number(match.score1);
    });

    visits.forEach(visit => {
      const player = byId.get(visit.player_id);
      if (!player) return;

      const isBust = visit.is_bust === true;
      const score = isBust ? 0 : number(visit.visit_score);

      // Pri chýbajúcom počte šípok sa použijú tri.
      const darts = number(visit.darts_thrown) > 0
        ? number(visit.darts_thrown)
        : 3;

      player.visits++;
      player.points += score;
      player.darts += darts;

      if (!isBust) {
        player.highVisit = Math.max(player.highVisit, score);
      }

      if (isBust) player.busts++;
      if (visit.is_checkout) player.checkouts++;
    });

    return result.map(player => ({
      ...player,
      average: player.darts
        ? (player.points / player.darts) * 3
        : 0,
      winRate: percent(player.wins, player.matches),
      legDifference: player.legsFor - player.legsAgainst,
    })).sort((a, b) =>
      b.wins - a.wins ||
      b.winRate - a.winRate ||
      b.legDifference - a.legDifference ||
      b.average - a.average
    );
  }, [players, matches, visits]);

  const visibleRows = rows.filter(player =>
    (selectedPlayer === 'all' || player.id === selectedPlayer) &&
    `${player.name} ${player.nickname || ''}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  const totals = useMemo(() => ({
    matches: matches.length,
    visits: visits.length,
    checkouts: visits.filter(visit => visit.is_checkout).length,
  }), [matches, visits]);

  return (
    <div className="sp-statistics">
      <div className="sp-page-title">
        <div>
          <span className="sp-kicker">
            ŠÍPKY PRO / ANALYTIKA KLUBU
          </span>
          <h1>Štatistiky</h1>
          <p>
            Výsledky a výkonnosť hráčov klubu.
            Započítavajú sa iba potvrdené dokončené zápasy.
          </p>
        </div>

        <button
          className="sp-outline"
          onClick={load}
          disabled={loading}
        >
          <RefreshCw size={15} />
          Obnoviť
        </button>
      </div>

      {error && (
        <div className="sp-message">{error}</div>
      )}

      <div className="sp-overview-grid">
        <div className="sp-overview-card">
          <Trophy />
          <span>Potvrdené zápasy</span>
          <strong>{totals.matches}</strong>
        </div>

        <div className="sp-overview-card">
          <Target />
          <span>Zapísané návštevy</span>
          <strong>{totals.visits}</strong>
        </div>

        <div className="sp-overview-card">
          <Crosshair />
          <span>Checkouty</span>
          <strong>{totals.checkouts}</strong>
        </div>
      </div>

      <div className="sp-panel">
        <div className="sp-stat-toolbar">
          <div className="sp-stat-heading">
            <BarChart3 size={19} />
            <strong>Rebríček hráčov</strong>
          </div>

          <div className="sp-stat-filters">
            <label>
              Hráč
              <select
                value={selectedPlayer}
                onChange={event =>
                  setSelectedPlayer(event.target.value)
                }
              >
                <option value="all">Všetci hráči</option>

                {players.map(player => (
                  <option key={player.id} value={player.id}>
                    {player.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Hľadať
              <div className="sp-search">
                <Search size={16} />
                <input
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  placeholder="Meno hráča"
                />
              </div>
            </label>
          </div>
        </div>

        {loading ? (
          <p className="sp-empty">
            Načítavam štatistiky…
          </p>
        ) : !visibleRows.length ? (
          <p className="sp-empty">
            Zatiaľ nie sú dostupné žiadne štatistiky.
          </p>
        ) : (
          <div className="sp-stat-table-wrap">
            <table className="sp-stat-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Hráč</th>
                  <th>Z</th>
                  <th>V</th>
                  <th>P</th>
                  <th>Úspešnosť</th>
                  <th>Legy</th>
                  <th>Rozdiel</th>
                  <th>Priemer / 3 šípky</th>
                  <th>Najvyššia návšteva</th>
                  <th>Checkout</th>
                  <th>BUST</th>
                </tr>
              </thead>

              <tbody>
                {visibleRows.map((player, index) => (
                  <tr key={player.id}>
                    <td>{index + 1}</td>

                    <td>
                      <strong>{player.name}</strong>
                      {player.nickname && (
                        <small>{player.nickname}</small>
                      )}
                    </td>

                    <td>{player.matches}</td>
                    <td>{player.wins}</td>
                    <td>{player.losses}</td>
                    <td>{player.winRate}%</td>
                    <td>
                      {player.legsFor}:{player.legsAgainst}
                    </td>
                    <td>
                      {player.legDifference > 0 ? '+' : ''}
                      {player.legDifference}
                    </td>
                    <td>{player.average.toFixed(2)}</td>
                    <td>{player.highVisit}</td>
                    <td>{player.checkouts}</td>
                    <td>{player.busts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <style>{`
        .sp-statistics .sp-stat-toolbar {
          display:flex;
          justify-content:space-between;
          gap:18px;
          align-items:center;
          margin-bottom:18px;
          flex-wrap:wrap;
        }

        .sp-statistics .sp-stat-heading {
          display:flex;
          align-items:center;
          gap:10px;
          color:var(--gold2);
        }

        .sp-stat-filters {
          display:flex;
          gap:12px;
          align-items:end;
          flex-wrap:wrap;
        }

        .sp-stat-filters label {
          min-width:180px;
        }

        .sp-stat-filters .sp-search {
          max-width:220px;
        }

        .sp-stat-table-wrap {
          overflow-x:auto;
        }

        .sp-stat-table {
          width:100%;
          border-collapse:collapse;
          white-space:nowrap;
          font-size:12px;
        }

        .sp-stat-table th,
        .sp-stat-table td {
          padding:12px 10px;
          text-align:right;
          border-top:1px solid var(--line);
        }

        .sp-stat-table th {
          color:var(--gold);
          font-size:10px;
          text-transform:uppercase;
        }

        .sp-stat-table th:nth-child(2),
        .sp-stat-table td:nth-child(2) {
          text-align:left;
        }

        .sp-stat-table td strong,
        .sp-stat-table td small {
          display:block;
        }

        .sp-stat-table td small {
          color:var(--muted);
          margin-top:3px;
        }

        @media(max-width:700px) {
          .sp-stat-filters {
            width:100%;
          }

          .sp-stat-filters label {
            width:100%;
          }

          .sp-stat-filters .sp-search {
            max-width:none;
          }
        }
      `}</style>
    </div>
  );
}
