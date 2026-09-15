import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import type { Role } from '../api/types';
import { LoadingState } from '../components/ui';

/**
 * Requires an authenticated session.
 *
 * Waits for the boot-time refresh attempt to settle before deciding. Without
 * that wait, a page reload would momentarily look logged-out (the access token
 * is in memory only) and bounce the user to /login even though their refresh
 * cookie is perfectly valid.
 */
export function RequireAuth({ role }: { role?: Role }) {
  const { user, isInitialising } = useAuth();
  const location = useLocation();

  if (isInitialising) {
    return <LoadingState label="Restoring your session…" />;
  }

  if (!user) {
    // Remember where they were heading so login can send them back there.
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (role && user.role !== role) {
    // Authenticated, but the wrong kind of account. Send them to their own
    // home rather than to login, which would be confusing.
    return <Navigate to={user.role === 'COMPANY' ? '/company/jobs' : '/jobs'} replace />;
  }

  return <Outlet />;
}

/** Redirects an already-authenticated user away from login/register. */
export function RedirectIfAuthenticated() {
  const { user, isInitialising } = useAuth();

  if (isInitialising) {
    return <LoadingState label="Restoring your session…" />;
  }

  if (user) {
    return <Navigate to={user.role === 'COMPANY' ? '/company/jobs' : '/jobs'} replace />;
  }

  return <Outlet />;
}
