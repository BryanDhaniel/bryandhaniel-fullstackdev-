import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { applicationsApi } from '../api/endpoints';
import { getErrorStatus, getErrorMessage } from '../api/client';
import { Button } from '../components/Button';
import {
  Alert,
  BackLink,
  EmptyState,
  ErrorState,
  PageHeader,
  SkeletonList,
  StatusBadge,
} from '../components/ui';
import type { ApplicationStatus, Candidate } from '../api/types';
import { ASSIGNABLE_STATUSES, STATUS_LABELS } from '../api/types';
import { STATUS_ICONS } from '../components/StatusIcon';
import { IconUser } from '../components/icons';
import { formatDate, formatRelativeTime, cx } from '../lib/format';

/**
 * Glyph colour per status, written out rather than composed from a template
 * string. Tailwind scans source text for class names, so a concatenated
 * `text-status-${x}` would never be generated.
 */
const STATUS_GLYPH_COLOUR: Record<ApplicationStatus, string> = {
  APPLIED: 'text-ink-500',
  REVIEWING: 'text-status-review',
  SHORTLISTED: 'text-status-shortlist',
  REJECTED: 'text-status-reject',
  ACCEPTED: 'text-white',
};

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

  /**
   * Which candidate is currently being updated.
   *
   * `statusMutation.isPending` is a single flag for the whole mutation, so
   * passing it to every card would spin the buttons on all of them at once.
   * The mutation's `variables` identify the one row actually in flight.
   */
  const updatingId = statusMutation.isPending ? statusMutation.variables?.applicationId : undefined;

  if (isPending) {
    return (
      <div>
        <BackLink to="/company/jobs">Back to my jobs</BackLink>
        <PageHeader title="Candidates" description="Loading candidates…" />
        <SkeletonList count={2} withAvatar={false} />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="mx-auto max-w-2xl py-8">
        <ErrorState
          message={
            getErrorStatus(error) === 404
              ? 'This job does not exist, or it belongs to another company.'
              : getErrorMessage(error)
          }
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  return (
    <div>
      <BackLink to="/company/jobs">Back to my jobs</BackLink>

      <PageHeader
        title="Candidates"
        description={
          <>
            <span className="tabular font-semibold text-ink-900">{data.length}</span> candidate
            {data.length === 1 ? '' : 's'}
            {statusFilter ? ` with status ${STATUS_LABELS[statusFilter]}` : ''}. Any status can
            follow any other, so a rejected candidate can be brought back.
          </>
        }
      />

      {actionError && (
        <div className="mb-5">
          <Alert variant="error">{actionError}</Alert>
        </div>
      )}

      {/* The status filter is a set of pills rather than a dropdown, because
          the recruiter is usually scanning for one of five known buckets and
          can see all of them at once. */}
      <div className="mb-6 flex flex-wrap items-center gap-2" role="group" aria-label="Filter by status">
        <button
          type="button"
          onClick={() => setStatusFilter('')}
          aria-pressed={statusFilter === ''}
          className={cx('chip px-3.5 py-1.5', statusFilter === '' && 'chip-active')}
        >
          All statuses
        </button>
        {(['APPLIED', ...ASSIGNABLE_STATUSES] as ApplicationStatus[]).map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => setStatusFilter(status)}
            aria-pressed={statusFilter === status}
            className={cx(
              'chip px-3.5 py-1.5',
              statusFilter === status
                ? 'border-accent-600 bg-accent-700 text-white'
                : undefined,
            )}
          >
            {STATUS_LABELS[status]}
          </button>
        ))}
      </div>

      {data.length === 0 ? (
        <EmptyState
          icon={<IconUser size={24} />}
          title={statusFilter ? 'No candidate has this status' : 'No candidates yet'}
          description={
            statusFilter
              ? 'Try a different status, or clear the filter to see everyone who applied.'
              : 'Applications will appear here as soon as Job Seekers apply to this posting.'
          }
          action={
            statusFilter ? (
              <Button onClick={() => setStatusFilter('')}>Clear filter</Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="space-y-4">
          {data.map((candidate) => (
            <CandidateCard
              key={candidate.id}
              candidate={candidate}
              isExpanded={expandedId === candidate.id}
              onToggle={() => setExpandedId(expandedId === candidate.id ? null : candidate.id)}
              onChangeStatus={(status, note) =>
                statusMutation.mutate({ applicationId: candidate.id, status, note })
              }
              isUpdating={updatingId === candidate.id}
              isDisabled={updatingId !== undefined && updatingId !== candidate.id}
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
  isDisabled,
}: {
  candidate: Candidate;
  isExpanded: boolean;
  onToggle: () => void;
  onChangeStatus: (status: ApplicationStatus, note?: string) => void;
  /** This row's own action is in flight. */
  isUpdating: boolean;
  /** A *different* row's action is in flight, so this one must not start another. */
  isDisabled: boolean;
}) {
  const [note, setNote] = useState('');

  const handleStatusClick = (status: ApplicationStatus) => {
    onChangeStatus(status, note.trim() || undefined);
    setNote('');
  };

  return (
    <li className="surface-lift overflow-hidden">
      <div className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-sm font-bold text-ink-600 ring-1 ring-ink-200"
              aria-hidden="true"
            >
              {/* The applicant is identified by email in this system, so the
                  monogram comes from the local part rather than from a name the
                  app does not have. */}
              {candidate.candidate.email.split('@')[0].slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate font-bold text-ink-900">{candidate.candidate.email}</p>
              <p className="mt-0.5 text-xs text-ink-500">
                Applied {formatRelativeTime(candidate.createdAt)}
              </p>
            </div>
          </div>
          <StatusBadge status={candidate.status} />
        </div>

        {candidate.coverLetter && (
          <div className="mt-4 rounded-lg bg-ink-100/70 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-ink-500">
              Cover letter
            </p>
            <p className="mt-2 max-w-[70ch] whitespace-pre-line text-sm leading-relaxed text-ink-700">
              {candidate.coverLetter}
            </p>
          </div>
        )}

        {/* Status controls — requirement 8.
            Every status is offered from every other status, including moving a
            rejected candidate back into review. There is no enforced pipeline,
            so no option is ever disabled. The current status is filtered out
            because setting it again would be a no-op. */}
        <div className="mt-4 border-t border-ink-200/80 pt-4">
          <label className="field-label" htmlFor={`note-${candidate.id}`}>
            Note
            <span className="ml-1.5 font-normal text-ink-400">
              Optional, saved to the history
            </span>
          </label>
          <input
            id={`note-${candidate.id}`}
            type="text"
            className="field"
            placeholder="e.g. Strong portfolio, moving to a technical interview"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={1000}
            disabled={isDisabled}
          />

          <div className="mt-3 flex flex-wrap gap-2">
            {ASSIGNABLE_STATUSES.filter((status) => status !== candidate.status).map((status) => {
              const StatusIcon = STATUS_ICONS[status];
              const isPrimary = status === 'ACCEPTED';
              const isDestructive = status === 'REJECTED';

              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => handleStatusClick(status)}
                  disabled={isDisabled || isUpdating}
                  className={cx(
                    'btn btn-sm border',
                    isPrimary
                      ? 'border-accent-700 bg-accent-700 text-white hover:bg-accent-800'
                      : isDestructive
                        ? 'border-ink-300 bg-white text-status-reject hover:border-status-reject/50 hover:bg-status-reject/5'
                        : 'border-ink-300 bg-white text-ink-800 hover:border-ink-400 hover:bg-ink-50',
                  )}
                  aria-label={`Set status to ${STATUS_LABELS[status]}`}
                >
                  {/* The target status is signalled by a coloured glyph, not by
                      filling the button. A coloured fill would read as "this is
                      the current status", which is the opposite of what the
                      button does. */}
                  {!isUpdating && (
                    <StatusIcon
                      size={13}
                      strokeWidth={2}
                      className={cx(
                        isPrimary ? 'text-white' : STATUS_GLYPH_COLOUR[status],
                      )}
                      aria-hidden="true"
                    />
                  )}
                  {STATUS_LABELS[status]}
                </button>
              );
            })}
          </div>
        </div>

        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isExpanded}
          className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-accent-700 transition-colors duration-200 hover:text-accent-800"
        >
          {isExpanded ? 'Hide history' : `Show history (${candidate.history.length})`}
        </button>
      </div>

      {/* Full audit trail — requirement 9. */}
      {isExpanded && (
        <div className="animate-fade-in border-t border-ink-200/80 bg-ink-100/40 px-5 py-5">
          <ol className="space-y-0">
            {candidate.history.map((entry, index) => {
              const isLast = index === candidate.history.length - 1;

              return (
                <li key={entry.id} className="flex gap-3.5">
                  <div className="flex flex-col items-center">
                    <span
                      className={cx(
                        'mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ring-4',
                        isLast ? 'bg-accent-600 ring-accent-100' : 'bg-ink-300 ring-ink-100',
                      )}
                      aria-hidden="true"
                    />
                    {!isLast && <span className="w-px flex-1 bg-ink-200" aria-hidden="true" />}
                  </div>

                  <div className={cx('min-w-0 flex-1', isLast ? 'pb-0' : 'pb-5')}>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={entry.status} withIcon={false} />
                      {isLast && (
                        <span className="text-[11px] font-bold uppercase tracking-wide text-accent-700">
                          Current
                        </span>
                      )}
                      {entry.changedByUserId === null && (
                        <span className="text-[11px] italic text-ink-400">by system</span>
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
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </li>
  );
}
