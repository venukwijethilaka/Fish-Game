// [AI-ASSISTED: Codex, 2026-10-21] Public contracts; reviewed through tests/typechecking.
import { z } from 'zod';
export const LEVELS = {
  EASY: { label: 'Easy', choices: 2, timeMs: 15000, base: 10, format: 'json' },
  MEDIUM: { label: 'Medium', choices: 3, timeMs: 12000, base: 20, format: 'csv' },
  HARD: { label: 'Hard', choices: 4, timeMs: 8000, base: 30, format: 'base64' },
} as const;
export type Level = keyof typeof LEVELS;
export const levelSchema = z.enum(['EASY', 'MEDIUM', 'HARD']);
export const modeSchema = z.enum(['live', 'practice']);
export type Mode = z.infer<typeof modeSchema>;
export const avatarIds = ['clownfish', 'turtle', 'octopus', 'whale', 'crab', 'jellyfish'] as const;
export type AvatarId = (typeof avatarIds)[number];
export const avatarSchema = z.enum(avatarIds);
export const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(24)
  .regex(/^[a-zA-Z0-9_ -]+$/, 'Use letters, numbers, spaces, _ or -');
export const emailSchema = z
  .email()
  .max(254)
  .transform((s) => s.toLowerCase());
export const passwordSchema = z.string().min(12, 'Use at least 12 characters').max(128);
export const registerSchema = z.object({
  username: usernameSchema,
  email: emailSchema,
  password: passwordSchema,
});
export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(128) });
export const startSchema = z.object({ level: levelSchema, mode: modeSchema, requestId: z.uuid() });
export const dockSchema = z.object({
  checkpointIndex: z.number().int().min(1).max(15),
  requestId: z.uuid(),
});
export const hitSchema = z.object({
  hazardType: z.enum(['rock', 'barrel', 'shark']),
  requestId: z.uuid(),
});
export const answerSchema = z.object({
  questionId: z.uuid(),
  optionId: z.uuid().nullable(),
  requestId: z.uuid(),
});
export interface UserDTO {
  id: string;
  username: string;
  email: string | null;
  avatarId: AvatarId;
  hasPassword: boolean;
}
export interface LeaderboardEntry {
  rank: number;
  id: string;
  username: string;
  avatarId: AvatarId;
  bestScore: number;
}
export interface ProfileDTO {
  user: UserDTO;
  bestScore: number;
  totalScore: number;
  gamesPlayed: number;
  rank: number | null;
  globalHighestScore: number;
  practiceGames: number;
}
export interface QuestionDTO {
  id: string;
  number: number;
  checkpointIndex: number;
  isFinalIsland: boolean;
  target: 'fish' | 'chest';
  count: number;
  options: { id: string; src: string }[];
  timeLimitMs: number;
}
export type Phase =
  | 'SAILING'
  | 'AWAITING_READY'
  | 'PLAYING'
  | 'PAUSED'
  | 'FEEDBACK'
  | 'LEVEL_REVIEW'
  | 'GAME_OVER'
  | 'COMPLETED'
  | 'ABANDONED'
  | 'INTERRUPTED';
export interface GameDTO {
  id: string;
  level: Level;
  startLevel: Level;
  mode: Mode;
  phase: Phase;
  version: number;
  question: QuestionDTO | null;
  score: number;
  levelCorrect: number;
  totalCorrect: number;
  totalAnswered: number;
  fastStreak: number;
  streak: number;
  feverRemainingMs: number;
  pausesRemaining: number;
  remainingMs: number;
  serverNow: number;
  expiresAt: number | null;
  pauseExpiresAt: number | null;
  result: {
    outcome: 'CORRECT' | 'WRONG' | 'TIMEOUT';
    correctOptionId: string;
    selectedOptionId: string | null;
    points: number;
    multiplier: number;
  } | null;
  saved: boolean;
  message?: string;
  // Pirate Expedition fields:
  hearts: number;
  checkpointIndex: number;
  isFinalIsland: boolean;
  expeditionElapsedMs: number;
}
export interface AppConfig {
  googleClientId: string | null;
  persistence: string;
}
