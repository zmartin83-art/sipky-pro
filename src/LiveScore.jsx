
import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';

const START_SCORE = 501;
const MAX_DARTS = 45;

export default function LiveScore({
  player1 = 'Hráč 1',
  player2 = 'Hráč 2',
  onFinish,
  matchId,
}) {
  const [scores, setScores] = useState([501, 501]);
  const [legs, setLegs] = useState([0, 0]);
  const [legsToWin, setLegsToWin] = useState(3);
  const [currentPlayer, setCurrentPlayer] = useState(0);
  const [visitInput, setVisitInput] = useState('');
  const [doubleOut, setDoubleOut] = useState(false);
  const [dartsThisVisit, setDartsThisVisit] = useState(3);
  const [dartsUsed, setDartsUsed] = useState([0, 0]);
  const [history, setHistory] = useState([]);
  const [bullHistory, setBullHistory] = useState([]);
  const [bullOffPhase, setBullOffPhase] = useState('opening');
  const [message, setMessage] = useState('Načítavam zápas...');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [undoConfirm, setUndoConfirm] = useState(false);
  const [finished, setFinished] = useState(false);
  const [matchCompleted, setMatchCompleted] = useState(false);

  const names = [player1, player2];
  const activeName = names[currentPlayer];
  const remainingDarts = MAX_DARTS - dartsUsed[currentPlayer];

  const averages = useMemo(() => {
    return [0, 1].map((i) => {
      const visits = history.filter(
        (item) => item.player === i && !item.bullOff
      );

      const darts = visits.reduce(
        (sum, item) => sum + (item.darts || 0), 0
      );

      const points = visits.reduce(
        (sum, item) => sum + (item.bust ? 0 : item.scored), 0
      );

      return darts
        ? ((points / darts) * 3).toFixed(2)
        : '0.00';
    });
  }, [history]);

  function applyDatabaseState(data) {
    if (!data) return;

    if (
      Number.isFinite(Number(data.remaining1)) &&
      Number.isFinite(Number(data.remaining2))
    ) {
      setScores([
        Number(data.remaining1),
        Number(data.remaining2),
      ]);
    }

    if (
      data.legs1 !== undefined &&
      data.legs2 !== undefined
    ) {
      setLegs([
        Number(data.legs1),
        Number(data.legs2),
      ]);
    }

    if (data.current_player_slot === 1 ||
        data.current_player_slot === 2) {
      setCurrentPlayer(data.current_player_slot - 1);
    }

    if (data.darts1 !== undefined && data.darts2 !== undefined) {
      setDartsUsed([
        Number(data.darts1),
        Number(data.darts2),
      ]);
    }

    if (data.bull_off_phase) {
      setBullOffPhase(data.bull_off_phase);
    } else if (data.starting_player == null) {
      setBullOffPhase('opening');
    } else {
      setBullOffPhase(null);
    }

    if (Array.isArray(data.bull_off_history)) {
      setBullHistory(data.bull_off_history);
    }

    if (data.live_status === 'finished') {
      setMatchCompleted(true);
    }
  }

  // Načítanie zápasu a histórie priamo zo Supabase.
  useEffect(() => {
    let active = true;

    async function loadMatch() {
      if (!matchId) {
        setMessage('Chýba ID zápasu.');
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase.rpc(
          'sp_get_match_live_state',
          { p_match_id: matchId }
        );

        if (error) throw error;
        if (!active) return;

        applyDatabaseState(data);

        // Počet víťazných legov načítame z nastavenia konkrétneho zápasu.
        const { data: matchFormat, error: formatError } = await supabase
          .from('matches')
          .select('live_legs_to_win')
          .eq('id', matchId)
          .maybeSingle();

        if (formatError) throw formatError;
        if (!active) return;

        const configuredLegs = Number(matchFormat?.live_legs_to_win);
        if (Number.isInteger(configuredLegs) && configuredLegs > 0) {
          setLegsToWin(configuredLegs);
        }

        const p1 = data.player1_id;
        const p2 = data.player2_id;

        // Podrobná história návštev.
        const { data: visits, error: historyError } =
          await supabase
            .from('match_visits')
            .select(
              'visit_number, player_id, visit_score, is_bust, is_checkout, darts_thrown'
            )
            .eq('match_id', matchId)
            .order('visit_number', { ascending: false });

        if (!historyError && active && visits) {
          const mapped = visits.map((item) => {
            const player = item.player_id === p1 ? 0 :
              item.player_id === p2 ? 1 : 0;

            return {
              player,
              name: names[player],
              scored: Number(item.visit_score),
              entered: Number(item.visit_score),
              darts: Number(item.darts_thrown || 3),
              bust: item.is_bust,
              checkout: item.is_checkout,
              bullOff: false,
              leg: 0,
            };
          });

          setHistory(mapped);
        }

        if (data.live_status === 'finished') {
          setMessage('Zápas je ukončený.');
        } else if (data.starting_player == null) {
          setMessage('Najskôr vykonajte úvodný rozstrel.');
          setBullOffPhase('opening');
        } else if (data.bull_off_phase === 'final') {
          setMessage('Obaja hráči vyčerpali 45 šípok. Rozhodne záverečný rozstrel.');
        } else {
          setMessage('Stav zápasu bol načítaný.');
        }
      } catch (error) {
        console.error('Načítanie zápasu zlyhalo:', error);
        if (active) {
          setMessage(
            `Zápas sa nepodarilo načítať: ${error.message}`
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadMatch();

    return () => {
      active = false;
    };
  }, [matchId]);

  function addDigit(value) {
    setVisitInput((old) => (old + String(value)).slice(0, 3));
    setMessage('');
  }

  function undoDigit() {
    setVisitInput((old) => old.slice(0, -1));
  }

  async function recordVisit() {
    if (saving || loading || matchCompleted || bullOffPhase) return;

    const value = Number(visitInput);

    if (
      visitInput === '' ||
      !Number.isInteger(value) ||
      value < 0 ||
      value > 180
    ) {
      setMessage('Zadaj skóre návštevy od 0 do 180.');
      return;
    }

    if (remainingDarts <= 0) {
      setMessage('Hráč už vyčerpal 45 šípok.');
      return;
    }

    const darts = Math.min(dartsThisVisit, remainingDarts);
    const before = scores[currentPlayer];
    const after = before - value;
    const checkout = after === 0 && doubleOut;

    const bust =
      after < 0 ||
      after === 1 ||
      (after === 0 && !doubleOut);

    const entry = {
      player: currentPlayer,
      name: activeName,
      scored: bust ? 0 : value,
      entered: value,
      before,
      after: bust ? before : after,
      darts,
      bust,
      checkout,
      bullOff: false,
      dartsUsedBefore: [...dartsUsed],
    };

    setSaving(true);
    setMessage('Ukladám návštevu...');

    try {
      const { data, error } = await supabase.rpc(
        'sp_record_match_visit_with_darts',
        {
          p_match_id: matchId,
          p_visit_score: value,
          p_double_out: doubleOut,
          p_darts_thrown: darts,
        }
      );

      if (error) throw error;

      if (data?.success === false) {
        throw new Error(data.message || 'Databáza odmietla návštevu.');
      }

      setHistory((old) => [entry, ...old]);
      setVisitInput('');
      setDoubleOut(false);
      setDartsThisVisit(3);

      applyDatabaseState(data);

      if (data.live_status === 'finished') {
        setMatchCompleted(true);
        setMessage(`${activeName} vyhráva zápas!`);

        if (typeof onFinish === 'function') {
          onFinish({
            legs: [
              Number(data.legs1),
              Number(data.legs2),
            ],
            history: [entry, ...history],
            scores: [
              Number(data.remaining1),
              Number(data.remaining2),
            ],
            darts: [
              Number(data.darts1),
              Number(data.darts2),
            ],
            saved: true,
            databaseResult: data,
          });
        }

        return;
      }

      if (data.bull_off_phase === 'final') {
        setBullOffPhase('final');
        setMessage(
          'Obaja hráči vyčerpali 45 šípok. Rozhodne záverečný rozstrel na bull.'
        );
      } else if (checkout) {
        setMessage(`${activeName} vyhráva leg!`);
      } else if (bust) {
        setMessage('BUST – skóre sa vracia späť.');
      } else {
        setMessage('Návšteva zapísaná.');
      }
    } catch (error) {
      console.error('Uloženie návštevy zlyhalo:', error);
      setMessage(
        `Návštevu sa nepodarilo uložiť: ${error.message}`
      );
    } finally {
      setSaving(false);
    }
  }

  // Úvodný a záverečný rozstrel.
  async function recordBullOff(winnerSlot, isTie = false) {
    if (saving || !bullOffPhase || matchCompleted) return;

    setSaving(true);
    setMessage('Ukladám výsledok rozstrelu...');

    try {
      const { data, error } = await supabase.rpc(
        'sp_record_match_bull_off',
        {
          p_match_id: matchId,
          p_phase: bullOffPhase,
          p_winner_slot: isTie ? null : winnerSlot + 1,
          p_is_tie: isTie,
        }
      );

      if (error) throw error;

      if (data?.success === false) {
        throw new Error(data.message || 'Rozstrel sa nepodarilo uložiť.');
      }

      if (isTie) {
        setBullHistory((old) => [
          ...old,
          {
            phase: bullOffPhase,
            is_tie: true,
            winner_slot: null,
          },
        ]);

        setMessage(
          'Rozstrel je nerozhodný. Hráči musia hádzať znova.'
        );
        return;
      }

      applyDatabaseState(data);

      setBullHistory((old) => [
        ...old,
        {
          phase: bullOffPhase,
          is_tie: false,
          winner_slot: winnerSlot + 1,
        },
      ]);

      if (bullOffPhase === 'opening') {
        setBullOffPhase(null);
        setCurrentPlayer(winnerSlot);
        setMessage(
          `${names[winnerSlot]} vyhráva úvodný rozstrel a začína prvý leg.`
        );
      } else {
        setBullOffPhase(null);

        if (data.live_status === 'finished') {
          setMatchCompleted(true);
          setMessage(
            `${names[winnerSlot]} vyhráva zápas rozstrelom na bull!`
          );

          if (typeof onFinish === 'function') {
            onFinish({
              legs: [
                Number(data.legs1),
                Number(data.legs2),
              ],
              history,
              scores: [
                Number(data.remaining1),
                Number(data.remaining2),
              ],
              darts: [
                Number(data.darts1),
                Number(data.darts2),
              ],
              saved: true,
              databaseResult: data,
            });
          }
        } else {
          setMessage(
            `${names[winnerSlot]} vyhráva leg rozstrelom na bull!`
          );
        }
      }
    } catch (error) {
      console.error('Rozstrel zlyhal:', error);
      setMessage(
        `Rozstrel sa nepodarilo uložiť: ${error.message}`
      );
    } finally {
      setSaving(false);
    }
  }

  async function undoLastVisit() {
    if (saving || !history.length || !matchId) return;

    const lastEntry = history[0];

    setSaving(true);
    setMessage('Vraciam poslednú návštevu...');

    try {
      const { data, error } = await supabase.rpc(
        'sp_undo_match_visit_with_darts',
        { p_match_id: matchId }
      );

      if (error) throw error;

      if (data?.success === false) {
        throw new Error(data.message || 'Undo sa nepodarilo.');
      }

      applyDatabaseState(data);

      setHistory((old) => old.slice(1));
      setVisitInput('');
      setDoubleOut(false);
      setDartsThisVisit(3);
      setMatchCompleted(false);

      setMessage('Posledná návšteva bola vrátená.');
    } catch (error) {
      console.error('Undo zlyhalo:', error);
      setMessage(
        `Poslednú návštevu sa nepodarilo vrátiť: ${error.message}`
      );
    } finally {
      setSaving(false);
      setUndoConfirm(false);
    }
  }

  // Predčasné ukončenie bez uloženia oficiálneho výsledku.
  function abandonMatch() {
    if (saving) return;

    setFinished(false);

    if (typeof onFinish === 'function') {
      onFinish({
        legs,
        history,
        scores,
        darts: dartsUsed,
        cancelled: true,
      });
    }
  }

  function closeScreen() {
    if (typeof onFinish === 'function') {
      onFinish({
        legs,
        history,
        scores,
        darts: dartsUsed,
        cancelled: true,
      });
    }
  }

  const styles = {
    root: {
      position: 'fixed',
      inset: 0,
      zIndex: 99999,
      width: '100vw',
      height: '100dvh',
      minHeight: '100vh',
      overflow: 'auto',
      background: '#081426',
      color: '#f7f8fb',
      fontFamily: 'Arial, Helvetica, sans-serif',
      padding: `
        calc(clamp(10px, 2vw, 24px) + var(--safe-area-top))
        calc(clamp(10px, 2vw, 24px) + var(--safe-area-right))
        calc(clamp(10px, 2vw, 24px) + var(--safe-area-bottom))
        calc(clamp(10px, 2vw, 24px) + var(--safe-area-left))
      `,
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 10,
      flexWrap: 'wrap',
    },
    brand: {
      color: '#e6b84b',
      fontWeight: 900,
      letterSpacing: 2,
      fontSize: 'clamp(17px, 2.5vw, 24px)',
    },
    button: {
      border: '1px solid #51617a',
      borderRadius: 10,
      padding: '10px 14px',
      background: '#172943',
      color: '#fff',
      fontWeight: 700,
      cursor: 'pointer',
    },
    players: {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
      gap: 12,
    },
    panel: {
      background: '#142943',
      border: '1px solid #314762',
      borderRadius: 16,
      padding: 'clamp(12px, 2.4vw, 24px)',
      textAlign: 'center',
      minWidth: 0,
    },
    playerName: {
      fontSize: 'clamp(14px, 2vw, 22px)',
      fontWeight: 800,
      overflowWrap: 'anywhere',
    },
    score: {
      fontSize: 'clamp(52px, 11vw, 108px)',
      lineHeight: 1.05,
      fontWeight: 900,
      color: '#fff',
      fontVariantNumeric: 'tabular-nums',
    },
    small: {
      color: '#b9c7d9',
      fontSize: 'clamp(11px, 1.4vw, 14px)',
    },
    center: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 18,
      flexWrap: 'wrap',
      textAlign: 'center',
    },
    legScore: {
      color: '#e6b84b',
      fontSize: 'clamp(30px, 5vw, 48px)',
      fontWeight: 900,
    },
    section: {
      background: '#101f34',
      border: '1px solid #2b4059',
      borderRadius: 14,
      padding: 14,
    },
    keypad: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
      gap: 8,
    },
    key: {
      border: '1px solid #415775',
      borderRadius: 12,
      minHeight: 48,
      background: '#1b3452',
      color: '#fff',
      fontSize: 22,
      fontWeight: 800,
      cursor: 'pointer',
    },
    gold: {
      background: '#bd9136',
      color: '#101827',
      border: 'none',
    },
    input: {
      fontSize: 30,
      fontWeight: 900,
      color: '#e6b84b',
      minHeight: 42,
      textAlign: 'center',
      fontVariantNumeric: 'tabular-nums',
    },
    lower: {
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1.15fr) minmax(0, .85fr)',
      gap: 12,
    },
    list: {
      maxHeight: 210,
      overflow: 'auto',
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
    },
    row: {
      display: 'flex',
      justifyContent: 'space-between',
      gap: 10,
      padding: '7px 9px',
      borderRadius: 8,
      background: '#172b44',
      fontSize: 13,
    },
    overlay: {
      position: 'fixed',
      inset: 0,
      zIndex: 100000,
      background: 'rgba(0,0,0,.88)',
      display: 'grid',
      placeItems: 'center',
      padding: 20,
    },
  };

  const disabled = saving || loading || matchCompleted;

  return (
    <div style={styles.root}>
      <style>{`
        * { box-sizing: border-box; }

        button:focus-visible {
          outline: 3px solid #e6b84b;
          outline-offset: 2px;
        }

        button:disabled {
          opacity: .45;
          cursor: not-allowed;
        }

        @media (max-width: 850px) {
          .sp-lower {
            grid-template-columns: 1fr !important;
          }

          .sp-history {
            max-height: 150px !important;
          }
        }
      `}</style>

      <header style={styles.header}>
        <div style={styles.brand}>
          ŠÍPKY PRO
          <span style={{ color: '#fff', fontWeight: 500 }}>
            {' '} / LIVE ZÁPAS
          </span>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            style={styles.button}
            disabled={disabled}
            onClick={() => setFinished(true)}
          >
            Predčasne ukončiť
          </button>

          <button style={styles.button} onClick={closeScreen}>
            Späť
          </button>
        </div>
      </header>

      <div style={styles.players}>
        {[0, 1].map((i) => (
          <section
            key={i}
            style={{
              ...styles.panel,
              borderColor:
                currentPlayer === i && !bullOffPhase
                  ? '#e6b84b'
                  : '#314762',
              boxShadow:
                currentPlayer === i && !bullOffPhase
                  ? '0 0 0 2px rgba(230,184,75,.18)'
                  : 'none',
            }}
          >
            <div style={styles.playerName}>{names[i]}</div>

            <div style={styles.score}>{scores[i]}</div>

            <div style={styles.small}>
              PRIEMER / 3 ŠÍPKY:
              <strong style={{ color: '#fff' }}>
                {' '}{averages[i]}
              </strong>
            </div>

            <div style={{ ...styles.small, marginTop: 6 }}>
              ŠÍPKY: {dartsUsed[i]} / {MAX_DARTS}
            </div>

            <div
              style={{
                height: 6,
                background: '#263c57',
                borderRadius: 9,
                marginTop: 9,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${(dartsUsed[i] / MAX_DARTS) * 100}%`,
                  background: '#e6b84b',
                }}
              />
            </div>

            {currentPlayer === i && !bullOffPhase && (
              <div
                style={{
                  color: '#e6b84b',
                  fontWeight: 900,
                  marginTop: 8,
                }}
              >
                NA ŤAHU
              </div>
            )}

            {dartsUsed[i] >= MAX_DARTS && !matchCompleted && (
              <div style={{ color: '#f3cc70', marginTop: 8, fontWeight: 800 }}>
                LIMIT VYČERPANÝ
              </div>
            )}
          </section>
        ))}
      </div>

      <div style={styles.center}>
        <div>
          <div style={styles.small}>LEGY</div>
          <div style={styles.legScore}>
            {legs[0]} : {legs[1]}
          </div>
        </div>

        <div>
          <div style={styles.small}>HRA</div>
          <div style={{ fontSize: 22, fontWeight: 900 }}>
            501 DOUBLE OUT
          </div>
        </div>

        <div>
          <div style={styles.small}>AKTUÁLNY STAV</div>
          <div
            style={{
              fontSize: 20,
              color: '#e6b84b',
              fontWeight: 900,
            }}
          >
            {bullOffPhase === 'opening'
              ? 'ÚVODNÝ ROZSTREL'
              : bullOffPhase === 'final'
                ? 'ZÁVEREČNÝ ROZSTREL'
                : activeName}
          </div>
        </div>
      </div>

      <section
        style={{
          ...styles.section,
          borderColor: '#bd9136',
          textAlign: 'center',
          padding: '10px 14px',
        }}
      >
        <div
          style={{
            color: '#e6b84b',
            fontSize: 'clamp(17px, 2.5vw, 22px)',
            fontWeight: 900,
            letterSpacing: 1,
          }}
        >
          HRA NA {legsToWin} VÍŤAZNÝCH LEGOV
        </div>
        <div style={{ ...styles.small, marginTop: 4 }}>
          Víťaz zápasu musí získať {legsToWin} legov.
        </div>
      </section>

      {message && (
        <div
          role="status"
          style={{
            ...styles.section,
            color: '#f3cc70',
            textAlign: 'center',
            fontWeight: 700,
          }}
        >
          {message}
        </div>
      )}

      {bullOffPhase && !matchCompleted && (
        <section
          style={{
            ...styles.section,
            borderColor: '#bd9136',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              color: '#e6b84b',
              fontSize: 22,
              fontWeight: 900,
              marginBottom: 8,
            }}
          >
            {bullOffPhase === 'opening'
              ? 'ÚVODNÝ ROZSTREL – KTO ZAČÍNA?'
              : 'ZÁVEREČNÝ ROZSTREL – KTO VYHRÁVA LEG?'}
          </div>

          <div style={{ ...styles.small, marginBottom: 14 }}>
            Rozhodca vyberie hráča, ktorého šípka je bližšie k stredu.
            Pri rovnakej vzdialenosti zvolí nerozhodný rozstrel.
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: 8,
            }}
          >
            <button
              style={{ ...styles.key, ...styles.gold, fontSize: 15 }}
              disabled={disabled}
              onClick={() => recordBullOff(0, false)}
            >
              {names[0]} – BLIŽŠIE K STREDU
            </button>

            <button
              style={{ ...styles.key, ...styles.gold, fontSize: 15 }}
              disabled={disabled}
              onClick={() => recordBullOff(1, false)}
            >
              {names[1]} – BLIŽŠIE K STREDU
            </button>
          </div>

          <button
            style={{
              ...styles.button,
              width: '100%',
              marginTop: 9,
              borderColor: '#e6b84b',
            }}
            disabled={disabled}
            onClick={() => recordBullOff(null, true)}
          >
            NEROZHODNÉ – OPAKOVAŤ ROZSTREL
          </button>

          <div style={{ ...styles.small, marginTop: 12 }}>
            Počet zaznamenaných pokusov:{' '}
            {bullHistory.filter(
              (item) => item.phase === bullOffPhase
            ).length}
          </div>
        </section>
      )}

      <div className="sp-lower" style={styles.lower}>
        <section style={styles.section}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 8,
              marginBottom: 8,
            }}
          >
            <strong>ZADANIE NÁVŠTEVY</strong>

            <span style={styles.small}>
              {bullOffPhase
                ? 'Čaká sa na rozstrel'
                : `Zostáva ${remainingDarts} šípok`}
            </span>
          </div>

          <div style={styles.input}>
            {visitInput || '—'}
          </div>

          <div style={styles.keypad}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
              <button
                key={n}
                style={styles.key}
                disabled={disabled || !!bullOffPhase}
                onClick={() => addDigit(n)}
              >
                {n}
              </button>
            ))}

            <button
              style={styles.key}
              disabled={disabled || !!bullOffPhase}
              onClick={() => setVisitInput('')}
            >
              C
            </button>

            <button
              style={styles.key}
              disabled={disabled || !!bullOffPhase}
              onClick={() => addDigit(0)}
            >
              0
            </button>

            <button
              style={styles.key}
              disabled={disabled || !!bullOffPhase}
              onClick={undoDigit}
            >
              ⌫
            </button>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
              marginTop: 10,
            }}
          >
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                fontSize: 13,
              }}
            >
              <input
                type="checkbox"
                checked={doubleOut}
                onChange={(e) => setDoubleOut(e.target.checked)}
                disabled={disabled || !!bullOffPhase}
              />
              Posledná šípka double
            </label>

            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                fontSize: 13,
              }}
            >
              Šípok:

              <select
                value={dartsThisVisit}
                onChange={(e) =>
                  setDartsThisVisit(Number(e.target.value))
                }
                disabled={disabled || !!bullOffPhase}
                style={{
                  background: '#1b3452',
                  color: '#fff',
                  padding: 7,
                  borderRadius: 7,
                  border: '1px solid #52647d',
                }}
              >
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={3}>3</option>
              </select>
            </label>
          </div>

          <button
            style={{
              ...styles.key,
              ...styles.gold,
              width: '100%',
              marginTop: 10,
              fontSize: 17,
            }}
            disabled={disabled || !!bullOffPhase}
            onClick={recordVisit}
          >
            {saving ? 'UKLADÁM...' : 'POTVRDIŤ NÁVŠTEVU'}
          </button>

          <button
            style={{
              ...styles.button,
              width: '100%',
              marginTop: 8,
              borderColor: '#bd9136',
              color: '#f3cc70',
            }}
            disabled={
              !history.length ||
              saving ||
              loading ||
              matchCompleted ||
              !!bullOffPhase
            }
            onClick={() => setUndoConfirm(true)}
          >
            KROK SPÄŤ – VRÁTIŤ POSLEDNÚ NÁVŠTEVU
          </button>
        </section>

        <section style={styles.section}>
          <strong>HISTÓRIA NÁVŠTEV</strong>

          <div
            className="sp-history"
            style={{ ...styles.list, marginTop: 9 }}
          >
            {history.length === 0 && (
              <div style={styles.small}>
                Zatiaľ bez zapísaných návštev.
              </div>
            )}

            {history.map((item, index) => (
              <div
                key={`${index}-${item.leg || 0}`}
                style={styles.row}
              >
                <span
                  style={{
                    minWidth: 0,
                    overflowWrap: 'anywhere',
                  }}
                >
                  {item.name}
                  {item.bust
                    ? ' · BUST'
                    : item.checkout
                      ? ' · CHECKOUT'
                      : ''}
                </span>

                <strong>
                  {item.entered}
                  <span style={styles.small}>
                    {' '}({item.darts} š.)
                  </span>
                </strong>
              </div>
            ))}
          </div>

          <div
            style={{
              marginTop: 12,
              borderTop: '1px solid #314762',
              paddingTop: 10,
            }}
          >
            <div style={styles.small}>POSLEDNÉ SKÓRE</div>

            <div
              style={{
                fontSize: 20,
                fontWeight: 900,
                color: '#e6b84b',
              }}
            >
              {scores[0]} : {scores[1]}
            </div>
          </div>

          <div
            style={{
              marginTop: 12,
              borderTop: '1px solid #314762',
              paddingTop: 10,
            }}
          >
            <div style={styles.small}>HISTÓRIA ROZSTRELOV</div>

            {bullHistory.length === 0 && (
              <div style={styles.small}>Zatiaľ bez rozstrelov.</div>
            )}

            {bullHistory.map((item, index) => (
              <div key={index} style={styles.row}>
                <span>
                  {item.phase === 'opening'
                    ? 'Úvodný'
                    : 'Záverečný'} rozstrel
                </span>

                <strong>
                  {item.is_tie
                    ? 'Remíza'
                    : names[(item.winner_slot || 1) - 1]}
                </strong>
              </div>
            ))}
          </div>
        </section>
      </div>

      {undoConfirm && (
        <div style={styles.overlay}>
          <div
            style={{
              ...styles.panel,
              width: 'min(440px, 100%)',
            }}
          >
            <div
              style={{
                color: '#e6b84b',
                fontSize: 21,
                fontWeight: 900,
              }}
            >
              VRÁTIŤ POSLEDNÚ NÁVŠTEVU?
            </div>

            <div style={{ margin: '14px 0', color: '#d7e0ec' }}>
              Posledná návšteva bude odstránená zo zápasu.
              Táto zmena sa uloží aj do databázy.
            </div>

            <div
              style={{
                display: 'flex',
                gap: 8,
                justifyContent: 'center',
                flexWrap: 'wrap',
              }}
            >
              <button
                style={styles.button}
                disabled={saving}
                onClick={() => setUndoConfirm(false)}
              >
                ZRUŠIŤ
              </button>

              <button
                style={{
                  ...styles.button,
                  background: '#bd9136',
                  color: '#101827',
                }}
                disabled={saving}
                onClick={undoLastVisit}
              >
                {saving ? 'VRACIAM...' : 'ÁNO, VRÁTIŤ'}
              </button>
            </div>
          </div>
        </div>
      )}

      {finished && (
        <div style={styles.overlay}>
          <div
            style={{
              ...styles.panel,
              width: 'min(440px, 100%)',
            }}
          >
            <div
              style={{
                color: '#e6b84b',
                fontSize: 22,
                fontWeight: 900,
              }}
            >
              PREDČASNE UKONČIŤ ZÁPAS?
            </div>

            <div
              style={{
                margin: '14px 0',
                fontSize: 28,
                fontWeight: 900,
              }}
            >
              {legs[0]} : {legs[1]}
            </div>

            <div style={{ margin: '0 0 14px', color: '#d7e0ec' }}>
              Zápas sa ukončí bez uloženia oficiálneho výsledku.
              Nedokončený zápas sa nebude počítať do výsledkov.
            </div>

            <div
              style={{
                display: 'flex',
                gap: 8,
                justifyContent: 'center',
                flexWrap: 'wrap',
              }}
            >
              <button
                style={styles.button}
                onClick={() => setFinished(false)}
              >
                Pokračovať v zápase
              </button>

              <button
                style={{
                  ...styles.button,
                  background: '#bd9136',
                  color: '#101827',
                }}
                disabled={saving}
                onClick={abandonMatch}
              >
                ÁNO, UKONČIŤ BEZ VÝSLEDKU
              </button>
            </div>
          </div>
        </div>
      )}

      {matchCompleted && (
        <div style={styles.overlay}>
          <div
            style={{
              ...styles.panel,
              width: 'min(440px, 100%)',
            }}
          >
            <div
              style={{
                color: '#e6b84b',
                fontSize: 25,
                fontWeight: 900,
              }}
            >
              ZÁPAS UKONČENÝ
            </div>

            <div style={{ margin: '15px 0', fontSize: 30, fontWeight: 900 }}>
              {legs[0]} : {legs[1]}
            </div>

            <button
              style={{
                ...styles.key,
                ...styles.gold,
                width: '100%',
              }}
              onClick={closeScreen}
            >
              ZAVRIEŤ ZÁPAS
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
