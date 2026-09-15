import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/Button';
import { Alert, Field } from '../components/ui';
import { getErrorMessage } from '../api/client';
import type { Role } from '../api/types';
import { cx } from '../lib/format';

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [role, setRole] = useState<Role>('JOB_SEEKER');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const user = await register({
        email,
        password,
        role,
        // Only sent for companies; the backend ignores it otherwise.
        companyName: role === 'COMPANY' ? companyName : undefined,
      });
      navigate(user.role === 'COMPANY' ? '/company/jobs' : '/jobs', { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const roleOptions: { value: Role; title: string; description: string }[] = [
    {
      value: 'JOB_SEEKER',
      title: 'Job Seeker',
      description: 'Browse jobs and apply to them.',
    },
    {
      value: 'COMPANY',
      title: 'Company',
      description: 'Post jobs and manage candidates.',
    },
  ];

  return (
    <div className="mx-auto max-w-md py-6">
      <div className="card p-6 sm:p-8">
        <h1 className="text-xl font-semibold text-slate-900">Create an account</h1>
        <p className="mt-1 text-sm text-slate-500">
          Your account type is fixed once chosen and cannot be changed later.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-5" noValidate>
          {error && <Alert variant="error">{error}</Alert>}

          {/* Role is a choice between two cards rather than a <select>, because
              it is a consequential, irreversible decision that deserves to be
              read rather than scrolled past. */}
          <fieldset>
            <legend className="field-label">I am a…</legend>
            <div className="grid grid-cols-2 gap-3">
              {roleOptions.map((option) => (
                <label
                  key={option.value}
                  className={cx(
                    'cursor-pointer rounded-lg border p-3 transition',
                    'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500 has-[:focus-visible]:ring-offset-2',
                    role === option.value
                      ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500'
                      : 'border-slate-300 bg-white hover:border-slate-400',
                  )}
                >
                  {/* Visually hidden rather than `display:none`, so the radio
                      stays in the tab order and keeps its native arrow-key
                      behaviour. The focus ring is drawn on the label via
                      `has-[:focus-visible]`, because the input itself is
                      invisible and an outline on it would never be seen. */}
                  <input
                    type="radio"
                    name="role"
                    value={option.value}
                    checked={role === option.value}
                    onChange={() => setRole(option.value)}
                    className="sr-only"
                  />
                  <span className="block text-sm font-semibold text-slate-900">
                    {option.title}
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    {option.description}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {role === 'COMPANY' && (
            <Field label="Company name" htmlFor="companyName">
              <input
                id="companyName"
                type="text"
                className="field"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                required
                placeholder="PT Contoh Sejahtera"
              />
            </Field>
          )}

          <Field label="Email" htmlFor="email">
            <input
              id="email"
              type="email"
              className="field"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              placeholder="you@example.com"
            />
          </Field>

          <Field label="Password" htmlFor="password" hint="At least 8 characters.">
            <input
              id="password"
              type="password"
              className="field"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
              minLength={8}
              placeholder="••••••••"
            />
          </Field>

          <Button type="submit" isLoading={isSubmitting} className="w-full">
            Create account
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-brand-600 hover:text-brand-700">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
