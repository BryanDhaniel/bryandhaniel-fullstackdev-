import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { IconArrowLeft, IconCompass } from '../components/icons';

/**
 * A branded not-found page.
 *
 * The catch-all route previously redirected to "/", which silently teleported
 * the user and made a mistyped URL indistinguishable from a working one. This
 * says what happened and offers the two destinations that actually exist for
 * the signed-in role.
 */
export function NotFoundPage() {
  const { user } = useAuth();
  const isCompany = user?.role === 'COMPANY';

  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center py-12 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-ink-900 text-ink-50">
        <IconCompass size={28} aria-hidden="true" />
      </span>

      <p className="tabular mt-6 font-mono text-sm font-bold tracking-tight text-ink-400">404</p>
      <h1 className="mt-2 text-display-sm font-extrabold text-ink-900">
        This page does not exist
      </h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-ink-600">
        The link may be mistyped, or the page may have moved. Nothing is broken on your
        account.
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        {user ? (
          <Link to={isCompany ? '/company/jobs' : '/jobs'} className="btn-primary">
            {isCompany ? 'Go to My Jobs' : 'Go to Find Jobs'}
          </Link>
        ) : (
          <Link to="/login" className="btn-primary">
            Go to log in
          </Link>
        )}

        {user && (
          <Link
            to={isCompany ? '/company/jobs/new' : '/applications'}
            className="btn-secondary"
          >
            {isCompany ? 'Post a job' : 'My Applications'}
          </Link>
        )}
      </div>

      <Link
        to="/"
        className="mt-8 inline-flex items-center gap-1.5 text-xs font-semibold text-ink-500 transition-colors duration-200 hover:text-ink-900"
      >
        <IconArrowLeft aria-hidden="true" />
        Back to start
      </Link>
    </div>
  );
}
