import type { Job, OwnedJob } from '../api/types';
import { CompanyAvatar } from './ui';
import { IconCheck, IconClock, IconCoins, IconMapPin, IconSealCheck } from './icons';
import { formatRelativeTime, formatSalary, jobTypeLabel, cx } from '../lib/format';

/**
 * A job row.
 *
 * Presentation only: it renders no link and owns no state, so it can sit inside
 * a `<Link>` on the listing page, inside the company's own list with action
 * buttons beside it, or inside a preview panel.
 *
 * The layout is a two-column grid rather than a flex row so the metadata strip
 * aligns across every row regardless of how long the title is. That alignment
 * is what makes a list of these scannable.
 */
export function JobCard({
  job,
  className,
}: {
  job: Job | OwnedJob;
  className?: string;
}) {
  const isOwned = 'isActive' in job;

  return (
    <article
      className={cx(
        'surface-lift group/card relative overflow-hidden p-5 transition-all duration-300 ease-settle',
        'hover:-translate-y-0.5 hover:shadow-raised',
        className,
      )}
    >
      <div className="flex gap-4">
        <CompanyAvatar name={job.company.companyName} />

        <div className="min-w-0 flex-1">
          {/* Title row */}
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
            <div className="min-w-0">
              <h3 className="text-[15px] font-bold leading-snug tracking-tight text-ink-900 transition-colors duration-200 group-hover/card:text-accent-700">
                {job.title}
              </h3>
              <p className="mt-0.5 flex items-center gap-1.5 text-sm text-ink-600">
                <IconSealCheck size={14} className="shrink-0 text-ink-400" aria-hidden="true" />
                <span className="truncate">{job.company.companyName}</span>
              </p>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {job.hasApplied && (
                <span className="badge border-status-accept/30 bg-status-accept/10 text-status-accept">
                  <IconCheck size={13} strokeWidth={2} aria-hidden="true" />
                  Applied
                </span>
              )}
              {isOwned && (
                <span
                  className={cx(
                    'badge',
                    job.isActive
                      ? 'border-status-accept/30 bg-status-accept/10 text-status-accept'
                      : 'border-ink-300 bg-ink-100 text-ink-600',
                  )}
                >
                  {job.isActive ? 'Active' : 'Inactive'}
                </span>
              )}
            </div>
          </div>

          {/* Metadata strip */}
          <dl className="mt-3.5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px]">
            <div className="flex items-center gap-1.5 text-ink-600">
              <IconMapPin className="text-ink-400" aria-hidden="true" />
              <dt className="sr-only">Location</dt>
              <dd>{job.location}</dd>
            </div>

            <div className="flex items-center gap-1.5">
              <dt className="sr-only">Job type</dt>
              <dd className="rounded-md bg-ink-100 px-2 py-0.5 text-xs font-semibold text-ink-700">
                {jobTypeLabel(job.jobType)}
              </dd>
            </div>

            <div className="flex items-center gap-1.5">
              <IconCoins className="text-ink-400" aria-hidden="true" />
              <dt className="sr-only">Salary</dt>
              {/* Undisclosed salary is rendered muted, because "Negotiable" is
                  the absence of data rather than a figure. */}
              <dd
                className={cx(
                  'tabular font-semibold',
                  job.salaryMin === null && job.salaryMax === null
                    ? 'text-ink-500'
                    : 'text-ink-900',
                )}
              >
                {formatSalary(job.salaryMin, job.salaryMax, job.currency)}
              </dd>
            </div>
          </dl>

          {/* Description preview */}
          <p className="mt-3.5 line-clamp-2 max-w-[70ch] text-sm leading-relaxed text-ink-500">
            {job.description}
          </p>

          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="flex items-center gap-1.5 text-xs text-ink-400">
              <IconClock aria-hidden="true" />
              Posted {formatRelativeTime(job.createdAt)}
            </p>
          </div>
        </div>
      </div>
    </article>
  );
}
