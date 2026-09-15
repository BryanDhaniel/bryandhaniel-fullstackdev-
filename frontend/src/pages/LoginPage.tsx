import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/Button';
import { Alert, Field } from '../components/ui';
import { AuthShell, DemoAccountButton } from '../components/AuthShell';
import { IconEye, IconEyeSlash } from '../components/icons';
import { getErrorMessage } from '../api/client';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const user = await login({ email, password });

      // Return the user to wherever the guard interrupted them, falling back to
      // their role's home page.
      const from = (location.state as { from?: string } | null)?.from;
      const home = user.role === 'COMPANY' ? '/company/jobs' : '/jobs';
      navigate(from ?? home, { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  /** One-click fill for the seeded demo accounts, so a reviewer need not type. */
  const fillDemo = (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword('Password123!');
    setError(null);
  };

  return (
    <AuthShell
      title="Log in"
      subtitle="Welcome back. Pick up where you left off."
    >
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {error && <Alert variant="error">{error}</Alert>}

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

        <Field label="Password" htmlFor="password">
          {/* The reveal toggle is inside the field rather than beside it, so
              the control belongs to the input it acts on. */}
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              className="field pr-11"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
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
          Log in
        </Button>
      </form>

      <p className="mt-6 text-sm text-ink-600">
        Don&apos;t have an account?{' '}
        <Link to="/register" className="link">
          Sign up
        </Link>
      </p>

      {/* Demo credentials. Collapsed into a disclosure so the primary action of
          the page stays unambiguous for a real user. */}
      <div className="mt-10 border-t border-ink-200 pt-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
          Demo accounts
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-ink-500">
          Seeded by{' '}
          <code className="rounded bg-ink-100 px-1.5 py-0.5 font-mono text-[11px] text-ink-700">
            npm run seed
          </code>
          . All use the password{' '}
          <code className="rounded bg-ink-100 px-1.5 py-0.5 font-mono text-[11px] text-ink-700">
            Password123!
          </code>
        </p>

        <div className="mt-3.5 space-y-2">
          <DemoAccountButton
            email="seeker@demo.com"
            role="Job Seeker"
            note="applications in every status"
            onSelect={() => fillDemo('seeker@demo.com')}
          />
          <DemoAccountButton
            email="company@demo.com"
            role="Company"
            note="PT Teknologi Nusantara"
            onSelect={() => fillDemo('company@demo.com')}
          />
          <DemoAccountButton
            email="startup@demo.com"
            role="Company"
            note="Kopi Digital, no applicants yet"
            onSelect={() => fillDemo('startup@demo.com')}
          />
        </div>
      </div>
    </AuthShell>
  );
}
