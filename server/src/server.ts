// [AI-ASSISTED: Codex, 2026-10-21] Local composition/bootstrap. See README for deployment limits.
import 'dotenv/config';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createApp } from './app.js';
mkdirSync('var', { recursive: true });
if (!process.env.JWT_SECRET && !existsSync('var/session-secret'))
  writeFileSync('var/session-secret', randomBytes(48).toString('hex'), { mode: 0o600 });
const secret = process.env.JWT_SECRET || readFileSync('var/session-secret', 'utf8');
if (secret.length < 32) throw new Error('JWT_SECRET must be at least 32 characters');
const isNeonConfigured =
  Boolean(process.env.DATABASE_URL) &&
  !process.env.DATABASE_URL?.includes('YOUR_PASSWORD') &&
  (process.env.DATABASE_URL?.startsWith('postgres://') || process.env.DATABASE_URL?.startsWith('postgresql://'));
const instance = createApp({
  dbPath: process.env.LOCAL_DB_PATH ?? 'var/reef.sqlite',
  databaseUrl: isNeonConfigured ? process.env.DATABASE_URL : undefined,
  secret,
  origin: process.env.APP_ORIGIN,
  googleClientId: process.env.GOOGLE_CLIENT_ID,
});
const dbType = isNeonConfigured
  ? 'Neon Serverless PostgreSQL (Cloud)'
  : `Local SQLite (${process.env.LOCAL_DB_PATH ?? 'var/reef.sqlite'})`;
const server = instance.app.listen(Number(process.env.PORT ?? 4000), '127.0.0.1', () =>
  console.log(`Smart Sailor API ready at http://127.0.0.1:4000 [Database: ${dbType}]`),
);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, async () => {
    server.close();
    await instance.close();
    process.exit(0);
  });
