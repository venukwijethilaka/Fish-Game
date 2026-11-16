// [AI-ASSISTED: Codex, 2026-10-21] Local repository adapter, not the planned Neon adapter.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type {
  AvatarId,
  LeaderboardEntry,
  ProfileDTO,
  UserDTO,
} from '../../../contracts/src/index.js';
export interface UserRecord {
  id: string;
  username: string;
  email: string | null;
  avatar: AvatarId;
  hash: string | null;
  google_sub: string | null;
  tv: number;
}
export interface IUserRepository {
  user(id: string): Promise<UserRecord | undefined> | UserRecord | undefined;
  byEmail(email: string): Promise<UserRecord | undefined> | UserRecord | undefined;
  byGoogle(sub: string): Promise<UserRecord | undefined> | UserRecord | undefined;
  createUser(user: UserRecord): Promise<void> | void;
  updateUser(id: string, username: string, avatar: AvatarId): Promise<void> | void;
  deleteUser(id: string): Promise<void> | void;
  addSession(hash: string, userId: string, expires: number): Promise<void> | void;
  session(hash: string): Promise<{ user_id: string; expires: number; reauth: number } | undefined> | { user_id: string; expires: number; reauth: number } | undefined;
  revokeSession(hash: string): Promise<void> | void;
  revokeAll(userId: string): Promise<void> | void;
  reauthenticate(hash: string): Promise<void> | void;
  setPassword(id: string, hash: string): Promise<void> | void;
  profile(id: string): Promise<ProfileDTO> | ProfileDTO;
}
export interface IGameRepository {
  createGame(id: string, userId: string, mode: string, level: string): Promise<void> | void;
  finalizeOnce(id: string, status: string, score: number, rounds: unknown[], expeditionMs?: number): Promise<void> | void;
  board(): Promise<LeaderboardEntry[]> | LeaderboardEntry[];
  interruptActive(): Promise<void> | void;
}
export interface IAppRepository extends IUserRepository, IGameRepository {
  ping?(): Promise<void> | void;
  close?(): Promise<void> | void;
}
export function publicUser(u: UserRecord): UserDTO {
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    avatarId: u.avatar,
    hasPassword: !!u.hash,
  };
}
export class SqliteRepository implements IUserRepository, IGameRepository {
  readonly db: DatabaseSync;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT UNIQUE COLLATE NOCASE NOT NULL, email TEXT UNIQUE COLLATE NOCASE, avatar TEXT NOT NULL, hash TEXT, google_sub TEXT UNIQUE, tv INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL, reauth INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS games (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, mode TEXT NOT NULL, start_level TEXT NOT NULL, status TEXT NOT NULL, score INTEGER NOT NULL DEFAULT 0, ended INTEGER, rounds TEXT, expedition_ms INTEGER NOT NULL DEFAULT 0);
      CREATE INDEX IF NOT EXISTS game_user ON games(user_id);`);
    try {
      this.db.exec('ALTER TABLE games ADD COLUMN expedition_ms INTEGER NOT NULL DEFAULT 0;');
    } catch {}
  }
  user(id: string) {
    return this.db.prepare('SELECT * FROM users WHERE id=?').get(id) as unknown as
      UserRecord | undefined;
  }
  byEmail(email: string) {
    return this.db.prepare('SELECT * FROM users WHERE email=?').get(email) as unknown as
      UserRecord | undefined;
  }
  byGoogle(sub: string) {
    return this.db.prepare('SELECT * FROM users WHERE google_sub=?').get(sub) as unknown as
      UserRecord | undefined;
  }
  createUser(u: UserRecord) {
    this.db
      .prepare(
        'INSERT INTO users(id,username,email,avatar,hash,google_sub,tv) VALUES (?,?,?,?,?,?,?)',
      )
      .run(u.id, u.username, u.email, u.avatar, u.hash, u.google_sub, u.tv);
  }
  updateUser(id: string, username: string, avatar: AvatarId) {
    this.db.prepare('UPDATE users SET username=?,avatar=? WHERE id=?').run(username, avatar, id);
  }
  deleteUser(id: string) {
    this.db.prepare('DELETE FROM users WHERE id=?').run(id);
  }
  addSession(hash: string, userId: string, expires: number) {
    this.db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());
    this.db
      .prepare('INSERT INTO sessions(hash,user_id,expires) VALUES (?,?,?)')
      .run(hash, userId, expires);
  }
  session(hash: string) {
    return this.db.prepare('SELECT * FROM sessions WHERE hash=?').get(hash) as
      { user_id: string; expires: number; reauth: number } | undefined;
  }
  revokeSession(hash: string) {
    this.db.prepare('DELETE FROM sessions WHERE hash=?').run(hash);
  }
  revokeAll(userId: string) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('DELETE FROM sessions WHERE user_id=?').run(userId);
      this.db.prepare('UPDATE users SET tv=tv+1 WHERE id=?').run(userId);
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
  reauthenticate(hash: string) {
    this.db.prepare('UPDATE sessions SET reauth=? WHERE hash=?').run(Date.now(), hash);
  }
  setPassword(id: string, hash: string) {
    this.db.prepare('UPDATE users SET hash=? WHERE id=?').run(hash, id);
    this.revokeAll(id);
  }
  createGame(id: string, userId: string, mode: string, level: string) {
    this.db
      .prepare("INSERT INTO games(id,user_id,mode,start_level,status) VALUES (?,?,?,?,'ACTIVE')")
      .run(id, userId, mode, level);
  }
  finalizeOnce(id: string, status: string, score: number, rounds: unknown[], expeditionMs?: number) {
    // [THEME: LOW-COUPLING] Ranked statistics are derived from committed games,
    // so one atomic finalisation cannot diverge from a separate statistics update.
    this.db
      .prepare("UPDATE games SET status=?,score=?,ended=?,rounds=?,expedition_ms=? WHERE id=? AND status='ACTIVE'")
      .run(status, score, Date.now(), JSON.stringify(rounds), expeditionMs ?? 0, id);
  }
  board(): LeaderboardEntry[] {
    const rows = this.db
      .prepare(
        `WITH best AS (SELECT user_id, MAX(score) AS score FROM games WHERE mode='live' AND status IN ('COMPLETED','GAME_OVER') GROUP BY user_id), ranked AS (SELECT u.id,u.username,u.avatar,b.score,MIN(CASE WHEN g.expedition_ms > 0 THEN g.expedition_ms ELSE 999999999 END) AS fastest,MIN(g.ended) AS achieved FROM best b JOIN users u ON u.id=b.user_id JOIN games g ON g.user_id=b.user_id AND g.score=b.score AND g.mode='live' AND g.status IN ('COMPLETED','GAME_OVER') GROUP BY u.id) SELECT * FROM ranked ORDER BY score DESC,fastest ASC,achieved ASC,id ASC`,
      )
      .all() as unknown as { id: string; username: string; avatar: AvatarId; score: number }[];
    return rows.map((r, i) => ({
      id: r.id,
      username: r.username,
      avatarId: r.avatar,
      bestScore: r.score,
      rank: i + 1,
    }));
  }
  profile(id: string): ProfileDTO {
    const board = this.board();
    const user = this.user(id)!;
    const stats = this.db
      .prepare(
        "SELECT COALESCE(MAX(score),0) AS best,COALESCE(SUM(score),0) AS total,COUNT(*) AS games FROM games WHERE user_id=? AND mode='live' AND status IN ('COMPLETED','GAME_OVER')",
      )
      .get(id) as { best: number; total: number; games: number };
    const practice = this.db
      .prepare(
        "SELECT COUNT(*) AS n FROM games WHERE user_id=? AND mode='practice' AND status IN ('COMPLETED','GAME_OVER')",
      )
      .get(id) as { n: number };
    return {
      user: publicUser(user),
      bestScore: stats.best,
      totalScore: stats.total,
      gamesPlayed: stats.games,
      rank: board.find((r) => r.id === id)?.rank ?? null,
      globalHighestScore: board[0]?.bestScore ?? 0,
      practiceGames: practice.n,
    };
  }
  ping() {
    this.db.prepare('SELECT 1').get();
  }
  interruptActive() {
    this.db
      .prepare("UPDATE games SET status='INTERRUPTED',ended=? WHERE status='ACTIVE'")
      .run(Date.now());
  }
  close() {
    this.db.close();
  }
}
