import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ApplicationStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class ApplyJobDto {
  @ApiPropertyOptional({
    example: 'I have five years of experience building Node.js services...',
    description: 'Optional cover letter.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(3000)
  coverLetter?: string;
}

/**
 * Body of a status change.
 *
 * Every status except APPLIED is accepted. APPLIED is rejected because it is the
 * system-assigned initial state: allowing a company to set it would let them
 * rewrite history ("this application was never reviewed") while the history
 * table would still show otherwise. See CONTEXT.md.
 */
export class UpdateApplicationStatusDto {
  @ApiProperty({
    enum: ApplicationStatus,
    example: ApplicationStatus.SHORTLISTED,
    description:
      'Any status other than APPLIED. Every status is reachable from every other status — ' +
      'including moving a REJECTED application back to REVIEWING.',
  })
  @IsEnum(ApplicationStatus, {
    message: `status must be one of the non-initial application statuses`,
  })
  status!: ApplicationStatus;

  @ApiPropertyOptional({
    example: 'Strong portfolio, scheduling a technical interview.',
    description: 'Optional note recorded in the application history.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

/** Query parameters for a company's candidate list for one job. */
export class QueryCandidatesDto {
  @ApiPropertyOptional({ enum: ApplicationStatus, description: 'Filter candidates by current status.' })
  @IsOptional()
  @IsEnum(ApplicationStatus)
  status?: ApplicationStatus;
}
