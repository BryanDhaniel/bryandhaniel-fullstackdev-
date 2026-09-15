import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { JobType } from '@prisma/client';

/**
 * A job as returned by the public listing and detail endpoints.
 *
 * `company` is flattened to just what a job seeker needs to decide whether to
 * apply, rather than nesting the whole `CompanyProfile` — the API contract is
 * about the job, not the company's profile page.
 */
export class JobResponseDto {
  @ApiProperty({ example: '8b1f2c3d-4e5f-6071-8293-a4b5c6d7e8f9' })
  id!: string;

  @ApiProperty({ example: 'Backend Engineer (Node.js)' })
  title!: string;

  @ApiProperty({ example: 'We are looking for a backend engineer...' })
  description!: string;

  @ApiProperty({ example: 'Jakarta, Indonesia' })
  location!: string;

  @ApiProperty({ enum: JobType, example: JobType.FULL_TIME })
  jobType!: JobType;

  @ApiPropertyOptional({ example: 8000000, nullable: true })
  salaryMin!: number | null;

  @ApiPropertyOptional({ example: 12000000, nullable: true })
  salaryMax!: number | null;

  @ApiProperty({ example: 'IDR' })
  currency!: string;

  @ApiProperty({
    example: false,
    description: 'Whether the *requesting* job seeker has already applied. Always false for a Company.',
  })
  hasApplied!: boolean;

  @ApiProperty({ example: '2026-09-15T13:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({
    example: { id: '...', companyName: 'PT Teknologi Nusantara', logoUrl: null, website: null },
  })
  company!: {
    id: string;
    companyName: string;
    logoUrl: string | null;
    website: string | null;
  };
}

export class PaginationMetaDto {
  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 10 })
  limit!: number;

  @ApiProperty({ example: 42, description: 'Total matching rows, ignoring pagination.' })
  total!: number;

  @ApiProperty({ example: 5 })
  totalPages!: number;

  @ApiProperty({ example: true })
  hasNextPage!: boolean;
}

/** Envelope for the paginated job listing. */
export class PaginatedJobsResponseDto {
  @ApiProperty({ type: [JobResponseDto] })
  data!: JobResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}
