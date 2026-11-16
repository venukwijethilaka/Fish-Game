// [AI-ASSISTED: Codex, 2026-10-21] Explicit external smoke check, not part of deterministic tests.
import { HttpFishProvider } from '../server/src/integrations/fish.js';
const provider = new HttpFishProvider();
for (const level of ['EASY', 'MEDIUM', 'HARD'] as const) {
  const started = performance.now();
  const sample = await provider.getSample(level, AbortSignal.timeout(15000));
  console.log(
    JSON.stringify({
      level,
      mime: sample.mime,
      bytes: sample.bytes.length,
      countsValid: Number.isInteger(sample.fish) && Number.isInteger(sample.chest),
      durationMs: Math.round(performance.now() - started),
    }),
  );
}
