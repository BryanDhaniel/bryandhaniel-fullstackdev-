import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { JobType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { IsNonBlank } from '../../common/validators/is-non-blank.validator';

export class CreateJobDto {
  @ApiProperty({ example: 'Backend Engineer (Node.js)' })
  @IsString()
  // `@IsNotEmpty()` alone would accept "   ", which is then trimmed to "" and
  // stored as an empty title. See IsNonBlank.
  @IsNonBlank({ message: 'title must not be empty' })
  @MaxLength(150)
  title!: string;

  @ApiProperty({ example: 'We are looking for a backend engineer to join our platform team.' })
  @IsString()
  @IsNonBlank({ message: 'description must not be empty' })
  @MaxLength(5000)
  description!: string;

  @ApiProperty({ example: 'Jakarta, Indonesia' })
  @IsString()
  @IsNonBlank({ message: 'location must not be empty' })
  @MaxLength(150)
  location!: string;

  @ApiProperty({ enum: JobType, example: JobType.FULL_TIME })
  @IsEnum(JobType)
  jobType!: JobType;

  @ApiPropertyOptional({
    example: 8000000,
    description: 'Omit both salaryMin and salaryMax for an undisclosed ("Negotiable") salary.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  salaryMin?: number;

  @ApiPropertyOptional({ example: 12000000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  salaryMax?: number;

  @ApiPropertyOptional({ example: 'IDR', default: 'IDR' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  currency?: string;

  @ApiPropertyOptional({
    example: true,
    default: true,
    description: 'Inactive jobs are hidden from the public listing and cannot be applied to.',
  })
  @IsOptional()
  isActive?: boolean;
}

export class UpdateJobDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNonBlank({ message: 'title must not be empty' })
  @MaxLength(150)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNonBlank({ message: 'description must not be empty' })
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNonBlank({ message: 'location must not be empty' })
  @MaxLength(150)
  location?: string;

  @ApiPropertyOptional({ enum: JobType })
  @IsOptional()
  @IsEnum(JobType)
  jobType?: JobType;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  salaryMin?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  salaryMax?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10)
  currency?: string;

  @ApiPropertyOptional({ description: 'Toggle visibility. Closing a job does not affect existing applications.' })
  @IsOptional()
  isActive?: boolean;
}

export class QueryJobsDto {
  @ApiPropertyOptional({ example: 1, default: 1, description: 'Page number, 1-based.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 10, default: 10, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50, { message: 'limit must not exceed 50' })
  limit?: number = 10;

  @ApiPropertyOptional({
    example: 'engineer',
    description: 'Case-insensitive search across job title, company name and description.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ example: 'Jakarta', description: 'Case-insensitive partial match.' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  location?: string;

  @ApiPropertyOptional({ enum: JobType })
  @IsOptional()
  @IsEnum(JobType)
  jobType?: JobType;
}
