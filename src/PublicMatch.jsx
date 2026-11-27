import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';

const REFRESH_INTERVAL = 3000;

export default function PublicMatch({ token: suppliedToken }) {
  const [match, setMatch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdate, setLastUpdate] = useState(null);

  const token = suppliedToken ||
    new URLSearchParams(window.location.search).get('watch');

  const loadMatch = useCallback(async (initial = false) => {
    if (!token) {
      setError('Verejný odkaz neobsahuje platný token.');
      setLoading(false);
      return;
    }

    try {
      const { data, error: rpcError } = await supabase.rpc(
        'sp_get_public_match',
        { p_token: token }
      );

      if (rpcError) {
        throw rpcError;
      }

      if (!data || !data.success) {
        throw new Error('Zápas sa nepodarilo načítať.');
      }

      setMatch(data);
      setLastUpdate(new Date());
      setError('');
    } catch (err) {
      if (initial || !match) {
        setError(
          'Zápas nie je dostupný. Odkaz môže byť neplatný alebo zrušený.'
        );
      }
    } finally {
      setLoading(false);
    }
  }, [token, match]);

  useEffect(() => {
    loadMatch(true);

    const interval = setInterval(() => {
      loadMatch(false);
    }, REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, [loadMatch]);

  const styles = {
    page: {
      minHeight: '100vh',
      width: '100%',
      background: '#081426',
      color: '#fff',
      fontFamily: 'Arial, Helvetica, sans-serif',
      padding: 'clamp(12px, 3vw, 28px)',
      boxSizing: 'border-box',
    },
    container: {
      width: '100%',
      maxWidth: 1100,
      margin: '0 auto',
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 12,
      marginBottom: 24,
    },
    brand: {
      color: '#e6b84b',
      fontSize: 'clamp(20px, 4vw, 30px)',
      fontWeight: 900,
      letterSpacing: 2,
    },
    live: {
      background: '#176b43',
      color: '#fff',
      padding: '8px 15px',
      borderRadius: 30,
      fontWeight: 900,
      fontSize: 13,
    },
    card: {
      background: '#142943',
      border: '1px solid #314762',
      borderRadius: 18,
      padding: 'clamp(14px, 3vw, 28px)',
      textAlign: 'center',
    },
    players: {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
      gap: 12,
    },
    playerName: {
      fontSize: 'clamp(14px, 2.5vw, 23px)',
      fontWeight: 900,
      overflowWrap: 'anywhere',
    },
    score: {
      fontSize: 'clamp(55px, 12vw, 110px)',
      lineHeight: 1.1,
      fontWeight: 900,
      margin: '12px 0',
      fontVariantNumeric: 'tabular-nums',
    },
    label: {
      color: '#b9c7d9',
      fontSize: 12,
      letterSpacing: 1,
    },
    center: {
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 35,
      textAlign: 'center',
      margin: '22px 0',
    },
    legs: {
      color: '#e6b84b',
      fontSize: 'clamp(34px, 7vw, 54px)',
      fontWeight: 900,
    },
    history: {
      display: 'flex',
      flexDirection: 'column',
      gap: 7,
      marginTop: 12,
    },
    historyRow: {
      display: 'flex',
      justifyContent: 'space-between',
      gap: 10,
      alignItems: 'center',
      padding: '11px 13px',
      background: '#172b44',
      borderRadius: 9,
      fontSize: 14,
    },
    footer: {
      textAlign: 'center',
      color: '#8fa1b8',
      fontSize: 12,
      marginTop: 22,
    },
  };

  if (loading && !match) {
    return (
      <main style={styles.page}>
        <div style={styles.container}>
          <div style={styles.brand}>ŠÍPKY PRO</div>
          <div style={{ ...styles.card, marginTop: 40 }}>
            Načítavam živý zápas...
          </div>
        </div>
      </main>
    );
  }

  if (error && !match) {
    return (
      <main style={styles.page}>
        <div style={styles.container}>
          <div style={styles.brand}>ŠÍPKY PRO</div>
          <div style={{ ...styles.card, marginTop: 40 }}>
            <h2 style={{ color: '#e6b84b' }}>
              Zápas nie je dostupný
            </h2>
            <p>{error}</p>
          </div>
        </div>
      </main>
    );
  }

  const isFinished = match.live_status === 'finished';

  return (
    <main style={styles.page}>
      <style>{`
        * { box-sizing: border-box; }
        @media (max-width: 500px) {
          .public-history { font-size: 12px !important; }
        }
      `}</style>

      <div style={styles.container}>
        <header style={styles.header}>
          <div style={styles.brand}>ŠÍPKY PRO</div>

          <div style={styles.live}>
            {isFinished ? 'UKONČENÝ ZÁPAS' : '● LIVE ZÁPAS'}
          </div>
        </header>

        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={styles.label}>HRA</div>
          <h2 style={{ margin: 6 }}>501 DOUBLE OUT</h2>
        </div>

        <div style={styles.players}>
          {[1, 2].map((slot) => {
            const isCurrent =
              Number(match.current_player_slot) === slot &&
              !isFinished;

            return (
              <section
                key={slot}
                style={{
                  ...styles.card,
                  borderColor: isCurrent
                    ? '#e6b84b'
                    : '#314762',
                  borderWidth: isCurrent ? 2 : 1,
                }}
              >
                <div style={styles.playerName}>
                  {slot === 1 ? match.player1 : match.player2}
                </div>

                <div style={styles.score}>
                  {slot === 1
                    ? match.remaining1
                    : match.remaining2}
                </div>

                <div style={styles.label}>
                  ZOSTÁVAJÚCE BODY
                </div>

                {isCurrent && (
                  <div
                    style={{
                      color: '#e6b84b',
                      fontWeight: 900,
                      marginTop: 12,
                    }}
                  >
                    NA ŤAHU
                  </div>
                )}
              </section>
            );
          })}
        </div>

        <div style={styles.center}>
          <div>
            <div style={styles.label}>LEGy</div>
            <div style={styles.legs}>
              {match.legs1} : {match.legs2}
            </div>
          </div>

          <div>
            <div style={styles.label}>STAV ZÁPASU</div>
            <div style={{ fontWeight: 900, fontSize: 17 }}>
              {isFinished
                ? 'KONIEC'
                : match.live_status === 'playing'
                  ? 'PREBIEHA'
                  : 'PRIPRAVENÝ'}
            </div>
          </div>
        </div>

        <section style={styles.card}>
          <div style={{ fontWeight: 900, textAlign: 'left' }}>
            HISTÓRIA NÁVŠTEV
          </div>

          <div style={styles.history}>
            {(!match.history || match.history.length === 0) && (
              <div style={{ color: '#b9c7d9', padding: 12 }}>
                Zatiaľ nebol zapísaný žiadny hod.
              </div>
            )}

            {match.history?.map((item) => (
              <div
                key={item.visit_number}
                className="public-history"
                style={styles.historyRow}
              >
                <span>
                  {item.player_name}
                  {item.is_bust && ' · BUST'}
                  {item.is_checkout && ' · CHECKOUT'}
                </span>

                <strong style={{ color: '#e6b84b' }}>
                  {item.visit_score}
                </strong>
              </div>
            ))}
          </div>
        </section>

        <div style={styles.footer}>
          {lastUpdate && (
            <div>
              Aktualizované: {lastUpdate.toLocaleTimeString('sk-SK')}
            </div>
          )}

          <div>
            ŠÍPKY PRO · Verejné sledovanie zápasu
          </div>

          <div>
            Obnovovanie každé 3 sekundy
          </div>
        </div>
      </div>
    </main>
  );
}
