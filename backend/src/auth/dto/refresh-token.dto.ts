import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

/**
 * Body of `POST /auth/refresh` and `POST /auth/logout`.
 *
 * The refresh token normally arrives as an httpOnly cookie, so this DTO exists
 * to support non-browser clients (curl, Swagger UI, a future mobile app) that
 * cannot carry cookies and must pass it explicitly. Exactly one of the two
 * sources is required; `AuthController.readRefreshToken` resolves which, and
 * returns 401 if neither is present.
 *
 * `refreshToken` must therefore be **optional**: for a browser the body is
 * empty, and a required field here would reject every legitimate refresh with a
 * 400 before the cookie was ever examined.
 */
export class RefreshTokenDto {
  @ApiProperty({
    required: false,
    description:
      'Only needed when the refresh cookie is unavailable (e.g. a non-browser client). ' +
      'Browsers send the token as an httpOnly cookie and omit this field entirely.',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  refreshToken?: string;
}
