import { registerDecorator, ValidationOptions } from 'class-validator';

/**
 * Rejects a string that is empty or contains only whitespace.
 *
 * `@IsNotEmpty()` from class-validator checks `value !== ''`, so `"   "` passes
 * it. Every required text field in this API is trimmed before it is persisted,
 * which means a whitespace-only value would be stored as an empty string — a
 * job title of `""`, a company with a blank name. This decorator closes that
 * gap: the check is run against the trimmed value, so what is validated is what
 * the database will actually hold.
 *
 * Usage: pair it with `@IsString()` and a `@MaxLength()`.
 *
 *   @IsString()
 *   @IsNonBlank()
 *   @MaxLength(150)
 *   title!: string;
 */
export function IsNonBlank(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isNonBlank',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          return typeof value === 'string' && value.trim().length > 0;
        },
        defaultMessage(): string {
          return validationOptions?.message === undefined
            ? `$property must not be blank`
            : (validationOptions.message as string);
        },
      },
    });
  };
}
