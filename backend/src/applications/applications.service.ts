import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ApplicationStatus, Prisma, Role } from '@prisma/client';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { JobsService } from '../jobs/jobs.service';
import { PrismaService } from '../prisma/prisma.service';
import { ApplyJobDto, QueryCandidatesDto, UpdateApplicationStatusDto } from './dto/application.dto';
import { CandidateResponseDto, MyApplicationResponseDto } from './dto/application-response.dto';

const HISTORY_SELECT = {
  select: {
    id: true,
    status: true,
    changedByUserId: true,
    note: true,
    createdAt: true,
  },
  orderBy: { createdAt: 'asc' as const },
};

@Injectable()
export class ApplicationsService {
  private readonly logger = new Logger(ApplicationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobsService,
  ) {}

  // -------------------------------------------------------------------------
  // Job Seeker
  // -------------------------------------------------------------------------

  /**
   * Applies to a job. Requirement 3, with requirement 5's duplicate rule.
   *
   * The application row and its initial `APPLIED` history entry are written in
   * **one transaction**, so an application can never exist without history.
   * See docs/adr/0002.
   */
  async apply(jobId: string, dto: ApplyJobDto, user: AuthenticatedUser) {
    if (user.role !== Role.JOB_SEEKER) {
      // Defence in depth: the route is already role-guarded, but this method is
      // the one that would corrupt data if that guard were ever removed.
      throw new ForbiddenException('Only a Job Seeker can apply to a job');
    }

    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      select: { id: true, isActive: true, title: true },
    });

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    if (!job.isActive) {
      // Applying to a closed posting is a client bug or a stale page, not a
      // conflict — 400 tells the UI to refresh rather than to show "duplicate".
      throw new BadRequestException('This job is no longer accepting applications');
    }

    // Friendly pre-check. The unique index on (jobId, applicantUserId) is the
    // actual guarantee under concurrency — see docs/adr/0003.
    const existing = await this.prisma.application.findUnique({
      where: { jobId_applicantUserId: { jobId, applicantUserId: user.id } },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('You have already applied to this job');
    }

    try {
      const application = await this.prisma.$transaction(async (tx) => {
        const created = await tx.application.create({
          data: {
            jobId,
            applicantUserId: user.id,
            status: ApplicationStatus.APPLIED,
            coverLetter: dto.coverLetter?.trim() ?? null,
          },
        });

        await tx.applicationHistory.create({
          data: {
            applicationId: created.id,
            status: ApplicationStatus.APPLIED,
            // System-written: no user made this change.
            changedByUserId: null,
            note: 'Application submitted',
          },
        });

        return created;
      });

      this.logger.log(`Job seeker ${user.id} applied to job ${jobId}`);

      return {
        id: application.id,
        status: application.status,
        coverLetter: application.coverLetter,
        createdAt: application.createdAt,
      };
    } catch (error) {
      // Lost the race against a concurrent apply. The filter would also catch
      // this, but translating it here yields the same message as the pre-check.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('You have already applied to this job');
      }
      throw error;
    }
  }

  /**
   * The caller's own applications, newest first. Requirement 4.
   *
   * Scoped by `applicantUserId` from the token, so this cannot leak another
   * seeker's applications regardless of query parameters. See docs/adr/0005.
   */
  async findMine(
    user: AuthenticatedUser,
    includeHistory: boolean,
  ): Promise<MyApplicationResponseDto[]> {
    if (user.role !== Role.JOB_SEEKER) {
      throw new ForbiddenException('Only a Job Seeker has applications');
    }

    const applications = await this.prisma.application.findMany({
      where: { applicantUserId: user.id },
      include: {
        job: {
          select: {
            id: true,
            title: true,
            location: true,
            jobType: true,
            isActive: true,
            company: {
              select: {
                id: true,
                email: true,
                companyProfile: { select: { companyName: true } },
              },
            },
          },
        },
        ...(includeHistory ? { history: HISTORY_SELECT } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });

    return applications.map((application) => ({
      id: application.id,
      status: application.status,
      coverLetter: application.coverLetter,
      createdAt: application.createdAt,
      updatedAt: application.updatedAt,
      job: {
        id: application.job.id,
        title: application.job.title,
        location: application.job.location,
        jobType: application.job.jobType,
        isActive: application.job.isActive,
        company: {
          id: application.job.company.id,
          companyName:
            application.job.company.companyProfile?.companyName ?? application.job.company.email,
        },
      },
      ...(includeHistory ? { history: application.history ?? [] } : {}),
    }));
  }

  /** One of the caller's own applications, including its full history. */
  async findMineById(id: string, user: AuthenticatedUser): Promise<MyApplicationResponseDto> {
    const application = await this.prisma.application.findUnique({
      where: { id },
      include: {
        job: {
          select: {
            id: true,
            title: true,
            location: true,
            jobType: true,
            isActive: true,
            company: {
              select: {
                id: true,
                email: true,
                companyProfile: { select: { companyName: true } },
              },
            },
          },
        },
        history: HISTORY_SELECT,
      },
    });

    // 404 for someone else's application, not 403 — see docs/adr/0005.
    if (!application || application.applicantUserId !== user.id) {
      throw new NotFoundException('Application not found');
    }

    return {
      id: application.id,
      status: application.status,
      coverLetter: application.coverLetter,
      createdAt: application.createdAt,
      updatedAt: application.updatedAt,
      job: {
        id: application.job.id,
        title: application.job.title,
        location: application.job.location,
        jobType: application.job.jobType,
        isActive: application.job.isActive,
        company: {
          id: application.job.company.id,
          companyName:
            application.job.company.companyProfile?.companyName ?? application.job.company.email,
        },
      },
      history: application.history,
    };
  }

  // -------------------------------------------------------------------------
  // Company
  // -------------------------------------------------------------------------

  /**
   * Candidates who applied to one of the company's own jobs. Requirement 7.
   *
   * Ownership is asserted before any application data is read, so a company
   * cannot enumerate another company's candidate pool by guessing job IDs.
   */
  async findCandidatesForJob(
    jobId: string,
    query: QueryCandidatesDto,
    user: AuthenticatedUser,
  ): Promise<CandidateResponseDto[]> {
    await this.jobs.assertOwnership(jobId, user.id);

    const applications = await this.prisma.application.findMany({
      where: {
        jobId,
        ...(query.status ? { status: query.status } : {}),
      },
      include: {
        applicant: { select: { id: true, email: true } },
        history: HISTORY_SELECT,
      },
      // Newest first: a fresh application is the one needing attention.
      orderBy: { createdAt: 'desc' },
    });

    return applications.map((application) => ({
      id: application.id,
      status: application.status,
      coverLetter: application.coverLetter,
      createdAt: application.createdAt,
      applicant: application.applicant,
      history: application.history,
    }));
  }

  /**
   * Changes an application's status. Requirements 8 and 9.
   *
   * The current status and the new history entry are written in **one
   * transaction**. If a history write could fail independently, the audit trail
   * and the read model would silently disagree — and the audit trail is the
   * authoritative record. See docs/adr/0002.
   *
   * Any status may follow any other: there is no state machine, deliberately.
   * See CONTEXT.md.
   */
  async updateStatus(
    applicationId: string,
    dto: UpdateApplicationStatusDto,
    user: AuthenticatedUser,
  ) {
    if (dto.status === ApplicationStatus.APPLIED) {
      throw new BadRequestException(
        'APPLIED is the initial status assigned by the system and cannot be set manually',
      );
    }

    const application = await this.prisma.application.findUnique({
      where: { id: applicationId },
      select: {
        id: true,
        status: true,
        applicantUserId: true,
        job: { select: { id: true, title: true, companyUserId: true } },
      },
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    // Ownership before anything else: a company may only act on applications to
    // its own jobs. 404 (not 403) so the application's existence is not leaked.
    if (application.job.companyUserId !== user.id) {
      throw new NotFoundException('Application not found');
    }

    if (application.status === dto.status) {
      // A no-op status change. Returning early avoids polluting the history
      // with a duplicate entry, which would misrepresent that something
      // changed. Not an error: the client's intent is already satisfied.
      return {
        id: application.id,
        status: application.status,
        previousStatus: application.status,
        changed: false,
      };
    }

    const previousStatus = application.status;

    await this.prisma.$transaction(async (tx) => {
      await tx.application.update({
        where: { id: applicationId },
        data: { status: dto.status },
      });

      await tx.applicationHistory.create({
        data: {
          applicationId,
          status: dto.status,
          changedByUserId: user.id,
          note: dto.note?.trim() ?? null,
        },
      });
    });

    this.logger.log(
      `Application ${applicationId} status ${previousStatus} -> ${dto.status} by company ${user.id}`,
    );

    return {
      id: application.id,
      status: dto.status,
      previousStatus,
      changed: true,
    };
  }
}
