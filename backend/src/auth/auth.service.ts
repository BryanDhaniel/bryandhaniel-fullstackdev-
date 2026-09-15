import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role, User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from './interfaces/authenticated-user.interface';
import { RefreshTokenService } from './refresh-token.service';

/** A user row joined with its optional company profile, as auth needs it. */
const AUTH_USER_SELECT = {
  id: true,
  email: true,
  passwordHash: true,
  role: true,
  isActive: true,
  createdAt: true,
  companyProfile: {
    select: { companyName: true, description: true, website: true, logoUrl: true },
  },
} as const;

type AuthUser = Pick<
  User,
  'id' | 'email' | 'passwordHash' | 'role' | 'isActive' | 'createdAt'
> & {
  companyProfile: {
    companyName: string;
    description: string | null;
    website: string | null;
    logoUrl: string | null;
  } | null;
};

export interface AuthSession {
  user: ReturnType<typeof toPublicUser>;
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  /**
   * A bcrypt hash of a throwaway value, used to equalize timing when the email
   * does not exist. Computed once at startup so login latency does not reveal
   * whether an account is registered.
   */
  private readonly dummyHash: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
    private readonly refreshTokens: RefreshTokenService,
  ) {
    this.dummyHash = bcrypt.hashSync('placeholder-for-timing-equalization', 10);
  }

  // -------------------------------------------------------------------------
  // Registration
  // -------------------------------------------------------------------------

  async register(dto: RegisterDto): Promise<AuthSession> {
    const email = dto.email.toLowerCase().trim();

    const existing = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existing) {
      // 409 Conflict, not 401: the request is well-formed and the credentials
      // are irrelevant — the email is simply taken. A 401 here would also be
      // misleading, because the client would reasonably try to re-authenticate.
      // The unique index on `email` is the real guarantee; a concurrent
      // double-submit still collides and the exception filter maps P2002 to 409.
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, this.config.bcryptRounds);

    // The user and, for companies, the profile are created in one transaction —
    // a COMPANY row with no profile would be a valid-but-broken state that the
    // display layer would have to defend against everywhere.
    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email,
          passwordHash,
          role: dto.role,
          ...(dto.role === Role.COMPANY
            ? {
                companyProfile: {
                  create: { companyName: (dto.companyName ?? email).trim() },
                },
              }
            : {}),
        },
        select: AUTH_USER_SELECT,
      });
      return created as AuthUser;
    });

    this.logger.log(`Registered ${user.role} account ${user.id}`);

    return this.issueSession(user);
  }

  // -------------------------------------------------------------------------
  // Login
  // -------------------------------------------------------------------------

  async login(dto: LoginDto): Promise<AuthSession> {
    const email = dto.email.toLowerCase().trim();

    const user = (await this.prisma.user.findUnique({
      where: { email },
      select: AUTH_USER_SELECT,
    })) as AuthUser | null;

    // Always run a bcrypt comparison, even when the user is absent, so that the
    // response time does not disclose whether the email is registered. The same
    // message is returned for "no such user" and "wrong password" for the same
    // reason: distinguishing them lets an attacker enumerate accounts.
    const hash = user?.passwordHash ?? this.dummyHash;
    const passwordMatches = await bcrypt.compare(dto.password, hash);

    if (!user || !passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.isActive) {
      // Distinct from the credential failure above on purpose: the credentials
      // were correct, so the account holder is entitled to know why access was
      // refused. The account's existence is already proven by the password.
      throw new UnauthorizedException('This account has been deactivated');
    }

    return this.issueSession(user);
  }

  // -------------------------------------------------------------------------
  // Session lifecycle
  // -------------------------------------------------------------------------

  /**
   * Mints an access token and a fresh refresh token for the user.
   * The refresh token is returned so the controller can set it as a cookie; it
   * is never placed in a response body.
   */
  async issueSession(user: AuthUser): Promise<AuthSession> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = await this.jwt.signAsync(payload);

    const { token: refreshToken, expiresAt } = await this.refreshTokens.issue(user.id);

    return {
      user: toPublicUser(user),
      accessToken,
      expiresIn: this.accessTokenTtlSeconds(),
      refreshToken,
      refreshTokenExpiresAt: expiresAt,
    };
  }

  /**
   * Rotates a refresh token: the presented token is revoked and a new one is
   * issued in the same call. Reusing a rotated token therefore fails, which is
   * what makes logout meaningful rather than cosmetic. See docs/adr/0004.
   */
  async refresh(rawToken: string): Promise<AuthSession> {
    const userId = await this.refreshTokens.consume(rawToken);

    const user = (await this.prisma.user.findUnique({
      where: { id: userId },
      select: AUTH_USER_SELECT,
    })) as AuthUser | null;

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Account no longer exists or has been deactivated');
    }

    return this.issueSession(user);
  }

  /** Revokes a single refresh token. Idempotent: revoking twice is not an error. */
  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    await this.refreshTokens.revoke(rawToken);
  }

  /** Revokes every refresh token for a user — used to end all their sessions. */
  async logoutAll(userId: string): Promise<void> {
    await this.refreshTokens.revokeAllForUser(userId);
  }

  // -------------------------------------------------------------------------

  async me(userId: string): Promise<ReturnType<typeof toPublicUser>> {
    const user = (await this.prisma.user.findUnique({
      where: { id: userId },
      select: AUTH_USER_SELECT,
    })) as AuthUser | null;

    if (!user) throw new UnauthorizedException('Account no longer exists');

    return toPublicUser(user);
  }

  private accessTokenTtlSeconds(): number {
    return parseDurationToSeconds(this.config.jwtAccessExpiresIn);
  }
}

/**
 * Strips the password hash. Nothing outside this service should see a User row.
 *
 * Takes the full `AuthUser` shape (which always carries `createdAt`), so the
 * public user's `createdAt` is never optional.
 */
function toPublicUser(user: AuthUser) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
    companyProfile: user.companyProfile,
  };
}

/** Converts `15m` / `7d` / `900s` into seconds. Defaults to 900 on anything odd. */
export function parseDurationToSeconds(value: string): number {
  const match = /^(\d+)\s*([smhd])?$/.exec(value.trim());
  if (!match) return 900;

  const amount = Number(match[1]);
  switch (match[2]) {
    case 's':
      return amount;
    case 'm':
    case undefined:
      return amount * 60;
    case 'h':
      return amount * 3600;
    case 'd':
      return amount * 86400;
    default:
      return 900;
  }
}
