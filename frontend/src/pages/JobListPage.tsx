import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { jobsApi } from '../api/endpoints';
import type { JobType } from '../api/types';
import { JOB_TYPE_LABELS } from '../api/types';
import { Button } from '../components/Button';
import { CompanyAvatar, EmptyState, ErrorState, LoadingState } from '../components/ui';
import { formatRelativeTime, formatSalary, jobTypeLabel } from '../lib/format';

const JOB_TYPES: JobType[] = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'FREELANCE'];

/**
 * Job listing (requirement 2).
 *
 * Filters are held in local state and applied on submit rather than on every
 * keystroke: each keystroke would otherwise be a request, and the search box is
 * server-side (`?q=`) over title, description, location and company name.
 */
export function JobListPage() {
  const [searchInput, setSearchInput] = useState('');
  const [locationInput, setLocationInput] = useState('');
  const [jobType, setJobType] = useState<JobType | ''>('');
  const [page, setPage] = useState(1);

  // The values actually sent to the API, committed from the inputs above.
  const [applied, setApplied] = useState({ q: '', location: '', jobType: '' as JobType | '' });

  // Any filter change must return to page 1, or the user can land on a page
  // that no longer exists for the narrower result set.
  useEffect(() => {
    setPage(1);
  }, [applied.q, applied.location, applied.jobType]);

  const { data, isPending, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['jobs', applied.q, applied.location, applied.jobType, page],
    queryFn: () =>
      jobsApi.list({
        q: applied.q,
        location: applied.location,
        jobType: applied.jobType,
        page,
        limit: 10,
      }),
  });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setApplied({ q: searchInput, location: locationInput, jobType });
  };

  const handleReset = () => {
    setSearchInput('');
    setLocationInput('');
    setJobType('');
    setApplied({ q: '', location: '', jobType: '' });
  };

  const hasFilters = Boolean(applied.q || applied.location || applied.jobType);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Find your next role</h1>
        <p className="mt-1 text-sm text-slate-500">
          {data ? `${data.meta.total} open position${data.meta.total === 1 ? '' : 's'}` : 'Loading open positions…'}
        </p>
      </div>

      {/* Filters */}
      <form onSubmit={handleSubmit} className="card mb-6 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <label className="field-label" htmlFor="q">
              Search
            </label>
            <input
              id="q"
              type="search"
              className="field"
              placeholder="Job title, company, keyword…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>

          <div>
            <label className="field-label" htmlFor="location">
              Location
            </label>
            <input
              id="location"
              type="text"
              className="field"
              placeholder="e.g. Jakarta"
              value={locationInput}
              onChange={(e) => setLocationInput(e.target.value)}
            />
          </div>

          <div>
            <label className="field-label" htmlFor="jobType">
              Job type
            </label>
            <select
              id="jobType"
              className="field"
              value={jobType}
              onChange={(e) => setJobType(e.target.value as JobType | '')}
            >
              <option value="">All types</option>
              {JOB_TYPES.map((type) => (
                <option key={type} value={type}>
                  {JOB_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button type="submit" isLoading={isFetching && !isPending}>
            Apply filters
          </Button>
          {hasFilters && (
            <Button type="button" variant="secondary" onClick={handleReset}>
              Reset
            </Button>
          )}
        </div>
      </form>

      {/* Results */}
      {isPending ? (
        <LoadingState label="Loading jobs…" />
      ) : isError ? (
        <ErrorState message={`Could not load jobs. ${(error as Error).message}`} onRetry={() => refetch()} />
      ) : data.data.length === 0 ? (
        <EmptyState
          title="No jobs match your filters"
          description="Try a broader search, or reset the filters to see every open position."
          action={hasFilters ? <Button onClick={handleReset}>Reset filters</Button> : undefined}
        />
      ) : (
        <>
          <ul className="space-y-3">
            {data.data.map((job) => (
              <li key={job.id}>
                <Link
                  to={`/jobs/${job.id}`}
                  className="card block p-4 transition hover:border-brand-300 hover:shadow-md sm:p-5"
                >
                  <div className="flex gap-4">
                    <CompanyAvatar name={job.company.companyName} />

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h2 className="truncate text-base font-semibold text-slate-900">
                            {job.title}
                          </h2>
                          <p className="mt-0.5 text-sm text-slate-600">
                            {job.company.companyName}
                          </p>
                        </div>

                        {job.hasApplied && (
                          <span className="badge shrink-0 bg-emerald-50 text-emerald-700 ring-emerald-200">
                            Applied
                          </span>
                        )}
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-slate-600">
                        <span className="inline-flex items-center gap-1.5">
                          <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                          </svg>
                          {job.location}
                        </span>

                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                          {jobTypeLabel(job.jobType)}
                        </span>

                        <span className="font-medium text-slate-900">
                          {formatSalary(job.salaryMin, job.salaryMax, job.currency)}
                        </span>
                      </div>

                      <p className="mt-3 line-clamp-2 text-sm text-slate-500">{job.description}</p>

                      <p className="mt-2 text-xs text-slate-400">
                        Posted {formatRelativeTime(job.createdAt)}
                      </p>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          {/* Pagination */}
          {data.meta.totalPages > 1 && (
            <nav
              className="mt-6 flex items-center justify-between gap-3"
              aria-label="Pagination"
            >
              <Button
                variant="secondary"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1 || isFetching}
              >
                Previous
              </Button>

              <span className="text-sm text-slate-600">
                Page {data.meta.page} of {data.meta.totalPages}
              </span>

              <Button
                variant="secondary"
                onClick={() => setPage((p) => p + 1)}
                disabled={!data.meta.hasNextPage || isFetching}
              >
                Next
              </Button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
