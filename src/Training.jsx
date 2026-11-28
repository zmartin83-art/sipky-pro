
import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';
import './Training.css';

export default function Training({
  club,
  clubId: providedClubId,
  onBack
}) {
  // ID klubu získame z App.jsx alebo priamo z clubId
  const clubId = providedClubId || club?.id || club?.club_id;

  const [sessions, setSessions] = useState([]);
  const [players, setPlayers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [boards, setBoards] = useState([]);
  const [trainingPlayers, setTrainingPlayers] = useState([]);
  const [visits, setVisits] = useState([]);

  const [sessionName, setSessionName] = useState('Klubový tréning');
  const [boardCount, setBoardCount] = useState(2);
  const [newBoardPlayer, setNewBoardPlayer] = useState({});
  const [newScores, setNewScores] = useState({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (clubId) {
      loadInitial();
    } else {
      setMessage('Nepodarilo sa načítať ID klubu.');
    }
  }, [clubId]);

  async function loadInitial() {
    if (!clubId) return;

    setLoading(true);
    setMessage('');

    const [s, p] = await Promise.all([
      supabase
        .from('training_sessions')
        .select('*')
        .eq('club_id', clubId)
        .order('training_date', { ascending: false }),

      supabase
        .from('players')
        .select('id,name,nickname,active')
        .eq('club_id', clubId)
        .eq('active', true)
        .order('name')
    ]);

    if (s.error) {
      setMessage(s.error.message);
    } else {
      setSessions(s.data || []);
    }

    if (p.error) {
      setMessage(p.error.message);
    } else {
      setPlayers(p.data || []);
    }

    setLoading(false);
  }

  async function createTraining() {
    if (!clubId) {
      setMessage('Chýba ID klubu. Obnov aplikáciu a skús to znova.');
      return;
    }

    if (!sessionName.trim()) {
      setMessage('Zadaj názov tréningu.');
      return;
    }

    setLoading(true);
    setMessage('');

    const { data, error } = await supabase
      .from('training_sessions')
      .insert({
        club_id: clubId,
        name: sessionName.trim(),
        status: 'active',
        started_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    const boardRows = Array.from(
      {
        length: Math.max(
          1,
          Math.min(20, Number(boardCount) || 1)
        )
      },
      (_, i) => ({
        session_id: data.id,
        board_number: i + 1,
        name: `Terč ${i + 1}`
      })
    );

    const { error: boardError } = await supabase
      .from('training_boards')
      .insert(boardRows);

    if (boardError) {
      setMessage(
        'Tréning bol vytvorený, ale terče sa nepodarilo vytvoriť: ' +
        boardError.message
      );
      setLoading(false);
      await loadInitial();
      return;
    }

    setSessionName('Klubový tréning');

    await loadInitial();
    await openTraining(data);

    setLoading(false);
  }

  async function openTraining(session) {
    setLoading(true);
    setSelected(session);
    setMessage('');

    const [b, p, v] = await Promise.all([
      supabase
        .from('training_boards')
        .select('*')
        .eq('session_id', session.id)
        .order('board_number'),

      supabase
        .from('training_players')
        .select('*, players(id,name,nickname)')
        .eq('session_id', session.id)
        .order('player_order'),

      supabase
        .from('training_visits')
        .select('*')
        .eq('session_id', session.id)
        .order('created_at')
    ]);

    if (b.error) {
      setMessage(b.error.message);
    } else {
      setBoards(b.data || []);
    }

    if (p.error) {
      setMessage(p.error.message);
    } else {
      setTrainingPlayers(p.data || []);
    }

    if (v.error) {
      setMessage(v.error.message);
    } else {
      setVisits(v.data || []);
    }

    setLoading(false);
  }

  async function addPlayer(boardId) {
    const playerId = newBoardPlayer[boardId];

    if (!playerId || !selected) return;

    const alreadyAdded = trainingPlayers.some(
      p => p.player_id === playerId && p.status === 'active'
    );

    if (alreadyAdded) {
      setMessage('Tento hráč už je zaradený v tréningu.');
      return;
    }

    const { error } = await supabase
      .from('training_players')
      .insert({
        session_id: selected.id,
        board_id: boardId,
        player_id: playerId,
        player_order: trainingPlayers.length + 1,
        status: 'active'
      });

    if (error) {
      setMessage(error.message);
      return;
    }

    setNewBoardPlayer(old => ({
      ...old,
      [boardId]: ''
    }));

    await openTraining(selected);
  }

  async function movePlayer(trainingPlayerId, boardId) {
    const { error } = await supabase
      .from('training_players')
      .update({
        board_id: boardId,
        status: 'active',
        left_at: null
      })
      .eq('id', trainingPlayerId);

    if (error) {
      setMessage(error.message);
      return;
    }

    await openTraining(selected);
  }

  async function removePlayer(trainingPlayerId) {
    const { error } = await supabase
      .from('training_players')
      .update({
        status: 'left',
        left_at: new Date().toISOString()
      })
      .eq('id', trainingPlayerId);

    if (error) {
      setMessage(error.message);
      return;
    }

    await openTraining(selected);
  }

  async function recordVisit(player, board) {
    const raw = newScores[player.id];

    if (raw === undefined || raw === '') return;

    const score = Number(raw);

    if (
      !Number.isInteger(score) ||
      score < 0 ||
      score > 180
    ) {
      setMessage('Skóre musí byť celé číslo od 0 do 180.');
      return;
    }

    const playerVisits = visits.filter(
      v => v.training_player_id === player.id
    );

    const previous = playerVisits[playerVisits.length - 1];
    const remainingBefore = previous?.remaining_after ?? 501;

    const isBust =
      score > remainingBefore ||
      remainingBefore - score === 1;

    const remainingAfter = isBust
      ? remainingBefore
      : remainingBefore - score;

    const { error } = await supabase
      .from('training_visits')
      .insert({
        session_id: selected.id,
        board_id: board.id,
        training_player_id: player.id,
        visit_number: playerVisits.length + 1,
        visit_score: isBust ? 0 : score,
        darts_thrown: 3,
        remaining_before: remainingBefore,
        remaining_after: remainingAfter,
        is_bust: isBust,
        is_checkout: remainingAfter === 0
      });

    if (error) {
      setMessage(error.message);
      return;
    }

    setNewScores(old => ({
      ...old,
      [player.id]: ''
    }));

    await openTraining(selected);
  }

  async function finishTraining() {
    if (!selected) return;

    const { error } = await supabase
      .from('training_sessions')
      .update({
        status: 'finished',
        finished_at: new Date().toISOString()
      })
      .eq('id', selected.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    await loadInitial();
    setSelected(null);
  }

  const playerStats = useMemo(() => {
    return trainingPlayers.map(player => {
      const playerVisits = visits.filter(
        v => v.training_player_id === player.id
      );

      const scoredVisits = playerVisits.filter(
        v => !v.is_bust
      );

      const points = scoredVisits.reduce(
        (sum, v) => sum + Number(v.visit_score || 0),
        0
      );

      const darts = playerVisits.reduce(
        (sum, v) => sum + (v.darts_thrown || 0),
        0
      );

      return {
        ...player,
        visitCount: playerVisits.length,
        points,
        darts,
        average: darts > 0 ? (points / darts) * 3 : 0
      };
    });
  }, [trainingPlayers, visits]);

  if (loading && !selected && sessions.length === 0) {
    return (
      <div className="training-page">
        Načítavam tréningy…
      </div>
    );
  }

  return (
    <div className="training-page">
      <header className="training-header">
        <div>
          <div className="training-eyebrow">ŠÍPKY PRO</div>
          <h1>Tréningy</h1>
          <p>Klubové tréningy, terče a výkony hráčov</p>
        </div>

        {onBack && (
          <button
            className="training-secondary"
            onClick={onBack}
          >
            Späť
          </button>
        )}
      </header>

      {message && (
        <div className="training-message">
          {message}
        </div>
      )}

      {!selected ? (
        <>
          <section className="training-create">
            <h2>Nový tréning</h2>

            <label>Názov tréningu</label>
            <input
              value={sessionName}
              onChange={e => setSessionName(e.target.value)}
              placeholder="Napríklad Piatkový tréning"
            />

            <label>Počet terčov</label>
            <input
              type="number"
              min="1"
              max="20"
              value={boardCount}
              onChange={e => setBoardCount(e.target.value)}
            />

            <button
              className="training-primary"
              disabled={loading || !clubId}
              onClick={createTraining}
            >
              {loading ? 'Vytváram…' : 'Vytvoriť tréning'}
            </button>
          </section>

          <section className="training-list">
            <h2>História tréningov</h2>

            {sessions.length === 0 ? (
              <p className="training-muted">
                Zatiaľ nemáš vytvorený žiadny tréning.
              </p>
            ) : (
              sessions.map(session => (
                <button
                  className="training-session-card"
                  key={session.id}
                  onClick={() => openTraining(session)}
                >
                  <span>
                    <strong>{session.name}</strong>
                    <small>
                      {new Date(
                        session.training_date
                      ).toLocaleString('sk-SK')}
                    </small>
                  </span>

                  <span className={`training-status ${session.status}`}>
                    {session.status === 'active'
                      ? 'Prebieha'
                      : session.status === 'finished'
                        ? 'Ukončený'
                        : session.status === 'cancelled'
                          ? 'Zrušený'
                          : 'Naplánovaný'}
                  </span>
                </button>
              ))
            )}
          </section>
        </>
      ) : (
        <>
          <div className="training-active-heading">
            <div>
              <button
                className="training-back-link"
                onClick={() => {
                  setSelected(null);
                  loadInitial();
                }}
              >
                ← Všetky tréningy
              </button>

              <h2>{selected.name}</h2>

              <p>
                {new Date(
                  selected.training_date
                ).toLocaleString('sk-SK')}
              </p>
            </div>

            {selected.status !== 'finished' && (
              <button
                className="training-finish"
                onClick={finishTraining}
              >
                Ukončiť tréning
              </button>
            )}
          </div>

          <div className="training-board-grid">
            {boards.map(board => {
              const boardPlayers = trainingPlayers.filter(
                p =>
                  p.board_id === board.id &&
                  p.status === 'active'
              );

              return (
                <section
                  className="training-board"
                  key={board.id}
                >
                  <div className="training-board-title">
                    <span className="training-board-number">
                      {board.board_number}
                    </span>

                    <div>
                      <h3>
                        {board.name || `Terč ${board.board_number}`}
                      </h3>
                      <small>
                        {boardPlayers.length} aktívnych hráčov
                      </small>
                    </div>
                  </div>

                  <div className="training-add-player">
                    <select
                      value={newBoardPlayer[board.id] || ''}
                      onChange={e =>
                        setNewBoardPlayer(old => ({
                          ...old,
                          [board.id]: e.target.value
                        }))
                      }
                    >
                      <option value="">Vyber hráča</option>

                      {players.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                          {p.nickname ? ` (${p.nickname})` : ''}
                        </option>
                      ))}
                    </select>

                    <button
                      onClick={() => addPlayer(board.id)}
                      disabled={selected.status === 'finished'}
                    >
                      + Pridať
                    </button>
                  </div>

                  {boardPlayers.length === 0 && (
                    <p className="training-muted">
                      Na tomto terči zatiaľ nie sú hráči.
                    </p>
                  )}

                  {boardPlayers.map(player => {
                    const stats = playerStats.find(
                      p => p.id === player.id
                    );

                    const lastVisit = visits
                      .filter(
                        v => v.training_player_id === player.id
                      )
                      .slice(-1)[0];

                    return (
                      <div
                        className="training-player-card"
                        key={player.id}
                      >
                        <div className="training-player-top">
                          <div>
                            <strong>
                              {player.players?.name || 'Hráč'}
                            </strong>

                            <small>
                              {stats?.visitCount || 0} návštev ·
                              {' '}{stats?.points || 0} bodov
                            </small>
                          </div>

                          <strong className="training-average">
                            {(stats?.average || 0).toFixed(2)}
                          </strong>
                        </div>

                        <div className="training-player-score">
                          <span>
                            Zostáva: {lastVisit?.remaining_after ?? 501}
                          </span>

                          <span>
                            Šípky: {stats?.darts || 0}
                          </span>
                        </div>

                        {selected.status !== 'finished' && (
                          <>
                            <div className="training-score-entry">
                              <input
                                type="number"
                                min="0"
                                max="180"
                                placeholder="Skóre 0–180"
                                value={newScores[player.id] ?? ''}
                                onChange={e =>
                                  setNewScores(old => ({
                                    ...old,
                                    [player.id]: e.target.value
                                  }))
                                }
                              />

                              <button
                                onClick={() => recordVisit(player, board)}
                              >
                                Zapísať
                              </button>
                            </div>

                            <div className="training-player-actions">
                              <select
                                defaultValue=""
                                onChange={e => {
                                  if (e.target.value) {
                                    movePlayer(
                                      player.id,
                                      e.target.value
                                    );
                                    e.target.value = '';
                                  }
                                }}
                              >
                                <option value="">
                                  Presunúť na terč…
                                </option>

                                {boards
                                  .filter(b => b.id !== board.id)
                                  .map(b => (
                                    <option
                                      key={b.id}
                                      value={b.id}
                                    >
                                      {b.name || `Terč ${b.board_number}`}
                                    </option>
                                  ))}
                              </select>

                              <button
                                className="training-remove"
                                onClick={() => removePlayer(player.id)}
                              >
                                Odobrať
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </section>
              );
            })}
          </div>

          <section className="training-summary">
            <h2>Štatistiky tréningu</h2>

            <div className="training-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Hráč</th>
                    <th>Návštevy</th>
                    <th>Body</th>
                    <th>Šípky</th>
                    <th>Priemer / 3 šípky</th>
                  </tr>
                </thead>

                <tbody>
                  {playerStats.map(p => (
                    <tr key={p.id}>
                      <td>{p.players?.name || 'Hráč'}</td>
                      <td>{p.visitCount}</td>
                      <td>{p.points}</td>
                      <td>{p.darts}</td>
                      <td>{p.average.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
