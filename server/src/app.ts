// [AI-ASSISTED: Codex, 2026-10-21] Express transport boundary; domain logic lives in use cases.
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { z } from 'zod';
import {
  answerSchema,
  avatarSchema,
  dockSchema,
  hitSchema,
  loginSchema,
  passwordSchema,
  registerSchema,
  startSchema,
  usernameSchema,
} from '../../contracts/src/index.js';
import {
  SqliteRepository,
  publicUser,
  type UserRecord,
  type IAppRepository,
} from './infrastructure/repository.js';
import { NeonRepository } from './infrastructure/neonRepository.js';
import { IdentityService } from './modules/identity/service.js';
import { GameService } from './modules/game/service.js';
import { HttpFishProvider, PracticeFishProvider, type IFishProvider } from './integrations/fish.js';
import { EventBus } from './events/bus.js';
import { AppError, ensure } from './errors.js';
interface Authed extends Request {
  identity: { user: UserRecord; sessionKey: string };
}
export function createApp(options: {
  dbPath?: string;
  databaseUrl?: string;
  repo?: IAppRepository;
  secret: string;
  origin?: string;
  googleClientId?: string;
  live?: IFishProvider;
  now?: () => number;
}): {
  app: express.Express;
  repo: SqliteRepository;
  games: GameService;
  identity: IdentityService;
  bus: EventBus;
  close: () => Promise<void>;
} {
  const app = express(),
    repo = (options.repo ??
      (options.databaseUrl
        ? new NeonRepository(options.databaseUrl)
        : new SqliteRepository(options.dbPath ?? 'var/reef.sqlite'))) as IAppRepository,
    bus = new EventBus();
  void Promise.resolve(repo.interruptActive()).catch((err) =>
    console.error('Failed to interrupt active games:', err),
  );
  const identity = new IdentityService(
    repo,
    new TextEncoder().encode(options.secret),
    options.googleClientId ?? null,
  );
  const games = new GameService(
    options.live ?? new HttpFishProvider(process.env.FISH_API_BASE),
    new PracticeFishProvider(),
    repo,
    bus,
    options.now,
  );
  const cookie = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  };
  const epoch = randomUUID();
  let version = 0;
  const streams = new Set<Response>();
  const board = async () => ({
    entries: ((await repo.board()) ?? []).slice(0, 10),
    version,
    epoch,
  });
  const send = async (res: Response) => {
    if (res.writableLength > 65536) {
      res.end();
      return;
    }
    const data = await board();
    res.write(
      `id: ${epoch}:${version}\nevent: leaderboard.updated\ndata: ${JSON.stringify(data)}\n\n`,
    );
  };
  bus.on('leaderboard.changed', () => {
    version++;
    for (const res of streams) void send(res);
  });
  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          'script-src': ["'self'", 'https://accounts.google.com'],
          'frame-src': ['https://accounts.google.com'],
          'connect-src': ["'self'", 'https://accounts.google.com'],
          'img-src': ["'self'", 'data:'],
          'style-src': ["'self'", "'unsafe-inline'", 'https://accounts.google.com'],
        },
      },
    }),
  );
  app.use(express.json({ limit: '16kb' }));
  app.use(cookieParser());
  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Correlation-Id', randomUUID());
    next();
  });
  const rotate = (res: Response) => {
    const token = randomBytes(32).toString('hex');
    res.cookie('reef_csrf', token, { ...cookie, maxAge: 7200000 });
    return token;
  };
  app.get('/api/auth/csrf', (req, res) => {
    const token =
      typeof req.cookies.reef_csrf === 'string' && /^[a-f0-9]{64}$/.test(req.cookies.reef_csrf)
        ? req.cookies.reef_csrf
        : rotate(res);
    res.json({ csrfToken: token });
  });
  const origins = new Set([
    options.origin ?? 'http://127.0.0.1:5173',
    'http://localhost:5173',
    'http://127.0.0.1:4000',
    'http://localhost:4000',
  ]);
  app.use('/api', (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const header = req.get('x-csrf-token'),
      token = req.cookies.reef_csrf;
    const origin = req.get('origin');
    if (origin && !origins.has(origin))
      return next(new AppError(403, 'ORIGIN_REJECTED', 'Request origin is not allowed.'));
    if (
      typeof token !== 'string' ||
      !header ||
      header.length !== token.length ||
      !timingSafeEqual(Buffer.from(header), Buffer.from(token))
    )
      return next(new AppError(403, 'CSRF_REJECTED', 'Please refresh and try again.'));
    next();
  });
  const auth = async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const result = await identity.authenticate(req.cookies.reef_session ?? '');
      (req as Authed).identity = result;
      next();
    } catch (e) {
      next(e);
    }
  };
  const authLimit = rateLimit({
    windowMs: 60000,
    limit: 25,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { code: 'RATE_LIMITED', message: 'Too many attempts. Please wait a minute.' },
  });
  const commandLimit = rateLimit({
    windowMs: 60000,
    limit: 600,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { code: 'RATE_LIMITED', message: 'Please slow down and try again.' },
  });
  app.use('/api/auth', authLimit);
  app.use('/api/games', commandLimit);
  const login = async (res: Response, user: UserRecord) => {
    res.cookie('reef_session', await identity.issue(user), { ...cookie, maxAge: 7200000 });
    res.json({ user: publicUser(user), csrfToken: rotate(res) });
  };
  app.get('/api/config', (_req, res) =>
    res.json({
      googleClientId: identity.googleClientId,
      persistence: options.databaseUrl
        ? 'Neon Serverless PostgreSQL (Cloud)'
        : 'Local SQLite · development',
    }),
  );
  app.get('/api/health/live', (_req, res) => res.json({ ok: true }));
  app.get('/api/health/ready', async (_req, res) => {
    try {
      if (repo.ping) await repo.ping();
      res.json({
        ok: true,
        persistence: options.databaseUrl ? 'neon-postgres' : 'sqlite',
      });
    } catch {
      res.status(503).json({ ok: false, error: 'Database unavailable' });
    }
  });
  app.post('/api/auth/register', async (req, res) => {
    const b = registerSchema.parse(req.body);
    await login(res, await identity.register(b.username, b.email, b.password));
  });
  app.post('/api/auth/login', async (req, res) => {
    const b = loginSchema.parse(req.body);
    await login(res, await identity.login(b.email, b.password));
  });
  app.post('/api/auth/google', async (req, res) => {
    const { credential } = z.object({ credential: z.string().min(1).max(10000) }).parse(req.body);
    await login(res, await identity.google(credential, req.cookies.reef_csrf));
  });
  app.get('/api/auth/me', auth, (req, res) => {
    const u = (req as Authed).identity.user;
    res.json({ user: publicUser(u), activeGameId: games.active(u.id) });
  });
  app.post('/api/auth/logout', auth, async (req, res) => {
    const a = (req as Authed).identity;
    await repo.revokeSession(a.sessionKey);
    res.clearCookie('reef_session', cookie);
    res.json({ ok: true, csrfToken: rotate(res) });
  });
  app.post('/api/auth/logout-all', auth, async (req, res) => {
    await repo.revokeAll((req as Authed).identity.user.id);
    res.clearCookie('reef_session', cookie);
    res.json({ ok: true, csrfToken: rotate(res) });
  });
  app.post('/api/auth/reauthenticate', auth, async (req, res) => {
    const b = z
      .object({
        password: z.string().max(128).optional(),
        credential: z.string().max(10000).optional(),
      })
      .parse(req.body);
    const a = (req as Authed).identity;
    await identity.reauthenticate(
      a.user,
      a.sessionKey,
      b.password,
      b.credential,
      req.cookies.reef_csrf,
    );
    res.json({ ok: true });
  });
  app.get('/api/users/me', auth, async (req, res) =>
    res.json(await repo.profile((req as Authed).identity.user.id)),
  );
  app.patch('/api/users/me', auth, async (req, res) => {
    const b = z.object({ username: usernameSchema, avatarId: avatarSchema }).parse(req.body);
    const u = (req as Authed).identity.user;
    await repo.updateUser(u.id, b.username, b.avatarId);
    bus.emit('leaderboard.changed', { reason: 'profile' });
    res.json(await repo.profile(u.id));
  });
  app.patch('/api/users/me/password', auth, async (req, res) => {
    const a = (req as Authed).identity;
    await identity.requireRecent(a.sessionKey);
    const { password } = z.object({ password: passwordSchema }).parse(req.body);
    await repo.setPassword(a.user.id, await identity.hashPassword(password));
    res.clearCookie('reef_session', cookie);
    res.json({ ok: true, csrfToken: rotate(res) });
  });
  app.delete('/api/users/me', auth, async (req, res) => {
    const a = (req as Authed).identity;
    await identity.requireRecent(a.sessionKey);
    await games.cancelUser(a.user.id);
    await repo.deleteUser(a.user.id);
    bus.emit('leaderboard.changed', { reason: 'deleted' });
    res.clearCookie('reef_session', cookie);
    res.json({ ok: true, csrfToken: rotate(res) });
  });
  app.get('/api/leaderboard', async (_req, res) => res.json(await board()));
  app.get('/api/leaderboard/stream', (req, res) => {
    ensure(streams.size < 100, 503, 'BUSY', 'Too many live connections.');
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    streams.add(res);
    send(res);
    const heartbeat = setInterval(() => {
      if (res.writableLength > 65536) {
        res.end();
        return;
      }
      res.write(': heartbeat\n\n');
    }, 25000);
    req.on('close', () => {
      clearInterval(heartbeat);
      streams.delete(res);
    });
  });
  app.post('/api/games', auth, async (req, res) => {
    const b = startSchema.parse(req.body);
    res.json(await games.start((req as Authed).identity.user.id, b.level, b.mode, b.requestId));
  });
  app.get('/api/games/:id', auth, async (req, res) =>
    res.json(await games.get(String(req.params.id), (req as Authed).identity.user.id)),
  );
  app.post('/api/games/:id/dock', auth, async (req, res) =>
    res.json(
      await games.dock(
        String(req.params.id),
        (req as Authed).identity.user.id,
        dockSchema.parse(req.body),
      ),
    ),
  );
  app.post('/api/games/:id/hit', auth, async (req, res) =>
    res.json(
      await games.hit(
        String(req.params.id),
        (req as Authed).identity.user.id,
        hitSchema.parse(req.body),
      ),
    ),
  );
  app.post('/api/games/:id/ready', auth, async (req, res) => {
    const b = z.object({ questionId: z.uuid() }).parse(req.body);
    res.json(
      await games.ready(String(req.params.id), (req as Authed).identity.user.id, b.questionId),
    );
  });
  app.post('/api/games/:id/answers', auth, async (req, res) =>
    res.json(
      await games.answer(
        String(req.params.id),
        (req as Authed).identity.user.id,
        answerSchema.parse(req.body),
      ),
    ),
  );
  for (const action of ['pause', 'resume', 'advance', 'finish'] as const)
    app.post(`/api/games/:id/${action}`, auth, async (req, res) => {
      const method = action === 'finish' ? 'abandon' : action;
      res.json(await games[method](String(req.params.id), (req as Authed).identity.user.id));
    });
  app.get('/api/images/:gameId/:imageId', auth, (req, res) => {
    const image = games.image(
      String(req.params.gameId),
      (req as Authed).identity.user.id,
      String(req.params.imageId),
    );
    res.type(image.mime).send(image.bytes);
  });
  const dist = resolve('dist/client');
  if (existsSync(dist)) {
    app.use(express.static(dist));
    app.get('/{*path}', (req, res) => {
      if (req.path.startsWith('/api/'))
        return res.status(404).json({ message: 'Endpoint not found.' });
      res.sendFile(resolve(dist, 'index.html'));
    });
  }
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof z.ZodError)
      return res
        .status(400)
        .json({ code: 'VALIDATION', message: error.issues[0]?.message ?? 'Invalid request.' });
    const err = error as { status?: number; code?: string; message?: string };
    const msg = (err.message ?? '').toLowerCase();
    const isUniqueViolation =
      msg.includes('unique constraint') ||
      msg.includes('duplicate key') ||
      err.code === '23505';
    if (isUniqueViolation)
      return res
        .status(409)
        .json({ code: 'ALREADY_USED', message: 'That name or email is already in use.' });
    if (err.status)
      return res
        .status(err.status)
        .json({ code: err.code ?? 'REQUEST_FAILED', message: err.message });
    console.error('Request failed:', error instanceof Error ? error.name : 'UnknownError');
    res.status(500).json({ code: 'INTERNAL', message: 'Something went wrong. Please try again.' });
  });
  return {
    app,
    repo: repo as SqliteRepository,
    identity,
    games,
    bus,
    close: async () => {
      for (const res of streams) res.end();
      games.close();
      if (repo.close) await repo.close();
    },
  };
}
