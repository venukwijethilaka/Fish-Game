// [AI-ASSISTED: Codex, 2026-11-05] Pirate Island Voyage Launcher & Global Scoreboard page.
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Anchor,
  Compass,
  Trophy,
  Sparkles,
  Waves,
  Timer,
  LayoutGrid,
  Fish,
  LoaderCircle,
  Radio,
  Leaf,
  ArrowRight,
  RotateCcw,
  Skull,
  Coins,
  ShieldCheck,
} from 'lucide-react';
import { LEVELS, type GameDTO, type Level, type Mode } from '../../../contracts/src/index';
import { api } from '../api';
import { useReef } from '../context';
import { Avatar, Notice, SailorAvatarIcon } from '../components';
import { SailingCanvas } from '../sailing/SailingCanvas';

export function Dashboard() {
  const { user, profile, activeGameId, setActiveGameId, mode } = useReef(),
    navigate = useNavigate();

  const [level, setLevel] = useState<Level>('EASY');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const levels: Level[] = ['EASY', 'MEDIUM', 'HARD'];

  const handleStart = useCallback(
    async (chosenLevel: Level) => {
      if (busy) return;
      setBusy(true);
      setError('');
      try {
        const game = await api<GameDTO>('/games', {
          level: chosenLevel,
          mode,
          requestId: crypto.randomUUID(),
        });
        setActiveGameId(game.id);
        navigate(`/game/${game.id}`);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [busy, mode, navigate, setActiveGameId],
  );

  useEffect(() => {
    const handleDashboardKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }

      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        setLevel((prev) => {
          const idx = levels.indexOf(prev);
          const nextIdx = (idx - 1 + levels.length) % levels.length;
          return levels[nextIdx];
        });
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        setLevel((prev) => {
          const idx = levels.indexOf(prev);
          const nextIdx = (idx + 1) % levels.length;
          return levels[nextIdx];
        });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (activeGameId) {
          navigate(`/game/${activeGameId}`);
        } else {
          void handleStart(level);
        }
      }
    };

    window.addEventListener('keydown', handleDashboardKey);
    return () => window.removeEventListener('keydown', handleDashboardKey);
  }, [level, activeGameId, handleStart, navigate]);

  return (
    <div className="pirate-dashboard-container">
      {/* 2D Interactive Ambient Sea Background */}
      <div className="dashboard-ambient-sea">
        <SailingCanvas
          checkpointIndex={1}
          fever={false}
          phase="PAUSED"
          paused={false}
          onDock={() => {}}
          onHit={() => {}}
        />
      </div>

      {/* The Central "WEIGH ANCHOR / SET SAIL" Popup Modal */}
      <div className="voyage-launcher-modal-backdrop">
        <div className="voyage-launcher-dialog">
          {/* Wooden Signboard Header with Iron Screws */}
          <div className="voyage-header-signboard">
            <div className="signboard-screw screw-tl" />
            <div className="signboard-screw screw-tr" />
            <div className="signboard-screw screw-bl" />
            <div className="signboard-screw screw-br" />
            <div className="signboard-title-row">
              <SailorAvatarIcon size={26} />
              <h2>SMART SAILOR EXPEDITION</h2>
              <Compass size={24} className="signboard-icon" />
            </div>
            <p>Welcome, Little Sailor {user?.username}! Choose your ocean sector to begin:</p>
          </div>

          {error && <Notice>{error}</Notice>}

          {/* Active Voyage Banner if a game is in progress */}
          {activeGameId && (
            <div className="active-voyage-banner">
              <div className="active-banner-left">
                <span className="ship-icon">⛵</span>
                <div>
                  <strong>Voyage In Progress!</strong>
                  <p>Your pirate ship is moored in open waters.</p>
                </div>
              </div>
              <button
                className="pirate-btn-small primary glow"
                onClick={() => navigate(`/game/${activeGameId}`)}
              >
                <span>RESUME EXPEDITION</span>
                <ArrowRight size={16} />
              </button>
            </div>
          )}

          {/* 3 Level Water Cards (Center Display) */}
          <div className="voyage-level-grid">
            {(Object.keys(LEVELS) as Level[]).map((lvlKey, idx) => {
              const pol = LEVELS[lvlKey];
              const isSelected = level === lvlKey;
              const titles = ['SHALLOW REEF', 'TWILIGHT WATERS', 'SKULL TRENCH'];
              const pierRanges = ['Piers 1–5 (Easy)', 'Piers 6–10 (Medium)', 'Piers 11–15 (Hard & Island)'];
              const descs = [
                'Calm turquoise waters, 2 camera feeds, ample battery life (15s). Tasks are simple scans.',
                'Murky deeper waters, 3 camera feeds (12s). The ship requests CSV-formatted telemetry data.',
                'Treacherous abyssal currents, 4 feeds (8s). Decrypt raw Base64 telemetry and claim the Final Island!',
              ];
              const icons = [<Fish size={24} />, <Waves size={24} />, <Skull size={24} />];

              return (
                <div
                  key={lvlKey}
                  className={`voyage-level-card ${lvlKey.toLowerCase()} ${isSelected ? 'selected' : ''}`}
                  onClick={() => setLevel(lvlKey)}
                  role="button"
                  tabIndex={0}
                >
                  <div className="level-card-header">
                    <span className="level-icon-badge">{icons[idx]}</span>
                    <div className="difficulty-stars">
                      {[0, 1, 2].map((s) => (
                        <span key={s} className={s <= idx ? 'star filled' : 'star'}>
                          ★
                        </span>
                      ))}
                    </div>
                  </div>
                  <h3 className="level-title">{titles[idx]}</h3>
                  <span className="level-piers-badge">{pierRanges[idx]}</span>
                  <p className="level-desc">{descs[idx]}</p>
                  <div className="level-footer-specs">
                    <span>
                      <LayoutGrid size={13} />
                      {pol.choices} camera feeds
                    </span>
                    <span>
                      <Timer size={13} />
                      {pol.timeMs / 1000}s per pier
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Launch Button */}
          <div className="voyage-action-footer">
            <button
              className="pirate-submit-btn large"
              disabled={busy}
              onClick={() => void handleStart(level)}
            >
              {busy ? (
                <>
                  <LoaderCircle size={22} className="spin" />
                  <span>PREPARING SATELLITE SONAR…</span>
                </>
              ) : (
                <>
                  <Anchor size={22} />
                  <span>
                    WEIGH ANCHOR & SET SAIL ({mode === 'practice' ? 'PRACTICE' : 'LIVE OCEAN'} ·{' '}
                    {level} WATERS)!
                  </span>
                  <ArrowRight size={22} />
                </>
              )}
            </button>
            <div className="keyboard-action-hint">
              Use <kbd>←</kbd> <kbd>→</kbd> arrows to choose ocean sector · Press <kbd>ENTER</kbd> to Weigh Anchor
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Standalone Leaderboard Page for direct /leaderboard route
export function Leaderboard() {
  const { board, profile, user, streamState } = useReef();
  const navigate = useNavigate();

  return (
    <div className="pirate-leaderboard-page">
      <div className="pirate-auth-card large">
        <div className="pirate-auth-signboard">
          <div className="signboard-screw screw-tl" />
          <div className="signboard-screw screw-tr" />
          <div className="signboard-screw screw-bl" />
          <div className="signboard-screw screw-br" />
          <div className="signboard-title-row">
            <Trophy size={28} className="signboard-icon gold" />
            <h1>THE SEVEN SEAS LEADERBOARD</h1>
            <Trophy size={28} className="signboard-icon gold" />
          </div>
          <p className="signboard-subtitle">
            Global Rankings · Real-time Server-Sent Events (SSE) Broadcast
          </p>
        </div>

        <div className="pirate-parchment-body">
          <div className="pane-header-row">
            <div>
              <h3>GLOBAL TOP 10 CAPTAINS</h3>
              <p>Rankings determined by expedition gold coins and voyage completion stopwatch</p>
            </div>
            <span className={`sse-indicator ${streamState === 'live' ? 'live' : ''}`}>
              <Radio size={14} className={streamState === 'live' ? 'pulse' : ''} />
              {streamState === 'live' ? 'Live SSE Stream Active' : 'Connecting to Satellite Sonar…'}
            </span>
          </div>

          <div className="scoreboard-list full">
            {board.length ? (
              board.map((entry) => {
                const isMe = entry.id === user?.id;
                return (
                  <div
                    key={entry.id}
                    className={`scoreboard-row ${isMe ? 'is-me' : ''} rank-${entry.rank}`}
                  >
                    <div className="score-rank-col">
                      {entry.rank === 1 ? (
                        <span className="crown-badge gold">🥇 1</span>
                      ) : entry.rank === 2 ? (
                        <span className="crown-badge silver">🥈 2</span>
                      ) : entry.rank === 3 ? (
                        <span className="crown-badge bronze">🥉 3</span>
                      ) : (
                        <span className="rank-num">#{entry.rank}</span>
                      )}
                    </div>
                    <Avatar id={entry.avatarId} size={44} />
                    <div className="score-name-col">
                      <span className="player-name">
                        {entry.username} {isMe && <small className="you-pill">YOU</small>}
                      </span>
                      <span className="player-sub">
                        Live Ocean Expedition
                      </span>
                    </div>
                    <div className="score-pts-col">
                      <Coins size={18} className="coin-icon" />
                      <strong>{entry.bestScore.toLocaleString()}</strong>
                      <small>coins</small>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="empty-scoreboard-box">
                <Trophy size={48} />
                <h4>No Captains Have Conquered the Island Yet!</h4>
                <p>Set sail on a live ocean expedition to claim the #1 spot!</p>
              </div>
            )}
          </div>

          <div className="leaderboard-actions">
            <button className="pirate-submit-btn" onClick={() => navigate('/dashboard')}>
              <Anchor size={18} />
              <span>RETURN TO EXPEDITION HELM</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
