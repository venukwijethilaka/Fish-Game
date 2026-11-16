// [ACADEMIC THEME 3: INTEROPERABILITY]
// Architecture: Logic, Location & Protocol Adapter + Defensive Reverse Proxy Gateway.
// - TRIAD OF INTEROPERABILITY:
//   * Logic: Native fetch + limitedFetch retries, Zod validation, csv-parse, and PNG header checks.
//   * Location: Strict HTTPS URL allowlist (https://marcconrad.com/uob/fish/api.php & www.sanfoh.com).
//   * Protocol & Data Exchange Formats: Normalizes 3 distinct formats — JSON (Easy), RFC-4180 CSV
//     plain text (Medium), and Base64-in-JSON (Hard) plus raw binary PNG bytes — into one FishSample.
// - ECONOMY & LEGALITY OF EXTERNAL SERVICES: Uses prefetch buffering, concurrency limiting (WorkQueue=2),
//   and an offline PracticeFishProvider to minimize load/cost on Dr. Marc Conrad's external service,
//   while attributing the API cleanly.
// - DEFENSIVE PROXY & ANTI-CHEAT ARCHITECTURE:
//   * Magic-Byte PNG Inspection (89 50 4E 47 0D 0A 1A 0A) & 1 MiB payload size ceiling.
//   * Ephemeral Image Proxying (/api/images/:gameId/:imageId) hides external URLs & counts.
// - ALTERNATIVE APPROACHES CONSIDERED & CRITIQUED:
//   * Client Direct Calling (Browser calling marcconrad.com via CORS):
//     Critique: Fails due to browser SOP/CORS; leaks solution counts in Network tab; vulnerable to client tampering.
//   * Heavy Third-Party Integration Frameworks:
//     Critique: Adds unnecessary overhead and security vulnerability surface. Direct native fetch + Zod ensures zero bloat.
import { parse } from 'csv-parse/sync';
import { z } from 'zod';
import { randomInt } from 'node:crypto';
import type { Level } from '../../../contracts/src/index.js';
import { AppError } from '../errors.js';
export interface FishSample {
  bytes: Buffer;
  mime: string;
  fish: number;
  chest: number;
}
export interface IFishProvider {
  getSample(level: Level, signal: AbortSignal): Promise<FishSample>;
}
const payloadSchema = z.object({
  question: z.string().min(1),
  fish: z.number().int().min(0).max(100),
  chest: z.number().int().min(0).max(100),
});
export function parseJson(raw: string) {
  return payloadSchema.parse(JSON.parse(raw));
}
export function parseCsv(raw: string) {
  const rows = parse(raw, { skip_empty_lines: true, trim: true }) as string[][];
  if (
    rows.length !== 1 ||
    rows[0].length !== 3 ||
    !/^\d+$/.test(rows[0][1]) ||
    !/^\d+$/.test(rows[0][2])
  )
    throw new Error('Invalid Fish CSV');
  return payloadSchema.parse({
    question: rows[0][0],
    fish: Number(rows[0][1]),
    chest: Number(rows[0][2]),
  });
}
export function pngBytes(raw: Buffer) {
  if (
    raw.length < 24 ||
    !raw.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
    raw.readUInt32BE(16) > 4096 ||
    raw.readUInt32BE(20) > 4096
  )
    throw new Error('Invalid or oversized PNG');
  return raw;
}
async function limitedFetch(url: string, signal: AbortSignal): Promise<Buffer> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
        redirect: 'error',
      });
      if ([408, 429, 500, 502, 503, 504].includes(response.status) && attempt < 2) {
        await response.body?.cancel();
        await new Promise((r) => setTimeout(r, 150 * (attempt + 1)));
        continue;
      }
      if (!response.ok)
        throw new AppError(
          502,
          'FISH_UNAVAILABLE',
          'The ocean is a little quiet. Please try again.',
        );
      const reader = response.body!.getReader();
      const chunks: Buffer[] = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 1024 * 1024) {
          await reader.cancel();
          throw new Error('Fish response exceeds 1 MiB');
        }
        chunks.push(Buffer.from(value));
      }
      return Buffer.concat(chunks);
    } catch (error) {
      if (signal.aborted || error instanceof AppError || attempt === 2) throw error;
    }
  }
  throw new Error('Fish unavailable');
}
export class HttpFishProvider implements IFishProvider {
  constructor(private base = 'https://marcconrad.com/uob/fish/api.php') {
    const u = new URL(base);
    if (u.protocol !== 'https:' || u.hostname !== 'marcconrad.com')
      throw new Error('Fish API must use the configured HTTPS service');
  }
  async getSample(level: Level, signal: AbortSignal): Promise<FishSample> {
    // [THEME: INTEROP] Protocol/representation differences stop at this adapter.
    const url = new URL(this.base);
    url.searchParams.set('out', level === 'MEDIUM' ? 'csv' : 'json');
    url.searchParams.set('base64', level === 'HARD' ? 'yes' : 'no');
    const raw = (await limitedFetch(url.href, signal)).toString('utf8');
    const parsed = level === 'MEDIUM' ? parseCsv(raw) : parseJson(raw);
    let bytes: Buffer;
    if (level === 'HARD') {
      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(parsed.question) || parsed.question.length % 4 !== 0)
        throw new Error('Invalid Base64');
      bytes = pngBytes(Buffer.from(parsed.question, 'base64'));
    } else {
      const image = new URL(parsed.question);
      if (
        image.protocol !== 'https:' ||
        image.hostname !== 'www.sanfoh.com' ||
        image.port ||
        image.username ||
        image.password ||
        !image.pathname.startsWith('/uob/fish/data/')
      )
        throw new Error('Untrusted image URL');
      bytes = pngBytes(await limitedFetch(image.href, signal));
    }
    return { bytes, mime: 'image/png', fish: parsed.fish, chest: parsed.chest };
  }
}
// [THEME: LOW-COUPLING] Explicit practice implementation of the same provider port.
// This code-native SVG illustration is not a Fish API response and never ranks.
export class PracticeFishProvider implements IFishProvider {
  async getSample(_level: Level, _signal: AbortSignal): Promise<FishSample> {
    const fish = randomInt(1, 9),
      chest = randomInt(1, 6);
    let items = '';
    const spots = Array.from({ length: 15 }, (_, i) => i).sort(() => Math.random() - 0.5);
    for (let i = 0; i < fish + chest; i++) {
      const spot = spots[i],
        x = 38 + (spot % 5) * 62 + randomInt(-6, 7),
        y = 42 + Math.floor(spot / 5) * 64 + randomInt(-5, 6);
      items +=
        i < fish
          ? `<g transform="translate(${x} ${y})"><path d="M-15 0L-27-12V12Z" fill="#f5ad48"/><ellipse rx="20" ry="13" fill="${['#ffc660', '#ff9471', '#75dfcf'][i % 3]}"/><path d="M-3-12V12M6-10V10" stroke="#fff5d7" stroke-width="5"/><circle cx="13" cy="-3" r="2.5" fill="#173e4c"/></g>`
          : `<g transform="translate(${x} ${y})"><path d="M-20-2Q-20-20 0-20Q20-20 20-2V17H-20Z" fill="#bd7750" stroke="#f4c16c" stroke-width="3"/><path d="M-20 0H20M-12-17V17M12-17V17" stroke="#f4c16c" stroke-width="3"/><rect x="-4" y="-3" width="8" height="9" rx="1" fill="#ffe19a"/></g>`;
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 350 230"><defs><linearGradient id="sea" x2="0" y2="1"><stop stop-color="#246b80"/><stop offset="1" stop-color="#173e59"/></linearGradient></defs><rect width="350" height="230" rx="20" fill="url(#sea)"/><path d="M0 211Q70 193 130 213T260 211T350 205V230H0" fill="#d6bc8c" opacity=".45"/><g fill="none" stroke="#a9e8e1" opacity=".18"><circle cx="20" cy="30" r="7"/><circle cx="320" cy="90" r="11"/><circle cx="145" cy="20" r="4"/></g>${items}</svg>`;
    return { bytes: Buffer.from(svg), mime: 'image/svg+xml', fish, chest };
  }
}
