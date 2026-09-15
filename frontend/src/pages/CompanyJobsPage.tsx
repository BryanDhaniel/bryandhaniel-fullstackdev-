import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { jobsApi } from '../api/endpoints';
import { getErrorMessage } from '../api/client';
import { Button } from '../components/Button';
import { Alert, EmptyState, ErrorState, PageHeader, SkeletonList } from '../components/ui';
import { JobCard } from '../components/JobCard';
import { IconArrowRight, IconBriefcase } from '../components/icons';
import { cx } from '../lib/format';

/** A company's own postings, with an applicant count and a link to manage the
candidates who applied to each. */
export function CompanyJobsPage() {
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['company-jobs'],
    queryFn: () => jobsApi.mine(),
  });

  /**
   * Toggling visibility is how a company "closes" a posting. There is no delete:
   * existing applications must survive, and the brief does not ask for deletion.
   */
  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      jobsApi.update(id, { isActive }),
    onSuccess: () => {
      setActionError(null);
      void queryClient.invalidateQueries({ queryKey: ['company-jobs'] });
    },
    onError: (err) => setActionError(getErrorMessage(err)),
  });

  /**
   * The row whose close/reopen is in flight.
   *
   * `toggleMutation.isPending` is one flag for the whole mutation; applying it
   * to every row would spin all the buttons at once, implying every posting is
   * being changed. The mutation's `variables` name the actual target.
   */
  const togglingId = toggleMutation.isPending ? toggleMutation.variables?.id : undefined;

  if (isPending) {
    return (
      <div>
        <PageHeader title="My Jobs" description="Loading your postings…" />
        <SkeletonList count={3} withAvatar={false} />
      </div>
    );
  }

  if (isError) return <ErrorState message={getErrorMessage(error)} onRetry={() => refetch()} />;

  const activeCount = data.filter((job) => job.isActive).length;
  const totalApplicants = data.reduce((sum, job) => sum + job.applicationCount, 0);

  return (
    <div>
      <PageHeader
        title="My Jobs"
        description={
          data.length === 0
            ? 'You have not posted any jobs yet.'
            : 'Every posting you own. Closing a posting hides it from Job Seekers without touching the applications it already received.'
        }
        action={
          <Link to="/company/jobs/new" className="btn-primary">
            Post a job
          </Link>
        }
      />

      {actionError && (
        <div className="mb-5">
          <Alert variant="error">{actionError}</Alert>
        </div>
      )}

      {data.length === 0 ? (
        <EmptyState
          icon={<IconBriefcase size={24} />}
          title="No job postings yet"
          description="Create your first posting to start receiving applications. You can leave the salary blank to show it as Negotiable."
          action={
            <Link to="/company/jobs/new" className="btn-primary">
              Post a job
            </Link>
          }
        />
      ) : (
        <>
          {/* Stat strip. Three numbers that answer the questions a recruiter
              opens this page with, set in mono so they line up. */}
          <dl className="mb-6 grid grid-cols-3 divide-x divide-ink-200 overflow-hidden rounded-xl border border-ink-200 bg-white">
            <Stat label="Postings" value={data.length} />
            <Stat label="Active" value={activeCount} accent />
            <Stat label="Applicants" value={totalApplicants} />
          </dl>

          <ul className="space-y-3">
            {data.map((job) => (
              <li key={job.id}>
                <JobCard job={job} />

                {/* Row actions sit outside the card so they are not nested
                    interactive elements, and so the card stays a pure display
                    surface. */}
                <div className="mt-2 flex flex-wrap items-center gap-2 pl-1">
                  <Link
                    to={`/company/jobs/${job.id}/candidates`}
                    className={cx(
                      'btn-secondary btn-sm',
                      job.applicationCount > 0 && 'border-accent-300 text-accent-800',
                    )}
                  >
                    View candidates
                    <span
                      className={cx(
                        'tabular ml-0.5 rounded-full px-1.5 py-px text-[11px] font-bold',
                        job.applicationCount > 0
                          ? 'bg-accent-600 text-white'
                          : 'bg-ink-200 text-ink-600',
                      )}
                    >
                      {job.applicationCount}
                    </span>
                    <IconArrowRight aria-hidden="true" />
                  </Link>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleMutation.mutate({ id: job.id, isActive: !job.isActive })}
                    isLoading={togglingId === job.id}
                    disabled={togglingId !== undefined && togglingId !== job.id}
                  >
                    {job.isActive ? 'Close posting' : 'Reopen posting'}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** One figure in the stat strip. */
function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div className="px-4 py-4 sm:px-5">
      <dt className="text-[11px] font-bold uppercase tracking-wide text-ink-500">{label}</dt>
      <dd
        className={cx(
          'tabular mt-1.5 text-2xl font-extrabold tracking-tight',
          accent ? 'text-accent-700' : 'text-ink-900',
        )}
      >
        {value}
      </dd>
    </div>
  );
}
