import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Requires a valid access token. Applied to any route that needs a known caller.
 *
 * Passport's default `UnauthorizedException` body has no message, which makes
 * the 401 indistinguishable from a dozen other failure modes in the client. We
 * override it so an expired or malformed token is explicit and the frontend can
 * tell "refresh your token" apart from "you are not permitted".
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser>(err: unknown, user: TUser): TUser {
    if (err || !user) {
      throw err instanceof Error
        ? err
        : new UnauthorizedException('Authentication required: missing or invalid access token');
    }
    return user;
  }
}
