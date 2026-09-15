import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { authApi, type LoginInput, type RegisterInput } from '../api/endpoints';
import { setAccessToken, setSessionExpiredHandler } from '../api/client';
import type { AuthResponse, User } from '../api/types';

interface AuthContextValue {
  user: User | null;
  /** True until the boot-time refresh attempt resolves. Gates route decisions. */
  isInitialising: boolean;
  isAuthenticated: boolean;
  login: (input: LoginInput) => Promise<User>;
  register: (input: RegisterInput) => Promise<User>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isInitialising, setIsInitialising] = useState(true);

  /** Applies a successful auth response: token into memory, user into state. */
  const adoptSession = useCallback((response: AuthResponse): User => {
    setAccessToken(response.accessToken);
    setUser(response.user);
    return response.user;
  }, []);

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setUser(null);
  }, []);

  /**
   * Boot: try to recover a session from the httpOnly refresh cookie.
   *
   * The access token is held in memory only, so it is gone after a reload —
   * this is how the user stays logged in across one. A failure here is the
   * normal "not logged in" case, not an error worth showing.
   */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const response = await authApi.refresh();
        if (!cancelled) adoptSession(response);
      } catch {
        if (!cancelled) clearSession();
      } finally {
        if (!cancelled) setIsInitialising(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [adoptSession, clearSession]);

  /**
   * When a refresh finally fails mid-session, the interceptor calls this to
   * drop the user back to the logged-out state rather than leaving the UI
   * showing stale data behind a dead session.
   */
  useEffect(() => {
    setSessionExpiredHandler(clearSession);
    return () => setSessionExpiredHandler(null);
  }, [clearSession]);

  const login = useCallback(
    async (input: LoginInput) => adoptSession(await authApi.login(input)),
    [adoptSession],
  );

  const register = useCallback(
    async (input: RegisterInput) => adoptSession(await authApi.register(input)),
    [adoptSession],
  );

  const logout = useCallback(async () => {
    try {
      // Server-side revocation: the refresh token is invalidated, not merely
      // forgotten by the client. See docs/adr/0004.
      await authApi.logout();
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isInitialising,
      isAuthenticated: user !== null,
      login,
      register,
      logout,
    }),
    [user, isInitialising, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside an <AuthProvider>');
  }
  return context;
}
