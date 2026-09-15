import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CreateJobDto, QueryJobsDto, UpdateJobDto } from './dto/job.dto';
import { JobResponseDto, PaginatedJobsResponseDto } from './dto/job-response.dto';
import { JobsService } from './jobs.service';

@ApiTags('Jobs')
@ApiBearerAuth()
@Controller('jobs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  // -------------------------------------------------------------------------
  // Job Seeker reads
  // -------------------------------------------------------------------------

  @Get()
  @Roles(Role.JOB_SEEKER, Role.COMPANY)
  @ApiOperation({
    summary: 'List active jobs (paginated, searchable)',
    description: 'Returns only active jobs. Each item carries `hasApplied` for the calling job seeker.',
  })
  @ApiResponse({ status: 200, type: PaginatedJobsResponseDto })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  async findAll(
    @Query() query: QueryJobsDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PaginatedJobsResponseDto> {
    return this.jobs.findAll(query, user);
  }

  /**
   * Declared before `:id` would matter here since the paths differ, but note
   * the ordering convention: static segments must precede parameters in Nest.
   */
  @Get('mine')
  @Roles(Role.COMPANY)
  @ApiOperation({
    summary: 'Jobs created by the authenticated company',
    description: 'Includes inactive jobs and an application count per job.',
  })
  @ApiResponse({ status: 200, description: 'Array of the company’s own jobs' })
  @ApiResponse({ status: 403, description: 'Caller is not a Company' })
  async findMine(@CurrentUser() user: AuthenticatedUser) {
    return this.jobs.findMine(user);
  }

  @Get(':id')
  @Roles(Role.JOB_SEEKER, Role.COMPANY)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary: 'Job detail',
    description:
      'An inactive job is visible only to the company that owns it; everyone else gets 404.',
  })
  @ApiResponse({ status: 200, type: JobResponseDto })
  @ApiResponse({ status: 404, description: 'Job not found (or not visible to the caller)' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<JobResponseDto> {
    return this.jobs.findOne(id, user);
  }

  // -------------------------------------------------------------------------
  // Company writes
  // -------------------------------------------------------------------------

  @Post()
  @Roles(Role.COMPANY)
  @ApiOperation({ summary: 'Create a job posting' })
  @ApiResponse({ status: 201, type: JobResponseDto })
  @ApiResponse({ status: 400, description: 'Validation failed, or salaryMin > salaryMax' })
  @ApiResponse({ status: 403, description: 'Caller is not a Company' })
  async create(
    @Body() dto: CreateJobDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<JobResponseDto> {
    return this.jobs.create(dto, user);
  }

  @Patch(':id')
  @Roles(Role.COMPANY)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary: 'Update a job posting',
    description: 'Only the owning company may update. Editing does not affect existing applications.',
  })
  @ApiResponse({ status: 200, type: JobResponseDto })
  @ApiResponse({ status: 404, description: 'Job not found, or owned by another company' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateJobDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<JobResponseDto> {
    return this.jobs.update(id, dto, user);
  }
}
