
import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';
import {
  Trophy,
  Target,
  Crosshair,
  RefreshCw,
  Medal,
  BarChart3
} from 'lucide-react';

const num = value => Number(value || 0);

export default function Statistics({ clubId, players = [], role = 'viewer' }) {
  const [matches, setMatches] = useState([]);
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedPlayer, setSelectedPlayer] = useState('all');

  async function loadStatistics() {
    if (!clubId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    const { data: matchData, error: matchError } = await supabase
      .from('matches')
      .select('id, player1_id, player2_id, score1, score2, winner_id')
      .eq('club_id', clubId)
      .eq('status', 'finished')
      .not('result_confirmed_at', 'is', null)
      .not('winner_id', 'is', null);

    if (matchError) {
      setError('Chyba pri načítaní zápasov: ' + matchError.message);
      setLoading(false);
      return;
    }

    const finished = matchData || [];
    setMatches(finished);

    if (!finished.length) {
      setVisits([]);
      setLoading(false);
      return;
    }

    const { data: visitData, error: visitError } = await supabase
      .from('match_visits')
      .select('match_id, player_id, visit_score, is_bust, is_checkout, darts_thrown')
      .in('match_id', finished.map(match => match.id));

    if (visitError) {
      setError('Chyba pri načítaní návštev: ' + visitError.message);
      setVisits([]);
    } else {
      setVisits(visitData || []);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadStatistics();
  }, [clubId]);

  const stats = useMemo(() => {
    const rows = new Map();

    players.forEach(player => {
      rows.set(player.id, {
        ...player,
        played: 0,
        wins: 0,
        losses: 0,
        legsFor: 0,
        legsAgainst: 0,
        points: 0,
        darts: 0,
        highVisit: 0,
        checkouts: 0,
        busts: 0
      });
    });

    matches.forEach(match => {
      const sides = [
        [match.player1_id, match.player2_id, match.score1, match.score2],
        [match.player2_id, match.player1_id, match.score2, match.score1]
      ];

      sides.forEach(([id, opponent, ownLegs, otherLegs]) => {
        const row = rows.get(id);
        if (!row) return;

        row.played += 1;

        if (match.winner_id === id) row.wins += 1;
        else row.losses += 1;

        row.legsFor += num(ownLegs);
        row.legsAgainst += num(otherLegs);
      });
    });

    visits.forEach(visit => {
      const row = rows.get(visit.player_id);
      if (!row) return;

      const bust = visit.is_bust === true;
      const score = bust ? 0 : num(visit.visit_score);

      // Ak počet šípok nie je uložený, použijú sa 3.
      const darts = num(visit.darts_thrown) || 3;

      row.points += score;
      row.darts += darts;

      if (bust) row.busts += 1;
      else row.highVisit = Math.max(row.highVisit, score);

      if (visit.is_checkout) row.checkouts += 1;
    });

    return [...rows.values()]
      .map(row => ({
        ...row,
        winRate: row.played
          ? Math.round(row.wins / row.played * 100)
          : 0,
        average: row.darts
          ? row.points / row.darts * 3
          : 0,
        legDifference: row.legsFor - row.legsAgainst
      }))
      .sort((a, b) =>
        b.wins - a.wins ||
        b.winRate - a.winRate ||
        b.legDifference - a.legDifference ||
        b.average - a.average
      );
  }, [players, matches, visits]);

  const visibleStats = selectedPlayer === 'all'
    ? stats
    : stats.filter(player => player.id === selectedPlayer);

  const checkouts = visits.filter(v => v.is_checkout).length;
  const admin = ['owner', 'admin'].includes(String(role).toLowerCase());

  return (
    <div className="sp-statistics">
      <div className="sp-page-title">
        <div>
          <span className="sp-kicker">ŠÍPKY PRO · ANALYTIKA KLUBU</span>
          <h1>Štatistiky</h1>
          <p>Výkonnosť hráčov a potvrdené výsledky klubu.</p>
        </div>

        <button
          className="sp-outline"
          onClick={loadStatistics}
          disabled={loading}
        >
          <RefreshCw size={15} />
          Obnoviť
        </button>
      </div>

      {error && <div className="sp-message">{error}</div>}

      <div className="sp-overview-grid">
        <div className="sp-overview-card">
          <Trophy />
          <span>Potvrdené zápasy</span>
          <strong>{matches.length}</strong>
        </div>

        <div className="sp-overview-card">
          <Target />
          <span>Zapísané návštevy</span>
          <strong>{visits.length}</strong>
        </div>

        <div className="sp-overview-card">
          <Crosshair />
          <span>Checkouty</span>
          <strong>{checkouts}</strong>
        </div>
      </div>

      <div className="sp-panel">
        <div className="sp-statistics-heading">
          <div>
            <span className="sp-kicker">PORADIE KLUBU</span>
            <h2><Medal size={19} /> Rebríček hráčov</h2>
          </div>

          <select
            value={selectedPlayer}
            onChange={event => setSelectedPlayer(event.target.value)}
          >
            <option value="all">Všetci hráči</option>
            {players.map(player => (
              <option key={player.id} value={player.id}>
                {player.name}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="sp-empty">Načítavam štatistiky...</div>
        ) : visibleStats.length === 0 ? (
          <div className="sp-empty">
            Zatiaľ nie sú dostupné potvrdené výsledky.
          </div>
        ) : (
          <div className="sp-statistics-table-wrap">
            <table className="sp-statistics-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Hráč</th>
                  <th>Zápasy</th>
                  <th>Výhry</th>
                  <th>Úspešnosť</th>
                  <th>Legy</th>
                  <th>Priemer</th>
                  <th>Naj návšteva</th>
                  <th>Checkouty</th>
                </tr>
              </thead>

              <tbody>
                {visibleStats.map(player => (
                  <tr key={player.id}>
                    <td>{stats.findIndex(p => p.id === player.id) + 1}</td>
                    <td>
                      <strong>{player.name}</strong>
                      {player.nickname && <small>{player.nickname}</small>}
                    </td>
                    <td>{player.played}</td>
                    <td>{player.wins} / {player.losses}</td>
                    <td>{player.winRate}%</td>
                    <td>{player.legsFor} : {player.legsAgainst}</td>
                    <td>{player.average.toFixed(2)}</td>
                    <td>{player.highVisit || '—'}</td>
                    <td>{player.checkouts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="sp-statistics-note">
          Priemer je prepočítaný na 3 šípky.
          BUST sa započítava ako 0 bodov.
        </p>
      </div>

      {admin && (
        <p className="sp-statistics-admin">
          <BarChart3 size={15} />
          Rozšírené klubové analýzy budú doplnené v ďalšej etape.
        </p>
      )}
    </div>
  );
}
