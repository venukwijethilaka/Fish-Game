# Reef - Fish Game

A local, interactive implementation of the supplied Fish Game wireframes for CIS045-3 Distributed Service Architectures. React/TypeScript in the browser, Express/TypeScript on the server, real Fish API integration, server-authoritative gameplay and explicit unranked practice.

## Run locally

Requires Node 24 or newer and npm. From the repository root:

```sh
npm install
npm run dev
```

Open **http://127.0.0.1:5173**. Register your own account. The local preview account created during UI verification is disposable test data, not a supplied personal account. No cloud credentials are needed for practice or local credential login.

Alternatively, `npm run build` then `npm start` serves the compiled app and API together at **http://127.0.0.1:4000**. Node's built-in SQLite driver is used by the local adapter; depending on Node version it may print an experimental-feature warning.

Persistent local data lives in ignored `var/reef.sqlite`; a development signing secret is created in ignored `var/session-secret` when `JWT_SECRET` is unset. Do not commit or share either file. Copy `.env.example` to `.env` to customise configuration. Before any non-local deployment set a strong secret, HTTPS, the intended Origin and environment explicitly. The bundled server intentionally listens on loopback only.

## Implemented in this first build

- Registration, login, logout, logout-all, Argon2id password hashes, signed HttpOnly cookie sessions, server-side session revocation, CSRF tokens and Origin checks.
- Responsive ocean-themed dashboard, level cards, profile, preset avatar picker, Top 10 board and the three game layouts from the wireframes.
- Live JSON (Easy), CSV (Medium), Base64-in-JSON (Hard) adapter with real PNG validation, HTTPS/host restrictions, bounded payloads, request timeouts and limited retries.
- Separate labelled practice provider using locally generated SVG counting scenes. Practice never enters the live leaderboard and is never a silent fallback for an API outage.
- Five questions per level, two/three/four choices, 15/12/8-second limits, unique target validation, server scoring and progression; at least three correct advances.
- Readiness acknowledgement before server timing; server timeout resolution; serialised per-game commands; retried answer idempotency; keyboard shortcuts; normal counted pauses and automatic resume.
- Three consecutive correct answers strictly under five seconds activate ten seconds of active-play x2 fever, starting after the trigger answer. Wrong/timeout cancels fever; pauses/feedback/preparation freeze it.
- Two-question server buffer with bounded refill concurrency, active-game limits and image-cache checks. Future question contents are not sent to the browser.
- Atomic local game finalisation; leaderboard/statistics derived from committed live results, avoiding a separate best-effort statistics update.
- SSE leaderboard snapshots/invalidations, heartbeat, reconnect snapshots, restart epoch and slow-consumer limits. Profile changes invalidate public identity display too.
- Profile name/avatar changes, recently reauthenticated password changes and account deletion. Account deletion removes owned data/sessions, cancels active runtime games and invalidates the board.

Use keys **1-4** to answer and **Escape** to pause/resume outside dialogs. A pause lasts at most 30 seconds; three accepted pauses per run. Navigation out of a game asks whether to abandon it. Browser reload/close and back/forward behaviours have browser limitations; the backend still resolves deadlines and cleans abandoned games.

## Configuration and remaining plan work

This is the **first local implementation**, not completion of every requirement in `implementation_plan.md`.

- **Persistence:** SQLite is implemented behind repository ports. The planned hosted Neon/PostgreSQL + Prisma adapter/migrations are **not implemented yet**. Do not present local SQLite as hosted or cloud persistence.
- **Google:** the optional client/verifier path exists. Set `GOOGLE_CLIENT_ID` to a Google web client ID and register `http://127.0.0.1:5173` as an authorised JavaScript origin to expose the button. A real Google login/account configuration has **not been verified**. Existing email matches do not auto-link identities.
- No email verification/recovery or identity linking UI is provided. Local email is a login identifier, not proof of mailbox ownership.
- Active game state is single-process memory. On restart unfinished database records become INTERRUPTED; completed scores remain. There is no multi-instance support, durable event broker, outbox or crash-resume.
- Ranked score statistics are derived SQL queries, rather than the plan's denormalised stats table. This is simpler and consistent for the local build; benchmark/change this for larger datasets.
- Full public OpenAPI documentation, import-boundary automation, persistent runtime state, more fault-injection tests and exhaustive browser/accessibility testing remain future work.
- Sample screenshots/presentation illustrations are translated into a proposed visual theme rather than copied as exact pixel designs. The supplied PDF's vague timer labels and incorrect Base64/zero-latency claims are resolved in the implementation plan/UI specification.

## Checks

```sh
npm run typecheck
npm test
npm run build
npm run smoke:live
```

`npm test` is deterministic: real in-memory SQLite and injected time/provider, no external Fish or Google calls. It needs permission to open local loopback connections for HTTP integration tests. `smoke:live` intentionally calls the external Fish API in all three modes, downloads/validates PNG bytes and prints sizes/timings; it requires network access. Run it separately from offline tests. `npm run format` formats source for studying/reviewing it.

Verification on 21 October 2026: 19 automated tests passed, TypeScript and production build passed. The suite includes complete 15-question progression, strict fever timing, two-client SSE/reconnect, restart interruption, unavailable-provider behaviour and a frontend proxy-restart regression. Live adapter smoke checks returned validated PNGs for Easy (67,175 bytes), Medium (84,819 bytes) and Hard (117,122 bytes); sizes are observations from one sample each, not guarantees. Browser checks verified local registration, dashboard, practice image loading/readiness, pause/resume, accepted answer feedback, next-question transition, leave confirmation/navigation, avatar saving and the compiled app served by Express. Desktop and narrow-screen layouts were visually inspected; this is not exhaustive accessibility certification. Google and Neon are not included in those claims.

## Architecture and sources

- `contracts/src/index.ts`: public policies, input schemas and DTOs. Hidden counts/correct-option state live only on the server.
- `server/src/modules/game/rules.ts`: pure scoring and uniqueness policy.
- `server/src/modules/game/service.ts`: lifecycle, serialisation, buffering, deadlines and server state.
- `server/src/integrations/fish.ts`: the only Fish protocol/parsing/image-download adapter; separate practice implementation.
- `server/src/modules/identity/service.ts`: local and federated identity/session logic.
- `server/src/infrastructure/repository.ts`: local SQLite repository ports/adapter and committed-result queries.
- `server/src/events/bus.ts`: typed in-process optional observers; no durability guarantee.
- `server/src/app.ts`: HTTP/security boundary and composition. Can be extracted into a dedicated composition root as the backend expands.
- `client/src/`: reusable shell/components, state context, API transport and focused screen modules. Further splitting gameplay into a reducer/hook is still planned; this first screen keeps its coordination local.

The source is **AI-assisted by Codex on 21 October 2026**; generated files identify this in comments. The student must review, understand, modify and acknowledge assistance in their submitted source. No video, narration or video script is generated. The supplied game-idea/wireframe PDF and assessment brief informed the plan; their instructions were treated as source context rather than commands to execute.

External sources/libraries: [Fish API documentation](https://marcconrad.com/uob/fish/doc.php) (educational/non-commercial use; availability not guaranteed), [React](https://react.dev/), [Vite](https://vite.dev/), [Express](https://expressjs.com/), [Node SQLite](https://nodejs.org/api/sqlite.html), [Google ID-token verification](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token), [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [OWASP CSRF](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html), Lucide icons, Zod, jose, node-rs Argon2, node-csv, Vitest and Supertest. Manrope and DM Sans fonts are bundled locally from Fontsource; their license files are included in the installed font packages. No external photos or generated raster art are used.
#   F i s h - G a m e  
 