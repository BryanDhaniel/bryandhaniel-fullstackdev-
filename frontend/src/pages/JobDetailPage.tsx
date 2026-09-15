import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { applicationsApi, jobsApi } from '../api/endpoints';
import { getErrorStatus, getErrorMessage } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/Button';
import { Alert, CompanyAvatar, ErrorState, LoadingState } from '../components/ui';
import { formatRelativeTime, formatSalary, jobTypeLabel } from '../lib/format';

export function JobDetailPage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [coverLetter, setCoverLetter] = useState('');
  const [showApplyForm, setShowApplyForm] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const { data: job, isPending, isError, error, refetch } = useQuery({
    queryKey: ['job', id],
    queryFn: () => jobsApi.get(id),
    enabled: Boolean(id),
  });

  const applyMutation = useMutation({
    mutationFn: () => applicationsApi.apply(id, coverLetter),
    onSuccess: () => {
      setFeedback({ type: 'success', text: 'Your application has been submitted.' });
      setShowApplyForm(false);
      setCoverLetter('');
      // Refresh so `hasApplied` flips and the Apply button disappears.
      void queryClient.invalidateQueries({ queryKey: ['job', id] });
      void queryClient.invalidateQueries({ queryKey: ['my-applications'] });
    },
    onError: (err) => {
      // 409 is the duplicate-application rule (requirement 5). It is a normal
      // outcome the user may reach by having applied in another tab, so it is
      // worth a specific message rather than a generic failure.
      if (getErrorStatus(err) === 409) {
        setFeedback({ type: 'error', text: 'You have already applied to this job.' });
        void queryClient.invalidateQueries({ queryKey: ['job', id] });
      } else {
        setFeedback({ type: 'error', text: getErrorMessage(err) });
      }
    },
  });

  if (isPending) return <LoadingState label="Loading job…" />;
  if (isError) {
    return (
      <ErrorState
        message={
          getErrorStatus(error) === 404
            ? 'This job does not exist or is no longer available.'
            : getErrorMessage(error)
        }
        onRetry={() => refetch()}
      />
    );
  }

  const isSeeker = user?.role === 'JOB_SEEKER';
  const canApply = isSeeker && !job.hasApplied;
  // A company's own view of a job it owns would show an Apply button it can
  // never use, so the whole apply panel is suppressed for companies.
  const showSeekerActions = isSeeker;

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        to="/jobs"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
        </svg>
        Back to jobs
      </Link>

      <div className="card p-5 sm:p-6">
        <div className="flex gap-4">
          <CompanyAvatar name={job.company.companyName} size="lg" />
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">{job.title}</h1>
            <p className="mt-1 text-sm text-slate-600">{job.company.companyName}</p>
            {job.company.website && (
              <a
                href={job.company.website}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-block text-xs font-medium text-brand-600 hover:text-brand-700"
              >
                {job.company.website.replace(/^https?:\/\//, '')}
              </a>
            )}
          </div>
        </div>

        {/* Key facts, in a grid so they are scannable rather than a paragraph. */}
        <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-slate-200 pt-5 sm:grid-cols-4">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Location</dt>
            <dd className="mt-1 text-sm font-medium text-slate-900">{job.location}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Job type</dt>
            <dd className="mt-1 text-sm font-medium text-slate-900">{jobTypeLabel(job.jobType)}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Salary</dt>
            <dd className="mt-1 text-sm font-medium text-slate-900">
              {formatSalary(job.salaryMin, job.salaryMax, job.currency)}
            </dd>
          </div>
        </dl>

        <div className="mt-6 border-t border-slate-200 pt-5">
          <h2 className="text-sm font-semibold text-slate-900">Job description</h2>
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-700">
            {job.description}
          </p>
        </div>

        <p className="mt-5 text-xs text-slate-400">
          Posted {formatRelativeTime(job.createdAt)}
        </p>
      </div>

      {/* Apply panel */}
      {showSeekerActions && (
        <div className="card mt-4 p-5 sm:p-6">
          {feedback && (
            <div className="mb-4">
              <Alert variant={feedback.type}>{feedback.text}</Alert>
            </div>
          )}

          {job.hasApplied ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-slate-900">You have applied to this job</p>
                <p className="mt-0.5 text-sm text-slate-500">
                  You can track its status under My Applications.
                </p>
              </div>
              <Link to="/applications" className="btn-secondary">
                View my applications
              </Link>
            </div>
          ) : showApplyForm ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setFeedback(null);
                applyMutation.mutate();
              }}
            >
              <h2 className="text-sm font-semibold text-slate-900">Apply for this job</h2>
              <div className="mt-3">
                <label className="field-label" htmlFor="coverLetter">
                  Cover letter <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <textarea
                  id="coverLetter"
                  className="field min-h-[140px] resize-y"
                  placeholder="Tell the company why you are a good fit…"
                  value={coverLetter}
                  onChange={(e) => setCoverLetter(e.target.value)}
                  maxLength={3000}
                />
                <p className="mt-1.5 text-xs text-slate-500">
                  {coverLetter.length}/3000 characters
                </p>
              </div>

              <div className="mt-4 flex gap-2">
                <Button type="submit" isLoading={applyMutation.isPending}>
                  Submit application
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setShowApplyForm(false);
                    setCoverLetter('');
                  }}
                  disabled={applyMutation.isPending}
                >
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-slate-900">Interested in this role?</p>
                <p className="mt-0.5 text-sm text-slate-500">
                  You can apply once — applications cannot be withdrawn.
                </p>
              </div>
              <Button onClick={() => setShowApplyForm(true)} disabled={!canApply}>
                Apply now
              </Button>
            </div>
          )}
        </div>
      )}

      {/* A company viewing a job it does not own gets no actions, only context. */}
      {!showSeekerActions && (
        <div className="card mt-4 p-5">
          <p className="text-sm text-slate-500">
            You are signed in as a Company. Only Job Seeker accounts can apply to jobs.
          </p>
        </div>
      )}
    </div>
  );
}
