import type { ApplicationStatus, JobType } from '../api/types';
import { JOB_TYPE_LABELS, STATUS_LABELS } from '../api/types';

/**
 * Formats a salary range for display.
 *
 * Both bounds absent means the salary is undisclosed, which is deliberately
 * distinct from a salary of zero and is rendered as "Negotiable" rather than as
 * an empty or zero range. See CONTEXT.md.
 */
export function formatSalary(
  min: number | null,
  max: number | null,
  currency = 'IDR',
): string {
  if (min === null && max === null) return 'Negotiable';

  const format = (value: number) =>
    new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(value);

  // Only one bound disclosed: show it rather than inventing the other.
  if (min !== null && max === null) return `From ${format(min)}`;
  if (min === null && max !== null) return `Up to ${format(max)}`;

  // An identical range is a single figure, not a range.
  if (min === max) return format(min as number);

  return `${format(min as number)} – ${format(max as number)}`;
}

export function jobTypeLabel(type: JobType): string {
  return JOB_TYPE_LABELS[type] ?? type;
}

export function statusLabel(status: ApplicationStatus): string {
  return STATUS_LABELS[status] ?? status;
}

/** Human-readable relative time, e.g. "3 hours ago". */
export function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diffMs = Date.now() - then;

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;

  return `${Math.floor(months / 12)} year(s) ago`;
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

/** Initials for the company avatar placeholder, e.g. "PT Teknologi" -> "PT". */
export function companyInitials(name: string): string {
  const words = name.replace(/[^a-zA-Z0-9\s]/g, '').trim().split(/\s+/);
  if (words.length === 0 || !words[0]) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** `classNames` helper: joins truthy class strings. */
export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}
