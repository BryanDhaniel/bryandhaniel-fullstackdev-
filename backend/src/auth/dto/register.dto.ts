import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { IsEmail, IsEnum, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { IsNonBlank } from '../../common/validators/is-non-blank.validator';

export class RegisterDto {
  @ApiProperty({ example: 'newuser@example.com', description: 'Must be unique.' })
  @IsEmail({}, { message: 'email must be a valid email address' })
  @MaxLength(254)
  email!: string;

  @ApiProperty({ example: 'Password123!', minLength: 8, maxLength: 72 })
  @IsString()
  @MinLength(8, { message: 'password must be at least 8 characters' })
  // bcrypt silently truncates beyond 72 bytes; rejecting is safer than
  // accepting a password whose tail is ignored.
  @MaxLength(72, { message: 'password must be at most 72 characters' })
  password!: string;

  @ApiProperty({
    enum: Role,
    example: Role.JOB_SEEKER,
    description:
      'Fixed at registration and cannot be changed afterwards. See docs/adr/0001.',
  })
  @IsEnum(Role, { message: 'role must be either JOB_SEEKER or COMPANY' })
  role!: Role;

  @ApiPropertyOptional({
    example: 'PT Teknologi Nusantara',
    description: 'Required when role is COMPANY. Ignored for JOB_SEEKER.',
  })
  // Only validated when role is COMPANY: a company without a name has nothing
  // to display on its job postings.
  //
  // NOTE: no `@IsOptional()` here. class-validator's `@IsOptional()` is a
  // short-circuit — if the value is `undefined` or `null`, *every other
  // validator on the property is skipped*, including the `@IsNonBlank` below.
  // That combination silently made `companyName` optional for companies, which
  // is exactly the case it was meant to forbid. `@ValidateIf` alone is the
  // correct tool: it decides whether to run validation, and when it says yes
  // the whole chain runs.
  @ValidateIf((o: RegisterDto) => o.role === Role.COMPANY)
  @IsString({ message: 'companyName must be a string' })
  @IsNonBlank({ message: 'companyName is required when registering as a COMPANY' })
  @MaxLength(150)
  companyName?: string;
}
