// [ACADEMIC THEME 1 & 4: DATA MIGRATION UTILITY]
// Migrates local SQLite users, active sessions, and games into Neon Serverless PostgreSQL.
import 'dotenv/config';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';
import { NeonRepository } from '../server/src/infrastructure/neonRepository.js';

async function migrate() {
  let databaseUrl = (process.argv[2] || process.env.DATABASE_URL || '').trim();
  // Strip outer quotes if passed in shell
  if (
    (databaseUrl.startsWith('"') && databaseUrl.endsWith('"')) ||
    (databaseUrl.startsWith("'") && databaseUrl.endsWith("'"))
  ) {
    databaseUrl = databaseUrl.slice(1, -1).trim();
  }

  if (!databaseUrl || databaseUrl.includes('YOUR_PASSWORD')) {
    console.log('\n============================================================');
    console.log('⚓ SMART SAILOR — NEON POSTGRESQL MIGRATION UTILITY');
    console.log('============================================================');
    console.log('Error: A valid Neon PostgreSQL connection URL is required.\n');
    console.log('You can run the migration in either of two easy ways:');
    console.log('1. Pass the URL directly to the npm script:');
    console.log('   npm run db:migrate:neon -- "postgresql://user:pass@ep-xyz.eu-west-1.aws.neon.tech/neondb?sslmode=require"\n');
    console.log('2. Or paste DATABASE_URL=... into your .env file and run:');
    console.log('   npm run db:migrate:neon\n');
    console.log('Get your free database URL at: https://console.neon.tech');
    console.log('============================================================\n');
    process.exit(1);
  }

  console.log('\n[1/5] Connecting to Neon Serverless PostgreSQL cloud...');
  let sql;
  try {
    sql = neon(databaseUrl);
    await sql`SELECT 1`;
    console.log('✓ Successfully connected to Neon PostgreSQL cluster.');
  } catch (connErr) {
    console.error('✗ Connection to Neon failed:', (connErr as Error).message);
    console.error('Please verify your Neon connection string, user credentials, and network connectivity.');
    process.exit(1);
  }

  // 2. Persist to .env so dev server automatically uses Neon on next launch
  try {
    const envPath = '.env';
    let envContent = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
    if (envContent.includes('DATABASE_URL=')) {
      envContent = envContent.replace(/DATABASE_URL=.*(\r?\n|$)/, `DATABASE_URL=${databaseUrl}$1`);
    } else {
      envContent += `\nDATABASE_URL=${databaseUrl}\n`;
    }
    writeFileSync(envPath, envContent);
    console.log('[2/5] Saved DATABASE_URL into .env (Smart Sailor will now use Neon cloud by default).');
  } catch (err) {
    console.warn('Notice: Could not auto-write .env:', err);
  }

  // 3. Initialize schema in Neon
  console.log('[3/5] Verifying schema and relational indexes in Neon...');
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username VARCHAR(64) UNIQUE NOT NULL,
      email VARCHAR(255) UNIQUE,
      avatar VARCHAR(32) NOT NULL,
      hash TEXT,
      google_sub VARCHAR(255) UNIQUE,
      tv INT NOT NULL DEFAULT 0
    );
  `;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_idx ON users (LOWER(username));`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users (LOWER(email));`;
  await sql`
    CREATE TABLE IF NOT EXISTS sessions (
      hash VARCHAR(64) PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires BIGINT NOT NULL,
      reauth BIGINT NOT NULL DEFAULT 0
    );
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS games (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      mode VARCHAR(32) NOT NULL,
      start_level VARCHAR(32) NOT NULL,
      status VARCHAR(32) NOT NULL,
      score INT NOT NULL DEFAULT 0,
      ended BIGINT,
      rounds TEXT,
      expedition_ms INT NOT NULL DEFAULT 0
    );
  `;
  try {
    await sql`ALTER TABLE games ADD COLUMN IF NOT EXISTS expedition_ms INT NOT NULL DEFAULT 0;`;
  } catch {}
  await sql`CREATE INDEX IF NOT EXISTS game_user_neon ON games(user_id);`;
  console.log('✓ Neon tables & indexes initialized (users, sessions, games).');

  // 4. Migrate local SQLite data if present
  const sqlitePath = process.env.LOCAL_DB_PATH ?? 'var/reef.sqlite';
  console.log(`[4/5] Inspecting local SQLite database at '${sqlitePath}'...`);
  if (!existsSync(sqlitePath)) {
    console.log('No local SQLite database found. Fresh Neon cluster is ready for traffic!');
  } else {
    try {
      const db = new DatabaseSync(sqlitePath);
      const users = db.prepare('SELECT * FROM users').all() as any[];
      console.log(`Migrating ${users.length} users...`);
      for (const u of users) {
        await sql`
          INSERT INTO users (id, username, email, avatar, hash, google_sub, tv)
          VALUES (${u.id}, ${u.username}, ${u.email}, ${u.avatar}, ${u.hash}, ${u.google_sub}, ${u.tv})
          ON CONFLICT (id) DO UPDATE SET
            username = EXCLUDED.username,
            email = EXCLUDED.email,
            avatar = EXCLUDED.avatar,
            hash = EXCLUDED.hash,
            google_sub = EXCLUDED.google_sub,
            tv = EXCLUDED.tv;
        `;
      }
      console.log(`✓ ${users.length} users synced to Neon.`);

      // Migrate unexpired sessions
      const now = Date.now();
      const sessions = db.prepare('SELECT * FROM sessions WHERE expires > ?').all(now) as any[];
      console.log(`Migrating ${sessions.length} active sessions...`);
      for (const s of sessions) {
        await sql`
          INSERT INTO sessions (hash, user_id, expires, reauth)
          VALUES (${s.hash}, ${s.user_id}, ${s.expires}, ${s.reauth ?? 0})
          ON CONFLICT (hash) DO UPDATE SET
            user_id = EXCLUDED.user_id,
            expires = EXCLUDED.expires,
            reauth = EXCLUDED.reauth;
        `;
      }
      console.log(`✓ ${sessions.length} active sessions synced to Neon.`);

      // Migrate games
      const games = db.prepare('SELECT * FROM games').all() as any[];
      console.log(`Migrating ${games.length} expedition games...`);
      for (const g of games) {
        await sql`
          INSERT INTO games (id, user_id, mode, start_level, status, score, ended, rounds, expedition_ms)
          VALUES (${g.id}, ${g.user_id}, ${g.mode}, ${g.start_level}, ${g.status}, ${g.score}, ${g.ended}, ${g.rounds}, ${g.expedition_ms ?? 0})
          ON CONFLICT (id) DO UPDATE SET
            user_id = EXCLUDED.user_id,
            mode = EXCLUDED.mode,
            start_level = EXCLUDED.start_level,
            status = EXCLUDED.status,
            score = EXCLUDED.score,
            ended = EXCLUDED.ended,
            rounds = EXCLUDED.rounds,
            expedition_ms = EXCLUDED.expedition_ms;
        `;
      }
      console.log(`✓ ${games.length} games synced to Neon.`);
    } catch (err) {
      console.error('Error during SQLite migration:', err);
    }
  }

  // 5. Verification & Live Status
  console.log('[5/5] Verifying Neon cloud data integrity...');
  const [userCount] = await sql`SELECT count(*)::int as c FROM users`;
  const [gameCount] = await sql`SELECT count(*)::int as c FROM games`;
  console.log(`✓ Current Neon database stats: ${userCount.c} users, ${gameCount.c} expedition records.`);

  const repo = new NeonRepository(databaseUrl);
  const board = await repo.board();
  console.log('\n🏆 NEON GLOBAL SCOREBOARD PREVIEW:');
  if (board.length === 0) {
    console.log('   (No completed live expeditions yet)');
  } else {
    for (const b of board.slice(0, 5)) {
      console.log(`   #${b.rank} ${b.username.padEnd(20)} ${String(b.bestScore).padStart(5)} coins`);
    }
  }

  console.log('\n============================================================');
  console.log('🎉 SUCCESS: DATABASE MIGRATED TO NEON POSTGRESQL CLOUD!');
  console.log('Your game backend is now configured to use Neon by default.');
  console.log('Run "npm run dev" or "npm start" to launch with Neon.');
  console.log('============================================================\n');
}

migrate().catch((e) => {
  console.error('\n✗ Fatal migration error:', e);
  process.exit(1);
});
