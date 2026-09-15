import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/Button';
import { Alert, Field } from '../components/ui';
import { getErrorMessage } from '../api/client';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
    <div className="mx-auto max-w-md py-6">
      <div className="card p-6 sm:p-8">
        <h1 className="text-xl font-semibold text-slate-900">Log in</h1>
        <p className="mt-1 text-sm text-slate-500">
          Welcome back to IndoKerja.id.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-5" noValidate>
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
            <input
              id="password"
              type="password"
              className="field"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              placeholder="••••••••"
            />
          </Field>

          <Button type="submit" isLoading={isSubmitting} className="w-full">
            Log in
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          Don't have an account?{' '}
          <Link to="/register" className="font-medium text-brand-600 hover:text-brand-700">
            Sign up
          </Link>
        </p>
      </div>

      <div className="card mt-4 p-5">
        <h2 className="text-sm font-semibold text-slate-900">Demo accounts</h2>
        <p className="mt-1 text-xs text-slate-500">
          Seeded by <code className="rounded bg-slate-100 px-1 py-0.5">npm run seed</code>. All
          use the password <code className="rounded bg-slate-100 px-1 py-0.5">Password123!</code>
        </p>
        <div className="mt-3 grid gap-2">
          {[
            { email: 'seeker@demo.com', label: 'Job Seeker', hint: 'has applications in several statuses' },
            { email: 'company@demo.com', label: 'Company', hint: 'PT Teknologi Nusantara' },
            { email: 'startup@demo.com', label: 'Company', hint: 'Kopi Digital — no applicants' },
          ].map((demo) => (
            <button
              key={demo.email}
              type="button"
              onClick={() => fillDemo(demo.email)}
              className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-left transition hover:border-brand-300 hover:bg-brand-50/50"
            >
              <span>
                <span className="block text-sm font-medium text-slate-900">{demo.email}</span>
                <span className="block text-xs text-slate-500">
                  {demo.label} — {demo.hint}
                </span>
              </span>
              <span className="text-xs font-medium text-brand-600">Use</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
