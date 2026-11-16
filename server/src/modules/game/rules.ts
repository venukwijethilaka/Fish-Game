// [AI-ASSISTED: Codex, 2026-10-21] Pure domain policy; no infrastructure imports.
import { LEVELS, type Level } from '../../../../contracts/src/index.js';
export function scoreAnswer(
  level: Level,
  correct: boolean,
  elapsedMs: number,
  fever: boolean,
  score: number,
) {
  const { base, timeMs } = LEVELS[level];
  const remaining = Math.max(0, Math.min(timeMs, timeMs - elapsedMs));
  const delta = correct ? (base + Math.round((base * remaining) / timeMs)) * (fever ? 2 : 1) : -5;
  return { score: Math.max(0, score + delta), delta: Math.max(0, score + delta) - score };
}
export function nextLevel(level: Level): Level | null {
  return level === 'EASY' ? 'MEDIUM' : level === 'MEDIUM' ? 'HARD' : null;
}
export function checkpointLevel(checkpointIndex: number): Level {
  if (checkpointIndex <= 5) return 'EASY';
  if (checkpointIndex <= 10) return 'MEDIUM';
  return 'HARD';
}
export function calculateExpeditionBonus(hearts: number, expeditionElapsedMs: number) {
  const heartBonus = Math.max(0, hearts) * 15;
  const speedBonus = Math.max(0, Math.round((300_000 - expeditionElapsedMs) / 5_000));
  return { heartBonus, speedBonus, totalBonus: heartBonus + speedBonus };
}
export function uniqueTarget(
  samples: { fish: number; chest: number }[],
  target: 'fish' | 'chest',
  index: number,
) {
  return samples.filter((s) => s[target] === samples[index][target]).length === 1;
}
