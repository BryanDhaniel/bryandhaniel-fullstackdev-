import { api } from './client';
import type {
  AuthResponse,
  Candidate,
  CreateJobInput,
  Job,
  JobFilters,
  MyApplication,
  OwnedJob,
  PaginatedJobs,
  Role,
  User,
} from './types';

/**
 * Thin wrappers over the REST endpoints.
 *
 * Components call these rather than axios directly, so endpoint paths and query
 * parameter shapes live in exactly one place.
 */

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput extends LoginInput {
  role: Role;
  companyName?: string;
}

export const authApi = {
  async login(input: LoginInput): Promise<AuthResponse> {
    const { data } = await api.post<AuthResponse>('/auth/login', input);
    return data;
  },

  async register(input: RegisterInput): Promise<AuthResponse> {
    const { data } = await api.post<AuthResponse>('/auth/register', input);
    return data;
  },

  /**
   * Recovers a session after a page reload, using the httpOnly refresh cookie.
   * Expected to fail with 401 when there is no valid cookie — that is a normal
   * "not logged in" outcome, not an error to surface.
   */
  async refresh(): Promise<AuthResponse> {
    const { data } = await api.post<AuthResponse>('/auth/refresh', {});
    return data;
  },

  async logout(): Promise<void> {
    await api.post('/auth/logout', {});
  },

  async me(): Promise<User> {
    const { data } = await api.get<User>('/auth/me');
    return data;
  },
};

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

export const jobsApi = {
  async list(filters: JobFilters = {}): Promise<PaginatedJobs> {
    // Strip empty values so a cleared filter does not send `?q=&jobType=`.
    const params: Record<string, string | number> = {};
    if (filters.page) params.page = filters.page;
    if (filters.limit) params.limit = filters.limit;
    if (filters.q?.trim()) params.q = filters.q.trim();
    if (filters.location?.trim()) params.location = filters.location.trim();
    if (filters.jobType) params.jobType = filters.jobType;

    const { data } = await api.get<PaginatedJobs>('/jobs', { params });
    return data;
  },

  async get(id: string): Promise<Job> {
    const { data } = await api.get<Job>(`/jobs/${id}`);
    return data;
  },

  /** The authenticated company's own postings, including inactive ones. */
  async mine(): Promise<OwnedJob[]> {
    const { data } = await api.get<OwnedJob[]>('/jobs/mine');
    return data;
  },

  async create(input: CreateJobInput): Promise<Job> {
    const { data } = await api.post<Job>('/jobs', input);
    return data;
  },

  async update(id: string, input: Partial<CreateJobInput>): Promise<Job> {
    const { data } = await api.patch<Job>(`/jobs/${id}`, input);
    return data;
  },
};

// ---------------------------------------------------------------------------
// Applications
// ---------------------------------------------------------------------------

export const applicationsApi = {
  /**
   * Apply to a job.
   *
   * A duplicate application returns 409, which callers should treat as a normal
   * outcome (show "you already applied") rather than an unexpected failure.
   */
  async apply(jobId: string, coverLetter?: string): Promise<void> {
    await api.post(`/jobs/${jobId}/applications`, { coverLetter: coverLetter || undefined });
  },

  async mine(includeHistory = false): Promise<MyApplication[]> {
    const { data } = await api.get<MyApplication[]>('/applications/me', {
      params: includeHistory ? { includeHistory: 'true' } : {},
    });
    return data;
  },

  async mineById(id: string): Promise<MyApplication> {
    const { data } = await api.get<MyApplication>(`/applications/me/${id}`);
    return data;
  },

  /** Candidates on a job the authenticated company owns. */
  async candidatesForJob(jobId: string, status?: string): Promise<Candidate[]> {
    const { data } = await api.get<Candidate[]>(`/jobs/${jobId}/applications`, {
      params: status ? { status } : {},
    });
    return data;
  },

  async updateStatus(
    applicationId: string,
    status: string,
    note?: string,
  ): Promise<{ id: string; status: string; previousStatus: string; changed: boolean }> {
    const { data } = await api.patch(`/applications/${applicationId}/status`, {
      status,
      note: note || undefined,
    });
    return data;
  },
};
