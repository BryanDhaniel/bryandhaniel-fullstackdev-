import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';

/**
 * Shape of the access token payload.
 *
 * Deliberately minimal: `sub` and `role` are all that authorization needs.
 * Email is included for convenience in logs/debugging and is not used for
 * authorization decisions.
 */
export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
}

/**
 * The authenticated principal attached to `request.user` by `JwtStrategy`.
 * Controllers and guards read this and never trust identity from the request
 * body — see docs/adr/0005.
 */
export class AuthenticatedUser {
  @ApiProperty({ example: '3f1a2b4c-5d6e-7f80-9a1b-2c3d4e5f6071' })
  id!: string;

  @ApiProperty({ example: 'seeker@demo.com' })
  email!: string;

  @ApiProperty({ enum: Role, example: Role.JOB_SEEKER })
  role!: Role;
}
