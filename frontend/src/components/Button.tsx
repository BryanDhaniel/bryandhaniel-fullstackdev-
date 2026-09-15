import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Spinner } from './ui';
import { cx } from '../lib/format';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANT_CLASS: Record<Variant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  /** Shows a spinner and blocks interaction. Also sets `aria-busy`. */
  isLoading?: boolean;
  children: ReactNode;
}

/**
 * A button that knows about its own pending state.
 *
 * Centralising `isLoading` means every async action in the app disables itself
 * while in flight, which is what prevents the double-submit bug that would
 * otherwise show up on the "Apply" button — where a second click would produce
 * a 409 and look like an error to the user.
 */
export function Button({
  variant = 'primary',
  isLoading = false,
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={cx(VARIANT_CLASS[variant], className)}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      {...rest}
    >
      {isLoading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
}
