import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { jobsApi } from '../api/endpoints';
import { getErrorMessage } from '../api/client';
import { Button } from '../components/Button';
import { Alert, Field } from '../components/ui';
import type { JobType } from '../api/types';
import { JOB_TYPE_LABELS } from '../api/types';

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

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Post a job</h1>
        <p className="mt-1 text-sm text-slate-500">
          Job Seekers will see this immediately once it is active.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="card space-y-5 p-5 sm:p-6" noValidate>
        {submitError && <Alert variant="error">{submitError}</Alert>}

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

        <Field label="Job type" htmlFor="jobType">
          <select
            id="jobType"
            className="field"
            value={form.jobType}
            onChange={(e) => setField('jobType', e.target.value as JobType)}
          >
            {JOB_TYPES.map((type) => (
              <option key={type} value={type}>
                {JOB_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </Field>

        {/* Two optional numbers, with an explicit note that blank is valid. */}
        <fieldset>
          <legend className="field-label">
            Salary range <span className="font-normal text-slate-400">(optional)</span>
          </legend>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <input
                id="salaryMin"
                type="number"
                min={0}
                step={100000}
                className="field"
                value={form.salaryMin}
                onChange={(e) => setField('salaryMin', e.target.value)}
                placeholder="Minimum"
                aria-label="Minimum salary"
              />
              {fieldErrors.salaryMin && <p className="field-error">{fieldErrors.salaryMin}</p>}
            </div>
            <div>
              <input
                id="salaryMax"
                type="number"
                min={0}
                step={100000}
                className="field"
                value={form.salaryMax}
                onChange={(e) => setField('salaryMax', e.target.value)}
                placeholder="Maximum"
                aria-label="Maximum salary"
              />
              {fieldErrors.salaryMax && <p className="field-error">{fieldErrors.salaryMax}</p>}
            </div>
          </div>
          <p className="mt-1.5 text-xs text-slate-500">
            Leave both blank to display the salary as <strong>Negotiable</strong>. Amounts are in
            IDR.
          </p>
        </fieldset>

        <Field label="Description" htmlFor="description" error={fieldErrors.description}>
          <textarea
            id="description"
            className="field min-h-[160px] resize-y"
            value={form.description}
            onChange={(e) => setField('description', e.target.value)}
            placeholder="Describe the role, responsibilities and requirements…"
            maxLength={5000}
            required
          />
        </Field>

        <div className="flex items-start gap-3 rounded-lg border border-slate-200 p-3">
          <input
            id="isActive"
            type="checkbox"
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            checked={form.isActive}
            onChange={(e) => setField('isActive', e.target.checked)}
          />
          <label htmlFor="isActive" className="text-sm">
            <span className="font-medium text-slate-900">Publish immediately</span>
            <span className="mt-0.5 block text-xs text-slate-500">
              An unpublished job is hidden from Job Seekers and cannot be applied to.
            </span>
          </label>
        </div>

        <div className="flex gap-2 border-t border-slate-200 pt-5">
          <Button type="submit" isLoading={createMutation.isPending}>
            Post job
          </Button>
          <Button type="button" variant="secondary" onClick={() => navigate('/company/jobs')}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
