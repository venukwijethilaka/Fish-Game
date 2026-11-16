// [AI-ASSISTED: Codex, 2026-10-21] Same-origin transport; sessions never enter JS storage.
let csrf = '';
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export async function csrfToken() {
  if (!csrf) {
    const response = await fetch('/api/auth/csrf', { credentials: 'same-origin' });
    if (!response.ok) throw new Error('Cannot connect to the game server.');
    csrf = (await response.json()).csrfToken;
  }
  return csrf;
}
export async function api<T>(
  path: string,
  body?: unknown,
  method = body === undefined ? 'GET' : 'POST',
  quiet = false,
): Promise<T> {
  const mutation = method !== 'GET';
  const token = mutation ? await csrfToken() : null;
  const response = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { 'X-CSRF-Token': token } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new ApiError(
      response.ok ? 502 : response.status,
      'SERVER_UNAVAILABLE',
      'The game server is reconnecting. Please try again in a moment.',
    );
  }
  if (data.csrfToken) csrf = data.csrfToken;
  if (!response.ok) {
    if (response.status === 401 && !quiet)
      window.dispatchEvent(new CustomEvent('reef:session-expired'));
    throw new ApiError(
      response.status,
      data.code ?? 'REQUEST_FAILED',
      data.message ?? 'Unable to reach the Smart Sailor fleet.',
    );
  }
  return data as T;
}
