// [AI-ASSISTED: Codex, 2026-10-21] Identity and public push snapshots; no hidden answer state.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { AppConfig, LeaderboardEntry, Mode, ProfileDTO, UserDTO } from '../../contracts/src/index';
import { api } from './api';
interface ContextValue {
  user: UserDTO | null;
  profile: ProfileDTO | null;
  config: AppConfig | null;
  loading: boolean;
  board: LeaderboardEntry[];
  streamState: 'connecting' | 'live' | 'reconnecting';
  activeGameId: string | null;
  mode: Mode;
  setMode: (m: Mode) => void;
  toggleMode: () => void;
  setActiveGameId: (id: string | null) => void;
  authenticate: (user: UserDTO) => void;
  refresh: () => Promise<void>;
  logout: (all?: boolean) => Promise<void>;
}
// Preserve one context identity while Vite replaces provider/consumer modules during editing.
const Context = (import.meta.hot?.data.reefContext ??
  createContext<ContextValue>(null!)) as ReturnType<typeof createContext<ContextValue>>;
if (import.meta.hot) import.meta.hot.data.reefContext = Context;
export function ReefProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserDTO | null>(null),
    [profile, setProfile] = useState<ProfileDTO | null>(null),
    [config, setConfig] = useState<AppConfig | null>(null),
    [loading, setLoading] = useState(true),
    [board, setBoard] = useState<LeaderboardEntry[]>([]),
    [streamState, setStreamState] = useState<ContextValue['streamState']>('connecting'),
    [activeGameId, setActiveGameId] = useState<string | null>(null),
    [mode, setModeState] = useState<Mode>(() => {
      try {
        const saved = localStorage.getItem('reef_game_mode');
        if (saved === 'live' || saved === 'practice') return saved;
      } catch {}
      return 'live';
    });

  const setMode = useCallback((m: Mode) => {
    setModeState(m);
    try {
      localStorage.setItem('reef_game_mode', m);
    } catch {}
  }, []);

  const toggleMode = useCallback(() => {
    setModeState((prev) => {
      const next = prev === 'practice' ? 'live' : 'practice';
      try {
        localStorage.setItem('reef_game_mode', next);
      } catch {}
      return next;
    });
  }, []);
  const userRef = useRef(user);
  userRef.current = user;
  const refresh = useCallback(async () => {
    if (!userRef.current) return;
    try {
      const p = await api<ProfileDTO>('/users/me');
      setProfile(p);
      setUser(p.user);
    } catch {}
  }, []);
  useEffect(() => {
    Promise.all([
      api<AppConfig>('/config')
        .then(setConfig)
        .catch(() => setConfig(null)),
      api<{ user: UserDTO; activeGameId: string | null }>('/auth/me', undefined, 'GET', true)
        .then((r) => {
          setUser(r.user);
          setActiveGameId(r.activeGameId);
        })
        .catch(() => {}),
    ]).finally(() => setLoading(false));
    const expired = () => {
      setUser(null);
      setProfile(null);
      setActiveGameId(null);
    };
    window.addEventListener('reef:session-expired', expired);
    return () => window.removeEventListener('reef:session-expired', expired);
  }, []);
  useEffect(() => {
    if (user) void refresh();
  }, [user?.id, refresh]);
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let version = -1,
      epoch = '';
    const stream = new EventSource('/api/leaderboard/stream');
    stream.addEventListener('leaderboard.updated', (event) => {
      try {
        const b = JSON.parse((event as MessageEvent).data);
        if (typeof b.version !== 'number' || !Array.isArray(b.entries)) return;
        if (epoch === b.epoch && b.version < version) return;
        epoch = b.epoch;
        version = b.version;
        setBoard(b.entries);
        setStreamState('live');
        clearTimeout(timeout);
        timeout = setTimeout(() => void refresh(), 250);
      } catch {
        setStreamState('reconnecting');
      }
    });
    stream.onerror = () => setStreamState('reconnecting');
    return () => {
      stream.close();
      clearTimeout(timeout);
    };
  }, [refresh]);
  const authenticate = (u: UserDTO) => {
    setUser(u);
    setActiveGameId(null);
  };
  const logout = async (all = false) => {
    await api(`/auth/${all ? 'logout-all' : 'logout'}`, {});
    setUser(null);
    setProfile(null);
    setActiveGameId(null);
  };
  return (
    <Context.Provider
      value={{
        user,
        profile,
        config,
        loading,
        board,
        streamState,
        activeGameId,
        mode,
        setMode,
        toggleMode,
        setActiveGameId,
        authenticate,
        refresh,
        logout,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useReef = () => useContext(Context);
