import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Role } from '@prisma/client';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser, JwtPayload } from '../interfaces/authenticated-user.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: AppConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.jwtAccessSecret,
    });
  }

  /**
   * Runs on every authenticated request.
   *
   * The token payload is re-verified against the database rather than trusted
   * as-is. This costs one indexed lookup and buys two things: a deactivated or
   * deleted account stops working immediately instead of at token expiry, and a
   * role change (which our model forbids, but which a database edit could still
   * introduce) cannot be used to escalate privilege with an old token.
   */
  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, isActive: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Account no longer exists or has been deactivated');
    }

    // The role is read from the database, not from the token, so a stale token
    // can never carry more authority than the account currently has.
    return { id: user.id, email: user.email, role: user.role as Role };
  }
}
