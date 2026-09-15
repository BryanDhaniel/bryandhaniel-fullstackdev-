import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { RedirectIfAuthenticated, RequireAuth } from './routes/guards';
import { useAuth } from './auth/AuthContext';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { JobListPage } from './pages/JobListPage';
import { JobDetailPage } from './pages/JobDetailPage';
import { MyApplicationsPage } from './pages/MyApplicationsPage';
import { CompanyJobsPage } from './pages/CompanyJobsPage';
import { CreateJobPage } from './pages/CreateJobPage';
import { CandidatesPage } from './pages/CandidatesPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { LoadingState } from './components/ui';

/**
 * Sends the visitor to the right home page for their role.
 *
 * Both roles exist in one app, so "/" cannot be a single page: a Job Seeker
 * wants the job listing and a Company wants its own postings. Rendering the
 * wrong one would be a dead end.
 */
function LandingRedirect() {
  const { user, isInitialising } = useAuth();

  if (isInitialising) return <LoadingState label="Restoring your session…" />;
  if (!user) return <Navigate to="/login" replace />;

  return <Navigate to={user.role === 'COMPANY' ? '/company/jobs' : '/jobs'} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<LandingRedirect />} />

        {/* Public, but redirect away once authenticated. */}
        <Route element={<RedirectIfAuthenticated />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
        </Route>

        {/* Job Seeker only. The guard also blocks a Company from these routes
            rather than merely hiding the links. */}
        <Route element={<RequireAuth role="JOB_SEEKER" />}>
          <Route path="/jobs" element={<JobListPage />} />
          <Route path="/jobs/:id" element={<JobDetailPage />} />
          <Route path="/applications" element={<MyApplicationsPage />} />
        </Route>

        {/* Company only. */}
        <Route element={<RequireAuth role="COMPANY" />}>
          <Route path="/company/jobs" element={<CompanyJobsPage />} />
          <Route path="/company/jobs/new" element={<CreateJobPage />} />
          <Route path="/company/jobs/:jobId/candidates" element={<CandidatesPage />} />
        </Route>

        {/* Anything else is genuinely not found. This used to redirect to "/",
            which hid mistyped URLs behind a silent teleport. */}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
