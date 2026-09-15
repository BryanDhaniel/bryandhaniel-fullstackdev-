import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { ApplicationStatus } from '../api/types';
import { STATUS_LABELS, STATUS_STYLES } from '../api/types';
import { companyInitials, cx } from '../lib/format';
import { STATUS_ICONS } from './StatusIcon';
import {
  IconArrowLeft,
  IconCheck,
  IconInfo,
  IconSearchList,
  IconWarning,
} from './icons';

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

/**
 * Renders an application status with a consistent colour.
 *
 * `withIcon` prefixes a glyph rather than a colour swatch. The five statuses
 * are distinguishable by hue, and hue alone is not an accessible signal, so
 * each one carries a shape as well — a tick for accepted, a cross for rejected,
 * and so on.
 */
export function StatusBadge({
  status,
  withIcon = true,
}: {
  status: ApplicationStatus;
  withIcon?: boolean;
}) {
  const StatusIcon = STATUS_ICONS[status];

  return (
    <span className={cx('badge', STATUS_STYLES[status])}>
      {withIcon && <StatusIcon size={13} strokeWidth={2} aria-hidden="true" />}
      {STATUS_LABELS[status]}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Skeleton loading
// ---------------------------------------------------------------------------

/**
 * A single shimmering placeholder block.
 *
 * Skeletons replace the circular spinner almost everywhere, because a spinner
 * tells the user "wait" while a skeleton tells them "here is the shape of what
 * is coming". The shimmer is a translated gradient rather than an animated
 * background colour, so it composites on the GPU.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cx('relative overflow-hidden rounded-md bg-ink-200/70', className)}
      aria-hidden="true"
    >
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/60 to-transparent" />
    </div>
  );
}

/** A skeleton matching the shape of a job / application row. */
export function SkeletonRow({ withAvatar = true }: { withAvatar?: boolean }) {
  return (
    <div className="surface-lift p-5">
      <div className="flex gap-4">
        {withAvatar && <Skeleton className="h-12 w-12 shrink-0 rounded-lg" />}
        <div className="flex-1 space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/5" />
              <Skeleton className="h-3 w-1/4" />
            </div>
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
          <div className="flex gap-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-28" />
          </div>
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-3/4" />
        </div>
      </div>
    </div>
  );
}

/** A skeleton list, used while a page of rows is loading for the first time. */
export function SkeletonList({
  count = 3,
  withAvatar = true,
}: {
  count?: number;
  withAvatar?: boolean;
}) {
  return (
    <div className="space-y-3" role="status" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonRow key={i} withAvatar={withAvatar} />
      ))}
    </div>
  );
}

/**
 * Retained for the handful of places where the *shape* of the result is not
 * known ahead of time (session restore, a route change). Everywhere the layout
 * is predictable, use a skeleton instead.
 */
export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 py-24 text-ink-500"
      role="status"
    >
      <span className="flex h-10 w-10 items-center justify-center">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-ink-300 border-t-accent-600" />
      </span>
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------

/**
 * A composed error state. Carries its own visual weight so a failed request
 * does not look like an empty list — the two problems need different actions
 * from the user, so they must not look the same.
 */
export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="surface-lift flex flex-col items-center px-6 py-16 text-center" role="alert">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-status-reject/10 text-status-reject">
        <IconWarning size={24} />
      </span>
      <h3 className="mt-4 text-base font-semibold text-ink-900">Something went wrong</h3>
      <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-ink-600">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="btn-secondary mt-5">
          Try again
        </button>
      )}
    </div>
  );
}

/**
 * An empty state.
 *
 * Deliberately composed rather than a bare sentence: an empty screen is the
 * first thing a new user sees on most pages in this app, and it is the only
 * chance to explain how to populate it.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="surface flex flex-col items-center px-6 py-16 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-ink-100 text-ink-400 ring-1 ring-ink-200">
        {icon ?? <IconSearchList size={24} />}
      </span>
      <h3 className="mt-4 text-base font-semibold text-ink-900">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-md text-sm leading-relaxed text-ink-600">{description}</p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

/** Inline form-level or action-level feedback. */
export function Alert({
  variant = 'error',
  children,
}: {
  variant?: 'error' | 'success' | 'info';
  children: ReactNode;
}) {
  const { styles, Icon } = {
    error: {
      styles: 'bg-status-reject/8 text-status-reject ring-status-reject/25',
      Icon: IconWarning,
    },
    success: {
      styles: 'bg-status-accept/8 text-status-accept ring-status-accept/25',
      Icon: IconCheck,
    },
    info: {
      styles: 'bg-accent-50 text-accent-800 ring-accent-200',
      Icon: IconInfo,
    },
  }[variant];

  return (
    <div
      className={cx('flex items-start gap-2.5 rounded-lg px-3.5 py-3 text-sm ring-1 ring-inset', styles)}
      role={variant === 'error' ? 'alert' : 'status'}
    >
      <Icon size={17} className="mt-px shrink-0" aria-hidden="true" />
      <span className="leading-relaxed">{children}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Form field
// ---------------------------------------------------------------------------

export function Field({
  label,
  htmlFor,
  error,
  hint,
  optional,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  optional?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="field-label" htmlFor={htmlFor}>
        {label}
        {optional && <span className="ml-1.5 font-normal text-ink-400">Optional</span>}
      </label>
      {children}
      {hint && !error && <p className="field-hint">{hint}</p>}
      {error && (
        <p className="field-error" role="alert">
          <IconWarning size={13} className="mt-px shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Avatar
// ---------------------------------------------------------------------------

/**
 * A company mark: the initials on a squared-off tile.
 *
 * Squares rather than circles, which is the more generic avatar shape, and
 * deliberately without a photograph — this app has no logo upload, so inventing
 * a face or a stock image would misrepresent the data.
 */
export function CompanyAvatar({
  name,
  size = 'md',
}: {
  name: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const sizes = {
    sm: 'h-9 w-9 text-[11px] rounded-md',
    md: 'h-12 w-12 text-sm rounded-lg',
    lg: 'h-16 w-16 text-lg rounded-xl',
  }[size];

  return (
    <span
      className={cx(
        'flex shrink-0 items-center justify-center bg-ink-900 font-bold tracking-tight text-ink-50',
        sizes,
      )}
      aria-hidden="true"
    >
      {companyInitials(name)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Layout helpers
// ---------------------------------------------------------------------------

/**
 * A page header: eyebrow-free by default, headline plus one line of context.
 *
 * Section eyebrows are rationed across the app (a maximum of one per three
 * sections) because a small uppercase label above every heading produces a
 * templated rhythm. Most headers here pass no eyebrow at all.
 */
export function PageHeader({
  title,
  description,
  action,
  as: Heading = 'h1',
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  as?: 'h1' | 'h2';
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <Heading className="text-display-sm font-extrabold text-ink-900">{title}</Heading>
        {description && (
          <p className="mt-2 max-w-[65ch] text-sm leading-relaxed text-ink-600">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** A back link for pages that are not top-level. Every detail page has one. */
export function BackLink({
  to,
  children,
  className,
}: {
  to: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      to={to}
      className={cx(
        'group mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-500',
        'transition-colors duration-200 hover:text-ink-900',
        className,
      )}
    >
      <span className="transition-transform duration-300 ease-settle group-hover:-translate-x-0.5">
        <IconArrowLeft />
      </span>
      {children}
    </Link>
  );
}
