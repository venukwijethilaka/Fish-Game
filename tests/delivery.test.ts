// [AI-ASSISTED: Codex, 2026-10-21] Push recovery, complete progression, restart and failed-provider evidence.
import { afterEach, beforeEach, expect, it } from 'vitest';
import request from 'supertest';
import { mkdtempSync } from 'node:fs';
import { resolve } from 'node:path';
import { createApp } from '../server/src/app.js';
import type { GameDTO } from '../contracts/src/index.js';
let ctx: ReturnType<typeof createApp>,
  time = 0;
beforeEach(() => {
  time = 0;
  ctx = createApp({
    dbPath: ':memory:',
    secret: 'a-separate-test-secret-at-least-32-characters',
    now: () => time,
  });
});
afterEach(() => ctx.close());
async function account() {
  const agent = request.agent(ctx.app);
  let csrf = (await agent.get('/api/auth/csrf')).body.csrfToken;
  const r = await agent
    .post('/api/auth/register')
    .set('X-CSRF-Token', csrf)
    .send({
      username: 'Delivery Explorer',
      email: 'delivery@reef.test',
      password: 'test-delivery-password',
    });
  expect(r.status).toBe(200);
  return { agent, csrf: r.body.csrfToken as string, id: r.body.user.id as string };
}
it('completes all three levels, records one unranked practice run and releases active game', async () => {
  const a = await account();
  let g = (
    await a.agent
      .post('/api/games')
      .set('X-CSRF-Token', a.csrf)
      .send({ level: 'EASY', mode: 'practice', requestId: crypto.randomUUID() })
  ).body as GameDTO;
  for (let level = 0; level < 3; level++) {
    for (let round = 0; round < 5; round++) {
      if (g.phase === 'SAILING') {
        g = (
          await a.agent
            .post(`/api/games/${g.id}/dock`)
            .set('X-CSRF-Token', a.csrf)
            .send({
              checkpointIndex: level * 5 + round + 1,
              requestId: crypto.randomUUID(),
            })
        ).body;
      }
      expect(g.question!.options).toHaveLength(level + 2);
      await a.agent
        .post(`/api/games/${g.id}/ready`)
        .set('X-CSRF-Token', a.csrf)
        .send({ questionId: g.question!.id });
      time += 1000;
      const option = g.question!.options.find(
        (o) => ctx.games.image(g.id, a.id, o.id)[g.question!.target] === g.question!.count,
      )!;
      const r = await a.agent
        .post(`/api/games/${g.id}/answers`)
        .set('X-CSRF-Token', a.csrf)
        .send({ questionId: g.question!.id, optionId: option.id, requestId: crypto.randomUUID() });
      expect(r.status).toBe(200);
      time += 800;
      g = (await a.agent.get(`/api/games/${g.id}`)).body;
    }
    if (level < 2) {
      expect(g.phase).toBe('LEVEL_REVIEW');
      time += 5000;
      g = (await a.agent.post(`/api/games/${g.id}/advance`).set('X-CSRF-Token', a.csrf).send({}))
        .body;
    }
  }
  expect(g.phase).toBe('COMPLETED');
  expect(g.totalAnswered).toBe(15);
  expect(g.totalCorrect).toBe(15);
  expect(g.saved).toBe(true);
  expect(ctx.repo.profile(a.id).practiceGames).toBe(1);
  expect(ctx.repo.board()).toHaveLength(0);
  expect(ctx.games.active(a.id)).toBe(null);
});
it('uses a strict sub-five-second threshold and interrupts unreadied images without rank', async () => {
  const a = await account();
  let g = (
    await a.agent
      .post('/api/games')
      .set('X-CSRF-Token', a.csrf)
      .send({ level: 'EASY', mode: 'practice', requestId: crypto.randomUUID() })
  ).body as GameDTO;
  g = (
    await a.agent
      .post(`/api/games/${g.id}/dock`)
      .set('X-CSRF-Token', a.csrf)
      .send({ checkpointIndex: 1, requestId: crypto.randomUUID() })
  ).body;
  await a.agent
    .post(`/api/games/${g.id}/ready`)
    .set('X-CSRF-Token', a.csrf)
    .send({ questionId: g.question!.id });
  time += 5000;
  const option = g.question!.options.find(
    (o) => ctx.games.image(g.id, a.id, o.id)[g.question!.target] === g.question!.count,
  )!;
  g = (
    await a.agent
      .post(`/api/games/${g.id}/answers`)
      .set('X-CSRF-Token', a.csrf)
      .send({ questionId: g.question!.id, optionId: option.id, requestId: crypto.randomUUID() })
  ).body;
  expect(g.fastStreak).toBe(0);
  time += 800;
  g = (await a.agent.get(`/api/games/${g.id}`)).body;
  expect(g.phase).toBe('SAILING');
  g = (
    await a.agent
      .post(`/api/games/${g.id}/dock`)
      .set('X-CSRF-Token', a.csrf)
      .send({ checkpointIndex: 2, requestId: crypto.randomUUID() })
  ).body;
  expect(g.phase).toBe('AWAITING_READY');
  time += 10001;
  g = (await a.agent.get(`/api/games/${g.id}`)).body;
  expect(g.phase).toBe('INTERRUPTED');
  expect(ctx.repo.profile(a.id).gamesPlayed).toBe(0);
});
it('pushes committed changes to two SSE subscribers and resynchronises reconnect', async () => {
  const a = await account();
  const server = ctx.app.listen(0, '127.0.0.1');
  await new Promise<void>((r) => server.once('listening', r));
  const port = (server.address() as { port: number }).port;
  const controller = new AbortController();
  const connect = () =>
    fetch(`http://127.0.0.1:${port}/api/leaderboard/stream`, { signal: controller.signal });
  const readers: ReadableStreamDefaultReader<Uint8Array>[] = [];
  const frame = async (reader: ReadableStreamDefaultReader<Uint8Array>) => {
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    return JSON.parse(
      text
        .split('\n')
        .find((l) => l.startsWith('data: '))!
        .slice(6),
    );
  };
  try {
    for (let i = 0; i < 2; i++) readers.push((await connect()).body!.getReader());
    const initial = await Promise.all(readers.map(frame));
    expect(initial[0].version).toBe(0);
    expect(initial[1].version).toBe(0);
    const update = await a.agent
      .patch('/api/users/me')
      .set('X-CSRF-Token', a.csrf)
      .send({ username: 'Updated Explorer', avatarId: 'turtle' });
    expect(update.status).toBe(200);
    const next = await Promise.all(readers.map(frame));
    expect(next[0].version).toBe(1);
    expect(next[1].version).toBe(1);
    const third = (await connect()).body!.getReader();
    readers.push(third);
    expect((await frame(third)).version).toBe(1);
  } finally {
    controller.abort();
    await Promise.all(readers.map((r) => r.cancel().catch(() => {})));
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});
it('marks unfinished durable rows interrupted after process restart', async () => {
  ctx.close();
  const folder = mkdtempSync(resolve('var/test-restart-'));
  const path = resolve(folder, 'test.sqlite');
  ctx = createApp({ dbPath: path, secret: 'a-separate-test-secret-at-least-32-characters' });
  const a = await account();
  const start = await a.agent
    .post('/api/games')
    .set('X-CSRF-Token', a.csrf)
    .send({ level: 'EASY', mode: 'practice', requestId: crypto.randomUUID() });
  expect(start.status).toBe(200);
  ctx.close();
  ctx = createApp({ dbPath: path, secret: 'a-separate-test-secret-at-least-32-characters' });
  expect(
    ctx.repo.db.prepare('SELECT status FROM games WHERE id=?').get(start.body.id)?.status,
  ).toBe('INTERRUPTED');
  expect(ctx.repo.user(a.id)?.username).toBe('Delivery Explorer');
});
it('does not disguise an unavailable live provider as practice or an incorrect answer', async () => {
  ctx.close();
  ctx = createApp({
    dbPath: ':memory:',
    secret: 'a-separate-test-secret-at-least-32-characters',
    live: {
      getSample: async () => {
        throw new Error('provider offline');
      },
    },
  });
  const a = await account();
  const g = (
    await a.agent
      .post('/api/games')
      .set('X-CSRF-Token', a.csrf)
      .send({ level: 'EASY', mode: 'live', requestId: crypto.randomUUID() })
  ).body as GameDTO;
  expect(g.phase).toBe('INTERRUPTED');
  expect(g.mode).toBe('live');
  expect(g.score).toBe(0);
  expect(g.question).toBeNull();
  expect(ctx.repo.board()).toHaveLength(0);
});
