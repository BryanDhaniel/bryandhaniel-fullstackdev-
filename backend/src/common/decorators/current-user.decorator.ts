import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';

/**
 * Injects the authenticated principal from the request.
 *
 * Using this rather than reaching into `request.user` in every handler keeps
 * the "who is calling?" answer in one typed place, and makes it obvious in a
 * handler's signature that it depends on the caller — which is exactly the
 * signal a reviewer needs to confirm resource ownership is enforced per user.
 *
 *   findAll(@CurrentUser() user: AuthenticatedUser) { ... }
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest();
    return request.user as AuthenticatedUser;
  },
);
