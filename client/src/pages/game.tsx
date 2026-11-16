// [AI-ASSISTED: Codex, 2026-11-05] 2D Pirate Island Sailing Expedition & Quiz Page.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Anchor,
  ArrowLeft,
  ArrowRight,
  Check,
  X,
  Clock3,
  Pause,
  Play,
  Trophy,
  RotateCcw,
  LoaderCircle,
  LogOut,
  Skull,
  Coins,
  Compass,
  Menu,
} from 'lucide-react';
import { LEVELS, type GameDTO } from '../../../contracts/src/index';
import { api, ApiError } from '../api';
import { useReef } from '../context';
import { Loading, Notice, SailorAvatarIcon } from '../components';
import { SailingCanvas } from '../sailing/SailingCanvas';

const ended = (phase: string) =>
  ['GAME_OVER', 'COMPLETED', 'ABANDONED', 'INTERRUPTED'].includes(phase);

function formatStopwatch(ms: number) {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  const tenths = Math.floor((ms % 1000) / 100);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${tenths}`;
}

export function GamePage() {
  const { gameId } = useParams(),
    navigate = useNavigate(),
    { refresh, setActiveGameId, logout } = useReef();
  const [game, setGame] = useState<GameDTO | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [now, setNow] = useState(performance.now()),
    [leave, setLeave] = useState(false),
    [leaving, setLeaving] = useState(false),
    [selected, setSelected] = useState<string | null>(null),
    [showOrders, setShowOrders] = useState(() => !localStorage.getItem('reef_orders_seen')),
    [leaveSelection, setLeaveSelection] = useState<'stay' | 'abandon'>('stay'),
    [mcqIndex, setMcqIndex] = useState<number>(0),
    [resultNavIndex, setResultNavIndex] = useState<number>(0),
    [errorNavIndex, setErrorNavIndex] = useState<number>(0);

  const current = useRef<GameDTO | null>(null),
    receivedAt = useRef(performance.now()),
    loaded = useRef(new Set<string>()),
    readySent = useRef(''),
    busyRef = useRef(false),
    dockingRef = useRef<number | null>(null),
    dockLockRef = useRef(false),
    lastDockAttemptRef = useRef(0),
    lastHitRef = useRef(0),
    pending = useRef<{ questionId: string; optionId: string; requestId: string } | null>(null),
    pausedForLeave = useRef(false),
    leaveTarget = useRef('/dashboard'),
    showOrdersRef = useRef(showOrders),
    leaveRef = useRef(leave),
    leaveSelectionRef = useRef(leaveSelection),
    mcqIndexRef = useRef(mcqIndex),
    resultNavIndexRef = useRef(resultNavIndex),
    errorNavIndexRef = useRef(errorNavIndex);

  showOrdersRef.current = showOrders;
  leaveRef.current = leave;
  leaveSelectionRef.current = leaveSelection;
  mcqIndexRef.current = mcqIndex;
  resultNavIndexRef.current = resultNavIndex;
  errorNavIndexRef.current = errorNavIndex;

  const adopt = useCallback((g: GameDTO) => {
    if (current.current && g.id === current.current.id && g.version < current.current.version)
      return;
    current.current = g;
    receivedAt.current = performance.now();
    setGame(g);
    if (g.phase !== 'PLAYING') pending.current = null;
  }, []);

  const sync = useCallback(async () => {
    if (!gameId) return;
    try {
      const g = await api<GameDTO>(`/games/${gameId}`);
      adopt(g);
      if (ended(g.phase)) {
        setActiveGameId(null);
        void refresh();
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }, [gameId, adopt, refresh, setActiveGameId]);

  useEffect(() => {
    void sync();
    const t = setInterval(() => setNow(performance.now()), 100);
    return () => clearInterval(t);
  }, [sync]);

  const command = useCallback(
    async (action: string, body: unknown = {}) => {
      if (busyRef.current || !gameId) return;
      busyRef.current = true;
      setBusy(true);
      setError('');
      try {
        const g = await api<GameDTO>(`/games/${gameId}/${action}`, body);
        adopt(g);
        return g;
      } catch (e) {
        if (
          e instanceof ApiError &&
          ['STALE_QUESTION', 'NOT_PLAYING', 'TOO_EARLY', 'NOT_SAILING', 'INVALID_CHECKPOINT'].includes(e.code)
        )
          await sync();
        else setError((e as Error).message);
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [gameId, adopt, sync],
  );

  useEffect(() => {
    if (!game) return;
    loaded.current.clear();
    readySent.current = '';
    setSelected(null);
    setMcqIndex(0);
    mcqIndexRef.current = 0;
    pending.current = null;
  }, [game?.question?.id]);

  useEffect(() => {
    if (!game) return;
    let delay: number | undefined;
    if (game.phase === 'FEEDBACK') delay = 800;
    if (game.phase === 'PLAYING') delay = game.remainingMs + 1150;
    if (game.phase === 'PAUSED')
      delay = Math.max(0, (game.pauseExpiresAt ?? Date.now()) - game.serverNow) + 150;
    if (game.phase === 'AWAITING_READY') delay = 10200;
    if (delay === undefined) return;
    const t = setTimeout(() => void sync(), delay);
    return () => clearTimeout(t);
  }, [game?.phase, game?.version, sync]);

  useEffect(() => {
    if (game && ended(game.phase)) {
      setActiveGameId(null);
      void refresh();
    }
  }, [game, refresh, setActiveGameId]);

  const answer = useCallback(
    async (optionId: string) => {
      if (busy || !game || game.phase !== 'PLAYING' || !game.question) return;
      setSelected(optionId);
      const req = {
        questionId: game.question.id,
        optionId,
        requestId: crypto.randomUUID(),
      };
      pending.current = req;
      await command('answers', req);
    },
    [busy, command, game],
  );

  // Reset docking latch when returning to SAILING phase for a new checkpoint
  useEffect(() => {
    if (
      game?.phase === 'SAILING' &&
      dockingRef.current !== null &&
      dockingRef.current !== game.checkpointIndex
    ) {
      dockingRef.current = null;
    }
  }, [game?.phase, game?.checkpointIndex]);

  const handleDock = useCallback(
    async (checkpointIndex: number) => {
      const g = current.current;
      const now = performance.now();
      if (!g || g.phase !== 'SAILING' || busyRef.current || dockLockRef.current) return;
      if (dockingRef.current === checkpointIndex) return;
      if (now - lastDockAttemptRef.current < 2000) return;
      lastDockAttemptRef.current = now;
      dockLockRef.current = true;
      dockingRef.current = checkpointIndex;
      try {
        const res = await command('dock', { checkpointIndex, requestId: crypto.randomUUID() });
        if (!res) {
          setTimeout(() => {
            dockLockRef.current = false;
            if (current.current?.phase === 'SAILING') {
              dockingRef.current = null;
            }
          }, 2500);
        } else {
          dockLockRef.current = false;
        }
      } catch {
        setTimeout(() => {
          dockLockRef.current = false;
          dockingRef.current = null;
        }, 2500);
      }
    },
    [command],
  );

  const handleHit = useCallback(
    async (hazardType: 'rock' | 'barrel' | 'shark') => {
      const g = current.current;
      const now = performance.now();
      if (!g || g.phase !== 'SAILING' || busyRef.current || now - lastHitRef.current < 1500) return;
      lastHitRef.current = now;
      await command('hit', { hazardType, requestId: crypto.randomUUID() });
    },
    [command],
  );

  const cancelLeave = useCallback(() => {
    setLeave(false);
    leaveRef.current = false;
    leaveTarget.current = '/dashboard';
    if (pausedForLeave.current) void command('resume');
    pausedForLeave.current = false;
  }, [command]);

  const confirmLeave = useCallback(async () => {
    setLeaving(true);
    const r = await command('finish');
    if (r && ended(r.phase)) {
      setActiveGameId(null);
      if (leaveTarget.current === '/login') await logout();
      navigate(leaveTarget.current);
    }
    setLeaving(false);
  }, [command, logout, navigate, setActiveGameId]);

  const requestLeave = useCallback(async () => {
    const g = current.current;
    if (!g || ended(g.phase)) {
      navigate(leaveTarget.current);
      return;
    }
    setLeave(true);
    leaveRef.current = true;
    setLeaveSelection('stay');
    leaveSelectionRef.current = 'stay';
    pausedForLeave.current = false;
    if ((g.phase === 'PLAYING' || g.phase === 'SAILING') && g.pausesRemaining > 0) {
      const r = await command('pause');
      pausedForLeave.current = r?.phase === 'PAUSED';
    }
  }, [command, navigate]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const g = current.current;
      if (!g) {
        if (error) {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
            e.preventDefault();
            setErrorNavIndex(0);
            errorNavIndexRef.current = 0;
            return;
          }
          if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
            e.preventDefault();
            setErrorNavIndex(1);
            errorNavIndexRef.current = 1;
            return;
          }
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (errorNavIndexRef.current === 0) {
              navigate('/dashboard');
            } else {
              navigate('/leaderboard');
            }
            return;
          }
        }
        return;
      }

      // 1. Initial Expedition Orders & Controls Briefing Modal
      if (showOrdersRef.current) {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
          e.preventDefault();
          localStorage.setItem('reef_orders_seen', 'true');
          setShowOrders(false);
          showOrdersRef.current = false;
          return;
        }
      }

      // 2. Return to Harbor Confirmation Modal
      if (leaveRef.current) {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          setLeaveSelection('stay');
          leaveSelectionRef.current = 'stay';
          return;
        }
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault();
          setLeaveSelection('abandon');
          leaveSelectionRef.current = 'abandon';
          return;
        }
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (leaveSelectionRef.current === 'stay') {
            cancelLeave();
          } else {
            void confirmLeave();
          }
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          cancelLeave();
          return;
        }
        return;
      }

      // 3. Game Over / Completed / Shipwrecked result screen
      if (ended(g.phase)) {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          setResultNavIndex(0);
          resultNavIndexRef.current = 0;
          return;
        }
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault();
          setResultNavIndex(1);
          resultNavIndexRef.current = 1;
          return;
        }
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (resultNavIndexRef.current === 0) {
            navigate('/dashboard');
          } else {
            navigate('/leaderboard');
          }
          return;
        }
        return;
      }

      // 4. Paused Screen (Anchor)
      if (g.phase === 'PAUSED') {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape' || e.key.toLowerCase() === 'p') {
          e.preventDefault();
          void command('resume');
          return;
        }
      }

      // 5. Zone Conquered (LEVEL_REVIEW)
      if (g.phase === 'LEVEL_REVIEW') {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          void command('advance');
          return;
        }
      }

      // 6. Escape key pauses when in active play
      if (e.key === 'Escape' && !e.repeat && ['PLAYING', 'SAILING'].includes(g.phase)) {
        e.preventDefault();
        void command('pause');
        return;
      }

      // 7. Pier Challenge / MCQ Dialog (PLAYING phase)
      if (g.phase === 'PLAYING' && g.question) {
        const opts = g.question.options;
        const count = opts.length;

        // Arrow keys navigate between feed options
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          const nextIdx = (mcqIndexRef.current - 1 + count) % count;
          setMcqIndex(nextIdx);
          mcqIndexRef.current = nextIdx;
          return;
        }
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault();
          const nextIdx = (mcqIndexRef.current + 1) % count;
          setMcqIndex(nextIdx);
          mcqIndexRef.current = nextIdx;
          return;
        }

        // Enter or Space key submits the highlighted option
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const chosen = opts[mcqIndexRef.current];
          if (chosen) {
            void answer(chosen.id);
          }
          return;
        }

        // Direct number keys 1..4 choose and submit
        const n = Number(e.key);
        if (n >= 1 && n <= count) {
          e.preventDefault();
          setMcqIndex(n - 1);
          mcqIndexRef.current = n - 1;
          void answer(opts[n - 1].id);
          return;
        }
      }
    };

    const hidden = () => {
      if (document.hidden && current.current?.phase === 'PLAYING') void command('pause');
    };
    window.addEventListener('keydown', key);
    document.addEventListener('visibilitychange', hidden);
    const unload = (e: BeforeUnloadEvent) => {
      if (current.current && !ended(current.current.phase)) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', unload);
    return () => {
      window.removeEventListener('keydown', key);
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('beforeunload', unload);
    };
  }, [answer, command, cancelLeave, confirmLeave, navigate, error]);

  // Listen for 'P' key toggle pause from SailingCanvas or HUD
  useEffect(() => {
    const onTogglePause = () => {
      const g = current.current;
      if (g && ['PLAYING', 'PAUSED', 'SAILING'].includes(g.phase) && !busyRef.current) {
        void command(g.phase === 'PAUSED' ? 'resume' : 'pause');
      }
    };
    window.addEventListener('reef:toggle-pause', onTogglePause);
    return () => window.removeEventListener('reef:toggle-pause', onTogglePause);
  }, [command]);

  const checkReady = useCallback(() => {
    const g = current.current;
    if (
      g?.phase === 'AWAITING_READY' &&
      g.question &&
      loaded.current.size >= g.question.options.length &&
      readySent.current !== g.question.id &&
      !busyRef.current
    ) {
      readySent.current = g.question.id;
      void command('ready', { questionId: g.question.id }).then((r) => {
        if (!r) {
          setTimeout(() => {
            if (current.current?.phase === 'AWAITING_READY') {
              readySent.current = '';
            }
          }, 600);
        }
      });
    }
  }, [command]);

  const imageLoaded = (id: string) => {
    loaded.current.add(id);
    checkReady();
  };

  useEffect(() => {
    if (game?.phase === 'AWAITING_READY' && game?.question) {
      checkReady();
    }
  }, [game?.phase, game?.question?.id, game?.version, checkReady]);

  if (!game) {
    if (error) {
      return (
        <div className="pirate-error-page page-enter">
          <div className="pirate-auth-card">
            <div className="pirate-auth-signboard">
              <div className="signboard-screw screw-tl" />
              <div className="signboard-screw screw-tr" />
              <div className="signboard-screw screw-bl" />
              <div className="signboard-screw screw-br" />
              <div className="signboard-title-row">
                <Compass size={28} className="signboard-icon gold" />
                <h1>EXPEDITION NOT FOUND</h1>
                <Compass size={28} className="signboard-icon gold" />
              </div>
              <p className="signboard-subtitle">Smart Sailor · Ocean Navigation System</p>
            </div>

            <div className="pirate-parchment-body">
              <span className="result-emblem" style={{ margin: '0 auto 12px' }}>
                <Anchor size={46} />
              </span>
              <h2
                style={{
                  fontFamily: "'Luckiest Guy', cursive",
                  color: '#78350f',
                  margin: '0 0 6px',
                  textAlign: 'center',
                }}
              >
                VESSEL MOORED IN SAFE HARBOR
              </h2>
              <div
                style={{
                  background: '#fef3c7',
                  border: '2px dashed #b45309',
                  borderRadius: 10,
                  padding: '14px 18px',
                  textAlign: 'center',
                  color: '#92400e',
                  fontSize: 14,
                  lineHeight: 1.5,
                  margin: '6px 0 12px',
                  boxShadow: 'inset 0 1px 4px rgba(180, 83, 9, 0.15)',
                }}
              >
                {error || 'This expedition is no longer active. Set sail on a new voyage!'}
              </div>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  width: '100%',
                }}
              >
                <button
                  className={`pirate-dialog-btn primary ${errorNavIndex === 0 ? 'btn-focused' : ''}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    width: '100%',
                  }}
                  onClick={() => navigate('/dashboard')}
                >
                  <RotateCcw size={18} />
                  <span>RETURN TO HARBOR HELM</span>
                </button>
                <button
                  className={`pirate-dialog-btn secondary ${errorNavIndex === 1 ? 'btn-focused' : ''}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    width: '100%',
                  }}
                  onClick={() => navigate('/leaderboard')}
                >
                  <Trophy size={18} />
                  <span>VIEW GLOBAL SCOREBOARD</span>
                </button>
              </div>
              <div className="keyboard-action-hint" style={{ marginTop: 8, textAlign: 'center' }}>
                Use <kbd>←</kbd> <kbd>→</kbd> or <kbd>↑</kbd> <kbd>↓</kbd> · Press <kbd>ENTER</kbd> to choose
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="pirate-loading-screen">
        <div className="pirate-auth-card" style={{ maxWidth: 420 }}>
          <div className="pirate-auth-signboard">
            <div className="signboard-screw screw-tl" />
            <div className="signboard-screw screw-tr" />
            <div className="signboard-screw screw-bl" />
            <div className="signboard-screw screw-br" />
            <div className="signboard-title-row">
              <Compass size={28} className="signboard-icon gold" />
              <h1>PREPARING SHIP</h1>
              <Compass size={28} className="signboard-icon gold" />
            </div>
            <p className="signboard-subtitle">Smart Sailor · Ocean Expedition</p>
          </div>
          <div className="pirate-parchment-body" style={{ textAlign: 'center', padding: '32px 24px' }}>
            <div className="ship-loading-animation" style={{ animation: 'ship-bob 2s ease-in-out infinite' }}>
              <span style={{ fontSize: 40 }}>⛵</span>
            </div>
            <h3
              style={{
                fontFamily: "'Luckiest Guy', cursive",
                color: '#78350f',
                margin: '8px 0 4px',
                fontSize: 20,
              }}
            >
              WEIGHING ANCHOR…
            </h3>
            <p style={{ color: '#92400e', fontSize: 13, margin: '0 0 16px' }}>
              Charting ocean coordinates and catching the offshore wind…
            </p>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                color: '#b45309',
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              <LoaderCircle size={18} className="spin" />
              <span>Loading sector map…</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const elapsedQuiz = game.phase === 'PLAYING' ? Math.max(0, now - receivedAt.current) : 0,
    remainingQuiz = Math.max(0, game.remainingMs - elapsedQuiz),
    fever = Math.max(0, game.feverRemainingMs - elapsedQuiz),
    q = game.question,
    policy = LEVELS[game.level];

  const totalExpeditionMs =
    game.expeditionElapsedMs +
    (game.phase === 'SAILING' || game.phase === 'PLAYING' ? Math.max(0, now - receivedAt.current) : 0);

  const outcome = game.result?.outcome;

  // Game over or completed run
  if (ended(game.phase))
    return (
      <div className="result-page page-enter">
        <span className={`result-emblem ${game.phase === 'COMPLETED' ? 'win' : ''}`}>
          {game.phase === 'COMPLETED' ? (
            <Trophy size={48} />
          ) : (
            <Skull size={48} />
          )}
        </span>
        <span className="eyebrow">
          {game.phase === 'COMPLETED'
            ? 'EXPEDITION VICTORY'
            : game.phase === 'GAME_OVER'
              ? 'EXPEDITION SHIPWRECKED'
              : 'EXPEDITION INTERRUPTED'}
        </span>
        <h1>
          {game.phase === 'COMPLETED'
            ? 'Pirate Treasure Island Conquered!'
            : game.phase === 'GAME_OVER'
              ? 'The voyage has come to an end.'
              : 'Back on safe shores.'}
        </h1>
        <p>
          {game.message ??
            (game.phase === 'COMPLETED'
              ? 'You sailed through all 15 checkpoints and claimed the legendary pirate treasure!'
              : 'You ran out of lifelines or failed the zone challenge. Better luck next voyage, Captain!')}
        </p>
        <div className="result-stats">
          <div>
            <small>FINAL SCORE</small>
            <strong>
              {game.score}
              <span>pts</span>
            </strong>
          </div>
          <div>
            <small>SURVIVING HEARTS</small>
            <strong>
              {[...Array(game.hearts)].map(() => '❤️').join('') || '💀'}
              <span> ({game.hearts}/3)</span>
            </strong>
          </div>
          <div>
            <small>VOYAGE TIME</small>
            <strong className="text-value">{formatStopwatch(totalExpeditionMs)}</strong>
          </div>
          <div>
            <small>RIGHT ANSWERS</small>
            <strong>
              {game.totalCorrect}
              <span>/{game.totalAnswered}</span>
            </strong>
          </div>
        </div>
        <span className="result-save">
          {game.saved ? <Check size={15} /> : <LoaderCircle size={15} className="spin" />}
          {game.saved
            ? game.mode === 'practice'
              ? 'Practice expedition saved · unranked'
              : 'Live expedition score saved to global scoreboard!'
            : 'Saving your voyage result…'}
        </span>
        <div className="result-actions">
          <button
            className={`button primary ${resultNavIndex === 0 ? 'btn-focused' : ''}`}
            onClick={() => navigate('/dashboard')}
          >
            <RotateCcw size={17} />
            Set sail on another expedition
          </button>
          <button
            className={`button secondary ${resultNavIndex === 1 ? 'btn-focused' : ''}`}
            onClick={() => navigate('/leaderboard')}
          >
            Global Scoreboard
            <ArrowRight size={17} />
          </button>
        </div>
        <div className="keyboard-action-hint">
          Use <kbd>←</kbd> <kbd>→</kbd> arrows · Press <kbd>ENTER</kbd> to choose
        </div>
      </div>
    );

  const isQuizOpen = ['AWAITING_READY', 'PLAYING', 'FEEDBACK'].includes(game.phase);

  return (
    <div className="pirate-game-container">
      {/* Top Wooden HUD Bar */}
      <header className="pirate-hud">
        <div className="hud-left">
          {/* Hamburger Menu Button */}
          <button
            className="pirate-hud-btn menu-btn"
            onClick={() => {
              window.dispatchEvent(
                new CustomEvent('reef:open-drawer', { detail: { tab: 'scoreboard' } }),
              );
            }}
            title="Open Global Scoreboard & Captain's Quarters"
          >
            <Menu size={16} />
            <span>Menu</span>
          </button>

          <button
            className="pirate-hud-btn"
            onClick={() => void requestLeave()}
            title="Return to harbor"
          >
            <ArrowLeft size={16} />
            Harbor
          </button>

          {/* 3 Hearts Lifeline */}
          <div className="hearts-container" title={`${game.hearts} lifelines remaining`}>
            {[1, 2, 3].map((h) => (
              <span
                key={h}
                className={`heart-icon ${h <= game.hearts ? 'filled' : 'empty'}`}
              >
                ❤️
              </span>
            ))}
          </div>

          {/* Checkpoint indicator */}
          <span className={`checkpoint-badge ${game.checkpointIndex === 15 ? 'final-island' : ''}`}>
            {game.checkpointIndex === 15 ? '⭐ FINAL ISLAND #15' : `PIER ${game.checkpointIndex}/15 • ${policy.label}`}
          </span>
        </div>

        {/* Center Wooden Signboard */}
        <div className="pirate-signboard">
          <SailorAvatarIcon size={20} />
          <span>SMART SAILOR</span>
        </div>

        <div className="hud-right">
          {/* Global Stopwatch */}
          <div className="stopwatch-badge" title="Total expedition voyage time">
            <Clock3 size={16} />
            <span>{formatStopwatch(totalExpeditionMs)}</span>
          </div>

          {/* Gold Coin Score */}
          <div className="score-badge">
            <Coins size={16} />
            <span>{game.score.toLocaleString()}</span>
          </div>

          {/* Fever Mode indicator */}
          {fever > 0 && (
            <span className="fever-badge-hud">
              🔥 x2 TAILWINDS ({(fever / 1000).toFixed(1)}s)
            </span>
          )}

          {/* Pause Button */}
          <button
            className="pirate-hud-btn"
            disabled={busy || !['PLAYING', 'PAUSED', 'SAILING'].includes(game.phase)}
            onClick={() => void command(game.phase === 'PAUSED' ? 'resume' : 'pause')}
          >
            {game.phase === 'PAUSED' ? <Play size={16} /> : <Pause size={16} />}
            <span>{game.phase === 'PAUSED' ? 'Resume' : 'Anchor'}</span>
          </button>
        </div>
      </header>

      {/* 2D Interactive Sailing Ocean Map */}
      <SailingCanvas
        checkpointIndex={game.checkpointIndex}
        fever={fever > 0}
        phase={game.phase}
        paused={game.phase === 'PAUSED' || showOrders}
        gameId={game.id}
        onDock={handleDock}
        onHit={handleHit}
      />

      {/* Initial Expedition Controls Briefing (Shortened, compact quick-reference card) */}
      {showOrders && (
        <div className="pirate-modal-backdrop" style={{ zIndex: 10000 }}>
          <div
            className="pirate-quiz-dialog page-enter"
            style={{ maxWidth: 440, textAlign: 'center', padding: '18px 22px' }}
          >
            <div className="quiz-header-banner" style={{ padding: '8px 14px' }}>
              <h2 style={{ fontSize: 20, margin: 0 }}>🧭 EXPEDITION CONTROLS 🧭</h2>
              <p style={{ fontSize: 13, margin: '2px 0 0' }}>
                Quick reference before weighing anchor, Captain!
              </p>
            </div>

            <div
              className="pirate-dialog-parchment"
              style={{
                padding: '12px 14px',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '8px 12px',
                textAlign: 'left',
              }}
            >
              <div className="control-quick-item">
                <span className="control-key">↑ ← ↓ → / WASD</span>
                <span className="control-desc">⛵ Steer Ship</span>
              </div>
              <div className="control-quick-item">
                <span className="control-key">SPACEBAR</span>
                <span className="control-desc">⚡ Nitro Speed Boost</span>
              </div>
              <div className="control-quick-item">
                <span className="control-key">P / ESC</span>
                <span className="control-desc">⏸️ Pause / Anchor</span>
              </div>
              <div className="control-quick-item">
                <span className="control-key">COMPASS</span>
                <span className="control-desc">🧭 Needle Points to Pier</span>
              </div>
            </div>

            <div
              style={{
                fontSize: 13,
                color: '#451a03',
                fontWeight: 700,
                margin: '2px 0 4px',
              }}
            >
              ❤️ 3 Lifelines: Avoid jagged rocks, islands & predator sharks!
            </div>

            <button
              className="pirate-dialog-btn primary btn-focused"
              style={{ width: '100%', marginTop: 6, fontSize: 16 }}
              onClick={() => {
                localStorage.setItem('reef_orders_seen', 'true');
                setShowOrders(false);
              }}
            >
              ⚓ WEIGH ANCHOR & SET SAIL!
            </button>
            <div className="keyboard-action-hint" style={{ marginTop: 8 }}>
              Press <kbd>ENTER</kbd> or <kbd>SPACE</kbd> to weigh anchor and begin!
            </div>
          </div>
        </div>
      )}

      {/* Sailing instruction helper when boat is in SAILING phase */}
      {game.phase === 'SAILING' && (
        <div className="sailing-instructions-banner">
          <Compass size={18} />
          <span>
            🧭 Follow your compass to seek {game.checkpointIndex === 15 ? 'the Final Pirate Island' : `Pier ${game.checkpointIndex}`}! Sail with <kbd>↑</kbd> <kbd>←</kbd> <kbd>↓</kbd> <kbd>→</kbd> or <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> · Avoid rocks & sharks!
          </span>
        </div>
      )}

      {/* Pier / Island Quiz Popup Modal */}
      {isQuizOpen && q && (
        <div className="pirate-modal-backdrop">
          <div className="pirate-quiz-dialog page-enter">
            <div className="quiz-header-banner">
              <span className="quiz-pier-badge">
                {game.checkpointIndex === 15 ? '⭐ FINAL ISLAND DESTINATION ⭐' : `PIER ${game.checkpointIndex} CHALLENGE`}
              </span>
              <div className="quiz-question-box">
                <span className="quiz-prompt-label">SPOT THE FEED WITH:</span>
                <span className="quiz-prompt-count-target">
                  {q.count} {q.target === 'chest' ? (q.count === 1 ? 'TREASURE CHEST' : 'TREASURE CHESTS') : (q.count === 1 ? 'FISH' : 'FISH')}
                </span>
              </div>
            </div>

            {/* Per-Quiz Countdown Timer Bar */}
            <div className="quiz-timer-bar-wrap" title={`${(remainingQuiz / 1000).toFixed(1)} seconds left`}>
              <div
                className={`quiz-timer-bar-fill ${remainingQuiz < 3000 ? 'urgent' : ''}`}
                style={{ width: `${(100 * remainingQuiz) / policy.timeMs}%` }}
              />
            </div>

            {/* Image choices */}
            <div className={`pirate-image-grid choices-${q.options.length}`}>
              {q.options.map((o, i) => {
                const correct = game.result?.correctOptionId === o.id,
                  wrong = game.result && game.result.selectedOptionId === o.id && !correct,
                  isArrowFocused = mcqIndex === i && game.phase === 'PLAYING';
                return (
                  <button
                    key={o.id}
                    className={`pirate-image-card ${isArrowFocused ? 'arrow-focused' : ''} ${selected === o.id ? 'is-selected' : ''} ${game.result && correct ? 'is-correct' : ''} ${wrong ? 'is-wrong' : ''}`}
                    onClick={() => void answer(o.id)}
                    onMouseEnter={() => {
                      if (game.phase === 'PLAYING') {
                        setMcqIndex(i);
                        mcqIndexRef.current = i;
                      }
                    }}
                    disabled={game.phase !== 'PLAYING' || busy || !!pending.current}
                  >
                    <div className="image-card-label">
                      <span>FEED #{i + 1}</span>
                      {isArrowFocused && (
                        <span className="enter-to-select-badge">ENTER TO CHOOSE</span>
                      )}
                      <kbd>{i + 1}</kbd>
                    </div>
                    <div className="pirate-image-frame">
                      <img
                        src={o.src}
                        alt={`Option ${i + 1}`}
                        onLoad={() => imageLoaded(o.id)}
                        onError={() =>
                          setError(
                            'An image could not load. The expedition will halt safely without ranking penalty.',
                          )
                        }
                      />
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Feedback status */}
            <div className="answer-feedback">
              {game.phase === 'FEEDBACK' && game.result ? (
                <span className={outcome === 'CORRECT' ? 'correct-text' : 'wrong-text'}>
                  {outcome === 'CORRECT' ? <Check size={18} /> : <X size={18} />}
                  {outcome === 'CORRECT'
                    ? 'Spot on! Setting sail for next waters…'
                    : outcome === 'TIMEOUT'
                      ? 'Quiz time expired!'
                      : 'Incorrect image!'}
                  <b>
                    {game.result.points >= 0 ? ' +' : ' '}
                    {game.result.points} pts{game.result.multiplier === 2 ? ' (x2 Fever)' : ''}
                  </b>
                </span>
              ) : game.phase === 'AWAITING_READY' ? (
                <span>
                  <LoaderCircle className="spin" size={16} />
                  Calibrating pier optical feeds…
                </span>
              ) : (
                <span>
                  Use <kbd>←</kbd> <kbd>→</kbd> arrows & press <kbd>ENTER</kbd> (or press keys <kbd>1</kbd> – <kbd>{q.options.length}</kbd>)
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Pause Screen Overlay */}
      {game.phase === 'PAUSED' && !leave && (
        <div className="pirate-modal-backdrop">
          <div className="pirate-quiz-dialog page-enter" style={{ maxWidth: 480, textAlign: 'center' }}>
            <div className="quiz-header-banner">
              <h2>⚓ SHIP AT ANCHOR ⚓</h2>
              <p>The seas are still. Catch your breath, Captain.</p>
            </div>
            <div className="pirate-dialog-parchment">
              <p style={{ margin: '8px 0', fontSize: 16, color: '#451a03', fontWeight: 600 }}>
                {game.pausesRemaining} {game.pausesRemaining === 1 ? 'pause' : 'pauses'} remaining on this expedition.
              </p>
            </div>
            <button
              className="pirate-dialog-btn primary btn-focused"
              disabled={busy}
              onClick={() => void command('resume')}
              style={{ alignSelf: 'center', width: '80%', marginTop: 8 }}
            >
              <Play size={18} />
              Weigh Anchor & Resume
            </button>
            <div className="keyboard-action-hint">
              Press <kbd>ENTER</kbd>, <kbd>SPACE</kbd> or <kbd>P</kbd> to resume
            </div>
          </div>
        </div>
      )}

      {/* Level Review Modal (conquering 5 piers in Easy or Medium) */}
      {game.phase === 'LEVEL_REVIEW' && !leave && (
        <div className="pirate-modal-backdrop">
          <div className="pirate-quiz-dialog page-enter" style={{ maxWidth: 520, textAlign: 'center' }}>
            <div className="quiz-header-banner">
              <h2>🏆 ZONE CONQUERED! 🏆</h2>
              <p>Splendid sailing, Captain!</p>
            </div>
            <div className="pirate-dialog-parchment">
              <span className="result-emblem small" style={{ margin: '8px auto 14px' }}>
                <Trophy size={42} />
              </span>
              <p style={{ fontSize: 16, lineHeight: 1.6, color: '#451a03', margin: 0 }}>
                You solved <strong>{game.levelCorrect} out of 5</strong> challenges correctly in{' '}
                <strong>{policy.label.toLowerCase()}</strong> waters! The next ocean sector awaits your fleet.
              </p>
            </div>
            <button
              className="pirate-dialog-btn primary btn-focused"
              style={{ width: '100%', marginTop: 8 }}
              disabled={busy}
              onClick={() => void command('advance')}
            >
              Weigh Anchor for {game.level === 'EASY' ? 'Twilight Waters' : 'Skull Trench'}
              <ArrowRight size={18} />
            </button>
            <div className="keyboard-action-hint">
              Press <kbd>ENTER</kbd> or <kbd>SPACE</kbd> to set sail for next waters
            </div>
          </div>
        </div>
      )}

      {/* Leave Harbor Confirmation - Authentic Pirate Signboard Dialog */}
      {leave && (
        <div className="pirate-modal-backdrop">
          <div className="pirate-quiz-dialog page-enter" style={{ maxWidth: 480, textAlign: 'center' }}>
            <div className="quiz-header-banner">
              <h2>⚓ RETURN TO HARBOR? ⚓</h2>
              <p>Expedition in Progress</p>
            </div>
            <div className="pirate-dialog-parchment">
              <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: '#451a03' }}>
                Abandoning this expedition now will forfeit your accumulated voyage score. Are ye sure ye wish to retreat to safe harbor?
              </p>
            </div>
            <div className="pirate-dialog-actions" style={{ marginTop: 8 }}>
              <button
                className={`pirate-dialog-btn secondary ${leaveSelection === 'stay' ? 'btn-focused' : ''}`}
                onClick={cancelLeave}
              >
                Stay & Sail
              </button>
              <button
                className={`pirate-dialog-btn danger ${leaveSelection === 'abandon' ? 'btn-focused' : ''}`}
                disabled={leaving || busy}
                onClick={() => void confirmLeave()}
              >
                <LogOut size={16} />
                Abandon Voyage
              </button>
            </div>
            <div className="keyboard-action-hint">
              Use <kbd>←</kbd> <kbd>→</kbd> arrows to choose · Press <kbd>ENTER</kbd> to confirm
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
