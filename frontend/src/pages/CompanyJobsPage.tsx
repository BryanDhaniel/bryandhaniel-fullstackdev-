import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { jobsApi } from '../api/endpoints';
import { getErrorMessage } from '../api/client';
import { Button } from '../components/Button';
import { Alert, EmptyState, ErrorState, LoadingState } from '../components/ui';
import { formatRelativeTime, formatSalary, jobTypeLabel } from '../lib/format';
import { useState } from 'react';

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

  if (isPending) return <LoadingState label="Loading your jobs…" />;
  if (isError) return <ErrorState message={getErrorMessage(error)} onRetry={() => refetch()} />;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">My Jobs</h1>
          <p className="mt-1 text-sm text-slate-500">
            {data.length === 0
              ? 'You have not posted any jobs yet.'
              : `${data.length} posting${data.length === 1 ? '' : 's'}.`}
          </p>
        </div>
        <Link to="/company/jobs/new" className="btn-primary">
          Post a job
        </Link>
      </div>

      {actionError && (
        <div className="mb-4">
          <Alert variant="error">{actionError}</Alert>
        </div>
      )}

      {data.length === 0 ? (
        <EmptyState
          title="No job postings yet"
          description="Create your first posting to start receiving applications."
          action={
            <Link to="/company/jobs/new" className="btn-primary">
              Post a job
            </Link>
          }
        />
      ) : (
        <ul className="space-y-3">
          {data.map((job) => (
            <li key={job.id} className="card p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold text-slate-900">{job.title}</h2>
                    <span
                      className={
                        job.isActive
                          ? 'badge bg-emerald-50 text-emerald-700 ring-emerald-200'
                          : 'badge bg-slate-100 text-slate-600 ring-slate-200'
                      }
                    >
                      {job.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
                    <span>{job.location}</span>
                    <span>{jobTypeLabel(job.jobType)}</span>
                    <span className="font-medium text-slate-900">
                      {formatSalary(job.salaryMin, job.salaryMax, job.currency)}
                    </span>
                  </div>

                  <p className="mt-2 text-xs text-slate-400">
                    Posted {formatRelativeTime(job.createdAt)}
                  </p>
                </div>

                <div className="flex flex-col items-stretch gap-2 sm:items-end">
                  <Link
                    to={`/company/jobs/${job.id}/candidates`}
                    className="btn-primary whitespace-nowrap"
                  >
                    Candidates
                    <span className="ml-1 rounded-full bg-white/20 px-1.5 text-xs font-bold">
                      {job.applicationCount}
                    </span>
                  </Link>
                  <Button
                    variant="secondary"
                    onClick={() => toggleMutation.mutate({ id: job.id, isActive: !job.isActive })}
                    isLoading={toggleMutation.isPending}
                  >
                    {job.isActive ? 'Close posting' : 'Reopen posting'}
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
