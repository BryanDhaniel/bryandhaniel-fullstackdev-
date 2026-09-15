import { Module } from '@nestjs/common';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

@Module({
  controllers: [JobsController],
  providers: [JobsService],
  // ApplicationsModule depends on the ownership check, which lives here.
  exports: [JobsService],
})
export class JobsModule {}
