import React, { useMemo, useState } from 'react';

const START_SCORE = 501;
const MAX_DARTS = 45;

export default function LiveScore({
  player1 = 'Hráč 1',
  player2 = 'Hráč 2',
  onFinish,
}) {
  const [scores, setScores] = useState([START_SCORE, START_SCORE]);
  const [legs, setLegs] = useState([0, 0]);
  const [currentPlayer, setCurrentPlayer] = useState(0);
  const [visitInput, setVisitInput] = useState('');
  const [doubleOut, setDoubleOut] = useState(false);
  const [dartsThisVisit, setDartsThisVisit] = useState(3);
  const [dartsUsed, setDartsUsed] = useState([0, 0]);
  const [history, setHistory] = useState([]);
  const [legHistory, setLegHistory] = useState([]);
  const [message, setMessage] = useState('');
  const [bullOff, setBullOff] = useState(false);
  const [finished, setFinished] = useState(false);

  const names = [player1, player2];
  const activeName = names[currentPlayer];
  const remainingDarts = MAX_DARTS - dartsUsed[currentPlayer];

  const averages = useMemo(() => {
    return [0, 1].map((i) => {
      const playerVisits = history.filter(
        (item) => item.player === i && !item.bullOff
      );
      const thrown = playerVisits.reduce(
        (sum, item) => sum + item.darts, 0
      );
      const scored = playerVisits.reduce(
        (sum, item) => sum + item.scored, 0
      );

      return thrown
        ? ((scored / thrown) * 3).toFixed(2)
        : '0.00';
    });
  }, [history]);

  function addDigit(value) {
    setVisitInput((old) => (old + String(value)).slice(0, 3));
    setMessage('');
  }

  function undoDigit() {
    setVisitInput((old) => old.slice(0, -1));
  }

  function recordVisit() {
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
      leg: legs[0] + legs[1] + 1,
    };

    const nextDarts = [...dartsUsed];
    nextDarts[currentPlayer] += darts;

    setDartsUsed(nextDarts);
    setHistory((old) => [entry, ...old]);
    setVisitInput('');
    setDoubleOut(false);
    setDartsThisVisit(3);

    if (checkout) {
      const nextLegs = [...legs];
      nextLegs[currentPlayer] += 1;

      setLegs(nextLegs);
      setLegHistory((old) => [
        ...old,
        {
          winner: currentPlayer,
          legs: nextLegs,
          history: [entry],
        },
      ]);

      setScores([START_SCORE, START_SCORE]);
      setDartsUsed([0, 0]);
      setCurrentPlayer(currentPlayer);
      setMessage(`${activeName} vyhráva leg!`);
      return;
    }

    if (
      nextDarts[0] >= MAX_DARTS &&
      nextDarts[1] >= MAX_DARTS
    ) {
      setBullOff(true);
      setMessage(
        'Obaja hráči vyčerpali 45 šípok. Rozhodne rozstrel na bull.'
      );
      return;
    }

    const other = 1 - currentPlayer;

    if (
      nextDarts[other] >= MAX_DARTS &&
      nextDarts[currentPlayer] < MAX_DARTS
    ) {
      setCurrentPlayer(currentPlayer);
      setMessage(
        'Súper vyčerpal 45 šípok. Dokonči svoje zostávajúce šípky.'
      );
    } else if (nextDarts[currentPlayer] >= MAX_DARTS) {
      if (nextDarts[other] < MAX_DARTS) {
        setCurrentPlayer(other);
        setMessage(
          'Hráč vyčerpal 45 šípok. Pokračuje súper.'
        );
      } else {
        setBullOff(true);
      }
    } else {
      setCurrentPlayer(other);
      setMessage(
        bust
          ? 'BUST – skóre sa vracia späť.'
          : 'Návšteva zapísaná.'
      );
    }
  }

  function decideBull(winner) {
    const nextLegs = [...legs];
    nextLegs[winner] += 1;

    const entry = {
      player: winner,
      name: names[winner],
      scored: 0,
      entered: 0,
      before: scores[winner],
      after: scores[winner],
      darts: 0,
      bust: false,
      checkout: false,
      bullOff: true,
      leg: legs[0] + legs[1] + 1,
    };

    setHistory((old) => [entry, ...old]);
    setLegHistory((old) => [
      ...old,
      {
        winner,
        legs: nextLegs,
        history: [entry],
      },
    ]);

    setLegs(nextLegs);
    setScores([START_SCORE, START_SCORE]);
    setDartsUsed([0, 0]);
    setCurrentPlayer(winner);
    setBullOff(false);
    setMessage(
      `${names[winner]} vyhráva rozstrel na bull a leg.`
    );
  }

  function finishMatch() {
    setFinished(true);

    if (typeof onFinish === 'function') {
      onFinish({
        legs,
        history,
        scores,
        darts: dartsUsed,
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
      padding: 'clamp(10px, 2vw, 24px)',
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

  return (
    <div style={styles.root}>
      <style>{`
        * {
          box-sizing: border-box;
        }

        button:focus-visible {
          outline: 3px solid #e6b84b;
          outline-offset: 2px;
        }

        @media (max-width: 650px) {
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
            onClick={() => setFinished(true)}
          >
            Ukončiť zápas
          </button>

          <button
            style={styles.button}
            onClick={closeScreen}
          >
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
                currentPlayer === i && !bullOff
                  ? '#e6b84b'
                  : '#314762',
              boxShadow:
                currentPlayer === i && !bullOff
                  ? '0 0 0 2px rgba(230,184,75,.18)'
                  : 'none',
            }}
          >
            <div style={styles.playerName}>
              {names[i]}
            </div>

            <div style={styles.score}>
              {scores[i]}
            </div>

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

            {currentPlayer === i && !bullOff && (
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
          <div style={styles.small}>AKTUÁLNE HÁDŽE</div>
          <div
            style={{
              fontSize: 20,
              color: '#e6b84b',
              fontWeight: 900,
            }}
          >
            {bullOff ? 'ROZSTREL NA BULL' : activeName}
          </div>
        </div>
      </div>

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
              {bullOff
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
                disabled={bullOff}
                onClick={() => addDigit(n)}
              >
                {n}
              </button>
            ))}

            <button
              style={styles.key}
              disabled={bullOff}
              onClick={() => setVisitInput('')}
            >
              C
            </button>

            <button
              style={styles.key}
              disabled={bullOff}
              onClick={() => addDigit(0)}
            >
              0
            </button>

            <button
              style={styles.key}
              disabled={bullOff}
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
                disabled={bullOff}
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
                disabled={bullOff}
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
            disabled={bullOff}
            onClick={recordVisit}
          >
            POTVRDIŤ NÁVŠTEVU
          </button>

          {bullOff && (
            <div
              style={{
                marginTop: 12,
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 8,
              }}
            >
              <button
                style={{
                  ...styles.key,
                  ...styles.gold,
                  fontSize: 14,
                }}
                onClick={() => decideBull(0)}
              >
                {names[0]} bližšie k bullu
              </button>

              <button
                style={{
                  ...styles.key,
                  ...styles.gold,
                  fontSize: 14,
                }}
                onClick={() => decideBull(1)}
              >
                {names[1]} bližšie k bullu
              </button>
            </div>
          )}
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
                key={`${index}-${item.leg}`}
                style={styles.row}
              >
                <span
                  style={{
                    minWidth: 0,
                    overflowWrap: 'anywhere',
                  }}
                >
                  {item.name}
                  {item.bullOff
                    ? ' · BULL'
                    : item.bust
                      ? ' · BUST'
                      : item.checkout
                        ? ' · CHECKOUT'
                        : ''}
                </span>

                <strong>
                  {item.bullOff
                    ? 'BULL'
                    : item.bust
                      ? '0'
                      : item.entered}

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
        </section>
      </div>

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
              UKONČIŤ ZÁPAS?
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
                Pokračovať
              </button>

              <button
                style={{
                  ...styles.button,
                  background: '#bd9136',
                  color: '#101827',
                }}
                onClick={finishMatch}
              >
                Potvrdiť koniec
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
