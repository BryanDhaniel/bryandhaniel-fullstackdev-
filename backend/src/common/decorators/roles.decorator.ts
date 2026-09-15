import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

export const ROLES_KEY = 'roles';

/**
 * Restricts a route to the given Roles. Enforced by `RolesGuard`, which must be
 * registered on the route alongside `JwtAuthGuard`.
 *
 *   @Roles(Role.COMPANY)
 *   @UseGuards(JwtAuthGuard, RolesGuard)
 *
 * This is actor-level authorization only. It does **not** establish that the
 * caller owns the resource being addressed — that check belongs in the service
 * layer. See docs/adr/0005.
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
