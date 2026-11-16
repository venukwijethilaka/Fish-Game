// [ACADEMIC THEME 1: SOFTWARE DESIGN PRINCIPLES & CLOUD SERVICE ARCHITECTURES]
// Neon Serverless PostgreSQL Repository Adapter.
// Implements IUserRepository and IGameRepository ports over Neon HTTP/WebSocket connection pooling.
import { neon, type NeonQueryFunction } from '@neondatabase/serverless';
import type {
  AvatarId,
  LeaderboardEntry,
  ProfileDTO,
} from '../../../contracts/src/index.js';
import {
  publicUser,
  type IUserRepository,
  type IGameRepository,
  type UserRecord,
  type IAppRepository,
} from './repository.js';

export class NeonRepository implements IUserRepository, IGameRepository, IAppRepository {
  readonly sql: NeonQueryFunction<false, false>;
  private schemaInitialized = false;

  constructor(databaseUrl: string) {
    this.sql = neon(databaseUrl);
  }

  async initSchema(): Promise<void> {
    if (this.schemaInitialized) return;
    try {
      await this.sql`
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
      await this.sql`CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_idx ON users (LOWER(username));`;
      await this.sql`CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users (LOWER(email));`;
      await this.sql`
        CREATE TABLE IF NOT EXISTS sessions (
          hash VARCHAR(64) PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          expires BIGINT NOT NULL,
          reauth BIGINT NOT NULL DEFAULT 0
        );
      `;
      await this.sql`
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
        await this.sql`ALTER TABLE games ADD COLUMN IF NOT EXISTS expedition_ms INT NOT NULL DEFAULT 0;`;
      } catch {}
      await this.sql`CREATE INDEX IF NOT EXISTS game_user_neon ON games(user_id);`;
      this.schemaInitialized = true;
    } catch (err) {
      console.error('Failed to initialize Neon schema:', err);
      throw err;
    }
  }

  async ping(): Promise<void> {
    await this.sql`SELECT 1`;
  }

  async user(id: string): Promise<UserRecord | undefined> {
    await this.initSchema();
    const rows = await this.sql`SELECT * FROM users WHERE id = ${id}`;
    if (!rows[0]) return undefined;
    return rows[0] as unknown as UserRecord;
  }

  async byEmail(email: string): Promise<UserRecord | undefined> {
    await this.initSchema();
    const rows = await this.sql`SELECT * FROM users WHERE LOWER(email) = LOWER(${email})`;
    if (!rows[0]) return undefined;
    return rows[0] as unknown as UserRecord;
  }

  async byGoogle(sub: string): Promise<UserRecord | undefined> {
    await this.initSchema();
    const rows = await this.sql`SELECT * FROM users WHERE google_sub = ${sub}`;
    if (!rows[0]) return undefined;
    return rows[0] as unknown as UserRecord;
  }

  async createUser(u: UserRecord): Promise<void> {
    await this.initSchema();
    await this.sql`
      INSERT INTO users (id, username, email, avatar, hash, google_sub, tv)
      VALUES (${u.id}, ${u.username}, ${u.email}, ${u.avatar}, ${u.hash}, ${u.google_sub}, ${u.tv})
    `;
  }

  async updateUser(id: string, username: string, avatar: AvatarId): Promise<void> {
    await this.initSchema();
    await this.sql`
      UPDATE users SET username = ${username}, avatar = ${avatar} WHERE id = ${id}
    `;
  }

  async deleteUser(id: string): Promise<void> {
    await this.initSchema();
    await this.sql`DELETE FROM users WHERE id = ${id}`;
  }

  async addSession(hash: string, userId: string, expires: number): Promise<void> {
    await this.initSchema();
    await this.sql`DELETE FROM sessions WHERE expires < ${Date.now()}`;
    await this.sql`
      INSERT INTO sessions (hash, user_id, expires, reauth)
      VALUES (${hash}, ${userId}, ${expires}, 0)
    `;
  }

  async session(hash: string): Promise<{ user_id: string; expires: number; reauth: number } | undefined> {
    await this.initSchema();
    const rows = await this.sql`SELECT user_id, expires, reauth FROM sessions WHERE hash = ${hash}`;
    if (!rows[0]) return undefined;
    return {
      user_id: rows[0].user_id as string,
      expires: Number(rows[0].expires),
      reauth: Number(rows[0].reauth),
    };
  }

  async revokeSession(hash: string): Promise<void> {
    await this.initSchema();
    await this.sql`DELETE FROM sessions WHERE hash = ${hash}`;
  }

  async revokeAll(userId: string): Promise<void> {
    await this.initSchema();
    await this.sql`DELETE FROM sessions WHERE user_id = ${userId}`;
    await this.sql`UPDATE users SET tv = tv + 1 WHERE id = ${userId}`;
  }

  async reauthenticate(hash: string): Promise<void> {
    await this.initSchema();
    await this.sql`UPDATE sessions SET reauth = ${Date.now()} WHERE hash = ${hash}`;
  }

  async setPassword(id: string, hash: string): Promise<void> {
    await this.initSchema();
    await this.sql`UPDATE users SET hash = ${hash} WHERE id = ${id}`;
    await this.revokeAll(id);
  }

  async createGame(id: string, userId: string, mode: string, level: string): Promise<void> {
    await this.initSchema();
    await this.sql`
      INSERT INTO games (id, user_id, mode, start_level, status)
      VALUES (${id}, ${userId}, ${mode}, ${level}, 'ACTIVE')
    `;
  }

  async finalizeOnce(
    id: string,
    status: string,
    score: number,
    rounds: unknown[],
    expeditionMs?: number,
  ): Promise<void> {
    await this.initSchema();
    await this.sql`
      UPDATE games
      SET status = ${status},
          score = ${score},
          ended = ${Date.now()},
          rounds = ${JSON.stringify(rounds)},
          expedition_ms = ${expeditionMs ?? 0}
      WHERE id = ${id} AND status = 'ACTIVE'
    `;
  }

  async board(): Promise<LeaderboardEntry[]> {
    await this.initSchema();
    const rows = await this.sql`
      WITH best AS (
        SELECT user_id, MAX(score) AS score
        FROM games
        WHERE mode = 'live' AND status IN ('COMPLETED', 'GAME_OVER')
        GROUP BY user_id
      ),
      ranked AS (
        SELECT u.id, u.username, u.avatar, b.score,
               MIN(CASE WHEN g.expedition_ms > 0 THEN g.expedition_ms ELSE 999999999 END) AS fastest,
               MIN(g.ended) AS achieved
        FROM best b
        JOIN users u ON u.id = b.user_id
        JOIN games g ON g.user_id = b.user_id AND g.score = b.score AND g.mode = 'live' AND g.status IN ('COMPLETED', 'GAME_OVER')
        GROUP BY u.id, u.username, u.avatar, b.score
      )
      SELECT id, username, avatar, score FROM ranked
      ORDER BY score DESC, fastest ASC, achieved ASC, id ASC
      LIMIT 10
    `;
    return rows.map((r, i) => ({
      id: r.id as string,
      username: r.username as string,
      avatarId: r.avatar as AvatarId,
      bestScore: Number(r.score),
      rank: i + 1,
    }));
  }

  async profile(id: string): Promise<ProfileDTO> {
    await this.initSchema();
    const [board, user] = await Promise.all([this.board(), this.user(id)]);
    if (!user) {
      throw new Error('User not found');
    }
    const statsRows = await this.sql`
      SELECT COALESCE(MAX(score), 0) AS best,
             COALESCE(SUM(score), 0) AS total,
             COUNT(*)::int AS games
      FROM games
      WHERE user_id = ${id} AND mode = 'live' AND status IN ('COMPLETED', 'GAME_OVER')
    `;
    const practiceRows = await this.sql`
      SELECT COUNT(*)::int AS n
      FROM games
      WHERE user_id = ${id} AND mode = 'practice' AND status IN ('COMPLETED', 'GAME_OVER')
    `;
    const stats = statsRows[0] || { best: 0, total: 0, games: 0 };
    const practice = practiceRows[0] || { n: 0 };
    return {
      user: publicUser(user),
      bestScore: Number(stats.best),
      totalScore: Number(stats.total),
      gamesPlayed: Number(stats.games),
      rank: board.find((r) => r.id === id)?.rank ?? null,
      globalHighestScore: board[0]?.bestScore ?? 0,
      practiceGames: Number(practice.n),
    };
  }

  async interruptActive(): Promise<void> {
    await this.initSchema();
    await this.sql`
      UPDATE games
      SET status = 'INTERRUPTED', ended = ${Date.now()}
      WHERE status = 'ACTIVE'
    `;
  }

  async close(): Promise<void> {
    // Neon serverless query client uses connection pooling and does not hold an idle socket.
  }
}
