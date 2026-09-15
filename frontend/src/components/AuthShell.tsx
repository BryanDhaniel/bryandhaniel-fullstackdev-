import type { ReactNode } from 'react';
import { IconArrowUpRight, IconCheck } from './icons';

/**
 * Split-screen shell for the two authentication pages.
 *
 * The left panel carries the product's promise and the right panel carries the
 * form. A centred card on an empty page would work, but it wastes the one
 * moment where a visitor has no data to look at and nothing else to read.
 *
 * The panel is hidden below `lg` rather than stacked: on a phone, the form is
 * the entire job and a sales panel above it just pushes the fields down.
 */
export function AuthShell({
  children,
  title,
  subtitle,
}: {
  children: ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="-mx-4 -my-10 grid min-h-[calc(100dvh-4rem)] sm:-mx-6 sm:-my-14 lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel */}
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-ink-900 p-12 lg:flex xl:p-14">
        {/* A single soft accent bloom, positioned off-centre. It is a radial
            gradient rather than an image so it costs nothing and cannot fail
            to load. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-32 -top-32 h-[28rem] w-[28rem] rounded-full opacity-40"
          style={{
            background:
              'radial-gradient(circle, rgba(63,157,144,0.55) 0%, rgba(63,157,144,0) 68%)',
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-40 -left-24 h-[26rem] w-[26rem] rounded-full opacity-30"
          style={{
            background:
              'radial-gradient(circle, rgba(114,191,179,0.45) 0%, rgba(114,191,179,0) 70%)',
          }}
        />

        <div className="relative">
          <span className="flex items-center gap-2.5">
            <span
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-600 text-sm font-extrabold text-white"
              aria-hidden="true"
            >
              IK
            </span>
            <span className="text-[15px] font-extrabold tracking-tight text-ink-50">
              IndoKerja<span className="text-accent-300">.id</span>
            </span>
          </span>
        </div>

        <div className="relative max-w-md">
          <h2 className="text-display-md font-extrabold text-ink-50">
            Every application,
            <br />
            <span className="text-accent-300">and every change to it.</span>
          </h2>
          <p className="mt-5 max-w-[46ch] text-sm leading-relaxed text-ink-300">
            Companies move candidates through five statuses at their own pace, and each
            move is written to a permanent history. Nobody has to guess what happened to
            an application.
          </p>

          {/* Three short, concrete claims. No metrics are quoted because none
              are measured — inventing a number here would be dishonest. */}
          <ul className="mt-8 space-y-3">
            {[
              'One application per job, enforced by the database itself',
              'A visible audit trail on every status change',
              'Salary shown honestly, or marked Negotiable',
            ].map((point) => (
              <li key={point} className="flex items-start gap-2.5 text-sm text-ink-200">
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent-600/25 text-accent-300">
                  <IconCheck size={11} strokeWidth={2.5} aria-hidden="true" />
                </span>
                {point}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative font-mono text-[11px] tracking-tight text-ink-500">
          React · TypeScript · NestJS · PostgreSQL
        </p>
      </aside>

      {/* Form panel */}
      <div className="flex items-center justify-center px-4 py-10 sm:px-6 lg:py-14">
        <div className="w-full max-w-[27rem]">
          <div className="mb-8">
            <h1 className="text-display-sm font-extrabold text-ink-900">{title}</h1>
            <p className="mt-2 text-sm leading-relaxed text-ink-600">{subtitle}</p>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * One-click credential fill for a seeded demo account.
 *
 * This is the difference between a reviewer seeing the product in ten seconds
 * and them opening the README to copy a password. It fills the form rather than
 * submitting it, so the fields still behave like fields.
 */
export function DemoAccountButton({
  email,
  role,
  note,
  onSelect,
}: {
  email: string;
  role: string;
  note: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="group flex w-full items-center justify-between gap-3 rounded-lg border border-ink-200 bg-white px-3.5 py-3 text-left transition-all duration-200 ease-settle hover:border-accent-300 hover:bg-accent-50/60 active:scale-[0.99]"
    >
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-semibold text-ink-900">{email}</span>
        <span className="mt-0.5 block text-[11px] text-ink-500">
          {role} · {note}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-accent-700">
        Use
        <IconArrowUpRight
          className="transition-transform duration-300 ease-settle group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
          aria-hidden="true"
        />
      </span>
    </button>
  );
}
