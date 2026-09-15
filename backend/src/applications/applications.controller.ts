import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ApplicationsService } from './applications.service';
import { ApplyJobDto, QueryCandidatesDto, UpdateApplicationStatusDto } from './dto/application.dto';
import { CandidateResponseDto, MyApplicationResponseDto } from './dto/application-response.dto';

@ApiTags('Applications')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class ApplicationsController {
  constructor(private readonly applications: ApplicationsService) {}

  // -------------------------------------------------------------------------
  // Job Seeker
  // -------------------------------------------------------------------------

  @Post('jobs/:jobId/applications')
  @Roles(Role.JOB_SEEKER)
  @ApiParam({ name: 'jobId', format: 'uuid' })
  @ApiOperation({
    summary: 'Apply to a job (requirement 3)',
    description:
      'A Job Seeker may apply to a given job at most once (requirement 5). A second attempt ' +
      'returns 409. A Company account is refused by the role guard.',
  })
  @ApiResponse({ status: 201, description: 'Application created' })
  @ApiResponse({ status: 400, description: 'Job is inactive' })
  @ApiResponse({ status: 403, description: 'Caller is not a Job Seeker' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  @ApiResponse({ status: 409, description: 'Already applied to this job' })
  async apply(
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Body() dto: ApplyJobDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.applications.apply(jobId, dto, user);
  }

  @Get('applications/me')
  @Roles(Role.JOB_SEEKER)
  @ApiOperation({
    summary: 'My applications with their statuses (requirement 4)',
    description: 'Scoped to the authenticated seeker.',
  })
  @ApiQuery({
    name: 'includeHistory',
    required: false,
    type: Boolean,
    description: 'Include the full status history for each application. Off by default (unbounded).',
  })
  @ApiResponse({ status: 200, type: [MyApplicationResponseDto] })
  @ApiResponse({ status: 403, description: 'Caller is not a Job Seeker' })
  async findMine(
    @CurrentUser() user: AuthenticatedUser,
    @Query('includeHistory') includeHistory?: string,
  ): Promise<MyApplicationResponseDto[]> {
    return this.applications.findMine(user, includeHistory === 'true');
  }

  @Get('applications/me/:id')
  @Roles(Role.JOB_SEEKER)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary: 'One of my applications, including its full status history',
    description: 'Returns 404 for another seeker’s application rather than 403, to avoid confirming it exists.',
  })
  @ApiResponse({ status: 200, type: MyApplicationResponseDto })
  @ApiResponse({ status: 404, description: 'Application not found, or not owned by the caller' })
  async findMineById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MyApplicationResponseDto> {
    return this.applications.findMineById(id, user);
  }

  // -------------------------------------------------------------------------
  // Company
  // -------------------------------------------------------------------------

  @Get('jobs/:jobId/applications')
  @Roles(Role.COMPANY)
  @ApiParam({ name: 'jobId', format: 'uuid' })
  @ApiOperation({
    summary: 'Candidates who applied to one of my jobs (requirement 7)',
    description:
      'Only the company that owns the job may read this. Another company gets 404, so job IDs ' +
      'cannot be enumerated to discover which exist.',
  })
  @ApiQuery({ name: 'status', required: false, enum: undefined, description: 'Filter by current status.' })
  @ApiResponse({ status: 200, type: [CandidateResponseDto] })
  @ApiResponse({ status: 403, description: 'Caller is not a Company' })
  @ApiResponse({ status: 404, description: 'Job not found, or owned by another company' })
  async findCandidates(
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Query() query: QueryCandidatesDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CandidateResponseDto[]> {
    return this.applications.findCandidatesForJob(jobId, query, user);
  }

  @Patch('applications/:id/status')
  @Roles(Role.COMPANY)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary: 'Change a candidate’s status (requirement 8)',
    description:
      'Records the change in the application history (requirement 9). Any status may follow any ' +
      'other, including returning a REJECTED candidate to REVIEWING. APPLIED cannot be set manually.',
  })
  @ApiResponse({ status: 200, description: 'Status changed, history entry written' })
  @ApiResponse({ status: 400, description: 'Attempted to set the initial APPLIED status' })
  @ApiResponse({ status: 404, description: 'Application not found, or on another company’s job' })
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateApplicationStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.applications.updateStatus(id, dto, user);
  }
}
