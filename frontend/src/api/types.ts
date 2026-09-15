/**
 * API contract types.
 *
 * These mirror the backend DTOs. They are hand-maintained rather than generated,
 * which is a deliberate trade-off: a shared `packages/types` workspace would
 * guarantee they stay in sync but adds a build step and an install-order
 * dependency to a two-app repo. The surface is small and changes rarely, and
 * every field here is exercised by the backend's `apitest.js` and the Jest
 * end-to-end suite in `backend/test/`.
 *
 * The trade-off is recorded in README.md § 9, under "Two choices that are not
 * ADRs".
 */

export type Role = 'JOB_SEEKER' | 'COMPANY';

export type JobType = 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'INTERNSHIP' | 'FREELANCE';

export type ApplicationStatus =
  | 'APPLIED'
  | 'REVIEWING'
  | 'SHORTLISTED'
  | 'REJECTED'
  | 'ACCEPTED';

/** Labels for display. Kept next to the type so a new status cannot be added without one. */
export const JOB_TYPE_LABELS: Record<JobType, string> = {
  FULL_TIME: 'Full Time',
  PART_TIME: 'Part Time',
  CONTRACT: 'Contract',
  INTERNSHIP: 'Internship',
  FREELANCE: 'Freelance',
};

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  APPLIED: 'Applied',
  REVIEWING: 'Reviewing',
  SHORTLISTED: 'Shortlisted',
  REJECTED: 'Rejected',
  ACCEPTED: 'Accepted',
};

/**
 * The statuses a Company may set, in the order they are offered in the UI.
 * `APPLIED` is excluded because the backend rejects it — it is the
 * system-assigned initial state, not a choice. See CONTEXT.md.
 */
export const ASSIGNABLE_STATUSES: ApplicationStatus[] = [
  'REVIEWING',
  'SHORTLISTED',
  'REJECTED',
  'ACCEPTED',
];

/** Tailwind classes per status, so colour is defined once and stays consistent. */
export const STATUS_STYLES: Record<ApplicationStatus, string> = {
  APPLIED: 'bg-slate-100 text-slate-700 ring-slate-200',
  REVIEWING: 'bg-amber-50 text-amber-700 ring-amber-200',
  SHORTLISTED: 'bg-violet-50 text-violet-700 ring-violet-200',
  REJECTED: 'bg-rose-50 text-rose-700 ring-rose-200',
  ACCEPTED: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
};

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export interface CompanyProfile {
  companyName: string;
  description: string | null;
  website: string | null;
  logoUrl: string | null;
}

export interface User {
  id: string;
  email: string;
  role: Role;
  createdAt?: string;
  companyProfile?: CompanyProfile | null;
}

export interface AuthResponse {
  /** Held in memory only, never persisted. See docs/adr/0004. */
  accessToken: string;
  expiresIn: number;
  user: User;
  refreshTokenExpiresAt: string;
}

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

export interface JobCompany {
  id: string;
  companyName: string;
  logoUrl: string | null;
  website: string | null;
}

export interface Job {
  id: string;
  title: string;
  description: string;
  location: string;
  jobType: JobType;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string;
  /** Whether the *calling* job seeker has already applied. */
  hasApplied: boolean;
  createdAt: string;
  company: JobCompany;
}

/** A company's own job, which additionally carries visibility and applicant count. */
export interface OwnedJob extends Job {
  isActive: boolean;
  applicationCount: number;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
}

export interface PaginatedJobs {
  data: Job[];
  meta: PaginationMeta;
}

export interface JobFilters {
  page?: number;
  limit?: number;
  q?: string;
  location?: string;
  jobType?: JobType | '';
}

export interface CreateJobInput {
  title: string;
  description: string;
  location: string;
  jobType: JobType;
  salaryMin?: number;
  salaryMax?: number;
  currency?: string;
  isActive?: boolean;
}

// ---------------------------------------------------------------------------
// Applications
// ---------------------------------------------------------------------------

export interface ApplicationHistoryEntry {
  id: string;
  status: ApplicationStatus;
  /** Null for the initial APPLIED entry, which the system writes. */
  changedByUserId: string | null;
  note: string | null;
  createdAt: string;
}

export interface MyApplication {
  id: string;
  status: ApplicationStatus;
  coverLetter: string | null;
  createdAt: string;
  updatedAt: string;
  job: {
    id: string;
    title: string;
    location: string;
    jobType: JobType;
    isActive: boolean;
    company: { id: string; companyName: string };
  };
  /** Present only when `includeHistory=true` was requested. */
  history?: ApplicationHistoryEntry[];
}

export interface Candidate {
  id: string;
  status: ApplicationStatus;
  coverLetter: string | null;
  createdAt: string;
  /** The Candidate — the Job Seeker as seen by this Company. See CONTEXT.md. */
  candidate: { id: string; email: string };
  history: ApplicationHistoryEntry[];
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** The uniform error body produced by the backend's exception filter. */
export interface ApiErrorBody {
  statusCode: number;
  error: string;
  message: string | string[];
  path: string;
  timestamp: string;
}
