// [AI-ASSISTED: Codex, 2026-10-21] Real SQLite + HTTP integration with injected time/provider.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../server/src/app.js';
import type { GameDTO } from '../contracts/src/index.js';
let ctx: ReturnType<typeof createApp>,
  time = 0,
  serial = 0;
beforeEach(() => {
  time = 0;
  serial = 0;
  ctx = createApp({
    dbPath: ':memory:',
    secret: 'integration-test-secret-at-least-32-characters',
    now: () => time,
    live: {
      getSample: async () => {
        const n = ++serial;
        return {
          bytes: Buffer.from(`fixture-${n}`),
          mime: 'image/png',
          fish: (n % 9) + 1,
          chest: (n % 6) + 1,
        };
      },
    },
  });
});
afterEach(() => ctx.close());
async function account(email = 'diver@example.com', username = 'Test Diver') {
  const agent = request.agent(ctx.app);
  let csrf = (await agent.get('/api/auth/csrf')).body.csrfToken;
  const reg = await agent
    .post('/api/auth/register')
    .set('X-CSRF-Token', csrf)
    .send({ username, email, password: 'a-long-test-password' });
  expect(reg.status).toBe(200);
  csrf = reg.body.csrfToken;
  return { agent, csrf, user: reg.body.user };
}
async function start(
  a: Awaited<ReturnType<typeof account>>,
  mode: 'live' | 'practice' = 'practice',
) {
  const r = await a.agent
    .post('/api/games')
    .set('X-CSRF-Token', a.csrf)
    .send({ level: 'EASY', mode, requestId: crypto.randomUUID() });
  expect(r.status).toBe(200);
  const docked = await a.agent
    .post(`/api/games/${r.body.id}/dock`)
    .set('X-CSRF-Token', a.csrf)
    .send({ checkpointIndex: 1, requestId: crypto.randomUUID() });
  expect(docked.status).toBe(200);
  return docked.body as GameDTO;
}
const post = (a: Awaited<ReturnType<typeof account>>, game: GameDTO, action: string, body = {}) =>
  a.agent.post(`/api/games/${game.id}/${action}`).set('X-CSRF-Token', a.csrf).send(body);
function correctOption(a: Awaited<ReturnType<typeof account>>, g: GameDTO) {
  const q = g.question!;
  return q.options.find((o) => {
    const sample = ctx.games.image(g.id, a.user.id, o.id);
    return sample[q.target] === q.count;
  })!.id;
}
describe('local identity and permissions', () => {
  it('protects mutations with CSRF and origin checks; revokes a copied session on logout', async () => {
    const a = await account();
    expect(
      (await a.agent.patch('/api/users/me').send({ username: 'Other', avatarId: 'turtle' })).status,
    ).toBe(403);
    expect(
      (
        await a.agent
          .patch('/api/users/me')
          .set('X-CSRF-Token', a.csrf)
          .set('Origin', 'https://evil.example')
          .send({ username: 'Other', avatarId: 'turtle' })
      ).status,
    ).toBe(403);
    expect((await a.agent.get('/api/auth/me')).status).toBe(200);
    const login = await a.agent
      .post('/api/auth/login')
      .set('X-CSRF-Token', a.csrf)
      .send({ email: 'diver@example.com', password: 'a-long-test-password' });
    const copied = (login.headers['set-cookie'] as unknown as string[])
      .find((c) => c.startsWith('reef_session='))!
      .split(';')[0];
    a.csrf = login.body.csrfToken;
    expect(
      (await a.agent.post('/api/auth/logout').set('X-CSRF-Token', a.csrf).send({})).status,
    ).toBe(200);
    expect((await request(ctx.app).get('/api/auth/me').set('Cookie', copied)).status).toBe(401);
  });
  it('prevents another user from reading/mutating a game and its images', async () => {
    const a = await account(),
      b = await account('other@example.com', 'Other Diver'),
      g = await start(a);
    expect((await b.agent.get(`/api/games/${g.id}`)).status).toBe(404);
    expect((await b.agent.get(g.question!.options[0].src)).status).toBe(404);
    expect((await post(b, g, 'finish')).status).toBe(404);
    expect(JSON.stringify(g)).not.toContain('sanfoh');
    expect(g.question!.options[0]).not.toHaveProperty('fish');
  });
  it('requires recent proof for account deletion and cascades sessions/history', async () => {
    const a = await account();
    const g = await start(a);
    expect(
      (await a.agent.delete('/api/users/me').set('X-CSRF-Token', a.csrf).send({})).status,
    ).toBe(403);
    expect(
      (
        await a.agent
          .post('/api/auth/reauthenticate')
          .set('X-CSRF-Token', a.csrf)
          .send({ password: 'a-long-test-password' })
      ).status,
    ).toBe(200);
    expect(
      (await a.agent.delete('/api/users/me').set('X-CSRF-Token', a.csrf).send({})).status,
    ).toBe(200);
    expect(ctx.repo.user(a.user.id)).toBeUndefined();
    expect(ctx.repo.db.prepare('SELECT * FROM games WHERE id=?').get(g.id)).toBeUndefined();
    expect((await a.agent.get('/api/auth/me')).status).toBe(401);
  });
});
describe('server-authoritative game lifecycle', () => {
  it('resolves simultaneous duplicate answers once and rejects changed request reuse', async () => {
    const a = await account();
    let g = await start(a);
    expect((await post(a, g, 'ready', { questionId: g.question!.id })).status).toBe(200);
    time += 1000;
    const body = {
      questionId: g.question!.id,
      optionId: correctOption(a, g),
      requestId: crypto.randomUUID(),
    };
    const [one, two] = await Promise.all([
      post(a, g, 'answers', body),
      post(a, g, 'answers', body),
    ]);
    expect(one.status).toBe(200);
    expect(two.body).toEqual(one.body);
    expect(one.body.totalAnswered).toBe(1);
    expect(
      (
        await post(a, g, 'answers', {
          ...body,
          optionId: g.question!.options.find((o) => o.id !== body.optionId)!.id,
        })
      ).status,
    ).toBe(409);
  });
  it('enforces pause limits and resolves expired questions without client claims', async () => {
    const a = await account();
    let g = await start(a);
    g = (await post(a, g, 'ready', { questionId: g.question!.id })).body;
    for (let i = 0; i < 3; i++) {
      time += 100;
      g = (await post(a, g, 'pause')).body;
      time += 2000;
      expect((await a.agent.get(`/api/games/${g.id}`)).body.remainingMs).toBe(g.remainingMs);
      g = (await post(a, g, 'resume')).body;
    }
    expect((await post(a, g, 'pause')).status).toBe(409);
    time += 17000;
    g = (await a.agent.get(`/api/games/${g.id}`)).body;
    expect(g.result?.outcome).toBe('TIMEOUT');
    expect(g.score).toBe(0);
  });
  it('does not allow early timeout requests or forged option IDs', async () => {
    const a = await account();
    const g = await start(a);
    await post(a, g, 'ready', { questionId: g.question!.id });
    expect(
      (
        await post(a, g, 'answers', {
          questionId: g.question!.id,
          optionId: null,
          requestId: crypto.randomUUID(),
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await post(a, g, 'answers', {
          questionId: g.question!.id,
          optionId: crypto.randomUUID(),
          requestId: crypto.randomUUID(),
        })
      ).status,
    ).toBe(400);
  });
  it('activates fever only after three fast answers; freezes it across pauses', async () => {
    const a = await account();
    let g = await start(a);
    for (let i = 0; i < 3; i++) {
      await post(a, g, 'ready', { questionId: g.question!.id });
      time += 1000;
      g = (
        await post(a, g, 'answers', {
          questionId: g.question!.id,
          optionId: correctOption(a, g),
          requestId: crypto.randomUUID(),
        })
      ).body;
      expect(g.result?.multiplier).toBe(1);
      time += 800;
      g = (await a.agent.get(`/api/games/${g.id}`)).body;
      if (i < 2) {
        expect(g.phase).toBe('SAILING');
        g = (
          await post(a, g, 'dock', {
            checkpointIndex: i + 2,
            requestId: crypto.randomUUID(),
          })
        ).body;
      }
    }
    expect(g.feverRemainingMs).toBe(10000);
    expect(g.phase).toBe('SAILING');
    g = (
      await post(a, g, 'dock', {
        checkpointIndex: 4,
        requestId: crypto.randomUUID(),
      })
    ).body;
    await post(a, g, 'ready', { questionId: g.question!.id });
    time += 1000;
    g = (await post(a, g, 'pause')).body;
    const frozen = g.feverRemainingMs;
    time += 5000;
    g = (await post(a, g, 'resume')).body;
    expect(g.feverRemainingMs).toBe(frozen);
    time += 1000;
    g = (
      await post(a, g, 'answers', {
        questionId: g.question!.id,
        optionId: correctOption(a, g),
        requestId: crypto.randomUUID(),
      })
    ).body;
    expect(g.result?.multiplier).toBe(2);
  });
  it('saves a failed live run once, derives a consistent leaderboard and excludes practice', async () => {
    const a = await account();
    let g = await start(a, 'live');
    for (let i = 0; i < 5; i++) {
      await post(a, g, 'ready', { questionId: g.question!.id });
      time += 1000;
      const correct = correctOption(a, g);
      const chosen = i === 0 ? correct : g.question!.options.find((o) => o.id !== correct)!.id;
      g = (
        await post(a, g, 'answers', {
          questionId: g.question!.id,
          optionId: chosen,
          requestId: crypto.randomUUID(),
        })
      ).body;
      time += 800;
      g = (await a.agent.get(`/api/games/${g.id}`)).body;
      if (i < 4) {
        expect(g.phase).toBe('SAILING');
        g = (
          await post(a, g, 'dock', {
            checkpointIndex: i + 2,
            requestId: crypto.randomUUID(),
          })
        ).body;
      }
    }
    expect(g.phase).toBe('GAME_OVER');
    expect(g.saved).toBe(true);
    await post(a, g, 'finish');
    await post(a, g, 'finish');
    expect(ctx.repo.profile(a.user.id).gamesPlayed).toBe(1);
    expect(ctx.repo.board()[0].id).toBe(a.user.id);
    const practice = await start(a);
    await post(a, practice, 'finish');
    expect(ctx.repo.profile(a.user.id).gamesPlayed).toBe(1);
  });
});
