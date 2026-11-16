// [ACADEMIC THEME 1: SOFTWARE DESIGN PRINCIPLES - LOW COUPLING & HIGH COHESION]
// Architecture: Hexagonal / Ports & Adapters with Inversion of Control (IoC).
// - HIGH COHESION ("Knowing & Doing" Responsibilities): GameService encapsulates solely
//   domain game rules, FSM state transitions, deadlines, streak calculations, and score
//   mutations without direct knowledge of Express HTTP objects, SQL/Postgres internals, or network protocols.
// - LOW COUPLING (Interfaces Hide Inner Workings): External dependencies sit behind pure ports:
//   1. IFishProvider (Port for third-party fish services: HttpFishProvider & PracticeFishProvider)
//   2. IGameRepository (Port for persistent storage: NeonRepository & SqliteRepository)
//   3. EventBus (Port for decoupled publish/subscribe event broadcasting)
// - BENEFITS REALIZED: Encapsulation, Reusability, Maintainability, and isolated Testability.
// - ALTERNATIVE APPROACHES CONSIDERED & CRITIQUED:
//   * Monolithic / Tightly Coupled Approach: Direct fetch calls inside route handlers.
//     Critique: Leaves game state untestable, mixes network errors with game rules, and creates tight coupling.
//   * Microservices Architecture: Splitting game logic and scoring into separate HTTP services.
//     Critique: Introduces distributed transaction overhead (2PC/Sagas), latency jitter, and operational complexity.
//   * Client-Side Authority: Managing game state in React.
//     Critique: Easily manipulated via DevTools; server-authoritative state guarantees integrity.
import { randomUUID, randomInt } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import {
  LEVELS,
  type GameDTO,
  type Level,
  type Mode,
  type Phase,
} from '../../../../contracts/src/index.js';
import { AppError, ensure } from '../../errors.js';
import type { IFishProvider, FishSample } from '../../integrations/fish.js';
import type { IGameRepository } from '../../infrastructure/repository.js';
import type { EventBus } from '../../events/bus.js';
import { calculateExpeditionBonus, nextLevel, scoreAnswer, uniqueTarget } from './rules.js';
interface Question {
  id: string;
  target: 'fish' | 'chest';
  count: number;
  options: { id: string; sample: FishSample }[];
  correct: string;
}
interface State {
  id: string;
  owner: string;
  mode: Mode;
  startLevel: Level;
  level: Level;
  phase: Phase;
  version: number;
  question: Question | null;
  score: number;
  levelCorrect: number;
  totalCorrect: number;
  totalAnswered: number;
  round: number;
  fastStreak: number;
  streak: number;
  fever: number;
  pauses: number;
  remaining: number;
  started: number;
  pauseUntil: number;
  issued: number;
  touched: number;
  feedbackUntil: number;
  result: GameDTO['result'];
  saved: boolean;
  rounds: unknown[];
  requests: Map<string, { payload: string; response: GameDTO }>;
  buffer: Question[];
  refill: Promise<void> | null;
  abort: AbortController;
  message?: string;
  hearts: number;
  checkpointIndex: number;
  expeditionStarted: number;
  totalExpeditionPaused: number;
  pauseStarted: number;
  previousPhase: 'SAILING' | 'PLAYING';
  lastHitAt: number;
}
const terminal = (p: Phase) => ['GAME_OVER', 'COMPLETED', 'ABANDONED', 'INTERRUPTED'].includes(p);
class WorkQueue {
  private active = 0;
  private waiting: (() => void)[] = [];
  async run<T>(job: () => Promise<T>): Promise<T> {
    if (this.active >= 2) {
      ensure(this.waiting.length < 20, 503, 'BUSY', 'The reef is busy. Try again shortly.');
      await new Promise<void>((r) => this.waiting.push(r));
    } else this.active++;
    try {
      return await job();
    } finally {
      const next = this.waiting.shift();
      if (next) next();
      else this.active--;
    }
  }
}
export class GameService {
  private states = new Map<string, State>();
  private activeUsers = new Set<string>();
  private deletedUsers = new Set<string>();
  private locks = new Map<string, Promise<unknown>>();
  private queue = new WorkQueue();
  private starts = new Map<string, { payload: string; id: string }>();
  private interval: ReturnType<typeof setInterval>;
  constructor(
    private live: IFishProvider,
    private practice: IFishProvider,
    private repo: IGameRepository,
    private events: EventBus,
    private now = () => performance.now(),
  ) {
    this.interval = setInterval(() => this.sweep(), 250);
    this.interval.unref();
  }
  private async lock<T>(id: string, job: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(id) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(job);
    this.locks.set(id, next);
    try {
      return await next;
    } finally {
      if (this.locks.get(id) === next) this.locks.delete(id);
    }
  }
  private state(id: string, owner: string) {
    const s = this.states.get(id);
    ensure(
      s && s.owner === owner,
      404,
      'GAME_NOT_FOUND',
      'This expedition is no longer active. Set sail on a new voyage!',
    );
    return s;
  }
  private expeditionElapsed(s: State): number {
    const now = this.now();
    const paused = s.phase === 'PAUSED' ? Math.max(0, now - s.pauseStarted) : 0;
    return Math.max(0, Math.round(now - s.expeditionStarted - s.totalExpeditionPaused - paused));
  }
  private dto(s: State): GameDTO {
    const now = this.now();
    const elapsed = s.phase === 'PLAYING' ? Math.max(0, now - s.started) : 0;
    const remaining = Math.max(0, s.remaining - elapsed);
    return {
      id: s.id,
      mode: s.mode,
      startLevel: s.startLevel,
      level: s.level,
      phase: s.phase,
      version: s.version,
      question: s.question
        ? {
            id: s.question.id,
            number: s.round,
            checkpointIndex: s.checkpointIndex,
            isFinalIsland: s.checkpointIndex === 15,
            target: s.question.target,
            count: s.question.count,
            timeLimitMs: LEVELS[s.level].timeMs,
            options: s.question.options.map((o) => ({
              id: o.id,
              src:
                s.mode === 'live' && s.level === 'HARD'
                  ? `data:image/png;base64,${o.sample.bytes.toString('base64')}`
                  : `/api/images/${s.id}/${o.id}`,
            })),
          }
        : null,
      score: s.score,
      levelCorrect: s.levelCorrect,
      totalCorrect: s.totalCorrect,
      totalAnswered: s.totalAnswered,
      fastStreak: s.fastStreak,
      streak: s.streak,
      feverRemainingMs: Math.max(0, s.fever - elapsed),
      pausesRemaining: 3 - s.pauses,
      remainingMs: remaining,
      serverNow: Date.now(),
      expiresAt: s.phase === 'PLAYING' ? Date.now() + remaining : null,
      pauseExpiresAt: s.phase === 'PAUSED' ? Date.now() + Math.max(0, s.pauseUntil - now) : null,
      result: s.result,
      saved: s.saved,
      message: s.message,
      hearts: s.hearts,
      checkpointIndex: s.checkpointIndex,
      isFinalIsland: s.checkpointIndex === 15,
      expeditionElapsedMs: this.expeditionElapsed(s),
    };
  }
  private usedBytes() {
    let bytes = 0;
    for (const s of this.states.values()) {
      if (terminal(s.phase)) continue;
      for (const q of [s.question, ...s.buffer])
        if (q) for (const o of q.options) bytes += o.sample.bytes.length;
    }
    return bytes;
  }
  private async build(s: State): Promise<Question> {
    return this.queue.run(async () => {
      const signal = AbortSignal.any([s.abort.signal, AbortSignal.timeout(15000)]);
      const provider = s.mode === 'live' ? this.live : this.practice;
      const samples: FishSample[] = [];
      const n = LEVELS[s.level].choices;
      for (let attempt = 0; attempt < 20; attempt++) {
        signal.throwIfAborted();
        samples.push(await provider.getSample(s.level, signal));
        if (samples.length < n) continue;
        if (samples.length > n) samples.shift();
        const possible: { target: 'fish' | 'chest'; index: number }[] = [];
        for (const target of ['fish', 'chest'] as const)
          for (let i = 0; i < n; i++)
            if (uniqueTarget(samples, target, i)) possible.push({ target, index: i });
        if (!possible.length) continue;
        const choice = possible[randomInt(possible.length)];
        const options = samples.map((sample) => ({ id: randomUUID(), sample }));
        const correct = options[choice.index].id;
        for (let i = options.length - 1; i > 0; i--) {
          const j = randomInt(i + 1);
          [options[i], options[j]] = [options[j], options[i]];
        }
        ensure(
          this.usedBytes() + samples.reduce((t, x) => t + x.bytes.length, 0) < 32 * 1024 * 1024,
          503,
          'CACHE_FULL',
          'The reef is busy. Try another dive shortly.',
        );
        return {
          id: randomUUID(),
          target: choice.target,
          count: samples[choice.index][choice.target],
          options,
          correct,
        };
      }
      throw new AppError(
        503,
        'NO_UNIQUE_QUESTION',
        'We could not prepare a unique question. Please try another dive.',
      );
    });
  }
  private refill(s: State) {
    if (s.refill || s.buffer.length >= 2 || terminal(s.phase) || s.round + s.buffer.length >= 5)
      return;
    s.refill = (async () => {
      while (
        s.buffer.length < 2 &&
        s.round + s.buffer.length < 5 &&
        !terminal(s.phase) &&
        !s.abort.signal.aborted
      ) {
        const q = await this.build(s);
        if (!s.abort.signal.aborted && !terminal(s.phase)) s.buffer.push(q);
      }
    })()
      .catch(() => {
        /* Current question stays playable; next preparation reports failure. */
      })
      .finally(() => {
        s.refill = null;
      });
  }
  private async issue(s: State) {
    try {
      if (!s.buffer.length && s.refill) await s.refill;
      s.question = s.buffer.shift() ?? (await this.build(s));
      s.phase = 'AWAITING_READY';
      s.issued = this.now();
      s.remaining = LEVELS[s.level].timeMs;
      s.result = null;
      s.version++;
      s.touched = this.now();
      this.refill(s);
    } catch {
      await this.finish(
        s,
        'INTERRUPTED',
        'The Fish service could not prepare this dive. No ranking or penalty was applied. Try again, or switch to practice.',
      );
    }
  }
  async start(owner: string, level: Level, mode: Mode, requestId: string): Promise<GameDTO> {
    ensure(!this.deletedUsers.has(owner), 401, 'AUTH_REQUIRED', 'Please sign in again.');
    const key = `${owner}:${requestId}`,
      payload = `${level}:${mode}`;
    const old = this.starts.get(key);
    if (old) {
      ensure(old.payload === payload, 409, 'REQUEST_REUSED', 'This request ID was already used.');
      return this.get(old.id, owner);
    }
    ensure(
      !this.activeUsers.has(owner),
      409,
      'ACTIVE_GAME',
      'You already have an active dive. Return to it or finish it first.',
    );
    ensure(this.activeUsers.size < 10, 503, 'BUSY', 'The reef is busy. Please try again shortly.');
    this.activeUsers.add(owner);
    const checkpointIndex = level === 'EASY' ? 1 : level === 'MEDIUM' ? 6 : 11;
    const s: State = {
      id: randomUUID(),
      owner,
      mode,
      level,
      startLevel: level,
      phase: 'SAILING',
      version: 0,
      question: null,
      score: 0,
      levelCorrect: 0,
      totalCorrect: 0,
      totalAnswered: 0,
      round: 1,
      fastStreak: 0,
      streak: 0,
      fever: 0,
      pauses: 0,
      remaining: LEVELS[level].timeMs,
      started: 0,
      pauseUntil: 0,
      issued: this.now(),
      touched: this.now(),
      feedbackUntil: 0,
      result: null,
      saved: false,
      rounds: [],
      requests: new Map(),
      buffer: [],
      refill: null,
      abort: new AbortController(),
      hearts: 3,
      checkpointIndex,
      expeditionStarted: this.now(),
      totalExpeditionPaused: 0,
      pauseStarted: 0,
      previousPhase: 'SAILING',
      lastHitAt: -10000,
    };
    this.states.set(s.id, s);
    this.starts.set(key, { id: s.id, payload });
    try {
      await this.repo.createGame(s.id, owner, mode, level);
      return await this.lock(s.id, async () => {
        try {
          const q = await this.build(s);
          s.buffer.push(q);
          this.refill(s);
        } catch {
          await this.finish(
            s,
            'INTERRUPTED',
            'The Fish service could not prepare this expedition. No ranking or penalty was applied. Try again, or switch to practice.',
          );
        }
        return this.dto(s);
      });
    } catch (e) {
      this.activeUsers.delete(owner);
      this.states.delete(s.id);
      this.starts.delete(key);
      throw e;
    }
  }
  async get(id: string, owner: string) {
    return this.lock(id, async () => {
      const s = this.state(id, owner);
      await this.tick(s);
      return this.dto(s);
    });
  }
  async dock(
    id: string,
    owner: string,
    body: { checkpointIndex: number; requestId: string },
  ) {
    return this.lock(id, async () => {
      const s = this.state(id, owner),
        payload = JSON.stringify([body.checkpointIndex]);
      const cached = s.requests.get(body.requestId);
      if (cached) {
        ensure(
          cached.payload === payload,
          409,
          'REQUEST_REUSED',
          'Request ID reused with different dock checkpoint.',
        );
        return cached.response;
      }
      await this.tick(s);
      if (s.phase !== 'SAILING') {
        if (
          ['AWAITING_READY', 'PLAYING', 'FEEDBACK'].includes(s.phase) &&
          body.checkpointIndex === s.checkpointIndex
        ) {
          return this.dto(s);
        }
        throw new AppError(409, 'NOT_SAILING', 'Your boat is not currently sailing.');
      }
      ensure(
        body.checkpointIndex === s.checkpointIndex,
        409,
        'INVALID_CHECKPOINT',
        'You must dock at the current active checkpoint.',
      );
      await this.issue(s);
      const response = this.dto(s);
      s.requests.set(body.requestId, { payload, response });
      return response;
    });
  }
  async hit(
    id: string,
    owner: string,
    body: { hazardType: 'rock' | 'barrel' | 'shark'; requestId: string },
  ) {
    return this.lock(id, async () => {
      const s = this.state(id, owner),
        payload = JSON.stringify([body.hazardType]);
      const cached = s.requests.get(body.requestId);
      if (cached) {
        ensure(cached.payload === payload, 409, 'REQUEST_REUSED', 'Request ID reused.');
        return cached.response;
      }
      await this.tick(s);
      ensure(s.phase === 'SAILING', 409, 'NOT_SAILING', 'Collisions only happen while sailing.');

      const now = this.now();
      if (now - s.lastHitAt >= 1500) {
        s.lastHitAt = now;
        s.hearts = Math.max(0, s.hearts - 1);
        s.version++;
        if (s.hearts === 0) {
          await this.finish(
            s,
            'GAME_OVER',
            'Shipwrecked! Your hull took too much damage from sea hazards.',
          );
        }
      }
      const response = this.dto(s);
      s.requests.set(body.requestId, { payload, response });
      return response;
    });
  }
  async ready(id: string, owner: string, questionId: string) {
    return this.lock(id, async () => {
      const s = this.state(id, owner);
      await this.tick(s);
      ensure(
        s.question?.id === questionId,
        409,
        'STALE_QUESTION',
        'That question has already ended.',
      );
      if (s.phase === 'AWAITING_READY') {
        s.phase = 'PLAYING';
        s.started = this.now();
        s.version++;
        s.touched = this.now();
      }
      return this.dto(s);
    });
  }
  private consumeTime(s: State) {
    if (s.phase !== 'PLAYING') return;
    const elapsed = Math.max(0, this.now() - s.started);
    s.remaining = Math.max(0, s.remaining - elapsed);
    if (s.fever > 0) {
      s.fever = Math.max(0, s.fever - elapsed);
      if (s.fever === 0) s.fastStreak = 0;
    }
    s.started = this.now();
  }
  private async resolve(s: State, optionId: string | null) {
    const elapsed = LEVELS[s.level].timeMs - s.remaining + Math.max(0, this.now() - s.started);
    const q = s.question!;
    const timeout = elapsed > LEVELS[s.level].timeMs + 1000 || optionId === null;
    const correct = !timeout && q.correct === optionId;
    const activeFever = s.fever > Math.max(0, this.now() - s.started);
    this.consumeTime(s);
    const points = scoreAnswer(s.level, correct, elapsed, activeFever, s.score);
    s.score = points.score;
    s.totalAnswered++;
    if (correct) {
      s.totalCorrect++;
      s.levelCorrect++;
      s.streak++;
      if (s.fever <= 0) {
        s.fastStreak = elapsed < 5000 ? s.fastStreak + 1 : 0;
        if (s.fastStreak === 3) {
          s.fever = 10000;
          s.fastStreak = 0;
        }
      }
    } else {
      s.streak = 0;
      s.fastStreak = 0;
      s.fever = 0;
    }
    s.result = {
      outcome: timeout ? 'TIMEOUT' : correct ? 'CORRECT' : 'WRONG',
      correctOptionId: q.correct,
      selectedOptionId: optionId,
      points: points.delta,
      multiplier: correct && activeFever ? 2 : 1,
    };
    s.rounds.push({
      questionId: q.id,
      level: s.level,
      outcome: s.result.outcome,
      elapsedMs: Math.round(elapsed),
      points: points.delta,
      multiplier: s.result.multiplier,
    });
    s.phase = 'FEEDBACK';
    s.feedbackUntil = this.now() + 700;
    s.touched = this.now();
    s.version++;
  }
  async answer(
    id: string,
    owner: string,
    body: { questionId: string; optionId: string | null; requestId: string },
  ) {
    return this.lock(id, async () => {
      const s = this.state(id, owner),
        payload = JSON.stringify([body.questionId, body.optionId]);
      const cached = s.requests.get(body.requestId);
      if (cached) {
        ensure(
          cached.payload === payload,
          409,
          'REQUEST_REUSED',
          'Request ID reused with different answer.',
        );
        return cached.response;
      }
      await this.tick(s);
      ensure(
        s.phase === 'PLAYING' && s.question?.id === body.questionId,
        409,
        'STALE_QUESTION',
        'That question has already ended.',
      );
      if (body.optionId !== null)
        ensure(
          s.question.options.some((o) => o.id === body.optionId),
          400,
          'INVALID_OPTION',
          'Choose one of the displayed images.',
        );
      if (body.optionId === null)
        ensure(
          this.now() - s.started >= s.remaining,
          409,
          'TOO_EARLY',
          'The question timer is still running.',
        );
      await this.resolve(s, body.optionId);
      const response = this.dto(s);
      s.requests.set(body.requestId, { payload, response });
      return response;
    });
  }
  async pause(id: string, owner: string) {
    return this.lock(id, async () => {
      const s = this.state(id, owner);
      await this.tick(s);
      if (s.phase === 'PAUSED') return this.dto(s);
      ensure(
        s.phase === 'PLAYING' || s.phase === 'SAILING',
        409,
        'NOT_PLAYABLE',
        'This expedition cannot be paused right now.',
      );
      ensure(
        s.pauses < 3,
        409,
        'NO_PAUSES',
        'You have used all three pauses. The timer continues.',
      );
      if (s.phase === 'PLAYING') {
        this.consumeTime(s);
      }
      s.previousPhase = s.phase;
      s.phase = 'PAUSED';
      s.pauses++;
      s.pauseStarted = this.now();
      s.pauseUntil = this.now() + 30000;
      s.version++;
      return this.dto(s);
    });
  }
  async resume(id: string, owner: string) {
    return this.lock(id, async () => {
      const s = this.state(id, owner);
      await this.tick(s);
      if (s.phase === 'PAUSED') {
        const pausedDuration = Math.max(0, this.now() - s.pauseStarted);
        s.totalExpeditionPaused += pausedDuration;
        s.phase = s.previousPhase ?? 'SAILING';
        if (s.phase === 'PLAYING') {
          s.started = this.now();
        }
        s.version++;
      }
      return this.dto(s);
    });
  }
  async advance(id: string, owner: string) {
    return this.lock(id, async () => {
      const s = this.state(id, owner);
      await this.tick(s);
      ensure(s.phase === 'LEVEL_REVIEW', 409, 'NOT_REVIEW', 'This level is not ready to advance.');
      const next = nextLevel(s.level);
      ensure(next, 409, 'RUN_COMPLETE', 'This run is complete.');
      s.level = next;
      s.round = 1;
      s.checkpointIndex++;
      s.levelCorrect = 0;
      s.buffer = [];
      s.refill = null;
      s.phase = 'SAILING';
      s.question = null;
      s.version++;
      this.refill(s);
      return this.dto(s);
    });
  }
  private async finish(s: State, phase: Phase, message?: string) {
    if (s.saved) return;
    s.phase = phase;
    s.message = message;
    s.version++;
    s.abort.abort();
    s.buffer = [];
    await this.repo.finalizeOnce(s.id, phase, s.score, s.rounds, this.expeditionElapsed(s));
    s.saved = true;
    s.question = null;
    s.touched = this.now();
    this.activeUsers.delete(s.owner);
    this.events.emit('game.finalized', { id: s.id, mode: s.mode });
    if (s.mode === 'live' && ['COMPLETED', 'GAME_OVER'].includes(phase))
      this.events.emit('leaderboard.changed', { reason: 'game' });
  }
  async abandon(id: string, owner: string) {
    return this.lock(id, async () => {
      const s = this.state(id, owner);
      if (!terminal(s.phase)) await this.finish(s, 'ABANDONED');
      return this.dto(s);
    });
  }
  private async tick(s: State) {
    const now = this.now();
    if (terminal(s.phase)) {
      if (!s.saved) await this.finish(s, s.phase, s.message);
      return;
    }
    if (now - s.touched > 300000) {
      await this.finish(s, 'ABANDONED');
      return;
    }
    if (s.phase === 'AWAITING_READY' && now - s.issued > 10000) {
      await this.finish(s, 'INTERRUPTED', 'Images did not load in time. Please try again.');
      return;
    }
    if (s.phase === 'PAUSED' && now >= s.pauseUntil) {
      const pausedDuration = Math.max(0, s.pauseUntil - s.pauseStarted);
      s.totalExpeditionPaused += pausedDuration;
      s.phase = s.previousPhase ?? 'SAILING';
      if (s.phase === 'PLAYING') {
        s.started = s.pauseUntil;
      }
      s.version++;
    }
    if (s.phase === 'PLAYING' && now - s.started > s.remaining + 1000) {
      await this.resolve(s, null);
      return;
    }
    if (s.phase === 'FEEDBACK' && now >= s.feedbackUntil) {
      if (s.round === 5) {
        if (s.levelCorrect < 3) {
          await this.finish(s, 'GAME_OVER', 'Zone failed! You did not catalog enough marine life.');
        } else if (s.level === 'HARD') {
          if (s.result?.outcome !== 'CORRECT') {
            await this.finish(
              s,
              'GAME_OVER',
              'The Final Island challenge was lost! You failed to conquer the pirate treasure.',
            );
          } else {
            const bonus = calculateExpeditionBonus(s.hearts, this.expeditionElapsed(s));
            s.score += bonus.totalBonus;
            await this.finish(s, 'COMPLETED', 'Victory! You conquered the Pirate Treasure Island!');
          }
        } else {
          s.phase = 'LEVEL_REVIEW';
          s.version++;
        }
      } else {
        s.round++;
        s.checkpointIndex++;
        s.phase = 'SAILING';
        s.question = null;
        s.version++;
        this.refill(s);
      }
    }
  }
  private sweep() {
    for (const [id, s] of this.states) {
      if (this.locks.has(id)) continue;
      if (terminal(s.phase) && s.saved && this.now() - s.touched > 900000) {
        this.states.delete(id);
        for (const [key, val] of this.starts) if (val.id === id) this.starts.delete(key);
        continue;
      }
      void this.lock(id, () => this.tick(s)).catch(() => {
        s.message = 'Result saving is pending. We will retry.';
      });
    }
  }
  image(id: string, owner: string, optionId: string) {
    const s = this.state(id, owner);
    ensure(!terminal(s.phase), 404, 'IMAGE_NOT_FOUND', 'Image no longer available.');
    const option = s.question?.options.find((o) => o.id === optionId);
    ensure(option, 404, 'IMAGE_NOT_FOUND', 'Image not found.');
    return option.sample;
  }
  async cancelUser(owner: string) {
    this.deletedUsers.add(owner);
    for (const s of this.states.values())
      if (s.owner === owner) {
        s.abort.abort();
        await this.lock(s.id, async () => {
          if (!terminal(s.phase)) await this.finish(s, 'ABANDONED');
          this.states.delete(s.id);
        });
      }
  }
  active(owner: string) {
    return (
      [...this.states.values()].find((s) => s.owner === owner && !terminal(s.phase))?.id ?? null
    );
  }
  close() {
    clearInterval(this.interval);
    for (const s of this.states.values()) s.abort.abort();
  }
}
