import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { applicationsApi, jobsApi } from '../api/endpoints';
import { getErrorStatus, getErrorMessage } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/Button';
import {
  Alert,
  BackLink,
  CompanyAvatar,
  ErrorState,
  Skeleton,
} from '../components/ui';
import {
  IconArrowUpRight,
  IconBriefcase,
  IconCheck,
  IconClock,
  IconCoins,
  IconMapPin,
  IconPaperPlane,
} from '../components/icons';
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

  if (isPending) return <JobDetailSkeleton />;

  if (isError) {
    return (
      <div className="mx-auto max-w-2xl py-8">
        <ErrorState
          message={
            getErrorStatus(error) === 404
              ? 'This job does not exist or is no longer available.'
              : getErrorMessage(error)
          }
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  const isSeeker = user?.role === 'JOB_SEEKER';
  const canApply = isSeeker && !job.hasApplied;
  // A company's own view of a job it owns would show an Apply button it can
  // never use, so the whole apply panel is suppressed for companies.
  const showSeekerActions = isSeeker;

  return (
    <div className="mx-auto max-w-6xl">
      <BackLink to="/jobs">Back to jobs</BackLink>

      {/* Two columns on desktop: the posting is the subject, the action panel is
          the sidebar. On mobile the sidebar moves above the description, where
          it is reachable without scrolling past a long description. */}
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem] lg:items-start">
        <div className="min-w-0">
          <article className="surface-lift overflow-hidden">
            {/* Header */}
            <header className="border-b border-ink-200/80 p-6 sm:p-8">
              <div className="flex items-start gap-4">
                <CompanyAvatar name={job.company.companyName} size="lg" />

                <div className="min-w-0 flex-1">
                  <h1 className="text-display-sm font-extrabold leading-tight text-ink-900">
                    {job.title}
                  </h1>
                  <p className="mt-2 text-sm font-semibold text-ink-700">
                    {job.company.companyName}
                  </p>
                  {job.company.website && (
                    <a
                      href={job.company.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-accent-700 transition-colors duration-200 hover:text-accent-800"
                    >
                      {job.company.website.replace(/^https?:\/\//, '')}
                      <IconArrowUpRight aria-hidden="true" />
                    </a>
                  )}
                </div>
              </div>

              {/* Key facts, in a grid so they are scannable rather than a
                  paragraph. */}
              <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
                <Fact icon={<IconMapPin />} label="Location" value={job.location} />
                <Fact icon={<IconBriefcase />} label="Job type" value={jobTypeLabel(job.jobType)} />
                <Fact
                  icon={<IconCoins />}
                  label="Salary"
                  value={formatSalary(job.salaryMin, job.salaryMax, job.currency)}
                  muted={job.salaryMin === null && job.salaryMax === null}
                  className="col-span-2 sm:col-span-1"
                />
              </dl>
            </header>

            {/* Description */}
            <div className="p-6 sm:p-8">
              <h2 className="text-sm font-bold uppercase tracking-wide text-ink-500">
                Job description
              </h2>
              <p className="mt-4 max-w-[68ch] whitespace-pre-line text-[15px] leading-relaxed text-ink-700">
                {job.description}
              </p>

              <p className="mt-8 flex items-center gap-1.5 border-t border-ink-200/80 pt-5 text-xs text-ink-400">
                <IconClock aria-hidden="true" />
                Posted {formatRelativeTime(job.createdAt)}
              </p>
            </div>
          </article>
        </div>

        {/* Action sidebar */}
        <aside className="lg:sticky lg:top-24">
          {showSeekerActions ? (
            <div className="surface-lift p-5">
              {feedback && (
                <div className="mb-4">
                  <Alert variant={feedback.type}>{feedback.text}</Alert>
                </div>
              )}

              {job.hasApplied ? (
                <div>
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-status-accept/10 text-status-accept">
                    <IconCheck size={22} aria-hidden="true" />
                  </span>
                  <p className="mt-3.5 text-sm font-bold text-ink-900">
                    You have applied to this job
                  </p>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-600">
                    Track its status and the full history under My Applications.
                  </p>
                  <Link to="/applications" className="btn-secondary mt-4 w-full">
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
                  <h2 className="text-sm font-bold text-ink-900">Apply for this job</h2>
                  <div className="mt-3">
                    <label className="field-label" htmlFor="coverLetter">
                      Cover letter
                      <span className="ml-1.5 font-normal text-ink-400">Optional</span>
                    </label>
                    <textarea
                      id="coverLetter"
                      className="field min-h-[160px] resize-y"
                      placeholder="Tell the company why you are a good fit…"
                      value={coverLetter}
                      onChange={(e) => setCoverLetter(e.target.value)}
                      maxLength={3000}
                    />
                    <p className="tabular mt-1.5 text-xs text-ink-500">
                      {coverLetter.length}/3000 characters
                    </p>
                  </div>

                  <div className="mt-4 space-y-2">
                    <Button
                      type="submit"
                      isLoading={applyMutation.isPending}
                      className="w-full"
                      trailingIcon={<IconPaperPlane size={12} />}
                    >
                      Submit application
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full"
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
                <div>
                  <h2 className="text-sm font-bold text-ink-900">Interested in this role?</h2>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-600">
                    You can apply once. Applications cannot be withdrawn.
                  </p>
                  <Button
                    onClick={() => setShowApplyForm(true)}
                    disabled={!canApply}
                    className="mt-4 w-full"
                    trailingIcon={<IconPaperPlane size={12} />}
                  >
                    Apply now
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="surface p-5">
              <p className="text-sm leading-relaxed text-ink-600">
                You are signed in as a Company. Only Job Seeker accounts can apply to jobs.
              </p>
            </div>
          )}

          {/* A short honest note about what happens next. This is the panel a
              nervous applicant actually wants to read. */}
          {showSeekerActions && !job.hasApplied && (
            <div className="mt-4 rounded-xl border border-ink-200 bg-ink-100/50 p-5">
              <h3 className="text-xs font-bold uppercase tracking-wide text-ink-500">
                What happens next
              </h3>
              <p className="mt-2.5 text-xs leading-relaxed text-ink-600">
                The company moves your application through Applied, Reviewing, Shortlisted,
                and then Accepted or Rejected. Every change is recorded, and you can watch it
                from My Applications.
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

/** One fact in the header grid: an icon, a label, and the value. */
function Fact({
  icon,
  label,
  value,
  muted,
  className,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  muted?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-500">
        <span className="text-ink-400" aria-hidden="true">
          {icon}
        </span>
        {label}
      </dt>
      <dd
        className={
          'tabular mt-1.5 text-sm font-semibold ' + (muted ? 'text-ink-500' : 'text-ink-900')
        }
      >
        {value}
      </dd>
    </div>
  );
}

/** Shape-matched placeholder, so the page does not jump when data arrives. */
function JobDetailSkeleton() {
  return (
    <div className="mx-auto max-w-6xl">
      <Skeleton className="mb-5 h-4 w-28" />
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem] lg:items-start">
        <div className="surface-lift overflow-hidden">
          <div className="border-b border-ink-200/80 p-6 sm:p-8">
            <div className="flex items-start gap-4">
              <Skeleton className="h-16 w-16 rounded-xl" />
              <div className="flex-1 space-y-3">
                <Skeleton className="h-6 w-3/5" />
                <Skeleton className="h-4 w-2/5" />
                <Skeleton className="h-3 w-1/4" />
              </div>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-6 sm:grid-cols-3">
              {Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-4 w-28" />
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-3 p-6 sm:p-8">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
        <div className="surface-lift space-y-3 p-5">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}
