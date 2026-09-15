import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ApplicationStatus, JobType } from '@prisma/client';

/**
 * One entry in an application's status history.
 *
 * `changedByUserId` is null for the initial APPLIED entry, which is written by
 * the system at application time rather than by a user.
 */
export class ApplicationHistoryEntryDto {
  @ApiProperty({ example: '1a2b3c4d-5e6f-7081-92a3-b4c5d6e7f809' })
  id!: string;

  @ApiProperty({ enum: ApplicationStatus, example: ApplicationStatus.REVIEWING })
  status!: ApplicationStatus;

  @ApiPropertyOptional({ example: null, nullable: true, description: 'Null for the initial APPLIED entry.' })
  changedByUserId!: string | null;

  @ApiPropertyOptional({ example: 'Strong portfolio.', nullable: true })
  note!: string | null;

  @ApiProperty({ example: '2026-09-15T13:00:00.000Z' })
  createdAt!: Date;
}

/**
 * A job seeker's own application, with the job it targets.
 * Returned by `GET /applications/me`.
 */
export class MyApplicationResponseDto {
  @ApiProperty({ example: '9c8b7a65-4321-0fed-cba9-876543210fed' })
  id!: string;

  @ApiProperty({ enum: ApplicationStatus, example: ApplicationStatus.APPLIED })
  status!: ApplicationStatus;

  @ApiPropertyOptional({ nullable: true })
  coverLetter!: string | null;

  @ApiProperty({ example: '2026-09-15T13:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-09-15T13:05:00.000Z' })
  updatedAt!: Date;

  @ApiProperty({
    description: 'The job applied to. Includes `isActive` so the UI can mark withdrawn postings.',
    example: {
      id: '...',
      title: 'Backend Engineer (Node.js)',
      location: 'Jakarta, Indonesia',
      jobType: 'FULL_TIME',
      isActive: true,
      company: { id: '...', companyName: 'PT Teknologi Nusantara' },
    },
  })
  job!: {
    id: string;
    title: string;
    location: string;
    jobType: JobType;
    isActive: boolean;
    company: { id: string; companyName: string };
  };

  @ApiProperty({
    type: [ApplicationHistoryEntryDto],
    description:
      'Full status history in chronological order. Omitted from list responses unless ' +
      '`includeHistory=true` is passed, since it is unbounded.',
  })
  history?: ApplicationHistoryEntryDto[];
}

/**
 * A candidate as seen by the company that owns the job.
 * Returned by `GET /jobs/:jobId/applications`.
 *
 * Note this exposes the applicant's identity (email) — it is the company's own
 * applicant pool, and they need to contact candidates. It never exposes the
 * applicant's password hash or refresh tokens, which live on the same row.
 */
export class CandidateResponseDto {
  @ApiProperty({ example: '9c8b7a65-4321-0fed-cba9-876543210fed' })
  id!: string;

  @ApiProperty({ enum: ApplicationStatus, example: ApplicationStatus.REVIEWING })
  status!: ApplicationStatus;

  @ApiPropertyOptional({ nullable: true })
  coverLetter!: string | null;

  @ApiProperty({ example: '2026-09-15T13:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({
    example: { id: '...', email: 'seeker@demo.com' },
    description: 'The applicant. Email is included so the company can contact them.',
  })
  applicant!: { id: string; email: string };

  @ApiProperty({ type: [ApplicationHistoryEntryDto] })
  history!: ApplicationHistoryEntryDto[];
}
