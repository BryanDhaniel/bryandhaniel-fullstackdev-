import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@prisma/client';

/**
 * The authenticated user's own profile, returned by `/auth/me` and embedded in
 * auth responses.
 */
export class UserResponseDto {
  @ApiProperty({ example: '3f1a2b4c-5d6e-7f80-9a1b-2c3d4e5f6071' })
  id!: string;

  @ApiProperty({ example: 'seeker@demo.com' })
  email!: string;

  @ApiProperty({ enum: Role, example: Role.JOB_SEEKER })
  role!: Role;

  @ApiProperty({ example: '2026-09-15T13:00:00.000Z' })
  createdAt!: Date;

  @ApiPropertyOptional({
    description: 'Present only when role is COMPANY.',
    example: { companyName: 'PT Teknologi Nusantara', website: 'https://example.com' },
  })
  companyProfile?: {
    companyName: string;
    description: string | null;
    website: string | null;
    logoUrl: string | null;
  } | null;

  static fromEntity(user: {
    id: string;
    email: string;
    role: Role;
    createdAt: Date;
    companyProfile?: {
      companyName: string;
      description: string | null;
      website: string | null;
      logoUrl: string | null;
    } | null;
  }): UserResponseDto {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
      ...(user.companyProfile !== undefined
        ? { companyProfile: user.companyProfile }
        : {}),
    } as UserResponseDto;
  }
}

/**
 * Shape of the authentication response.
 *
 * Note the access token is returned in the body (the client holds it in memory)
 * while the refresh token is set as an httpOnly cookie and is deliberately
 * **not** present here — see docs/adr/0004.
 */
export class AuthResponseDto {
  @ApiProperty({
    description:
      'Short-lived bearer token. The frontend keeps this in memory only; the refresh ' +
      'token travels exclusively as an httpOnly cookie.',
  })
  accessToken!: string;

  @ApiProperty({ example: 900, description: 'Access token lifetime in seconds.' })
  expiresIn!: number;

  @ApiProperty({ type: UserResponseDto })
  user!: UserResponseDto;

  @ApiProperty({
    example: '2026-09-22T13:00:00.000Z',
    description:
      'When the refresh cookie expires. Exposed for client-side UX only; it is not a credential.',
  })
  refreshTokenExpiresAt!: Date;
}
