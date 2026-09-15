import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/Button';
import { Alert, Field } from '../components/ui';
import { AuthShell } from '../components/AuthShell';
import { IconBriefcase, IconEye, IconEyeSlash, IconUser } from '../components/icons';
import { getErrorMessage } from '../api/client';
import type { Role } from '../api/types';
import { cx } from '../lib/format';

const ROLE_OPTIONS: {
  value: Role;
  title: string;
  description: string;
  Icon: typeof IconUser;
}[] = [
  {
    value: 'JOB_SEEKER',
    title: 'Job Seeker',
    description: 'Browse open roles and apply to them.',
    Icon: IconUser,
  },
  {
    value: 'COMPANY',
    title: 'Company',
    description: 'Post jobs and manage the candidates who apply.',
    Icon: IconBriefcase,
  },
];

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [role, setRole] = useState<Role>('JOB_SEEKER');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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

  return (
    <AuthShell
      title="Create an account"
      subtitle="Your account type is fixed once chosen and cannot be changed later."
    >
      <form onSubmit={handleSubmit} className="space-y-6" noValidate>
        {error && <Alert variant="error">{error}</Alert>}

        {/* Role is a choice between two tiles rather than a <select>, because
            it is a consequential, irreversible decision that deserves to be
            read rather than scrolled past. The radio itself is visually hidden
            rather than removed, so arrow-key navigation still works and the
            focus ring is drawn on the wrapping label. */}
        <fieldset>
          <legend className="field-label">I am a…</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {ROLE_OPTIONS.map((option) => {
              const isSelected = role === option.value;

              return (
                <label
                  key={option.value}
                  className={cx(
                    'group relative cursor-pointer rounded-xl border p-4 transition-all duration-200 ease-settle',
                    'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent-500 has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-ink-50',
                    'active:scale-[0.99]',
                    isSelected
                      ? 'border-accent-500 bg-accent-50/70 shadow-lift'
                      : 'border-ink-200 bg-white hover:border-ink-300 hover:bg-ink-50/60',
                  )}
                >
                  <input
                    type="radio"
                    name="role"
                    value={option.value}
                    checked={isSelected}
                    onChange={() => setRole(option.value)}
                    className="sr-only"
                  />

                  <span
                    className={cx(
                      'flex h-9 w-9 items-center justify-center rounded-lg transition-colors duration-200',
                      isSelected
                        ? 'bg-accent-600 text-white'
                        : 'bg-ink-100 text-ink-500 group-hover:bg-ink-200',
                    )}
                    aria-hidden="true"
                  >
                    <option.Icon size={18} />
                  </span>

                  <span className="mt-3 block text-sm font-bold text-ink-900">
                    {option.title}
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-ink-500">
                    {option.description}
                  </span>

                  {/* A visible selected marker, since colour alone is not an
                      accessible signal. */}
                  {isSelected && (
                    <span className="absolute right-3 top-3 flex h-4 w-4 items-center justify-center rounded-full bg-accent-600 text-[9px] font-bold text-white">
                      ✓
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        </fieldset>

        {/* Company name is only asked for, and only required, when it applies. */}
        {role === 'COMPANY' && (
          <div className="animate-rise-in">
            <Field
              label="Company name"
              htmlFor="companyName"
              hint="Shown on every job you post."
            >
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
          </div>
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

        <Field
          label="Password"
          htmlFor="password"
          hint="At least 8 characters."
        >
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              className="field pr-11"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
              minLength={8}
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-ink-400 transition-colors duration-200 hover:bg-ink-100 hover:text-ink-700"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
            >
              {showPassword ? <IconEyeSlash /> : <IconEye />}
            </button>
          </div>
        </Field>

        <Button type="submit" isLoading={isSubmitting} className="w-full">
          Create account
        </Button>
      </form>

      <p className="mt-6 text-sm text-ink-600">
        Already have an account?{' '}
        <Link to="/login" className="link">
          Log in
        </Link>
      </p>
    </AuthShell>
  );
}
