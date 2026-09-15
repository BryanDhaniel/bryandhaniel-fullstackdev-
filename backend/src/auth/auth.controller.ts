import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Request, Response } from 'express';
import { AppConfigService } from '../config/app-config.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AuthService, AuthSession } from './auth.service';
import { AuthResponseDto, UserResponseDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthenticatedUser } from './interfaces/authenticated-user.interface';

/** Name of the httpOnly cookie carrying the refresh token. */
export const REFRESH_COOKIE = 'refresh_token';

/**
 * Rate limits, in requests per minute.
 *
 * Overridable by environment so the end-to-end suite — which shares one IP
 * across a whole run — does not trip the register limit while testing
 * unrelated behaviour. The defaults are what the application uses.
 */
const THROTTLE = {
  register: Number(process.env.THROTTLE_LIMIT_REGISTER ?? 5),
  login: Number(process.env.THROTTLE_LIMIT_LOGIN ?? 10),
  refresh: Number(process.env.THROTTLE_LIMIT_REFRESH ?? 30),
  ttl: 60_000,
};

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: AppConfigService,
  ) {}

  // -------------------------------------------------------------------------
  // Registration & login
  // -------------------------------------------------------------------------

  /**
   * Tighter limit than the global default: registration and login are the two
   * endpoints where automated abuse (credential stuffing, mass account
   * creation) actually pays off.
   */
  @Throttle({ default: { limit: THROTTLE.register, ttl: THROTTLE.ttl } })
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Register a Job Seeker or Company',
    description:
      'Role is fixed at registration. Registering as a COMPANY creates the associated ' +
      'company profile in the same transaction.',
  })
  @ApiResponse({ status: 201, type: AuthResponseDto })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 409, description: 'Email already registered' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    const session = await this.auth.register(dto);
    return this.respondWithSession(session, res);
  }

  @Throttle({ default: { limit: THROTTLE.login, ttl: THROTTLE.ttl } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log in' })
  @ApiResponse({ status: 200, type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    const session = await this.auth.login(dto);
    return this.respondWithSession(session, res);
  }

  // -------------------------------------------------------------------------
  // Session maintenance
  // -------------------------------------------------------------------------

  @Throttle({ default: { limit: THROTTLE.refresh, ttl: THROTTLE.ttl } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth(REFRESH_COOKIE)
  @ApiOperation({
    summary: 'Exchange a refresh token for a new access token',
    description:
      'The refresh token is read from the httpOnly cookie, or from the request body for ' +
      'non-browser clients. The presented token is revoked and a replacement issued (rotation).',
  })
  @ApiResponse({ status: 200, type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'Refresh token missing, expired, or already used' })
  async refresh(
    @Req() req: Request,
    @Body() dto: RefreshTokenDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    const rawToken = this.readRefreshToken(req, dto);
    if (!rawToken) {
      throw new UnauthorizedException('No refresh token supplied');
    }

    const session = await this.auth.refresh(rawToken);
    return this.respondWithSession(session, res);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiCookieAuth(REFRESH_COOKIE)
  @ApiOperation({
    summary: 'Log out',
    description:
      'Revokes the refresh token server-side and clears the cookie. Deliberately does not ' +
      'require a valid access token: logging out with an expired access token must still work.',
  })
  @ApiResponse({ status: 204, description: 'Logged out' })
  async logout(
    @Req() req: Request,
    @Body() dto: RefreshTokenDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const rawToken = this.readRefreshToken(req, dto);
    await this.auth.logout(rawToken);
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Log out of all devices' })
  @ApiResponse({ status: 204, description: 'All sessions revoked' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  async logoutAll(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logoutAll(user.id);
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
  }

  // -------------------------------------------------------------------------
  // Identity
  // -------------------------------------------------------------------------

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Current user',
    description:
      'The frontend calls this on boot to recover the session after a reload, since the ' +
      'access token is held in memory only and does not survive one.',
  })
  @ApiResponse({ status: 200, type: UserResponseDto })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  async me(@CurrentUser() user: AuthenticatedUser): Promise<UserResponseDto> {
    return this.auth.me(user.id);
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /**
   * Writes the refresh token as an httpOnly cookie and returns the body.
   *
   * The access token goes in the body (the client keeps it in memory) and the
   * refresh token goes *only* in the cookie — it must never appear in a JSON
   * response the page's own JavaScript can read. See docs/adr/0004.
   */
  private respondWithSession(session: AuthSession, res: Response): AuthResponseDto {
    res.cookie(REFRESH_COOKIE, session.refreshToken, {
      ...this.cookieOptions(),
      expires: session.refreshTokenExpiresAt,
    });

    return {
      accessToken: session.accessToken,
      expiresIn: session.expiresIn,
      user: session.user as UserResponseDto,
      refreshTokenExpiresAt: session.refreshTokenExpiresAt,
    };
  }

  /**
   * Cookie attributes.
   *
   * `httpOnly` keeps it away from JavaScript; `sameSite: 'lax'` still sends it
   * on a top-level navigation back to the app (so the session survives a
   * reload) while blocking it on cross-site subresource requests, which is the
   * common CSRF vector. `secure` is conditional because it would prevent the
   * cookie from being set at all over plain HTTP in development.
   */
  private cookieOptions() {
    return {
      httpOnly: true,
      secure: this.config.isProduction,
      sameSite: 'lax' as const,
      path: '/',
    };
  }

  /** Accepts the token from the cookie (browsers) or the body (other clients). */
  private readRefreshToken(req: Request, dto: RefreshTokenDto): string | undefined {
    const fromCookie = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    return fromCookie ?? dto?.refreshToken;
  }
}
