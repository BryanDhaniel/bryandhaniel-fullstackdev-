import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { ROLES_KEY } from '../decorators/roles.decorator';

/**
 * Restricts a route to one or more Roles.
 *
 * This guards the **actor**, not the resource: it answers "may a Company call
 * this endpoint at all?", not "does this Company own the thing it is asking
 * about?". Resource-level ownership is checked in the service layer against the
 * database. Both are required — see docs/adr/0005.
 *
 * Must run *after* `JwtAuthGuard`; on a route with no `@Roles(...)` it is a
 * no-op, so it is only ever registered alongside the auth guard.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No @Roles(...) on this route: role is not part of the requirement.
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser | undefined;

    if (!user) {
      // Reaching here means the route was misconfigured — this guard must be
      // paired with JwtAuthGuard. Fail closed rather than allow.
      throw new ForbiddenException('No authenticated user on request');
    }

    if (!requiredRoles.includes(user.role)) {
      throw new ForbiddenException(
        `This action requires role ${requiredRoles.join(' or ')}; you are ${user.role}`,
      );
    }

    return true;
  }
}
