import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AppConfigService } from './config/app-config.service';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const config = app.get(AppConfigService);

  // ---------------------------------------------------------------------------
  // Security headers
  // ---------------------------------------------------------------------------
  // The API returns only JSON, so the browser-oriented defaults are tightened
  // further: no content type sniffing, no framing, no referrer leakage.
  app.use(
    helmet({
      contentSecurityPolicy: false, // Swagger UI's inline scripts would be blocked.
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );

  // Required to read the httpOnly refresh cookie. See docs/adr/0004.
  app.use(cookieParser());

  // ---------------------------------------------------------------------------
  // CORS
  // ---------------------------------------------------------------------------
  // An explicit origin, never '*': credentialed requests (the refresh cookie)
  // are incompatible with a wildcard, and a wildcard would also let any site
  // drive authenticated requests against the API.
  app.enableCors({
    origin: config.corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------
  app.useGlobalPipes(
    new ValidationPipe({
      // Strip properties with no decorator, so a client cannot smuggle extra
      // fields into a DTO (e.g. `companyUserId`) and have them reach the service.
      whitelist: true,
      // Reject the request outright if unknown properties were sent, rather than
      // silently ignoring them. A client sending a typo'd field should find out.
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());

  app.setGlobalPrefix('api');

  // ---------------------------------------------------------------------------
  // API documentation
  // ---------------------------------------------------------------------------
  const swaggerConfig = new DocumentBuilder()
    .setTitle('IndoKerja.id — Job Application Management API')
    .setDescription(
      [
        'REST API for the IndoKerja.id job application platform.',
        '',
        '**Authentication.** `POST /api/auth/login` returns a short-lived access token in the',
        'response body and sets a long-lived refresh token as an httpOnly cookie. Send the',
        'access token as `Authorization: Bearer <token>`. When it expires (15 minutes), call',
        '`POST /api/auth/refresh` — the cookie authenticates the call and a new access token',
        'is returned. Because the refresh token is a cookie, Swagger UI works for everything',
        'except the refresh/logout flow unless you pass the token explicitly in the body.',
        '',
        '**Roles.** Registration is either `JOB_SEEKER` or `COMPANY`, and the role cannot be',
        'changed afterwards. Job Seekers apply to jobs; Companies create jobs and manage the',
        'resulting applications.',
      ].join('\n'),
    )
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Access token' },
      'bearer',
    )
    .addCookieAuth('refresh_token', { type: 'apiKey', in: 'cookie' })
    .addTag('Auth', 'Registration, login, session refresh and identity')
    .addTag('Jobs', 'Job listings and company-owned postings')
    .addTag('Applications', 'Applying to jobs, candidate tracking and status workflow')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true, // Keep the pasted token across reloads.
      tagsSorter: 'alpha',
    },
    customSiteTitle: 'IndoKerja.id API',
  });

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------
  app.enableShutdownHooks();

  await app.listen(config.port);

  logger.log(`API listening on http://localhost:${config.port}/api`);
  logger.log(`Swagger UI at     http://localhost:${config.port}/api/docs`);
  logger.log(`CORS origin       ${config.corsOrigin}`);
  logger.log(`Environment       ${config.nodeEnv}`);
}

bootstrap().catch((error) => {
  // A startup failure (bad config, unreachable database) must be loud: the
  // container should exit non-zero rather than serve a broken API.
  // eslint-disable-next-line no-console
  console.error('Fatal error during startup:', error);
  process.exit(1);
});
