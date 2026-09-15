import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Typed, validated access to environment configuration.
 *
 * Reading env vars through this service rather than `process.env` directly means
 * a missing variable is one clear failure at startup instead of an `undefined`
 * that silently propagates into a JWT secret.
 */
@Injectable()
export class AppConfigService {
  private readonly logger = new Logger(AppConfigService.name);

  constructor(private readonly config: ConfigService) {
    this.assertSafeForProduction();
  }

  get nodeEnv(): string {
    return this.config.get<string>('NODE_ENV', 'development');
  }

  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }

  get port(): number {
    return Number(this.config.get<string>('PORT', '3000'));
  }

  /** Explicit origin allowed to send credentialed requests. Never '*'. */
  get corsOrigin(): string {
    return this.config.get<string>('CORS_ORIGIN', 'http://localhost:5173');
  }

  get jwtAccessSecret(): string {
    return this.config.getOrThrow<string>('JWT_ACCESS_SECRET');
  }

  get jwtAccessExpiresIn(): string {
    return this.config.get<string>('JWT_ACCESS_EXPIRES_IN', '15m');
  }

  /**
   * Refresh lifetime in days. Refresh tokens are opaque random strings stored
   * as bcrypt hashes, not JWTs — see docs/adr/0004.
   */
  get jwtRefreshExpiresInDays(): number {
    return Number(this.config.get<string>('JWT_REFRESH_EXPIRES_IN_DAYS', '7'));
  }

  get bcryptRounds(): number {
    return Number(this.config.get<string>('BCRYPT_ROUNDS', '10'));
  }

  /**
   * Refuse to boot with the development secret in production. A placeholder
   * secret in production means anyone can forge an access token, so failing
   * loudly at startup is strictly better than running insecurely.
   */
  private assertSafeForProduction(): void {
    if (!this.isProduction) return;

    const secret = this.config.get<string>('JWT_ACCESS_SECRET') ?? '';
    const isPlaceholder =
      secret.length < 32 || secret.includes('change-me') || secret.includes('dev-only');

    if (isPlaceholder) {
      throw new Error(
        'JWT_ACCESS_SECRET is missing, too short, or still set to the development ' +
          'placeholder. Refusing to start in production. Set a strong random value ' +
          '(e.g. `openssl rand -base64 48`).',
      );
    }

    if (this.corsOrigin === '*') {
      throw new Error(
        'CORS_ORIGIN must be an explicit origin in production: credentialed requests ' +
          'are incompatible with a wildcard. See docs/adr/0004.',
      );
    }
  }
}
