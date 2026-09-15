import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { jobsApi } from '../api/endpoints';
import { getErrorMessage } from '../api/client';
import type { JobType, PaginatedJobs } from '../api/types';
import { JOB_TYPE_LABELS } from '../api/types';
import { Button } from '../components/Button';
import { EmptyState, ErrorState, SkeletonList } from '../components/ui';
import { JobCard } from '../components/JobCard';
import {
  IconBriefcase,
  IconCaretLeft,
  IconCaretRight,
  IconSearch,
  IconSliders,
  IconX,
} from '../components/icons';
import { cx } from '../lib/format';

const JOB_TYPES: JobType[] = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'FREELANCE'];

/**
 * Job listing (requirement 2).
 *
 * Filters live in the URL rather than in component state, so a filtered search
 * is a shareable link and the back button undoes a filter change. The inputs
 * themselves are local and only committed to the URL on submit: filtering on
 * every keystroke would fire a request per character, and the search box is
 * server-side (`?q=`) across title, description, location and company name.
 */
export function JobListPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const q = searchParams.get('q') ?? '';
  const location = searchParams.get('location') ?? '';
  const jobType = (searchParams.get('jobType') ?? '') as JobType | '';
  const page = Number(searchParams.get('page') ?? 1) || 1;

  // Mirrors of the committed values, so the user can type without the URL
  // updating per keystroke.
  const [searchInput, setSearchInput] = useState(q);
  const [locationInput, setLocationInput] = useState(location);

  // Keep the inputs in step when the URL changes from outside the form
  // (back button, a Reset click, a shared link).
  useEffect(() => setSearchInput(q), [q]);
  useEffect(() => setLocationInput(location), [location]);

  const { data, isPending, isError, error, refetch, isFetching } = useQuery<PaginatedJobs>({
    queryKey: ['jobs', q, location, jobType, page],
    queryFn: () => jobsApi.list({ q, location, jobType, page, limit: 10 }),
    // Keeps the current page on screen while the next one loads, so the list
    // does not collapse to a skeleton on every pagination click.
    placeholderData: (previous) => previous,
  });

  const hasFilters = Boolean(q || location || jobType);

  /** Writes a new filter set to the URL, always returning to page 1. */
  const commit = (next: { q?: string; location?: string; jobType?: JobType | '' }) => {
    const params = new URLSearchParams();
    const nextQ = next.q ?? q;
    const nextLocation = next.location ?? location;
    const nextType = next.jobType ?? jobType;

    if (nextQ.trim()) params.set('q', nextQ.trim());
    if (nextLocation.trim()) params.set('location', nextLocation.trim());
    if (nextType) params.set('jobType', nextType);

    setSearchParams(params, { replace: false });
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    commit({ q: searchInput, location: locationInput });
  };

  const handleReset = () => {
    setSearchInput('');
    setLocationInput('');
    setSearchParams(new URLSearchParams(), { replace: false });
  };

  const goToPage = (next: number) => {
    const params = new URLSearchParams(searchParams);
    if (next <= 1) params.delete('page');
    else params.set('page', String(next));
    setSearchParams(params);
  };

  return (
    <div>
      {/* Header. No eyebrow: the page has one job and the headline says it. */}
      <div className="mb-8">
        <h1 className="text-display-sm font-extrabold text-ink-900">
          Find your next role
        </h1>
        <p className="mt-2 text-sm text-ink-600">
          {data ? (
            <>
              <span className="tabular font-semibold text-ink-900">{data.meta.total}</span>{' '}
              open position{data.meta.total === 1 ? '' : 's'}
              {hasFilters && ' matching your filters'}
            </>
          ) : (
            'Loading open positions…'
          )}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[17rem_1fr] lg:items-start">
        {/* Filter rail. Sticky on desktop so the filters stay reachable while
            scrolling a long result list; a plain block on mobile, where a
            sticky panel would eat the viewport. */}
        <form
          onSubmit={handleSubmit}
          className="surface-lift p-4 lg:sticky lg:top-24"
          aria-label="Filter jobs"
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-bold text-ink-900">
              <IconSliders className="text-ink-400" aria-hidden="true" />
              Filters
            </h2>
            {hasFilters && (
              <button
                type="button"
                onClick={handleReset}
                className="flex items-center gap-1 text-xs font-semibold text-ink-500 transition-colors duration-200 hover:text-ink-900"
              >
                <IconX aria-hidden="true" />
                Clear
              </button>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <label className="field-label" htmlFor="q">
                Search
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400">
                  <IconSearch aria-hidden="true" />
                </span>
                <input
                  id="q"
                  type="search"
                  className="field pl-9"
                  placeholder="Title, company, keyword"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                />
              </div>
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

            {/* Job type as a pill group rather than a <select>. Five options
                that the user can see at once beat a dropdown that hides them,
                and each pill is large enough to tap. */}
            <div>
              <span className="field-label">Job type</span>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Job type">
                <button
                  type="button"
                  onClick={() => commit({ jobType: '' })}
                  aria-pressed={jobType === ''}
                  className={cx('chip', jobType === '' && 'chip-active')}
                >
                  Any
                </button>
                {JOB_TYPES.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => commit({ jobType: type })}
                    aria-pressed={jobType === type}
                    className={cx('chip', jobType === type && 'chip-active')}
                  >
                    {JOB_TYPE_LABELS[type]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <Button type="submit" className="mt-5 w-full">
            Apply filters
          </Button>
        </form>

        {/* Results */}
        <div className="min-w-0">
          {isPending ? (
            <SkeletonList count={4} />
          ) : isError ? (
            <ErrorState message={getErrorMessage(error)} onRetry={() => refetch()} />
          ) : data.data.length === 0 ? (
            <EmptyState
              icon={<IconBriefcase size={24} />}
              title="No jobs match your filters"
              description="Try a broader search, or clear the filters to see every open position."
              action={
                hasFilters ? (
                  <Button onClick={handleReset}>Clear filters</Button>
                ) : undefined
              }
            />
          ) : (
            <>
              <ul
                className={cx(
                  'space-y-3 transition-opacity duration-300',
                  isFetching && 'pointer-events-none opacity-50',
                )}
                aria-busy={isFetching}
              >
                {data.data.map((job) => (
                  <li key={job.id}>
                    <Link
                      to={`/jobs/${job.id}`}
                      className="block rounded-xl focus-visible:outline-none"
                    >
                      <JobCard job={job} />
                    </Link>
                  </li>
                ))}
              </ul>

              {data.meta.totalPages > 1 && (
                <nav
                  className="mt-6 flex items-center justify-between gap-3"
                  aria-label="Pagination"
                >
                  <Button
                    variant="secondary"
                    onClick={() => goToPage(page - 1)}
                    disabled={page === 1 || isFetching}
                  >
                    <IconCaretLeft aria-hidden="true" />
                    Previous
                  </Button>

                  <span className="tabular text-sm font-medium text-ink-600">
                    Page {data.meta.page} of {data.meta.totalPages}
                  </span>

                  <Button
                    variant="secondary"
                    onClick={() => goToPage(page + 1)}
                    disabled={!data.meta.hasNextPage || isFetching}
                  >
                    Next
                    <IconCaretRight aria-hidden="true" />
                  </Button>
                </nav>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
