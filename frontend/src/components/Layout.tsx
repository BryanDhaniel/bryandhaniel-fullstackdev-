import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { cx } from '../lib/format';
import { Button } from './Button';
import { IconCompass, IconSignOut } from './icons';

/**
 * Application shell: header, navigation and the routed page.
 *
 * Navigation items are derived from the user's role rather than rendered and
 * then hidden. A Job Seeker has no "My Jobs" concept and a Company has no
 * applications of its own, so showing either would be noise — and hiding links
 * with CSS would still leave the routes reachable.
 *
 * The nav labels and route paths are unchanged from the original build: they
 * are muscle memory and, in a real deployment, they would be analytics event
 * sources. Only the presentation is new.
 */
export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const isCompany = user?.role === 'COMPANY';

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  /**
   * A nav item is a pill that fills on hover and holds a subtle inner highlight
   * when active. The active state is not colour-only: it also carries a 1px
   * ring and a raised surface, so it survives greyscale and low vision.
   */
  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    cx(
      'rounded-lg px-3 py-2 text-sm font-semibold transition-all duration-200 ease-settle',
      isActive
        ? 'bg-white text-ink-900 shadow-hair'
        : 'text-ink-500 hover:bg-white/60 hover:text-ink-900',
    );

  return (
    <div className="grain flex min-h-[100dvh] flex-col bg-ink-50">
      {/* Keyboard users reach the content without tabbing the whole nav. */}
      <a href="#main" className="skip-link">
        Skip to content
      </a>

      <header className="sticky top-0 z-30 border-b border-ink-200/80 bg-ink-50/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:gap-6 sm:px-6">
          <Link
            to="/"
            className="flex items-center gap-2.5 transition-opacity duration-200 hover:opacity-80"
          >
            <span
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-700 text-sm font-extrabold tracking-tight text-white shadow-lift"
              aria-hidden="true"
            >
              IK
            </span>
            <span className="hidden text-[15px] font-extrabold tracking-tight text-ink-900 sm:inline">
              IndoKerja<span className="text-accent-600">.id</span>
            </span>
          </Link>

          {user && (
            <>
              {/* A hairline divider between brand and nav keeps the header from
                  reading as one undifferentiated row of pills. */}
              <span className="hidden h-6 w-px bg-ink-200 lg:block" aria-hidden="true" />

              <nav className="flex items-center gap-1 lg:bg-ink-100/70 lg:p-1 lg:rounded-xl" aria-label="Main">
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
            </>
          )}

          <div className="ml-auto flex items-center gap-3">
            {user ? (
              <>
                <div className="hidden items-center gap-2.5 border-l border-ink-200 pl-3 md:flex">
                  <span
                    className="flex h-8 w-8 items-center justify-center rounded-md bg-ink-900 text-[11px] font-bold text-ink-50"
                    aria-hidden="true"
                  >
                    {(user.companyProfile?.companyName ?? user.email)
                      .replace(/[^a-zA-Z0-9]/g, '')
                      .slice(0, 2)
                      .toUpperCase()}
                  </span>
                  <span className="text-right">
                    <span className="block max-w-[16ch] truncate text-[13px] font-semibold leading-tight text-ink-900">
                      {user.companyProfile?.companyName ?? user.email}
                    </span>
                    <span className="block text-[11px] font-medium leading-tight text-ink-500">
                      {isCompany ? 'Company' : 'Job Seeker'}
                    </span>
                  </span>
                </div>
                <Button variant="ghost" size="sm" onClick={handleLogout}>
                  <IconSignOut aria-hidden="true" />
                  <span className="hidden sm:inline">Log out</span>
                  <span className="sr-only sm:hidden">Log out</span>
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

      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
        <Outlet />
      </main>

      <footer className="border-t border-ink-200/80">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-xs text-ink-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-2.5">
            <span
              className="flex h-6 w-6 items-center justify-center rounded-md bg-ink-300 text-[10px] font-bold text-ink-700"
              aria-hidden="true"
            >
              IK
            </span>
            <span>
              <span className="font-semibold text-ink-600">IndoKerja.id</span>, manajemen
              lamaran kerja.
            </span>
          </div>

          <nav className="flex flex-wrap items-center gap-x-5 gap-y-2" aria-label="Footer">
            {isCompany ? (
              <Link to="/company/jobs" className="transition-colors hover:text-ink-900">
                My Jobs
              </Link>
            ) : (
              <Link to="/jobs" className="transition-colors hover:text-ink-900">
                Find Jobs
              </Link>
            )}
            <span className="text-ink-400">Privacy</span>
            <span className="text-ink-400">Terms</span>
            <span className="flex items-center gap-1.5">
              <IconCompass size={13} aria-hidden="true" />
              <span className="font-mono text-[10px] tracking-tight">ID</span>
            </span>
          </nav>
        </div>
      </footer>
    </div>
  );
}
