import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { cx } from '../lib/format';
import { Button } from './Button';

/**
 * Application shell: header, navigation and the routed page.
 *
 * Navigation items are derived from the user's role rather than rendered and
 * then hidden. A Job Seeker has no "My Jobs" concept and a Company has no
 * applications of its own, so showing either would be noise — and hiding links
 * with CSS would still leave the routes reachable.
 */
export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const isCompany = user?.role === 'COMPANY';

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    cx(
      'rounded-lg px-3 py-2 text-sm font-medium transition',
      isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
    );

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:gap-6">
          <Link to="/" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
              IK
            </span>
            <span className="hidden text-base font-semibold text-slate-900 sm:inline">
              IndoKerja<span className="text-brand-600">.id</span>
            </span>
          </Link>

          {user && (
            <nav className="flex items-center gap-1" aria-label="Main">
              {isCompany ? (
                <>
                  <NavLink to="/company/jobs" className={navLinkClass}>
                    My Jobs
                  </NavLink>
                  <NavLink to="/company/jobs/new" className={navLinkClass}>
                    Post a Job
                  </NavLink>
                </>
              ) : (
                <>
                  <NavLink to="/jobs" className={navLinkClass}>
                    Find Jobs
                  </NavLink>
                  <NavLink to="/applications" className={navLinkClass}>
                    My Applications
                  </NavLink>
                </>
              )}
            </nav>
          )}

          <div className="ml-auto flex items-center gap-3">
            {user ? (
              <>
                <div className="hidden text-right sm:block">
                  <p className="text-sm font-medium leading-tight text-slate-900">
                    {user.companyProfile?.companyName ?? user.email}
                  </p>
                  <p className="text-xs leading-tight text-slate-500">
                    {isCompany ? 'Company' : 'Job Seeker'}
                  </p>
                </div>
                <Button variant="secondary" onClick={handleLogout}>
                  Log out
                </Button>
              </>
            ) : (
              <>
                <Link to="/login" className="btn-ghost">
                  Log in
                </Link>
                <Link to="/register" className="btn-primary">
                  Sign up
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-8">
        <Outlet />
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-6 text-xs text-slate-500">
          IndoKerja.id — assessment submission. React + TypeScript frontend, NestJS +
          PostgreSQL backend.
        </div>
      </footer>
    </div>
  );
}
