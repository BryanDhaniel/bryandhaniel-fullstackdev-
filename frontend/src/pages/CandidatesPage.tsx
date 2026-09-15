import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { applicationsApi } from '../api/endpoints';
import { getErrorMessage } from '../api/client';
import { Button } from '../components/Button';
import { Alert, EmptyState, ErrorState, LoadingState, StatusBadge } from '../components/ui';
import type { ApplicationStatus, Candidate } from '../api/types';
import { ASSIGNABLE_STATUSES, STATUS_LABELS } from '../api/types';
import { formatDate, formatRelativeTime } from '../lib/format';

/**
 * Candidate management for one of the company's own jobs
 * (requirements 7, 8 and 9).
 *
 * The company owns this job, so the backend permits the read; attempting the
 * same page for another company's job returns 404, which is surfaced as a plain
 * "not found" rather than an authorization error — so the UI never confirms
 * that someone else's job exists.
 */
export function CandidatesPage() {
  const { jobId = '' } = useParams();
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<ApplicationStatus | ''>('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['candidates', jobId, statusFilter],
    queryFn: () => applicationsApi.candidatesForJob(jobId, statusFilter || undefined),
    enabled: Boolean(jobId),
  });

  /**
   * Status change (requirement 8). The backend writes the history entry in the
   * same transaction, so a successful response means both the current status
   * and the audit trail are updated — nothing further is required here beyond
   * refetching.
   */
  const statusMutation = useMutation({
    mutationFn: ({
      applicationId,
      status,
      note,
    }: {
      applicationId: string;
      status: ApplicationStatus;
      note?: string;
    }) => applicationsApi.updateStatus(applicationId, status, note),
    onSuccess: () => {
      setActionError(null);
      void queryClient.invalidateQueries({ queryKey: ['candidates', jobId] });
    },
    onError: (err) => setActionError(getErrorMessage(err)),
  });

  if (isPending) return <LoadingState label="Loading candidates…" />;
  if (isError) {
    return (
      <ErrorState
        message={
          (error as { response?: { status?: number } })?.response?.status === 404
            ? 'This job does not exist, or it belongs to another company.'
            : getErrorMessage(error)
        }
        onRetry={() => refetch()}
      />
    );
  }

  return (
    <div>
      <Link
        to="/company/jobs"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
        </svg>
        Back to my jobs
      </Link>

      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Candidates</h1>
          <p className="mt-1 text-sm text-slate-500">
            {data.length} candidate{data.length === 1 ? '' : 's'}
            {statusFilter ? ` with status ${STATUS_LABELS[statusFilter]}` : ''}
          </p>
        </div>

        <div>
          <label className="field-label" htmlFor="statusFilter">
            Filter by status
          </label>
          <select
            id="statusFilter"
            className="field"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as ApplicationStatus | '')}
          >
            <option value="">All statuses</option>
            {(['APPLIED', ...ASSIGNABLE_STATUSES] as ApplicationStatus[]).map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {actionError && (
        <div className="mb-4">
          <Alert variant="error">{actionError}</Alert>
        </div>
      )}

      {data.length === 0 ? (
        <EmptyState
          title="No candidates yet"
          description={
            statusFilter
              ? 'No candidate currently has this status. Try clearing the filter.'
              : 'Applications will appear here as soon as Job Seekers apply.'
          }
          action={
            statusFilter ? (
              <Button onClick={() => setStatusFilter('')}>Clear filter</Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="space-y-3">
          {data.map((candidate) => (
            <CandidateCard
              key={candidate.id}
              candidate={candidate}
              isExpanded={expandedId === candidate.id}
              onToggle={() => setExpandedId(expandedId === candidate.id ? null : candidate.id)}
              onChangeStatus={(status, note) =>
                statusMutation.mutate({ applicationId: candidate.id, status, note })
              }
              isUpdating={statusMutation.isPending}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function CandidateCard({
  candidate,
  isExpanded,
  onToggle,
  onChangeStatus,
  isUpdating,
}: {
  candidate: Candidate;
  isExpanded: boolean;
  onToggle: () => void;
  onChangeStatus: (status: ApplicationStatus, note?: string) => void;
  isUpdating: boolean;
}) {
  const [note, setNote] = useState('');

  const handleStatusClick = (status: ApplicationStatus) => {
    onChangeStatus(status, note.trim() || undefined);
    setNote('');
  };

  return (
    <li className="card overflow-hidden">
      <div className="p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold text-slate-900">{candidate.candidate.email}</p>
            <p className="mt-0.5 text-xs text-slate-500">
              Applied {formatRelativeTime(candidate.createdAt)}
            </p>
          </div>
          <StatusBadge status={candidate.status} />
        </div>

        {candidate.coverLetter && (
          <div className="mt-3 rounded-lg bg-slate-50 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Cover letter
            </p>
            <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-slate-700">
              {candidate.coverLetter}
            </p>
          </div>
        )}

        {/* Status controls — requirement 8.
            Every status is offered from every other status, including moving a
            rejected candidate back into review. There is no enforced pipeline,
            so no option is ever disabled. The current status is filtered out
            because setting it again would be a no-op. */}
        <div className="mt-4 border-t border-slate-200 pt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Change status
          </p>

          <input
            type="text"
            className="field mt-2"
            placeholder="Optional note for the status history…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={1000}
          />

          <div className="mt-2 flex flex-wrap gap-2">
            {ASSIGNABLE_STATUSES.filter((status) => status !== candidate.status).map((status) => (
              <Button
                key={status}
                variant={status === 'ACCEPTED' ? 'primary' : status === 'REJECTED' ? 'danger' : 'secondary'}
                onClick={() => handleStatusClick(status)}
                isLoading={isUpdating}
                className="text-xs"
              >
                {STATUS_LABELS[status]}
              </Button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={onToggle}
          className="mt-4 text-xs font-medium text-brand-600 hover:text-brand-700"
          aria-expanded={isExpanded}
        >
          {isExpanded ? 'Hide history' : `Show history (${candidate.history.length})`}
        </button>
      </div>

      {/* Full audit trail — requirement 9. */}
      {isExpanded && (
        <div className="border-t border-slate-200 bg-slate-50/70 px-4 py-4 sm:px-5">
          <ol className="space-y-3">
            {candidate.history.map((entry, index) => (
              <li key={entry.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand-500" aria-hidden="true" />
                  {index < candidate.history.length - 1 && (
                    <span className="mt-1 w-px flex-1 bg-slate-300" aria-hidden="true" />
                  )}
                </div>
                <div className="min-w-0 flex-1 pb-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={entry.status} withDot={false} />
                    <span className="text-xs text-slate-500">{formatDate(entry.createdAt)}</span>
                    {entry.changedByUserId === null && (
                      <span className="text-xs italic text-slate-400">by system</span>
                    )}
                  </div>
                  {entry.note && <p className="mt-1 text-xs text-slate-600">{entry.note}</p>}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </li>
  );
}
