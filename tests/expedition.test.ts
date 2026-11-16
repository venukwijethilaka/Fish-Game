// [AI-ASSISTED: Codex, 2026-11-05] Tests for 2D Pirate Island expedition, sailing, hearts, checkpoints, and Final Island.
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
    secret: 'test-secret-at-least-32-characters-long',
    now: () => time,
    live: {
      getSample: async () => {
        const n = ++serial;
        return {
          bytes: Buffer.from(`sample-${n}`),
          mime: 'image/png',
          fish: (n % 8) + 1,
          chest: (n % 5) + 1,
        };
      },
    },
  });
});

afterEach(() => ctx.close());

async function account(email = 'captain@example.com', username = 'Captain Jack') {
  const agent = request.agent(ctx.app);
  let csrf = (await agent.get('/api/auth/csrf')).body.csrfToken;
  const reg = await agent
    .post('/api/auth/register')
    .set('X-CSRF-Token', csrf)
    .send({ username, email, password: 'password-123456789' });
  expect(reg.status).toBe(200);
  csrf = reg.body.csrfToken;
  return { agent, csrf, user: reg.body.user };
}

describe('Pirate Island Sailing & Checkpoint Expedition', () => {
  it('starts an expedition in SAILING phase with 3 hearts at checkpoint 1', async () => {
    const a = await account();
    const res = await a.agent
      .post('/api/games')
      .set('X-CSRF-Token', a.csrf)
      .send({ level: 'EASY', mode: 'practice', requestId: crypto.randomUUID() });
    expect(res.status).toBe(200);
    const g = res.body as GameDTO;
    expect(g.phase).toBe('SAILING');
    expect(g.hearts).toBe(3);
    expect(g.checkpointIndex).toBe(1);
    expect(g.isFinalIsland).toBe(false);
    expect(g.question).toBeNull();
  });

  it('loses hearts on obstacle/shark collisions and triggers shipwreck at 0 hearts', async () => {
    const a = await account();
    let g = (
      await a.agent
        .post('/api/games')
        .set('X-CSRF-Token', a.csrf)
        .send({ level: 'EASY', mode: 'practice', requestId: crypto.randomUUID() })
    ).body as GameDTO;

    // Hit 1: rock
    time += 500;
    let hitRes = await a.agent
      .post(`/api/games/${g.id}/hit`)
      .set('X-CSRF-Token', a.csrf)
      .send({ hazardType: 'rock', requestId: crypto.randomUUID() });
    expect(hitRes.status).toBe(200);
    g = hitRes.body;
    expect(g.hearts).toBe(2);
    expect(g.phase).toBe('SAILING');

    // Immediate second hit within 1500ms invincibility cooldown should not deduct heart
    time += 200;
    hitRes = await a.agent
      .post(`/api/games/${g.id}/hit`)
      .set('X-CSRF-Token', a.csrf)
      .send({ hazardType: 'barrel', requestId: crypto.randomUUID() });
    expect(hitRes.status).toBe(200);
    g = hitRes.body;
    expect(g.hearts).toBe(2); // still 2

    // Hit 2 after cooldown: chasing shark
    time += 1600;
    hitRes = await a.agent
      .post(`/api/games/${g.id}/hit`)
      .set('X-CSRF-Token', a.csrf)
      .send({ hazardType: 'shark', requestId: crypto.randomUUID() });
    expect(hitRes.status).toBe(200);
    g = hitRes.body;
    expect(g.hearts).toBe(1);
    expect(g.phase).toBe('SAILING');

    // Hit 3 after cooldown: lethal collision -> shipwreck!
    time += 1600;
    hitRes = await a.agent
      .post(`/api/games/${g.id}/hit`)
      .set('X-CSRF-Token', a.csrf)
      .send({ hazardType: 'rock', requestId: crypto.randomUUID() });
    expect(hitRes.status).toBe(200);
    g = hitRes.body;
    expect(g.hearts).toBe(0);
    expect(g.phase).toBe('GAME_OVER');
    expect(g.message).toContain('Shipwrecked');
    expect(g.saved).toBe(true);
  });

  it('rejects docking at wrong checkpoints and requires sequential discovery', async () => {
    const a = await account();
    const g = (
      await a.agent
        .post('/api/games')
        .set('X-CSRF-Token', a.csrf)
        .send({ level: 'EASY', mode: 'practice', requestId: crypto.randomUUID() })
    ).body as GameDTO;

    // Attempting to skip Pier 1 and dock directly at Pier 3
    const badDock = await a.agent
      .post(`/api/games/${g.id}/dock`)
      .set('X-CSRF-Token', a.csrf)
      .send({ checkpointIndex: 3, requestId: crypto.randomUUID() });
    expect(badDock.status).toBe(409);
    expect(badDock.body.code).toBe('INVALID_CHECKPOINT');

    // Valid dock at Pier 1
    const goodDock = await a.agent
      .post(`/api/games/${g.id}/dock`)
      .set('X-CSRF-Token', a.csrf)
      .send({ checkpointIndex: 1, requestId: crypto.randomUUID() });
    expect(goodDock.status).toBe(200);
    expect(goodDock.body.phase).toBe('AWAITING_READY');
    expect(goodDock.body.question).not.toBeNull();
  });

  it('allows pausing during sailing and freezes the expedition stopwatch', async () => {
    const a = await account();
    let g = (
      await a.agent
        .post('/api/games')
        .set('X-CSRF-Token', a.csrf)
        .send({ level: 'EASY', mode: 'practice', requestId: crypto.randomUUID() })
    ).body as GameDTO;

    time += 2000;
    // Pause during SAILING
    g = (
      await a.agent.post(`/api/games/${g.id}/pause`).set('X-CSRF-Token', a.csrf).send({})
    ).body;
    expect(g.phase).toBe('PAUSED');
    const elapsedAtPause = g.expeditionElapsedMs;

    time += 4000;
    // Check state while paused: elapsed time should be frozen
    g = (await a.agent.get(`/api/games/${g.id}`)).body;
    expect(g.expeditionElapsedMs).toBe(elapsedAtPause);

    // Resume: returns to SAILING
    g = (
      await a.agent.post(`/api/games/${g.id}/resume`).set('X-CSRF-Token', a.csrf).send({})
    ).body;
    expect(g.phase).toBe('SAILING');
  });

  it('conquering Final Island #15 wins the expedition and awards surviving heart and speed bonuses', async () => {
    const a = await account();
    // Start directly on HARD level (starts at Checkpoint 11, ending at Island 15)
    let g = (
      await a.agent
        .post('/api/games')
        .set('X-CSRF-Token', a.csrf)
        .send({ level: 'HARD', mode: 'practice', requestId: crypto.randomUUID() })
    ).body as GameDTO;
    expect(g.checkpointIndex).toBe(11);

    for (let round = 1; round <= 5; round++) {
      const checkpoint = 10 + round;
      if (g.phase === 'SAILING') {
        g = (
          await a.agent
            .post(`/api/games/${g.id}/dock`)
            .set('X-CSRF-Token', a.csrf)
            .send({ checkpointIndex: checkpoint, requestId: crypto.randomUUID() })
        ).body;
      }
      expect(g.checkpointIndex).toBe(checkpoint);
      if (checkpoint === 15) {
        expect(g.isFinalIsland).toBe(true);
      }

      await a.agent
        .post(`/api/games/${g.id}/ready`)
        .set('X-CSRF-Token', a.csrf)
        .send({ questionId: g.question!.id });
      time += 1000;

      // Pick correct answer
      const q = g.question!;
      const correct = q.options.find(
        (o) => ctx.games.image(g.id, a.user.id, o.id)[q.target] === q.count,
      )!;
      await a.agent
        .post(`/api/games/${g.id}/answers`)
        .set('X-CSRF-Token', a.csrf)
        .send({ questionId: q.id, optionId: correct.id, requestId: crypto.randomUUID() });
      time += 800;
      g = (await a.agent.get(`/api/games/${g.id}`)).body;
    }

    expect(g.phase).toBe('COMPLETED');
    expect(g.message).toContain('Victory');
    expect(g.saved).toBe(true);
    // All 3 hearts survived, so score includes 3 * 15 = 45 heart bonus + speed bonus
    expect(g.score).toBeGreaterThan(150);
  });
});
