// [AI-ASSISTED: Codex, 2026-10-21] Regression for a proxy restart observed during browser QA.
import { afterEach, expect, it, vi } from 'vitest';
import { api, ApiError } from '../client/src/api';
afterEach(() => vi.unstubAllGlobals());
it('turns a non-JSON reconnect response into an actionable error rather than a JSON parsing crash', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 502 })));
  const result = api('/config');
  await expect(result).rejects.toBeInstanceOf(ApiError);
  await expect(result).rejects.toMatchObject({ code: 'SERVER_UNAVAILABLE', status: 502 });
});
