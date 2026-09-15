import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';

/** Uniform error body. Every failure the API returns has this shape. */
interface ErrorBody {
  statusCode: number;
  error: string;
  message: string | string[];
  path: string;
  timestamp: string;
}

/**
 * Converts every escaping exception into one consistent JSON shape, and
 * translates Prisma's error codes into meaningful HTTP statuses.
 *
 * Without this, a unique-constraint violation surfaces as a bare `500` and the
 * client cannot tell a duplicate application apart from a crash. Since
 * requirement 5 (no duplicate applications) is enforced by the database — see
 * docs/adr/0003 — that translation is load-bearing, not cosmetic.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, message, error } = this.resolve(exception);

    const body: ErrorBody = {
      statusCode: status,
      error,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json(body);
  }

  private resolve(exception: unknown): {
    status: number;
    message: string | string[];
    error: string;
  } {
    // Nest's own exceptions (validation, guards, controllers) already carry the
    // right status and a usable message.
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();

      if (typeof payload === 'string') {
        return { status, message: payload, error: exception.name };
      }

      const obj = payload as Record<string, unknown>;
      return {
        status,
        // ValidationPipe puts an array here; everything else a string.
        message: (obj.message as string | string[]) ?? exception.message,
        error: (obj.error as string) ?? exception.name,
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.resolvePrismaError(exception);
    }

    // Unknown/unexpected. Never leak internals to the client.
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'An unexpected error occurred. Please try again later.',
      error: 'Internal Server Error',
    };
  }

  private resolvePrismaError(exception: Prisma.PrismaClientKnownRequestError): {
    status: number;
    message: string | string[];
    error: string;
  } {
    switch (exception.code) {
      // Unique constraint violated. For Application(jobId, applicantUserId)
      // this is requirement 5 — the duplicate-application rule.
      case 'P2002': {
        const target = (exception.meta?.target as string[] | undefined) ?? [];
        if (target.includes('jobId') || target.includes('applicantUserId')) {
          return {
            status: HttpStatus.CONFLICT,
            message: 'You have already applied to this job',
            error: 'Conflict',
          };
        }
        return {
          status: HttpStatus.CONFLICT,
          message: `A record with this ${target.join(', ') || 'value'} already exists`,
          error: 'Conflict',
        };
      }

      // Referenced row not found (e.g. a foreign key pointing at a deleted row).
      case 'P2003':
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'Referenced record does not exist',
          error: 'Bad Request',
        };

      // Required row not found by a `findUniqueOrThrow`/`update` on a missing id.
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          message: 'The requested record does not exist',
          error: 'Not Found',
        };

      default:
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'A database error occurred',
          error: 'Internal Server Error',
        };
    }
  }
}
