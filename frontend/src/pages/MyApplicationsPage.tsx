import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { applicationsApi } from '../api/endpoints';
import { getErrorMessage } from '../api/client';
import type { ApplicationStatus } from '../api/types';
import {
  CompanyAvatar,
  EmptyState,
  ErrorState,
  PageHeader,
  Skeleton,
  SkeletonList,
  StatusBadge,
} from '../components/ui';
import {
  IconArrowRight,
  IconCalendar,
  IconMapPin,
  IconPaperPlane,
  IconProhibit,
} from '../components/icons';
import { formatDate, formatRelativeTime, cx } from '../lib/format';

/**
 * A seeker's own applications with their current status (requirement 4).
 *
 * History is fetched on demand per application rather than for every row: it is
 * unbounded by nature, and only one timeline is ever on screen at a time.
 */
export function MyApplicationsPage() {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['my-applications'],
    queryFn: () => applicationsApi.mine(),
  });

  // Separate query, only enabled for the row the user opened.
  const { data: detail, isPending: isLoadingDetail } = useQuery({
    queryKey: ['my-application', expandedId],
    queryFn: () => applicationsApi.mineById(expandedId as string),
    enabled: Boolean(expandedId),
  });

  if (isPending) {
    return (
      <div>
        <PageHeader title="My Applications" description="Loading your applications…" />
        <SkeletonList count={3} />
      </div>
    );
  }

  if (isError) return <ErrorState message={getErrorMessage(error)} onRetry={() => refetch()} />;

  /** A tally per status, used for the summary strip. */
  const counts = data.reduce<Partial<Record<ApplicationStatus, number>>>((acc, app) => {
    acc[app.status] = (acc[app.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div>
      <PageHeader
        title="My Applications"
        description={
          data.length === 0
            ? 'You have not applied to any jobs yet.'
            : `Tracking ${data.length} application${data.length === 1 ? '' : 's'}. Open one to read its full status history.`
        }
        action={
          data.length > 0 ? (
            <Link to="/jobs" className="btn-secondary">
              Find more jobs
            </Link>
          ) : undefined
        }
      />

      {data.length === 0 ? (
        <EmptyState
          icon={<IconPaperPlane size={24} />}
          title="No applications yet"
          description="Browse open positions and apply to the ones that fit. You can apply to each job once."
          action={
            <Link to="/jobs" className="btn-primary">
              Find jobs
            </Link>
          }
        />
      ) : (
        <>
          {/* Summary strip. Only statuses that actually occur are shown, so an
              empty category is not a row of zeros. */}
          <div className="mb-6 flex flex-wrap gap-2">
            {(
              ['APPLIED', 'REVIEWING', 'SHORTLISTED', 'ACCEPTED', 'REJECTED'] as ApplicationStatus[]
            )
              .filter((status) => counts[status])
              .map((status) => (
                <span key={status} className="flex items-center gap-2">
                  <StatusBadge status={status} withIcon={false} />
                  <span className="tabular text-xs font-bold text-ink-500">
                    {counts[status]}
                  </span>
                </span>
              ))}
          </div>

          <ul className="space-y-3">
            {data.map((application) => {
              const isExpanded = expandedId === application.id;

              return (
                <li key={application.id} className="surface-lift overflow-hidden">
                  <div className="p-5">
                    <div className="flex gap-4">
                      <CompanyAvatar name={application.job.company.companyName} />

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                          <div className="min-w-0">
                            <Link
                              to={`/jobs/${application.job.id}`}
                              className="text-[15px] font-bold leading-snug tracking-tight text-ink-900 transition-colors duration-200 hover:text-accent-700"
                            >
                              {application.job.title}
                            </Link>
                            <p className="mt-0.5 text-sm text-ink-600">
                              {application.job.company.companyName}
                            </p>
                          </div>
                          <StatusBadge status={application.status} />
                        </div>

                        <dl className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-ink-500">
                          <div className="flex items-center gap-1.5">
                            <IconMapPin size={14} className="text-ink-400" aria-hidden="true" />
                            <dt className="sr-only">Location</dt>
                            <dd>{application.job.location}</dd>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <IconCalendar size={14} className="text-ink-400" aria-hidden="true" />
                            <dt className="sr-only">Applied</dt>
                            <dd>Applied {formatRelativeTime(application.createdAt)}</dd>
                          </div>
                          {!application.job.isActive && (
                            <div className="flex items-center gap-1.5 font-semibold text-ink-600">
                              <IconProhibit size={14} aria-hidden="true" />
                              <dd>No longer accepting applications</dd>
                            </div>
                          )}
                        </dl>

                        <button
                          type="button"
                          onClick={() => setExpandedId(isExpanded ? null : application.id)}
                          aria-expanded={isExpanded}
                          className="group mt-3.5 inline-flex items-center gap-1.5 text-xs font-bold text-accent-700 transition-colors duration-200 hover:text-accent-800"
                        >
                          {isExpanded ? 'Hide status history' : 'Show status history'}
                          <IconArrowRight
                            className={cx(
                              'transition-transform duration-300 ease-settle',
                              isExpanded && 'rotate-90',
                            )}
                            aria-hidden="true"
                          />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Status history — requirement 9 made visible to the applicant. */}
                  {isExpanded && (
                    <div className="animate-fade-in border-t border-ink-200/80 bg-ink-100/40 px-5 py-5">
                      {isLoadingDetail ? (
                        <div className="space-y-4">
                          {Array.from({ length: 3 }, (_, i) => (
                            <div key={i} className="flex gap-3">
                              <Skeleton className="h-2.5 w-2.5 shrink-0 rounded-full" />
                              <div className="flex-1 space-y-2">
                                <Skeleton className="h-5 w-28 rounded-full" />
                                <Skeleton className="h-3 w-2/5" />
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <ol className="space-y-0">
                          {(detail?.history ?? []).map((entry, index, all) => {
                            const isLast = index === all.length - 1;

                            return (
                              <li key={entry.id} className="flex gap-3.5">
                                {/* Timeline rail: a node per entry, joined by a
                                    hairline that stops at the last one. */}
                                <div className="flex flex-col items-center">
                                  <span
                                    className={cx(
                                      'mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ring-4',
                                      isLast
                                        ? 'bg-accent-600 ring-accent-100'
                                        : 'bg-ink-300 ring-ink-100',
                                    )}
                                    aria-hidden="true"
                                  />
                                  {!isLast && (
                                    <span
                                      className="w-px flex-1 bg-ink-200"
                                      aria-hidden="true"
                                    />
                                  )}
                                </div>

                                <div className={cx('min-w-0 flex-1', isLast ? 'pb-0' : 'pb-5')}>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <StatusBadge status={entry.status} withIcon={false} />
                                    {isLast && (
                                      <span className="text-[11px] font-bold uppercase tracking-wide text-accent-700">
                                        Current
                                      </span>
                                    )}
                                  </div>
                                  <p className="tabular mt-1.5 text-xs text-ink-500">
                                    {formatDate(entry.createdAt)}
                                  </p>
                                  {entry.note && (
                                    <p className="mt-2 max-w-[60ch] rounded-lg bg-white px-3 py-2 text-xs leading-relaxed text-ink-700 ring-1 ring-ink-200">
                                      {entry.note}
                                    </p>
                                  )}
                                  {entry.changedByUserId === null && (
                                    <p className="mt-1.5 text-xs italic text-ink-400">
                                      Recorded automatically when you applied
                                    </p>
                                  )}
                                </div>
                              </li>
                            );
                          })}
                        </ol>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
