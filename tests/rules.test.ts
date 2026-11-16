// [AI-ASSISTED: Codex, 2026-10-21] Boundary tests document intended domain semantics.
import { describe, expect, it } from 'vitest';
import {
  scoreAnswer,
  uniqueTarget,
  nextLevel,
  checkpointLevel,
  calculateExpeditionBonus,
} from '../server/src/modules/game/rules.js';
import { parseCsv, parseJson, pngBytes } from '../server/src/integrations/fish.js';
import { EventBus } from '../server/src/events/bus.js';
describe('score policy', () => {
  it('rewards speed, clamps grace and doubles positive points only', () => {
    expect(scoreAnswer('EASY', true, 0, false, 0)).toEqual({ score: 20, delta: 20 });
    expect(scoreAnswer('EASY', true, 15050, true, 0)).toEqual({ score: 20, delta: 20 });
    expect(scoreAnswer('HARD', true, 4000, true, 10)).toEqual({ score: 100, delta: 90 });
    expect(scoreAnswer('EASY', false, 0, true, 3)).toEqual({ score: 0, delta: -3 });
  });
  it('requires uniqueness only for the asked target', () => {
    const samples = [
      { fish: 3, chest: 2 },
      { fish: 6, chest: 2 },
    ];
    expect(uniqueTarget(samples, 'fish', 0)).toBe(true);
    expect(uniqueTarget(samples, 'chest', 0)).toBe(false);
    expect(nextLevel('HARD')).toBe(null);
  });
  it('maps 15 checkpoints across Easy, Medium, and Hard zones', () => {
    expect(checkpointLevel(1)).toBe('EASY');
    expect(checkpointLevel(5)).toBe('EASY');
    expect(checkpointLevel(6)).toBe('MEDIUM');
    expect(checkpointLevel(10)).toBe('MEDIUM');
    expect(checkpointLevel(11)).toBe('HARD');
    expect(checkpointLevel(15)).toBe('HARD');
  });
  it('calculates expedition completion bonuses based on surviving hearts and speed', () => {
    // 3 hearts, 120 seconds (120,000 ms) elapsed out of 300,000 ms budget
    const fast = calculateExpeditionBonus(3, 120000);
    expect(fast.heartBonus).toBe(45); // 3 * 15
    expect(fast.speedBonus).toBe(36); // (300,000 - 120,000) / 5000 = 36
    expect(fast.totalBonus).toBe(81);

    // 1 heart, slower than 5 minutes
    const slow = calculateExpeditionBonus(1, 350000);
    expect(slow.heartBonus).toBe(15);
    expect(slow.speedBonus).toBe(0);
    expect(slow.totalBonus).toBe(15);
  });
});
describe('external payload contracts', () => {
  it('normalises named JSON and positional CSV fields', () => {
    expect(parseJson('{"question":"https://www.sanfoh.com/a.png","fish":7,"chest":4}')).toEqual(
      parseCsv('https://www.sanfoh.com/a.png,7,4\r\n'),
    );
  });
  it('handles quoted URLs and rejects malformed counts/records', () => {
    expect(parseCsv('"https://www.sanfoh.com/a,b.png",2,3').fish).toBe(2);
    for (const payload of ['url,,2', 'url,-1,2', 'url,1,2,3', 'url,1,2\nurl,1,2'])
      expect(() => parseCsv(payload)).toThrow();
    expect(() => parseJson('<html>Unavailable</html>')).toThrow();
    expect(() => parseJson('{"question":"url","fish":-1,"chest":3}')).toThrow();
    expect(() => pngBytes(Buffer.from('not a png'))).toThrow();
  });
});
describe('optional observers', () => {
  it('isolates a throwing observer from other subscribers', () => {
    const bus = new EventBus();
    let observed = false;
    bus.on('leaderboard.changed', () => {
      throw new Error('observer failed');
    });
    bus.on('leaderboard.changed', () => {
      observed = true;
    });
    expect(() => bus.emit('leaderboard.changed', { reason: 'test' })).not.toThrow();
    expect(observed).toBe(true);
  });
});
