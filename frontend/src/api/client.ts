import axios, { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import type { ApiErrorBody, AuthResponse } from './types';

const BASE_URL = '/api';

/**
 * The access token lives here and nowhere else.
 *
 * Module-scope rather than React state because the axios interceptor needs to
 * read it outside the component tree, and because a token in React state could
 * be accidentally serialised into a render or a devtools snapshot. It is
 * deliberately **not** in localStorage or sessionStorage — see docs/adr/0004.
 *
 * Consequence: a full page reload loses it, and the app recovers by calling
 * `/auth/refresh` (the refresh token is an httpOnly cookie) during boot. That
 * is the intended design, not a bug.
 */
let accessToken: string | null = null;

/** Notified when the session ends for good, so the UI can redirect to login. */
type SessionExpiredHandler = () => void;
let onSessionExpired: SessionExpiredHandler | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function setSessionExpiredHandler(handler: SessionExpiredHandler | null): void {
  onSessionExpired = handler;
}

export const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  // Required for the httpOnly refresh cookie to be sent and received.
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

// ---------------------------------------------------------------------------
// Refresh-on-401
// ---------------------------------------------------------------------------

/**
 * A single in-flight refresh, shared by every request that gets a 401 while it
 * runs.
 *
 * Without this, a page that fires three requests in parallel after the access
 * token expires would trigger three refreshes. Because the backend **rotates**
 * refresh tokens on use (docs/adr/0004), the second and third would present an
 * already-revoked token, be rejected, and — worse — the backend revokes the
 * whole chain on reuse, logging the user out. So collapsing concurrent
 * refreshes into one is correctness, not just efficiency.
 */
let refreshInFlight: Promise<string> | null = null;

/** Endpoints where a 401 is the expected answer, not a signal to refresh. */
const NO_REFRESH_PATHS = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout'];

function isAuthEndpoint(url: string | undefined): boolean {
  if (!url) return false;
  return NO_REFRESH_PATHS.some((path) => url.includes(path));
}

async function refreshAccessToken(): Promise<string> {
  // A bare axios call, not `api`, so this request does not itself run through
  // the interceptor and recurse.
  const { data } = await axios.post<AuthResponse>(
    `${BASE_URL}/auth/refresh`,
    {},
    { withCredentials: true },
  );
  setAccessToken(data.accessToken);
  return data.accessToken;
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;

    // Not a 401, or no request to retry — nothing to do.
    if (!original || error.response?.status !== 401) {
      return Promise.reject(error);
    }

    // Never try to refresh a request that was itself an auth call. A 401 from
    // /auth/login means bad credentials, and refreshing would be nonsense.
    if (isAuthEndpoint(original.url)) {
      return Promise.reject(error);
    }

    // Only retry once per request, so a persistently failing refresh cannot
    // produce an infinite loop.
    if (original._retried) {
      setAccessToken(null);
      onSessionExpired?.();
      return Promise.reject(error);
    }
    original._retried = true;

    try {
      if (!refreshInFlight) {
        refreshInFlight = refreshAccessToken().finally(() => {
          refreshInFlight = null;
        });
      }
      const token = await refreshInFlight;

      original.headers.Authorization = `Bearer ${token}`;
      return api.request(original);
    } catch (refreshError) {
      // The refresh token is expired, revoked, or absent: the session is over.
      setAccessToken(null);
      onSessionExpired?.();
      return Promise.reject(refreshError);
    }
  },
);

// ---------------------------------------------------------------------------
// Error normalisation
// ---------------------------------------------------------------------------

/**
 * Turns any thrown value into a message worth showing a user.
 *
 * Validation errors arrive as a `string[]` from the Nest `ValidationPipe`, and
 * network failures have no response at all. Callers should not each have to
 * know that, so the shape is flattened here once.
 */
export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const body = error.response?.data as ApiErrorBody | undefined;

    if (body?.message) {
      return Array.isArray(body.message) ? body.message.join(', ') : body.message;
    }

    if (error.code === 'ERR_NETWORK') {
      return 'Cannot reach the server. Is the backend running?';
    }

    return error.message;
  }

  if (error instanceof Error) return error.message;
  return 'Something went wrong.';
}

export function getErrorStatus(error: unknown): number | undefined {
  return axios.isAxiosError(error) ? error.response?.status : undefined;
}
