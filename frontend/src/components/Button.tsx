import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { IconSpinner } from './icons';
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
  /** Renders the compact size, for status controls inside a dense card. */
  size?: 'sm' | 'md';
  /**
   * A trailing icon rendered in its own circular well rather than sitting naked
   * next to the label. Used on the primary forward action of a page (see
   * `.btn-island` in index.css for the hover physics).
   */
  trailingIcon?: ReactNode;
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
  size = 'md',
  disabled,
  className,
  children,
  trailingIcon,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={cx(
        VARIANT_CLASS[variant],
        size === 'sm' && 'btn-sm',
        className,
      )}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      {...rest}
    >
      {isLoading ? (
        <IconSpinner className="animate-spin" aria-hidden="true" />
      ) : null}
      {children}
      {trailingIcon && !isLoading ? (
        <span
          className="ml-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/15 transition-transform duration-300 ease-settle group-hover:translate-x-0.5"
          aria-hidden="true"
        >
          {trailingIcon}
        </span>
      ) : null}
    </button>
  );
}

/**
 * A button rendered with the same visual language but as a link.
 *
 * Nav and inline actions are anchors semantically, and using a `<button>` with
 * a click handler for navigation breaks middle-click, "open in new tab" and
 * screen-reader announcement of the destination. This exists so those cases can
 * still look like a button.
 */
export function buttonClasses(
  variant: Variant = 'primary',
  size: 'sm' | 'md' = 'md',
  className?: string,
) {
  return cx(VARIANT_CLASS[variant], size === 'sm' && 'btn-sm', 'group', className);
}
