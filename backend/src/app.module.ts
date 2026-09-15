import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppConfigModule } from './config/app-config.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { JobsModule } from './jobs/jobs.module';
import { ApplicationsModule } from './applications/applications.module';

@Module({
  imports: [
    // A global rate limit as a baseline. Individual endpoints tighten it via
    // `@Throttle(...)` — see AuthController for login and registration, where
    // credential stuffing actually pays off.
    //
    // The values are overridable by environment so the end-to-end suite can
    // lift the ceiling: it shares one IP across the whole run and would
    // otherwise trip the register limit while testing unrelated behaviour.
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: Number(process.env.THROTTLE_TTL_MS ?? 60_000),
        limit: Number(process.env.THROTTLE_LIMIT ?? 100),
      },
    ]),

    AppConfigModule,
    PrismaModule,
    AuthModule,
    JobsModule,
    ApplicationsModule,
  ],
  providers: [
    // Registered as a provider rather than `app.useGlobalGuards(...)` so Nest
    // can inject ThrottlerStorage, and so every route is covered by default
    // instead of relying on each controller to remember.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
