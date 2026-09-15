import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { JobType, Prisma, Role } from '@prisma/client';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { CreateJobDto, QueryJobsDto, UpdateJobDto } from './dto/job.dto';
import { JobResponseDto, PaginatedJobsResponseDto } from './dto/job-response.dto';

/** Prisma `include` shared by every read path, so responses never diverge. */
const JOB_INCLUDE = {
  company: {
    select: {
      id: true,
      email: true,
      companyProfile: { select: { companyName: true, logoUrl: true, website: true } },
    },
  },
} satisfies Prisma.JobInclude;

type JobWithCompany = Prisma.JobGetPayload<{ include: typeof JOB_INCLUDE }>;

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // -------------------------------------------------------------------------
  // Public listing (Job Seeker view)
  // -------------------------------------------------------------------------

  /**
   * Paginated list of active jobs, with optional search and filters.
   *
   * Only `isActive` jobs are returned: an inactive job is invisible to job
   * seekers, and applying to one is refused. Inactive is a visibility state,
   * not a lifecycle stage — existing applications are unaffected.
   */
  async findAll(query: QueryJobsDto, user: AuthenticatedUser): Promise<PaginatedJobsResponseDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.JobWhereInput = {
      isActive: true,
      ...(query.jobType ? { jobType: query.jobType } : {}),
      ...(query.location
        ? { location: { contains: query.location, mode: 'insensitive' as const } }
        : {}),
      ...(query.q
        ? {
            OR: [
              { title: { contains: query.q, mode: 'insensitive' as const } },
              { description: { contains: query.q, mode: 'insensitive' as const } },
              { location: { contains: query.q, mode: 'insensitive' as const } },
              {
                company: {
                  companyProfile: {
                    companyName: { contains: query.q, mode: 'insensitive' as const },
                  },
                },
              },
            ],
          }
        : {}),
    };

    // Count and page in one round trip. The caller's own applications are
    // resolved concurrently for `hasApplied`.
    const [total, jobs, myApplicationJobIds] = await Promise.all([
      this.prisma.job.count({ where }),
      this.prisma.job.findMany({
        where,
        include: JOB_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.appliedJobIds(user, { isActive: true }),
    ]);

    const applied = new Set(myApplicationJobIds);

    return {
      data: jobs.map((job) => this.toResponse(job, applied.has(job.id))),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        hasNextPage: skip + jobs.length < total,
      },
    };
  }

  /**
   * A single job's detail.
   *
   * Visible to anyone (including Companies) when the job is active. An inactive
   * job is only visible to the company that owns it, so a seeker holding a
   * stale link gets a 404 rather than a preview of a withdrawn posting.
   */
  async findOne(id: string, user: AuthenticatedUser): Promise<JobResponseDto> {
    const job = await this.prisma.job.findUnique({ where: { id }, include: JOB_INCLUDE });

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    const isOwner = job.companyUserId === user.id;
    if (!job.isActive && !isOwner) {
      // 404 rather than 403: the caller has no business knowing this job exists.
      throw new NotFoundException('Job not found');
    }

    const appliedJobIds = await this.appliedJobIds(user, { id });

    return this.toResponse(job, appliedJobIds.includes(job.id));
  }

  // -------------------------------------------------------------------------
  // Company-owned operations
  // -------------------------------------------------------------------------

  /**
   * Jobs created by the authenticated company, newest first.
   *
   * Unpaginated by design — a company's own postings are a small, bounded set,
   * unlike the public listing.
   */
  async findMine(user: AuthenticatedUser) {
    const jobs = await this.prisma.job.findMany({
      where: { companyUserId: user.id },
      include: {
        ...JOB_INCLUDE,
        _count: { select: { applications: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return jobs.map((job) => ({
      ...this.toResponse(job, false),
      isActive: job.isActive,
      applicationCount: job._count.applications,
    }));
  }

  /**
   * Creates a job owned by the authenticated company.
   *
   * `companyUserId` comes from the authenticated principal and is never read
   * from the request body — otherwise a company could create a posting in
   * another company's name. See docs/adr/0005.
   */
  async create(dto: CreateJobDto, user: AuthenticatedUser): Promise<JobResponseDto> {
    this.assertSalaryRange(dto.salaryMin, dto.salaryMax);

    const job = await this.prisma.job.create({
      data: {
        companyUserId: user.id,
        title: dto.title.trim(),
        description: dto.description.trim(),
        location: dto.location.trim(),
        jobType: dto.jobType,
        salaryMin: dto.salaryMin ?? null,
        salaryMax: dto.salaryMax ?? null,
        currency: dto.currency ?? 'IDR',
        isActive: dto.isActive ?? true,
      },
      include: JOB_INCLUDE,
    });

    this.logger.log(`Company ${user.id} created job ${job.id}`);

    return this.toResponse(job, false);
  }

  /** Updates a job. Only the owning company may do so. */
  async update(id: string, dto: UpdateJobDto, user: AuthenticatedUser): Promise<JobResponseDto> {
    await this.assertOwnership(id, user.id);

    this.assertSalaryRange(dto.salaryMin, dto.salaryMax);

    const job = await this.prisma.job.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description.trim() } : {}),
        ...(dto.location !== undefined ? { location: dto.location.trim() } : {}),
        ...(dto.jobType !== undefined ? { jobType: dto.jobType } : {}),
        ...(dto.salaryMin !== undefined ? { salaryMin: dto.salaryMin } : {}),
        ...(dto.salaryMax !== undefined ? { salaryMax: dto.salaryMax } : {}),
        ...(dto.currency !== undefined ? { currency: dto.currency } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
      include: JOB_INCLUDE,
    });

    return this.toResponse(job, false);
  }

  // -------------------------------------------------------------------------
  // Ownership
  // -------------------------------------------------------------------------

  /**
   * Asserts that `companyUserId` owns `jobId`, or throws.
   *
   * Returns **404, not 403**, when the job exists but belongs to someone else:
   * a 403 would confirm that the job ID is real, letting a company enumerate
   * another company's postings. See docs/adr/0005.
   *
   * Callers use this as a guard before any company-scoped read or write.
   */
  async assertOwnership(jobId: string, companyUserId: string): Promise<void> {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      select: { companyUserId: true },
    });

    if (!job || job.companyUserId !== companyUserId) {
      throw new NotFoundException('Job not found');
    }
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /**
   * Job IDs the caller has applied to.
   *
   * Short-circuits for Companies: they cannot apply, so the answer is always
   * empty and the query is skipped.
   */
  private async appliedJobIds(
    user: AuthenticatedUser,
    jobFilter: Prisma.JobWhereInput,
  ): Promise<string[]> {
    if (user.role !== Role.JOB_SEEKER) return [];

    const rows = await this.prisma.application.findMany({
      where: { applicantUserId: user.id, job: jobFilter },
      select: { jobId: true },
    });

    return rows.map((row) => row.jobId);
  }

  /** A min greater than a max is a data-entry error, not a legitimate state. */
  private assertSalaryRange(min?: number | null, max?: number | null): void {
    if (min != null && max != null && min > max) {
      throw new BadRequestException('salaryMin must not be greater than salaryMax');
    }
  }

  private toResponse(job: JobWithCompany, hasApplied: boolean): JobResponseDto {
    return {
      id: job.id,
      title: job.title,
      description: job.description,
      location: job.location,
      jobType: job.jobType as JobType,
      salaryMin: job.salaryMin,
      salaryMax: job.salaryMax,
      currency: job.currency,
      hasApplied,
      createdAt: job.createdAt,
      company: {
        id: job.company.id,
        // A COMPANY user always has a profile in practice (created atomically
        // at registration), but the schema permits its absence, so fall back to
        // the email rather than emitting a null name.
        companyName: job.company.companyProfile?.companyName ?? job.company.email,
        logoUrl: job.company.companyProfile?.logoUrl ?? null,
        website: job.company.companyProfile?.website ?? null,
      },
    };
  }
}
