import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { applicationsApi } from '../api/endpoints';
import { getErrorMessage } from '../api/client';
import { CompanyAvatar, EmptyState, ErrorState, LoadingState, StatusBadge } from '../components/ui';
import { formatDate, formatRelativeTime } from '../lib/format';

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

  if (isPending) return <LoadingState label="Loading your applications…" />;
  if (isError) return <ErrorState message={getErrorMessage(error)} onRetry={() => refetch()} />;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">My Applications</h1>
        <p className="mt-1 text-sm text-slate-500">
          {data.length === 0
            ? 'You have not applied to any jobs yet.'
            : `Tracking ${data.length} application${data.length === 1 ? '' : 's'}.`}
        </p>
      </div>

      {data.length === 0 ? (
        <EmptyState
          title="No applications yet"
          description="Browse open positions and apply to the ones that fit."
          action={
            <Link to="/jobs" className="btn-primary">
              Find jobs
            </Link>
          }
        />
      ) : (
        <ul className="space-y-3">
          {data.map((application) => {
            const isExpanded = expandedId === application.id;

            return (
              <li key={application.id} className="card overflow-hidden">
                <div className="p-4 sm:p-5">
                  <div className="flex gap-4">
                    <CompanyAvatar name={application.job.company.companyName} />

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <Link
                            to={`/jobs/${application.job.id}`}
                            className="font-semibold text-slate-900 hover:text-brand-700"
                          >
                            {application.job.title}
                          </Link>
                          <p className="mt-0.5 text-sm text-slate-600">
                            {application.job.company.companyName}
                          </p>
                        </div>
                        <StatusBadge status={application.status} />
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                        <span>{application.job.location}</span>
                        <span>Applied {formatRelativeTime(application.createdAt)}</span>
                        {!application.job.isActive && (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600">
                            No longer accepting applications
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : application.id)}
                        className="mt-3 text-xs font-medium text-brand-600 hover:text-brand-700"
                        aria-expanded={isExpanded}
                      >
                        {isExpanded ? 'Hide history' : 'Show status history'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Status history — requirement 9 made visible to the applicant. */}
                {isExpanded && (
                  <div className="border-t border-slate-200 bg-slate-50/70 px-4 py-4 sm:px-5">
                    {isLoadingDetail ? (
                      <p className="text-xs text-slate-500">Loading history…</p>
                    ) : (
                      <ol className="space-y-3">
                        {(detail?.history ?? []).map((entry, index) => (
                          <li key={entry.id} className="flex gap-3">
                            <div className="flex flex-col items-center">
                              <span
                                className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand-500"
                                aria-hidden="true"
                              />
                              {index < (detail?.history?.length ?? 0) - 1 && (
                                <span className="mt-1 w-px flex-1 bg-slate-300" aria-hidden="true" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1 pb-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <StatusBadge status={entry.status} withDot={false} />
                                <span className="text-xs text-slate-500">
                                  {formatDate(entry.createdAt)}
                                </span>
                              </div>
                              {entry.note && (
                                <p className="mt-1 text-xs text-slate-600">{entry.note}</p>
                              )}
                              {entry.changedByUserId === null && (
                                <p className="mt-1 text-xs italic text-slate-400">
                                  Recorded automatically when you applied
                                </p>
                              )}
                            </div>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
