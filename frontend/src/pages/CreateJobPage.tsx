import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { jobsApi } from '../api/endpoints';
import { getErrorMessage } from '../api/client';
import { Button } from '../components/Button';
import { Alert, BackLink, Field, PageHeader } from '../components/ui';
import { IconCoins, IconInfo } from '../components/icons';
import type { JobType } from '../api/types';
import { JOB_TYPE_LABELS } from '../api/types';
import { cx } from '../lib/format';

const JOB_TYPES: JobType[] = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'FREELANCE'];

interface FormState {
  title: string;
  description: string;
  location: string;
  jobType: JobType;
  salaryMin: string;
  salaryMax: string;
  isActive: boolean;
}

const INITIAL: FormState = {
  title: '',
  description: '',
  location: '',
  jobType: 'FULL_TIME',
  salaryMin: '',
  salaryMax: '',
  isActive: true,
};

/**
 * Create a job posting (requirement 6).
 *
 * Salary is entered as a pair of optional numbers, left blank for an
 * undisclosed salary. The backend rejects a min greater than a max, so the same
 * rule is checked here first to give immediate feedback rather than a round trip.
 *
 * The form is long, so it is split into two labelled groups rather than
 * presented as one undifferentiated column of fields. A long form with one
 * heading reads as endless; two groups read as two decisions.
 */
export function CreateJobPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState<FormState>(INITIAL);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: () =>
      jobsApi.create({
        title: form.title.trim(),
        description: form.description.trim(),
        location: form.location.trim(),
        jobType: form.jobType,
        // Send numbers only when entered; blank means "undisclosed".
        salaryMin: form.salaryMin ? Number(form.salaryMin) : undefined,
        salaryMax: form.salaryMax ? Number(form.salaryMax) : undefined,
        isActive: form.isActive,
      }),
    onSuccess: () => navigate('/company/jobs', { replace: true }),
    onError: (err) => setSubmitError(getErrorMessage(err)),
  });

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const validate = (): boolean => {
    const errors: Partial<Record<keyof FormState, string>> = {};

    if (!form.title.trim()) errors.title = 'Job title is required.';
    if (!form.description.trim()) errors.description = 'Description is required.';
    if (!form.location.trim()) errors.location = 'Location is required.';

    const min = form.salaryMin ? Number(form.salaryMin) : null;
    const max = form.salaryMax ? Number(form.salaryMax) : null;

    if (min !== null && min < 0) errors.salaryMin = 'Salary cannot be negative.';
    if (max !== null && max < 0) errors.salaryMax = 'Salary cannot be negative.';
    if (min !== null && max !== null && min > max) {
      errors.salaryMax = 'Maximum salary must be at least the minimum.';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitError(null);
    if (!validate()) return;
    createMutation.mutate();
  };

  const salaryPreview =
    form.salaryMin || form.salaryMax
      ? `${form.salaryMin ? Number(form.salaryMin).toLocaleString('id-ID') : '…'} - ${
          form.salaryMax ? Number(form.salaryMax).toLocaleString('id-ID') : '…'
        } IDR`
      : 'Negotiable';

  return (
    <div className="mx-auto max-w-3xl">
      <BackLink to="/company/jobs">Back to my jobs</BackLink>

      <PageHeader
        title="Post a job"
        description="Job Seekers see this the moment it is active. You can close it later without losing any applications."
      />

      <form onSubmit={handleSubmit} noValidate>
        {submitError && (
          <div className="mb-5">
            <Alert variant="error">{submitError}</Alert>
          </div>
        )}

        {/* Group 1: what the role is */}
        <section className="surface-lift p-5 sm:p-6">
          <h2 className="text-sm font-bold uppercase tracking-wide text-ink-500">
            The role
          </h2>

          <div className="mt-5 space-y-5">
            <Field label="Job title" htmlFor="title" error={fieldErrors.title}>
              <input
                id="title"
                className="field"
                value={form.title}
                onChange={(e) => setField('title', e.target.value)}
                placeholder="e.g. Backend Engineer (Node.js)"
                maxLength={150}
                required
              />
            </Field>

            <Field label="Location" htmlFor="location" error={fieldErrors.location}>
              <input
                id="location"
                className="field"
                value={form.location}
                onChange={(e) => setField('location', e.target.value)}
                placeholder="e.g. Jakarta, Indonesia"
                maxLength={150}
                required
              />
            </Field>

            {/* Job type as a pill group: five visible options beat a dropdown
                that hides them behind a click and renders inconsistently
                across platforms. */}
            <fieldset>
              <legend className="field-label">Job type</legend>
              <div className="flex flex-wrap gap-2">
                {JOB_TYPES.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setField('jobType', type)}
                    aria-pressed={form.jobType === type}
                    className={cx('chip px-3.5 py-1.5', form.jobType === type && 'chip-active')}
                  >
                    {JOB_TYPE_LABELS[type]}
                  </button>
                ))}
              </div>
            </fieldset>

            <Field label="Description" htmlFor="description" error={fieldErrors.description}>
              <textarea
                id="description"
                className="field min-h-[200px] resize-y"
                value={form.description}
                onChange={(e) => setField('description', e.target.value)}
                placeholder="Describe the responsibilities, the requirements, and what the team is working on…"
                maxLength={5000}
                required
              />
              <p className="tabular mt-1.5 text-xs text-ink-500">
                {form.description.length}/5000 characters
              </p>
            </Field>
          </div>
        </section>

        {/* Group 2: compensation and visibility */}
        <section className="surface-lift mt-5 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <h2 className="text-sm font-bold uppercase tracking-wide text-ink-500">
              Compensation
            </h2>

            {/* A live preview of how the salary will read on the listing. It
                answers "what does blank actually do?" without a wall of
                explanation. */}
            <span className="tabular rounded-md bg-ink-100 px-2.5 py-1 text-[11px] font-bold text-ink-700">
              {salaryPreview}
            </span>
          </div>

          <fieldset className="mt-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="field-label" htmlFor="salaryMin">
                  Minimum
                </label>
                <input
                  id="salaryMin"
                  type="number"
                  min={0}
                  step={100000}
                  className="field tabular"
                  value={form.salaryMin}
                  onChange={(e) => setField('salaryMin', e.target.value)}
                  placeholder="0"
                />
                {fieldErrors.salaryMin && (
                  <p className="field-error">{fieldErrors.salaryMin}</p>
                )}
              </div>
              <div>
                <label className="field-label" htmlFor="salaryMax">
                  Maximum
                </label>
                <input
                  id="salaryMax"
                  type="number"
                  min={0}
                  step={100000}
                  className="field tabular"
                  value={form.salaryMax}
                  onChange={(e) => setField('salaryMax', e.target.value)}
                  placeholder="0"
                />
                {fieldErrors.salaryMax && (
                  <p className="field-error">{fieldErrors.salaryMax}</p>
                )}
              </div>
            </div>

            <p className="mt-3 flex items-start gap-2 rounded-lg bg-ink-100/70 px-3.5 py-3 text-xs leading-relaxed text-ink-600">
              <IconCoins className="mt-px shrink-0 text-ink-400" aria-hidden="true" />
              <span>
                Amounts are in IDR. Leave both blank to list the salary as{' '}
                <strong className="font-bold text-ink-800">Negotiable</strong>, which is
                different from a salary of zero.
              </span>
            </p>
          </fieldset>
        </section>

        {/* Group 3: publish state, as a single explicit switch */}
        <section className="surface-lift mt-5 p-5 sm:p-6">
          <label
            htmlFor="isActive"
            className="flex cursor-pointer items-start gap-3.5"
          >
            <input
              id="isActive"
              type="checkbox"
              className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded border-ink-300 text-accent-700 transition focus:ring-2 focus:ring-accent-500 focus:ring-offset-2"
              checked={form.isActive}
              onChange={(e) => setField('isActive', e.target.checked)}
            />
            <span>
              <span className="block text-sm font-bold text-ink-900">
                Publish immediately
              </span>
              <span className="mt-1 flex items-start gap-1.5 text-xs leading-relaxed text-ink-500">
                <IconInfo size={14} className="mt-px shrink-0 text-ink-400" aria-hidden="true" />
                An unpublished job is hidden from Job Seekers and cannot be applied to. You can
                change this later from My Jobs.
              </span>
            </span>
          </label>
        </section>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button type="submit" isLoading={createMutation.isPending}>
            Post job
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => navigate('/company/jobs')}
            disabled={createMutation.isPending}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
