
import React, { useState } from 'react';
import {
  Target,
  RotateCcw,
  Trophy,
  CheckCircle2
} from 'lucide-react';

const START_SCORE = 501;
const MAX_DARTS = 45;

export default function LiveScore({
  player1 = 'Hráč 1',
  player2 = 'Hráč 2',
  onFinish
}) {
  const names = [player1, player2];

  const [scores, setScores] = useState([501, 501]);
  const [legs, setLegs] = useState([0, 0]);
  const [darts, setDarts] = useState([0, 0]);
  const [current, setCurrent] = useState(0);
  const [visit, setVisit] = useState('');
  const [dartCount, setDartCount] = useState(3);
  const [doubleFinish, setDoubleFinish] = useState(false);
  const [history, setHistory] = useState([]);
  const [status, setStatus] = useState('playing');
  const [message, setMessage] = useState('');

  function enterDigit(digit) {
    if (status !== 'playing') return;

    setVisit(old => {
      const next = old + String(digit);
      return Number(next) > 180 ? old : next;
    });
  }

  function submitVisit() {
    if (visit === '' || status !== 'playing') return;

    const value = Number(visit);
    const usedDarts = Math.min(
      dartCount,
      MAX_DARTS - darts[current]
    );

    if (usedDarts <= 0) return;

    const remaining = scores[current] - value;

    const checkout =
      remaining === 0 && doubleFinish;

    const bust =
      remaining < 0 ||
      remaining === 1 ||
      (remaining === 0 && !doubleFinish);

    const finalScore = bust ? scores[current] : remaining;

    const nextScores = [...scores];
    const nextDarts = [...darts];

    nextScores[current] = finalScore;
    nextDarts[current] += usedDarts;

    const entry = {
      player: names[current],
      score: value,
      darts: usedDarts,
      remaining: finalScore,
      bust,
      checkout
    };

    setHistory(old => [entry, ...old]);
    setScores(nextScores);
    setDarts(nextDarts);
    setVisit('');
    setDoubleFinish(false);
    setDartCount(3);

    if (checkout) {
      const nextLegs = [...legs];
      nextLegs[current] += 1;
      setLegs(nextLegs);
      setStatus('leg-won');
      setMessage(`${names[current]} zatvára leg!`);
      return;
    }

    const other = 1 - current;

    if (
      nextDarts[0] >= MAX_DARTS &&
      nextDarts[1] >= MAX_DARTS
    ) {
      setStatus('bull');
      setMessage('Obaja hráči minuli 45 šípok. Nasleduje rozstrel na stred.');
      return;
    }

    if (nextDarts[other] >= MAX_DARTS) {
      setCurrent(current);
    } else {
      setCurrent(other);
    }
  }

  function chooseBullWinner(winner) {
    const nextLegs = [...legs];
    nextLegs[winner] += 1;
    setLegs(nextLegs);
    setStatus('leg-won');
    setMessage(`${names[winner]} vyhráva rozstrel na stred!`);
  }

  function nextLeg() {
    setScores([501, 501]);
    setDarts([0, 0]);
    setCurrent(0);
    setVisit('');
    setDoubleFinish(false);
    setDartCount(3);
    setHistory([]);
    setStatus('playing');
    setMessage('');
  }

  function resetMatch() {
    setScores([501, 501]);
    setLegs([0, 0]);
    setDarts([0, 0]);
    setCurrent(0);
    setVisit('');
    setHistory([]);
    setStatus('playing');
    setMessage('');
    setDoubleFinish(false);
    setDartCount(3);
  }

  const keypad = [1, 2, 3, 4, 5, 6, 7, 8, 9, 'C', 0, 'OK'];

  return (
    <div className="live-score">
      <style>{`
        .live-score {
          background:#071426;
          color:#fff;
          min-height:100vh;
          padding:18px;
          font-family:Arial,sans-serif;
        }
        .ls-top {
          display:flex;
          justify-content:space-between;
          align-items:center;
          gap:12px;
          flex-wrap:wrap;
          margin-bottom:20px;
        }
        .ls-title {
          color:#e7b94f;
          font-size:25px;
          font-weight:800;
        }
        .ls-btn {
          background:#172b43;
          color:#fff;
          border:1px solid #bd9237;
          border-radius:9px;
          padding:11px 15px;
          cursor:pointer;
        }
        .ls-players {
          display:grid;
          grid-template-columns:1fr 1fr;
          gap:12px;
        }
        .ls-player {
          background:#10243b;
          border:2px solid #263e59;
          border-radius:15px;
          padding:18px;
          text-align:center;
        }
        .ls-player.active {
          border-color:#e7b94f;
          box-shadow:0 0 18px #e7b94f30;
        }
        .ls-name {
          font-size:18px;
          font-weight:700;
          color:#e7b94f;
        }
        .ls-score {
          font-size:clamp(42px,9vw,76px);
          font-weight:900;
          margin:12px 0;
        }
        .ls-info {
          font-size:14px;
          color:#b8c5d4;
          line-height:1.8;
        }
        .ls-legs {
          text-align:center;
          margin:18px auto;
          color:#e7b94f;
          font-size:24px;
          font-weight:800;
        }
        .ls-panel {
          background:#10243b;
          border-radius:14px;
          padding:16px;
          margin-top:18px;
        }
        .ls-input {
          font-size:34px;
          text-align:center;
          color:#e7b94f;
          font-weight:800;
          padding:12px;
        }
        .ls-keypad {
          display:grid;
          grid-template-columns:repeat(3,1fr);
          gap:9px;
        }
        .ls-key {
          background:#1b3450;
          color:white;
          border:1px solid #34516e;
          padding:17px 8px;
          border-radius:10px;
          font-size:23px;
          font-weight:700;
        }
        .ls-key.ok {
          background:#b88a2e;
          color:#071426;
        }
        .ls-options {
          display:flex;
          gap:10px;
          flex-wrap:wrap;
          align-items:center;
          margin:12px 0;
          color:#d6dfeb;
        }
        .ls-options select {
          background:#1b3450;
          color:white;
          padding:9px;
          border:1px solid #52677f;
          border-radius:8px;
        }
        .ls-history {
          max-height:260px;
          overflow:auto;
        }
        .ls-row {
          display:flex;
          justify-content:space-between;
          gap:8px;
          border-bottom:1px solid #29405a;
          padding:10px 2px;
          font-size:14px;
        }
        .ls-message {
          text-align:center;
          color:#e7b94f;
          font-size:19px;
          font-weight:800;
          padding:18px;
        }
        .ls-bull {
          display:flex;
          gap:10px;
          justify-content:center;
          flex-wrap:wrap;
        }
        @media(max-width:520px) {
          .live-score {padding:10px}
          .ls-player {padding:12px 6px}
          .ls-name {font-size:14px}
          .ls-info {font-size:12px}
        }
      `}</style>

      <div className="ls-top">
        <div className="ls-title">
          <Target size={23} style={{verticalAlign:'middle'}} />
          {' '}501 DOUBLE OUT
        </div>
        <button className="ls-btn" onClick={resetMatch}>
          <RotateCcw size={16} /> Nový zápas
        </button>
      </div>

      <div className="ls-players">
        {[0, 1].map(i => (
          <div
            key={i}
            className={`ls-player ${
              current === i && status === 'playing'
                ? 'active'
                : ''
            }`}
          >
            <div className="ls-name">{names[i]}</div>
            <div className="ls-score">{scores[i]}</div>
            <div className="ls-info">
              Zostávajúce šípky: {MAX_DARTS - darts[i]} / 45
              <br />
              Odohrať: {darts[i]} šípok
            </div>
          </div>
        ))}
      </div>

      <div className="ls-legs">
        LEGY: {legs[0]} : {legs[1]}
      </div>

      {status === 'playing' && (
        <div className="ls-panel">
          <div style={{
            textAlign:'center',
            color:'#e7b94f',
            fontWeight:700
          }}>
            HÁDŽE: {names[current]}
          </div>

          <div className="ls-input">{visit || '0'}</div>

          <div className="ls-options">
            <label>Počet šípok:</label>
            <select
              value={dartCount}
              onChange={e => setDartCount(Number(e.target.value))}
            >
              {[1, 2, 3].map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>

            <label>
              <input
                type="checkbox"
                checked={doubleFinish}
                onChange={e => setDoubleFinish(e.target.checked)}
              />
              Zatvorenie na double
            </label>
          </div>

          <div className="ls-keypad">
            {keypad.map((key, i) => (
              <button
                key={i}
                className={`ls-key ${key === 'OK' ? 'ok' : ''}`}
                onClick={() => {
                  if (key === 'C') setVisit('');
                  else if (key === 'OK') submitVisit();
                  else enterDigit(key);
                }}
              >
                {key}
              </button>
            ))}

            <button
              className="ls-key"
              onClick={() => setVisit(old => old.slice(0, -1))}
            >
              ⌫
            </button>
          </div>
        </div>
      )}

      {status === 'bull' && (
        <div className="ls-panel">
          <div className="ls-message">{message}</div>
          <div className="ls-bull">
            <button className="ls-btn" onClick={() => chooseBullWinner(0)}>
              {names[0]} bližšie k stredu
            </button>
            <button className="ls-btn" onClick={() => chooseBullWinner(1)}>
              {names[1]} bližšie k stredu
            </button>
          </div>
        </div>
      )}

      {status === 'leg-won' && (
        <div className="ls-panel">
          <div className="ls-message">
            <Trophy size={22} /> {message}
          </div>

          <div style={{
            display:'flex',
            gap:10,
            justifyContent:'center',
            flexWrap:'wrap'
          }}>
            <button className="ls-btn" onClick={nextLeg}>
              Ďalší leg
            </button>

            <button
              className="ls-btn"
              onClick={() => onFinish?.({
                legs,
                history,
                scores,
                darts
              })}
            >
              <CheckCircle2 size={16} />
              {' '}Odovzdať výsledok
            </button>
          </div>
        </div>
      )}

      <div className="ls-panel">
        <h3 style={{color:'#e7b94f', marginTop:0}}>
          História návštev
        </h3>

        <div className="ls-history">
          {history.length === 0 && (
            <div className="ls-info">Zatiaľ bez návštev.</div>
          )}

          {history.map((item, i) => (
            <div className="ls-row" key={i}>
              <span>{item.player}</span>
              <strong>
                {item.bust
                  ? 'BUST'
                  : item.checkout
                    ? 'CHECKOUT'
                    : item.score}
              </strong>
              <span>{item.darts} šíp.</span>
              <span>Zostáva: {item.remaining}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

