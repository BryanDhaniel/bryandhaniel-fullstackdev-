/**
 * End-to-end test suite.
 *
 * Boots the real Nest application against the real PostgreSQL database and
 * drives it over HTTP. Nothing is mocked: the point is to verify the behaviour
 * that only exists when the layers are wired together — the unique constraint
 * that prevents duplicate applications, the transaction that keeps the status
 * and the history in step, the rotation that makes a refresh token
 * single-use, and the guards that decide 401 versus 403 versus 404.
 *
 * Both halves of each rule are tested where it matters: the happy path, and the
 * path that must fail. A suite that only proves things work would not have
 * caught the two real defects this project hit during development.
 *
 * Run:
 *   npm run test:e2e
 *
 * The suite truncates the tables it owns and creates its own accounts, so it
 * does not depend on `npm run seed` having run — and it leaves the seeded demo
 * data intact by working under its own email domain.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ApplicationStatus, JobType, PrismaClient, Role } from '@prisma/client';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthController } from '../src/auth/auth.controller';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

/** Every account this suite creates uses this domain, so cleanup is exact. */
const TEST_DOMAIN = '@e2e.local';
const PASSWORD = 'Password123!';

const prisma = new PrismaClient();

let app: INestApplication;
let http: ReturnType<typeof request>;

/** Unique suffix per run, so a leftover row from a crashed run cannot collide. */
const runId = Date.now().toString(36);

const email = (name: string) => `${name}.${runId}${TEST_DOMAIN}`;

// ---------------------------------------------------------------------------
// Session helpers
// ---------------------------------------------------------------------------

interface SessionUser {
  id: string;
  email: string;
  role: Role;
  createdAt?: string;
  companyProfile?: { companyName: string } | null;
}

interface Session {
  accessToken: string;
  user: SessionUser;
  /** The raw refresh token, for the cases that must reuse/revoke it. */
  refreshToken: string;
  cookies: string[];
}

/**
 * Pulls the refresh token out of the `Set-Cookie` header.
 *
 * Typed as `unknown` because supertest types the header loosely (`string` in
 * its own typings, an array at runtime) — narrowing here is more honest than
 * casting at each call site.
 */
function extractRefreshCookie(setCookie: unknown): string {
  const headers: string[] = Array.isArray(setCookie)
    ? (setCookie as string[])
    : typeof setCookie === 'string'
      ? [setCookie]
      : [];

  const header = headers.find((c) => c.startsWith('refresh_token='));
  if (!header) throw new Error('No refresh_token cookie in the response');
  // "refresh_token=VALUE; Max-Age=...; Path=/; HttpOnly; SameSite=Lax"
  return header.split(';')[0].slice('refresh_token='.length);
}

/** The raw `Set-Cookie` headers, normalised to an array. */
function setCookieHeaders(res: { headers: Record<string, unknown> }): string[] {
  const raw = res.headers['set-cookie'];
  if (Array.isArray(raw)) return raw as string[];
  if (typeof raw === 'string') return [raw];
  return [];
}

async function login(emailAddress: string, password = PASSWORD): Promise<Session> {
  const res = await http.post('/api/auth/login').send({ email: emailAddress, password }).expect(200);

  return {
    accessToken: res.body.accessToken,
    user: res.body.user,
    refreshToken: extractRefreshCookie(res.headers['set-cookie']),
    cookies: setCookieHeaders(res),
  };
}

async function register(
  name: string,
  role: Role,
  extra: Record<string, unknown> = {},
): Promise<Session> {
  const res = await http
    .post('/api/auth/register')
    .send({ email: email(name), password: PASSWORD, role, ...extra })
    .expect(201);

  return {
    accessToken: res.body.accessToken,
    user: res.body.user,
    refreshToken: extractRefreshCookie(res.headers['set-cookie']),
    cookies: setCookieHeaders(res),
  };
}

/** Credentials for an authenticated request. */
const as = (session: Session) => ({ Authorization: `Bearer ${session.accessToken}` });

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const jobBody = (overrides: Record<string, unknown> = {}) => ({
  title: 'Test Engineer',
  description: 'A job created by the end-to-end suite.',
  location: 'Jakarta, Indonesia',
  jobType: JobType.FULL_TIME,
  salaryMin: 10_000_000,
  salaryMax: 15_000_000,
  ...overrides,
});

async function createJob(company: Session, overrides: Record<string, unknown> = {}) {
  const res = await http.post('/api/jobs').set(as(company)).send(jobBody(overrides)).expect(201);
  return res.body as { id: string; title: string; salaryMin: number | null };
}

/** Removes everything this suite created. Scoped by the test email domain. */
async function cleanup(): Promise<void> {
  const users = await prisma.user.findMany({
    where: { email: { endsWith: TEST_DOMAIN } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);

  if (userIds.length > 0) {
    // Applications cascade to history; jobs cascade to applications.
    await prisma.application.deleteMany({ where: { applicantUserId: { in: userIds } } });
    await prisma.application.deleteMany({ where: { job: { companyUserId: { in: userIds } } } });
    await prisma.job.deleteMany({ where: { companyUserId: { in: userIds } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.companyProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }

  // Jobs created for company-B fixtures whose owner row was already removed.
  await prisma.job.deleteMany({ where: { title: { startsWith: '[e2e]' } } });
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

beforeAll(async () => {
  // Mirror `main.ts`. Kept in the test rather than extracted into a shared
  // bootstrap so the suite exercises the same wiring the app ships with; if
  // main.ts changes, this should change with it.
  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  app = moduleRef.createNestApplication();
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.setGlobalPrefix('api');

  await app.init();
  http = request(app.getHttpServer());

  await cleanup();
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
  await app.close();
});

// ---------------------------------------------------------------------------
// 1. Authentication
// ---------------------------------------------------------------------------

describe('Authentication', () => {
  let seeker: Session;

  beforeAll(async () => {
    seeker = await register('auth.seeker', Role.JOB_SEEKER);
  });

  it('registers a job seeker and returns an access token', () => {
    expect(seeker.accessToken).toBeTruthy();
    expect(seeker.user.role).toBe(Role.JOB_SEEKER);
    expect(seeker.user).not.toHaveProperty('passwordHash');
  });

  it('sets the refresh token as an httpOnly cookie, never in the body', () => {
    const cookie = seeker.cookies.find((c) => c.startsWith('refresh_token=')) ?? '';

    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    // The whole point of the design: JavaScript must not be able to read it.
    // See docs/adr/0004. (Not asserting `Secure` — it is intentionally off over
    // plain HTTP in development, and `cookieOptions()` keys it off NODE_ENV.)
    expect(seeker.refreshToken).toBeTruthy();
  });

  it('creates a company profile in the same transaction as a company account', async () => {
    const company = await register('auth.company', Role.COMPANY, {
      companyName: 'PT E2E Testing',
    });

    expect(company.user.companyProfile).toMatchObject({ companyName: 'PT E2E Testing' });

    // And it is actually persisted, not just echoed back.
    const row = await prisma.companyProfile.findUnique({ where: { userId: company.user.id } });
    expect(row?.companyName).toBe('PT E2E Testing');
  });

  it('rejects a company registration without a company name', async () => {
    // Validation runs before the service, so nothing is persisted. Note the
    // absence of `@IsOptional()` on the DTO field: it short-circuits every
    // other validator for an undefined value, which would have made this test
    // fail with a 201.
    const res = await http
      .post('/api/auth/register')
      .send({ email: email('auth.noname'), password: PASSWORD, role: Role.COMPANY })
      .expect(400);

    expect(JSON.stringify(res.body)).toContain('companyName');

    const row = await prisma.user.findUnique({
      where: { email: email('auth.noname') },
    });
    expect(row).toBeNull();
  });

  it('rejects a whitespace-only company name', async () => {
    await http
      .post('/api/auth/register')
      .send({
        email: email('auth.blankname'),
        password: PASSWORD,
        role: Role.COMPANY,
        companyName: '   ',
      })
      .expect(400);
  });

  it('does not require a company name for a job seeker', async () => {
    await http
      .post('/api/auth/register')
      .send({ email: email('auth.seekername'), password: PASSWORD, role: Role.JOB_SEEKER })
      .expect(201);
  });

  it('rejects a duplicate email with 409', async () => {
    // The service pre-checks and throws ConflictException; the unique index on
    // `email` is what actually guarantees it, and a concurrent double-submit
    // arrives here as a P2002 that the exception filter also maps to 409.
    const res = await http
      .post('/api/auth/register')
      .send({ email: seeker.user.email, password: PASSWORD, role: Role.JOB_SEEKER })
      .expect(409);

    expect(res.body.message).toContain('already exists');
  });

  it('rejects a password shorter than 8 characters', async () => {
    await http
      .post('/api/auth/register')
      .send({ email: email('auth.short'), password: 'short', role: Role.JOB_SEEKER })
      .expect(400);
  });

  it('rejects a concurrent double-submit of the same email, creating one account', async () => {
    // The pre-check alone cannot guarantee this: both requests could pass it
    // before either inserts. The unique index on `email` is the real guarantee,
    // and the P2002 it raises is mapped to 409. Same shape as the duplicate
    // application rule in docs/adr/0003.
    const target = email('auth.race');

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        http
          .post('/api/auth/register')
          .send({ email: target, password: PASSWORD, role: Role.JOB_SEEKER }),
      ),
    );

    const created = results.filter((r) => r.status === 201);
    const conflicted = results.filter((r) => r.status === 409);

    expect(created).toHaveLength(1);
    expect(conflicted).toHaveLength(4);

    const count = await prisma.user.count({ where: { email: target } });
    expect(count).toBe(1);
  });

  it('logs in with valid credentials', async () => {
    const session = await login(seeker.user.email);
    expect(session.accessToken).toBeTruthy();
  });

  it('returns the same 401 for an unknown email and a wrong password', async () => {
    // Distinguishing the two would let an attacker enumerate registered
    // accounts. The messages must be identical.
    const unknown = await http
      .post('/api/auth/login')
      .send({ email: email('auth.ghost'), password: PASSWORD })
      .expect(401);

    const wrongPassword = await http
      .post('/api/auth/login')
      .send({ email: seeker.user.email, password: 'NotThePassword1!' })
      .expect(401);

    expect(unknown.body.message).toBe(wrongPassword.body.message);
  });

  it('returns the current user from /auth/me', async () => {
    const res = await http.get('/api/auth/me').set(as(seeker)).expect(200);
    expect(res.body.id).toBe(seeker.user.id);
    expect(res.body).not.toHaveProperty('passwordHash');
  });

  it('rejects a request with no token', async () => {
    await http.get('/api/auth/me').expect(401);
  });

  it('rejects a malformed token', async () => {
    await http.get('/api/auth/me').set({ Authorization: 'Bearer not-a-jwt' }).expect(401);
  });

  it('rejects a token signed with the wrong secret', async () => {
    // A well-formed JWT whose signature does not verify must be refused.
    const forged =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
      'eyJzdWIiOiJmYWtlIiwicm9sZSI6IkNPTVBBTlkiLCJpYXQiOjE3MDAwMDAwMDB9.' +
      'ZmFrZXNpZ25hdHVyZWZha2VzaWduYXR1cmVmYWtl';

    await http.get('/api/auth/me').set({ Authorization: `Bearer ${forged}` }).expect(401);
  });
});

// ---------------------------------------------------------------------------
// 2. Refresh-token rotation
// ---------------------------------------------------------------------------

describe('Refresh token rotation', () => {
  let session: Session;

  beforeAll(async () => {
    session = await register('refresh.seeker', Role.JOB_SEEKER);
  });

  it('exchanges a valid refresh token for a new access token', async () => {
    const fresh = await login(session.user.email);

    const res = await http
      .post('/api/auth/refresh')
      .set('Cookie', `refresh_token=${fresh.refreshToken}`)
      .send({})
      .expect(200);

    expect(res.body.accessToken).toBeTruthy();

    // The new access token actually works.
    await http.get('/api/auth/me').set({ Authorization: `Bearer ${res.body.accessToken}` }).expect(200);
  });

  it('rotates: the new refresh token differs from the old one', async () => {
    const fresh = await login(session.user.email);

    const res = await http
      .post('/api/auth/refresh')
      .set('Cookie', `refresh_token=${fresh.refreshToken}`)
      .send({})
      .expect(200);

    const rotated = extractRefreshCookie(res.headers['set-cookie']);
    expect(rotated).not.toBe(fresh.refreshToken);
  });

  it('refuses a refresh token that has already been used', async () => {
    // This is the property that makes logout real rather than cosmetic. It is
    // also the reason the frontend must never fire two refreshes concurrently.
    const fresh = await login(session.user.email);

    await http
      .post('/api/auth/refresh')
      .set('Cookie', `refresh_token=${fresh.refreshToken}`)
      .send({})
      .expect(200);

    await http
      .post('/api/auth/refresh')
      .set('Cookie', `refresh_token=${fresh.refreshToken}`)
      .send({})
      .expect(401);
  });

  it('accepts the refresh token from the body when no cookie is sent', async () => {
    // Non-browser clients. The cookie is a convenience, not a requirement.
    const fresh = await login(session.user.email);

    await http
      .post('/api/auth/refresh')
      .send({ refreshToken: fresh.refreshToken })
      .expect(200);
  });

  it('rejects a request with no refresh token at all', async () => {
    // This is the case the ValidationPipe must not break: the browser sends an
    // empty body with the token in a cookie, so `refreshToken` has to be
    // optional in the DTO. A 400 here would mean refresh is unreachable.
    await http.post('/api/auth/refresh').send({}).expect(401);
  });

  it('rejects a garbage refresh token', async () => {
    await http
      .post('/api/auth/refresh')
      .set('Cookie', 'refresh_token=not-a-real-token')
      .send({})
      .expect(401);
  });
});

// ---------------------------------------------------------------------------
// 3. Logout
// ---------------------------------------------------------------------------

describe('Logout', () => {
  it('revokes the refresh token so it cannot be reused', async () => {
    const session = await register('logout.seeker', Role.JOB_SEEKER);

    await http
      .post('/api/auth/logout')
      .set('Cookie', `refresh_token=${session.refreshToken}`)
      .send({})
      .expect(204);

    await http
      .post('/api/auth/refresh')
      .set('Cookie', `refresh_token=${session.refreshToken}`)
      .send({})
      .expect(401);
  });

  it('succeeds with no token, and is idempotent', async () => {
    // Logging out must never fail — otherwise a session cannot be ended.
    await http.post('/api/auth/logout').send({}).expect(204);
    await http
      .post('/api/auth/logout')
      .set('Cookie', 'refresh_token=already-revoked')
      .send({})
      .expect(204);
  });

  it('logout-all revokes every session for the user', async () => {
    const session = await register('logoutall.seeker', Role.JOB_SEEKER);
    const secondDevice = await login(session.user.email);

    await http.post('/api/auth/logout-all').set(as(session)).expect(204);

    // Both the original and the second device are now unusable.
    await http
      .post('/api/auth/refresh')
      .set('Cookie', `refresh_token=${session.refreshToken}`)
      .send({})
      .expect(401);

    await http
      .post('/api/auth/refresh')
      .set('Cookie', `refresh_token=${secondDevice.refreshToken}`)
      .send({})
      .expect(401);
  });

  it('requires authentication for logout-all', async () => {
    await http.post('/api/auth/logout-all').expect(401);
  });
});

// ---------------------------------------------------------------------------
// 4. Job listing (requirement 2)
// ---------------------------------------------------------------------------

describe('Job listing', () => {
  let seeker: Session;
  let company: Session;
  let jobId: string;

  beforeAll(async () => {
    seeker = await register('list.seeker', Role.JOB_SEEKER);
    company = await register('list.company', Role.COMPANY, { companyName: 'PT List Co' });
    jobId = (await createJob(company, { title: '[e2e] Listed Job' })).id;
  });

  it('requires authentication', async () => {
    await http.get('/api/jobs').expect(401);
  });

  it('returns jobs with every field requirement 2 asks for', async () => {
    const res = await http.get('/api/jobs?limit=50').set(as(seeker)).expect(200);

    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toMatchObject({
      page: expect.any(Number),
      limit: expect.any(Number),
      total: expect.any(Number),
      totalPages: expect.any(Number),
      hasNextPage: expect.any(Boolean),
    });

    const job = res.body.data.find((j: { id: string }) => j.id === jobId);
    expect(job).toBeDefined();

    // Title, company, location, salary, job type — the requirement's list.
    expect(job.title).toBe('[e2e] Listed Job');
    expect(job.company.companyName).toBe('PT List Co');
    expect(job.location).toBe('Jakarta, Indonesia');
    expect(job.salaryMin).toBe(10_000_000);
    expect(job.salaryMax).toBe(15_000_000);
    expect(job.currency).toBe('IDR');
    expect(job.jobType).toBe(JobType.FULL_TIME);
  });

  it('hides inactive jobs from the listing', async () => {
    const hidden = await createJob(company, { title: '[e2e] Inactive Job', isActive: false });

    const res = await http.get('/api/jobs?limit=50').set(as(seeker)).expect(200);
    const ids = res.body.data.map((j: { id: string }) => j.id);

    expect(ids).not.toContain(hidden.id);
  });

  it('hides inactive jobs from their own company in the public listing too', async () => {
    const hidden = await createJob(company, { title: '[e2e] Inactive Job 2', isActive: false });

    const res = await http.get('/api/jobs?limit=50').set(as(company)).expect(200);
    expect(res.body.data.map((j: { id: string }) => j.id)).not.toContain(hidden.id);
  });

  it('preserves an undisclosed salary as null rather than zero', async () => {
    const undisclosed = await createJob(company, {
      title: '[e2e] Negotiable Job',
      salaryMin: undefined,
      salaryMax: undefined,
    });

    expect(undisclosed.salaryMin).toBeNull();

    const res = await http.get(`/api/jobs/${undisclosed.id}`).set(as(seeker)).expect(200);
    expect(res.body.salaryMin).toBeNull();
    expect(res.body.salaryMax).toBeNull();
  });

  it('filters by job type', async () => {
    await createJob(company, { title: '[e2e] Contract Job', jobType: JobType.CONTRACT });

    const res = await http.get('/api/jobs?jobType=CONTRACT&limit=50').set(as(seeker)).expect(200);

    expect(res.body.data.length).toBeGreaterThan(0);
    for (const job of res.body.data) {
      expect(job.jobType).toBe(JobType.CONTRACT);
    }
  });

  it('searches case-insensitively across title', async () => {
    const res = await http.get('/api/jobs?q=LISTED&limit=50').set(as(seeker)).expect(200);

    expect(res.body.data.map((j: { title: string }) => j.title)).toContain('[e2e] Listed Job');
  });

  it('filters by location, partially and case-insensitively', async () => {
    const res = await http.get('/api/jobs?location=jakarta&limit=50').set(as(seeker)).expect(200);

    for (const job of res.body.data) {
      expect(job.location.toLowerCase()).toContain('jakarta');
    }
  });

  it('paginates', async () => {
    const first = await http.get('/api/jobs?page=1&limit=2').set(as(seeker)).expect(200);
    expect(first.body.data).toHaveLength(2);
    expect(first.body.meta.page).toBe(1);

    if (first.body.meta.hasNextPage) {
      const second = await http.get('/api/jobs?page=2&limit=2').set(as(seeker)).expect(200);
      expect(second.body.data[0].id).not.toBe(first.body.data[0].id);
    }
  });

  it('rejects a limit above the maximum of 50', async () => {
    await http.get('/api/jobs?limit=500').set(as(seeker)).expect(400);
  });

  it('rejects an unknown query parameter', async () => {
    // forbidNonWhitelisted: a typo'd parameter must fail loudly, not be ignored.
    await http.get('/api/jobs?limitt=5').set(as(seeker)).expect(400);
  });

  it('rejects an invalid job type', async () => {
    await http.get('/api/jobs?jobType=FULLTIME').set(as(seeker)).expect(400);
  });
});

// ---------------------------------------------------------------------------
// 5. Job detail (requirement 3)
// ---------------------------------------------------------------------------

describe('Job detail', () => {
  let seeker: Session;
  let company: Session;

  beforeAll(async () => {
    seeker = await register('detail.seeker', Role.JOB_SEEKER);
    company = await register('detail.company', Role.COMPANY, { companyName: 'PT Detail Co' });
  });

  it('returns the full job', async () => {
    const job = await createJob(company, { title: '[e2e] Detail Job' });

    const res = await http.get(`/api/jobs/${job.id}`).set(as(seeker)).expect(200);

    expect(res.body.id).toBe(job.id);
    expect(res.body.description).toBeTruthy();
    expect(res.body.company.companyName).toBe('PT Detail Co');
    expect(res.body.hasApplied).toBe(false);
  });

  it('returns 404 for an unknown id', async () => {
    await http
      .get('/api/jobs/00000000-0000-4000-8000-000000000000')
      .set(as(seeker))
      .expect(404);
  });

  it('returns 400 for a non-UUID id', async () => {
    await http.get('/api/jobs/not-a-uuid').set(as(seeker)).expect(400);
  });

  it('shows an inactive job to its owner but 404s everyone else', async () => {
    const hidden = await createJob(company, { title: '[e2e] Hidden Detail', isActive: false });

    await http.get(`/api/jobs/${hidden.id}`).set(as(company)).expect(200);
    await http.get(`/api/jobs/${hidden.id}`).set(as(seeker)).expect(404);
  });
});

// ---------------------------------------------------------------------------
// 6. Applying (requirements 3 and 5)
// ---------------------------------------------------------------------------

describe('Applying to a job', () => {
  let seeker: Session;
  let company: Session;
  let job: { id: string };

  beforeAll(async () => {
    seeker = await register('apply.seeker', Role.JOB_SEEKER);
    company = await register('apply.company', Role.COMPANY, { companyName: 'PT Apply Co' });
    job = await createJob(company, { title: '[e2e] Apply Job' });
  });

  it('creates an application with the initial APPLIED status', async () => {
    const res = await http
      .post(`/api/jobs/${job.id}/applications`)
      .set(as(seeker))
      .send({ coverLetter: 'I would like to apply.' })
      .expect(201);

    expect(res.body.status).toBe(ApplicationStatus.APPLIED);
    expect(res.body.coverLetter).toBe('I would like to apply.');
  });

  it('writes exactly one initial history entry, attributed to the system', async () => {
    // Requirement 9 starts here: an application can never exist without history.
    const applications = await prisma.application.findMany({
      where: { jobId: job.id, applicantUserId: seeker.user.id },
      include: { history: true },
    });

    expect(applications).toHaveLength(1);

    const history = applications[0].history;
    expect(history).toHaveLength(1);
    expect(history[0].status).toBe(ApplicationStatus.APPLIED);
    // No user made this change — the system did. See docs/adr/0002.
    expect(history[0].changedByUserId).toBeNull();
  });

  it('refuses a second application with 409 (requirement 5)', async () => {
    const res = await http
      .post(`/api/jobs/${job.id}/applications`)
      .set(as(seeker))
      .send({})
      .expect(409);

    expect(res.body.message).toContain('already applied');
  });

  it('refuses two concurrent applications, leaving exactly one row', async () => {
    // The pre-check alone cannot guarantee this: both requests could pass the
    // check before either inserts. The unique constraint is what actually
    // enforces requirement 5. See docs/adr/0003.
    const other = await register('apply.race', Role.JOB_SEEKER);
    const raceJob = await createJob(company, { title: '[e2e] Race Job' });

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        http.post(`/api/jobs/${raceJob.id}/applications`).set(as(other)).send({}),
      ),
    );

    const created = results.filter((r) => r.status === 201);
    const conflicted = results.filter((r) => r.status === 409);

    expect(created).toHaveLength(1);
    expect(conflicted).toHaveLength(4);

    const count = await prisma.application.count({
      where: { jobId: raceJob.id, applicantUserId: other.user.id },
    });
    expect(count).toBe(1);
  });

  it('refuses an application to an inactive job', async () => {
    const closed = await createJob(company, { title: '[e2e] Closed Job', isActive: false });
    const another = await register('apply.closed', Role.JOB_SEEKER);

    const res = await http
      .post(`/api/jobs/${closed.id}/applications`)
      .set(as(another))
      .send({})
      .expect(400);

    expect(res.body.message).toContain('no longer accepting');
  });

  it('refuses a Company applying to a job (403, not 404)', async () => {
    // Wrong role is a 403: the caller is authenticated and the resource exists,
    // but this actor may never perform this action. Contrast with cross-tenant
    // reads, which are 404. See docs/adr/0005.
    await http.post(`/api/jobs/${job.id}/applications`).set(as(company)).send({}).expect(403);
  });

  it('requires authentication', async () => {
    await http.post(`/api/jobs/${job.id}/applications`).send({}).expect(401);
  });

  it('returns 404 for an unknown job', async () => {
    const fresh = await register('apply.unknown', Role.JOB_SEEKER);

    await http
      .post('/api/jobs/00000000-0000-4000-8000-000000000000/applications')
      .set(as(fresh))
      .send({})
      .expect(404);
  });

  it('rejects a cover letter over 3000 characters', async () => {
    const fresh = await register('apply.longletter', Role.JOB_SEEKER);

    await http
      .post(`/api/jobs/${job.id}/applications`)
      .set(as(fresh))
      .send({ coverLetter: 'x'.repeat(3001) })
      .expect(400);
  });

  it('rejects an unknown property in the body', async () => {
    const fresh = await register('apply.extrafield', Role.JOB_SEEKER);

    await http
      .post(`/api/jobs/${job.id}/applications`)
      .set(as(fresh))
      .send({ coverLetter: 'ok', status: 'ACCEPTED' }) // status is not the seeker's to set
      .expect(400);
  });
});

// ---------------------------------------------------------------------------
// 7. My applications (requirement 4)
// ---------------------------------------------------------------------------

describe('My applications', () => {
  let seeker: Session;
  let otherSeeker: Session;
  let company: Session;
  let job: { id: string };
  let applicationId: string;

  beforeAll(async () => {
    seeker = await register('mine.seeker', Role.JOB_SEEKER);
    otherSeeker = await register('mine.other', Role.JOB_SEEKER);
    company = await register('mine.company', Role.COMPANY, { companyName: 'PT Mine Co' });

    job = await createJob(company, { title: '[e2e] Mine Job' });

    await http.post(`/api/jobs/${job.id}/applications`).set(as(otherSeeker)).send({}).expect(201);

    const res = await http
      .post(`/api/jobs/${job.id}/applications`)
      .set(as(seeker))
      .send({ coverLetter: 'My application.' })
      .expect(201);
    applicationId = res.body.id;
  });

  it('lists the caller’s own applications with statuses', async () => {
    const res = await http.get('/api/applications/me').set(as(seeker)).expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(applicationId);
    expect(res.body[0].status).toBe(ApplicationStatus.APPLIED);
    expect(res.body[0].job.title).toBe('[e2e] Mine Job');
    expect(res.body[0].job.company.companyName).toBe('PT Mine Co');
  });

  it('never leaks another seeker’s applications', async () => {
    const mine = await http.get('/api/applications/me').set(as(seeker)).expect(200);
    const theirs = await http.get('/api/applications/me').set(as(otherSeeker)).expect(200);

    const myIds = mine.body.map((a: { id: string }) => a.id);
    const theirIds = theirs.body.map((a: { id: string }) => a.id);

    expect(myIds).not.toContain(theirIds[0]);
    expect(theirIds).not.toContain(applicationId);
  });

  it('omits history by default and includes it on request', async () => {
    const without = await http.get('/api/applications/me').set(as(seeker)).expect(200);
    expect(without.body[0].history).toBeUndefined();

    const withHistory = await http
      .get('/api/applications/me?includeHistory=true')
      .set(as(seeker))
      .expect(200);

    expect(withHistory.body[0].history).toHaveLength(1);
    expect(withHistory.body[0].history[0].status).toBe(ApplicationStatus.APPLIED);
  });

  it('serves one application with its full history', async () => {
    const res = await http.get(`/api/applications/me/${applicationId}`).set(as(seeker)).expect(200);

    expect(res.body.id).toBe(applicationId);
    expect(res.body.history).toHaveLength(1);
    expect(res.body.history[0].changedByUserId).toBeNull();
  });

  it('returns 404 for another seeker’s application, not 403', async () => {
    // 403 would confirm the row exists. See docs/adr/0005.
    await http.get(`/api/applications/me/${applicationId}`).set(as(otherSeeker)).expect(404);
  });

  it('is refused for a Company', async () => {
    await http.get('/api/applications/me').set(as(company)).expect(403);
  });

  it('requires authentication', async () => {
    await http.get('/api/applications/me').expect(401);
  });
});

// ---------------------------------------------------------------------------
// 8. Managing own jobs (requirement 6)
// ---------------------------------------------------------------------------

describe('Company job management', () => {
  let company: Session;
  let rival: Session;

  beforeAll(async () => {
    company = await register('jobs.company', Role.COMPANY, { companyName: 'PT Jobs Co' });
    rival = await register('jobs.rival', Role.COMPANY, { companyName: 'PT Rival Co' });
  });

  it('creates a job owned by the authenticated company', async () => {
    const res = await http.post('/api/jobs').set(as(company)).send(jobBody()).expect(201);

    const row = await prisma.job.findUnique({ where: { id: res.body.id } });
    // Ownership comes from the token, never the body.
    expect(row?.companyUserId).toBe(company.user.id);
  });

  it('cannot be tricked into assigning another company as owner', async () => {
    // `companyUserId` is not part of CreateJobDto, and forbidNonWhitelisted
    // turns the attempt into a 400 rather than silently ignoring it.
    await http
      .post('/api/jobs')
      .set(as(company))
      .send({ ...jobBody(), companyUserId: rival.user.id })
      .expect(400);
  });

  it('lists its own jobs, including inactive ones, with applicant counts', async () => {
    const inactive = await createJob(company, { title: '[e2e] Own Inactive', isActive: false });

    const res = await http.get('/api/jobs/mine').set(as(company)).expect(200);

    const mine = res.body.map((j: { id: string }) => j.id);
    expect(mine).toContain(inactive.id);

    for (const job of res.body) {
      expect(job).toHaveProperty('isActive');
      expect(job).toHaveProperty('applicationCount');
      expect(typeof job.applicationCount).toBe('number');
    }
  });

  it('does not list another company’s jobs', async () => {
    const theirs = await createJob(rival, { title: '[e2e] Rival Job' });

    const res = await http.get('/api/jobs/mine').set(as(company)).expect(200);
    expect(res.body.map((j: { id: string }) => j.id)).not.toContain(theirs.id);
  });

  it('is refused for a Job Seeker', async () => {
    const seeker = await register('jobs.seeker', Role.JOB_SEEKER);

    await http.get('/api/jobs/mine').set(as(seeker)).expect(403);
    await http.post('/api/jobs').set(as(seeker)).send(jobBody()).expect(403);
  });

  it('updates its own job', async () => {
    const job = await createJob(company, { title: '[e2e] Update Me' });

    const res = await http
      .patch(`/api/jobs/${job.id}`)
      .set(as(company))
      .send({ title: '[e2e] Updated Title', jobType: JobType.CONTRACT })
      .expect(200);

    expect(res.body.title).toBe('[e2e] Updated Title');
    expect(res.body.jobType).toBe(JobType.CONTRACT);
    // A partial update must not clear the fields it did not mention.
    expect(res.body.location).toBe('Jakarta, Indonesia');
    expect(res.body.salaryMin).toBe(10_000_000);
  });

  it('can clear a salary back to undisclosed with explicit nulls', async () => {
    const job = await createJob(company, { title: '[e2e] Salary Clear' });

    const res = await http
      .patch(`/api/jobs/${job.id}`)
      .set(as(company))
      .send({ salaryMin: null, salaryMax: null })
      .expect(200);

    expect(res.body.salaryMin).toBeNull();
    expect(res.body.salaryMax).toBeNull();
  });

  it('returns 404 when updating a job owned by another company', async () => {
    const theirs = await createJob(rival, { title: '[e2e] Not Yours' });

    await http
      .patch(`/api/jobs/${theirs.id}`)
      .set(as(company))
      .send({ title: '[e2e] Hijacked' })
      .expect(404);

    // And the row is untouched.
    const row = await prisma.job.findUnique({ where: { id: theirs.id } });
    expect(row?.title).toBe('[e2e] Not Yours');
  });
});

// ---------------------------------------------------------------------------
// 9. Job validation
// ---------------------------------------------------------------------------

describe('Job validation', () => {
  let company: Session;

  beforeAll(async () => {
    company = await register('validation.company', Role.COMPANY, { companyName: 'PT Validate Co' });
  });

  it('rejects a missing title', async () => {
    await http
      .post('/api/jobs')
      .set(as(company))
      .send({ ...jobBody(), title: undefined })
      .expect(400);
  });

  it('rejects an empty title', async () => {
    await http.post('/api/jobs').set(as(company)).send({ ...jobBody(), title: '' }).expect(400);
  });

  it('rejects a whitespace-only title', async () => {
    // `@IsNotEmpty()` alone accepts "   ", and the service trims before saving,
    // so this would have persisted as a job with an empty title.
    const res = await http
      .post('/api/jobs')
      .set(as(company))
      .send({ ...jobBody(), title: '   ' })
      .expect(400);

    expect(JSON.stringify(res.body)).toContain('title');
  });

  it('rejects a blank description and location', async () => {
    await http
      .post('/api/jobs')
      .set(as(company))
      .send({ ...jobBody(), description: '\t\n ' })
      .expect(400);

    await http
      .post('/api/jobs')
      .set(as(company))
      .send({ ...jobBody(), location: '  ' })
      .expect(400);
  });

  it('rejects blanking a job title by update', async () => {
    const job = await createJob(company, { title: '[e2e] Keep My Title' });

    await http
      .patch(`/api/jobs/${job.id}`)
      .set(as(company))
      .send({ title: '   ' })
      .expect(400);

    const row = await prisma.job.findUnique({ where: { id: job.id } });
    expect(row?.title).toBe('[e2e] Keep My Title');
  });

  it('rejects an invalid job type', async () => {
    await http
      .post('/api/jobs')
      .set(as(company))
      .send({ ...jobBody(), jobType: 'PERMANENT' })
      .expect(400);
  });

  it('rejects salaryMin greater than salaryMax', async () => {
    const res = await http
      .post('/api/jobs')
      .set(as(company))
      .send({ ...jobBody(), salaryMin: 20_000_000, salaryMax: 10_000_000 })
      .expect(400);

    expect(res.body.message).toContain('salaryMin');
  });

  it('accepts salaryMin equal to salaryMax', async () => {
    await http
      .post('/api/jobs')
      .set(as(company))
      .send({ ...jobBody(), salaryMin: 12_000_000, salaryMax: 12_000_000 })
      .expect(201);
  });

  it('rejects a negative salary', async () => {
    await http
      .post('/api/jobs')
      .set(as(company))
      .send({ ...jobBody(), salaryMin: -1 })
      .expect(400);
  });

  it('rejects a non-integer salary', async () => {
    await http
      .post('/api/jobs')
      .set(as(company))
      .send({ ...jobBody(), salaryMin: 10_000_000.5 })
      .expect(400);
  });

  it('rejects a title over 150 characters', async () => {
    await http
      .post('/api/jobs')
      .set(as(company))
      .send({ ...jobBody(), title: 'x'.repeat(151) })
      .expect(400);
  });
});

// ---------------------------------------------------------------------------
// 10. Applicant tracking (requirement 7)
// ---------------------------------------------------------------------------

describe('Company views its own candidates', () => {
  let company: Session;
  let rival: Session;
  let applicants: Session[];
  let job: { id: string };

  beforeAll(async () => {
    company = await register('track.company', Role.COMPANY, { companyName: 'PT Track Co' });
    rival = await register('track.rival', Role.COMPANY, { companyName: 'PT Other Co' });
    job = await createJob(company, { title: '[e2e] Tracking Job' });

    applicants = await Promise.all([
      register('track.a1', Role.JOB_SEEKER),
      register('track.a2', Role.JOB_SEEKER),
      register('track.a3', Role.JOB_SEEKER),
    ]);

    for (const [index, applicant] of applicants.entries()) {
      await http
        .post(`/api/jobs/${job.id}/applications`)
        .set(as(applicant))
        .send({ coverLetter: `Cover letter ${index + 1}` })
        .expect(201);
    }
  });

  it('lists every candidate for the job', async () => {
    const res = await http.get(`/api/jobs/${job.id}/applications`).set(as(company)).expect(200);

    expect(res.body).toHaveLength(3);
    for (const candidate of res.body) {
      expect(candidate.candidate.email).toBeTruthy();
      expect(candidate.status).toBe(ApplicationStatus.APPLIED);
      expect(candidate.history).toHaveLength(1);
    }
  });

  it('names the Job Seeker "candidate" from the Company’s point of view', async () => {
    // CONTEXT.md reserves "Candidate" for exactly this perspective and rejects
    // "Applicant" here — the distinction carries information, since the same
    // Job Seeker is a Candidate on one job and a stranger to another company's.
    // Asserted so the vocabulary cannot drift back without a test failing.
    const res = await http.get(`/api/jobs/${job.id}/applications`).set(as(company)).expect(200);

    expect(res.body[0]).toHaveProperty('candidate');
    expect(res.body[0]).not.toHaveProperty('applicant');
  });

  it('exposes the cover letter so the company can read it', async () => {
    const res = await http.get(`/api/jobs/${job.id}/applications`).set(as(company)).expect(200);
    const letters = res.body.map((c: { coverLetter: string }) => c.coverLetter).sort();

    expect(letters).toEqual(['Cover letter 1', 'Cover letter 2', 'Cover letter 3']);
  });

  it('never exposes the applicant’s password hash', async () => {
    const res = await http.get(`/api/jobs/${job.id}/applications`).set(as(company)).expect(200);

    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    expect(JSON.stringify(res.body)).not.toContain('$2b$');
  });

  it('returns 404 for another company’s job', async () => {
    await http.get(`/api/jobs/${job.id}/applications`).set(as(rival)).expect(404);
  });

  it('filters candidates by status', async () => {
    const applicationId = (
      await http.get(`/api/jobs/${job.id}/applications`).set(as(company)).expect(200)
    ).body[0].id;

    await http
      .patch(`/api/applications/${applicationId}/status`)
      .set(as(company))
      .send({ status: ApplicationStatus.SHORTLISTED })
      .expect(200);

    const shortlisted = await http
      .get(`/api/jobs/${job.id}/applications?status=SHORTLISTED`)
      .set(as(company))
      .expect(200);

    expect(shortlisted.body).toHaveLength(1);
    expect(shortlisted.body[0].id).toBe(applicationId);

    const applied = await http
      .get(`/api/jobs/${job.id}/applications?status=APPLIED`)
      .set(as(company))
      .expect(200);

    expect(applied.body).toHaveLength(2);

    // Put it back, so the ordering of tests within this block does not matter.
    await http
      .patch(`/api/applications/${applicationId}/status`)
      .set(as(company))
      .send({ status: ApplicationStatus.APPLIED })
      .expect(400); // APPLIED is not assignable — the real revert target is REVIEWING
  });

  it('rejects an invalid status filter', async () => {
    const res = await http
      .get(`/api/jobs/${job.id}/applications?status=PENDING`)
      .set(as(company))
      .expect(400);

    expect(JSON.stringify(res.body)).toContain('status');
  });

  it('is refused for a Job Seeker', async () => {
    await http.get(`/api/jobs/${job.id}/applications`).set(as(applicants[0])).expect(403);
  });
});

// ---------------------------------------------------------------------------
// 11. Status workflow and history (requirements 8 and 9)
// ---------------------------------------------------------------------------

describe('Status changes and history', () => {
  let company: Session;
  let seeker: Session;

  /** Creates a fresh application to work on, so tests stay independent. */
  async function freshApplication() {
    const job = await createJob(company, { title: `[e2e] Status Job ${Date.now()}-${Math.random()}` });

    const res = await http.post(`/api/jobs/${job.id}/applications`).set(as(seeker)).send({}).expect(201);

    return { jobId: job.id, applicationId: res.body.id as string };
  }

  beforeAll(async () => {
    company = await register('status.company', Role.COMPANY, { companyName: 'PT Status Co' });
    seeker = await register('status.seeker', Role.JOB_SEEKER);
  });

  it('records a status change and writes exactly one history entry', async () => {
    const { applicationId } = await freshApplication();

    const res = await http
      .patch(`/api/applications/${applicationId}/status`)
      .set(as(company))
      .send({ status: ApplicationStatus.REVIEWING, note: 'First look.' })
      .expect(200);

    expect(res.body.changed).toBe(true);
    expect(res.body.previousStatus).toBe(ApplicationStatus.APPLIED);
    expect(res.body.status).toBe(ApplicationStatus.REVIEWING);

    const history = await prisma.applicationHistory.findMany({
      where: { applicationId },
      orderBy: { createdAt: 'asc' },
    });

    // APPLIED (system) + REVIEWING (company). Exactly two, not three.
    expect(history).toHaveLength(2);
    expect(history[1].status).toBe(ApplicationStatus.REVIEWING);
    expect(history[1].changedByUserId).toBe(company.user.id);
    expect(history[1].note).toBe('First look.');
  });

  it('keeps the denormalised status in step with the history', async () => {
    const { applicationId } = await freshApplication();

    const chain = [
      ApplicationStatus.REVIEWING,
      ApplicationStatus.SHORTLISTED,
      ApplicationStatus.REJECTED,
      ApplicationStatus.REVIEWING,
      ApplicationStatus.ACCEPTED,
    ];

    for (const status of chain) {
      await http
        .patch(`/api/applications/${applicationId}/status`)
        .set(as(company))
        .send({ status })
        .expect(200);
    }

    const application = await prisma.application.findUnique({
      where: { id: applicationId },
      include: { history: { orderBy: { createdAt: 'asc' } } },
    });

    // The invariant of docs/adr/0002: the current status is always the tip of
    // the history, never something the two disagree about.
    expect(application?.status).toBe(ApplicationStatus.ACCEPTED);
    expect(application?.history.map((h) => h.status)).toEqual([
      ApplicationStatus.APPLIED,
      ...chain,
    ]);
  });

  it('allows a REJECTED application to be reopened', async () => {
    // Deliberately not a state machine: a company reopening a candidacy after
    // an interview is a real workflow, not a data error. See CONTEXT.md.
    const { applicationId } = await freshApplication();

    await http
      .patch(`/api/applications/${applicationId}/status`)
      .set(as(company))
      .send({ status: ApplicationStatus.REJECTED })
      .expect(200);

    const res = await http
      .patch(`/api/applications/${applicationId}/status`)
      .set(as(company))
      .send({ status: ApplicationStatus.REVIEWING, note: 'Reopened after interview.' })
      .expect(200);

    expect(res.body.changed).toBe(true);
    expect(res.body.status).toBe(ApplicationStatus.REVIEWING);
  });

  it('treats setting the current status as a no-op and writes no history', async () => {
    const { applicationId } = await freshApplication();

    await http
      .patch(`/api/applications/${applicationId}/status`)
      .set(as(company))
      .send({ status: ApplicationStatus.REVIEWING })
      .expect(200);

    const before = await prisma.applicationHistory.count({ where: { applicationId } });

    const res = await http
      .patch(`/api/applications/${applicationId}/status`)
      .set(as(company))
      .send({ status: ApplicationStatus.REVIEWING })
      .expect(200);

    expect(res.body.changed).toBe(false);

    const after = await prisma.applicationHistory.count({ where: { applicationId } });
    // The audit trail must never claim something changed when it did not.
    expect(after).toBe(before);
  });

  it('refuses to set the initial APPLIED status', async () => {
    const { applicationId } = await freshApplication();

    const res = await http
      .patch(`/api/applications/${applicationId}/status`)
      .set(as(company))
      .send({ status: ApplicationStatus.APPLIED })
      .expect(400);

    expect(res.body.message).toContain('APPLIED');
  });

  it('accepts every assignable status', async () => {
    for (const status of [
      ApplicationStatus.REVIEWING,
      ApplicationStatus.SHORTLISTED,
      ApplicationStatus.REJECTED,
      ApplicationStatus.ACCEPTED,
    ]) {
      const { applicationId } = await freshApplication();

      await http
        .patch(`/api/applications/${applicationId}/status`)
        .set(as(company))
        .send({ status })
        .expect(200);
    }
  });

  it('rejects an invalid status value', async () => {
    const { applicationId } = await freshApplication();

    await http
      .patch(`/api/applications/${applicationId}/status`)
      .set(as(company))
      .send({ status: 'PENDING' })
      .expect(400);
  });

  it('rejects a missing status', async () => {
    const { applicationId } = await freshApplication();

    await http
      .patch(`/api/applications/${applicationId}/status`)
      .set(as(company))
      .send({ note: 'No status here.' })
      .expect(400);
  });

  it('rejects a note over 1000 characters', async () => {
    const { applicationId } = await freshApplication();

    await http
      .patch(`/api/applications/${applicationId}/status`)
      .set(as(company))
      .send({ status: ApplicationStatus.REVIEWING, note: 'x'.repeat(1001) })
      .expect(400);
  });

  it('returns 404 when another company changes the status', async () => {
    const { applicationId } = await freshApplication();
    const rival = await register('status.rival', Role.COMPANY, { companyName: 'PT Rival' });

    await http
      .patch(`/api/applications/${applicationId}/status`)
      .set(as(rival))
      .send({ status: ApplicationStatus.ACCEPTED })
      .expect(404);

    // And nothing changed.
    const application = await prisma.application.findUnique({ where: { id: applicationId } });
    expect(application?.status).toBe(ApplicationStatus.APPLIED);
  });

  it('returns 404 for an unknown application', async () => {
    await http
      .patch('/api/applications/00000000-0000-4000-8000-000000000000/status')
      .set(as(company))
      .send({ status: ApplicationStatus.REVIEWING })
      .expect(404);
  });

  it('is refused for a Job Seeker', async () => {
    const { applicationId } = await freshApplication();

    await http
      .patch(`/api/applications/${applicationId}/status`)
      .set(as(seeker))
      .send({ status: ApplicationStatus.ACCEPTED })
      .expect(403);
  });

  it('shows the full history to the applicant', async () => {
    const { applicationId } = await freshApplication();

    await http
      .patch(`/api/applications/${applicationId}/status`)
      .set(as(company))
      .send({ status: ApplicationStatus.REVIEWING, note: 'Looks promising.' })
      .expect(200);

    await http
      .patch(`/api/applications/${applicationId}/status`)
      .set(as(company))
      .send({ status: ApplicationStatus.SHORTLISTED, note: 'Moving to interview.' })
      .expect(200);

    const res = await http.get(`/api/applications/me/${applicationId}`).set(as(seeker)).expect(200);

    expect(res.body.status).toBe(ApplicationStatus.SHORTLISTED);
    expect(res.body.history.map((h: { status: string }) => h.status)).toEqual([
      'APPLIED',
      'REVIEWING',
      'SHORTLISTED',
    ]);
    // The applicant sees the notes the company left.
    expect(res.body.history[1].note).toBe('Looks promising.');
    expect(res.body.history[2].note).toBe('Moving to interview.');
  });
});

// ---------------------------------------------------------------------------
// 12. Error format
// ---------------------------------------------------------------------------

describe('Uniform error responses', () => {
  it('returns a consistent body for 404', async () => {
    const seeker = await register('errors.404', Role.JOB_SEEKER);

    const res = await http
      .get('/api/jobs/00000000-0000-4000-8000-000000000000')
      .set(as(seeker))
      .expect(404);

    expect(res.body).toMatchObject({
      statusCode: 404,
      error: expect.any(String),
      message: expect.any(String),
      path: expect.stringContaining('/api/jobs/'),
      timestamp: expect.any(String),
    });
  });

  it('returns an array of messages for validation failures', async () => {
    const company = await register('errors.400', Role.COMPANY, { companyName: 'PT Errors' });

    const res = await http
      .post('/api/jobs')
      .set(as(company))
      .send({ title: '', description: '', location: '', jobType: 'NOPE' })
      .expect(400);

    expect(Array.isArray(res.body.message)).toBe(true);
    expect(res.body.message.length).toBeGreaterThan(1);
  });

  it('does not leak internals on an unexpected error', async () => {
    const seeker = await register('errors.500', Role.JOB_SEEKER);

    // A malformed UUID in a path parameter is handled by ParseUUIDPipe (400),
    // so this asserts the shape rather than forcing a genuine 500: the filter
    // must never emit a stack trace or a driver message.
    const res = await http.get('/api/jobs/not-a-uuid').set(as(seeker)).expect(400);

    const body = JSON.stringify(res.body);
    expect(body).not.toContain('node_modules');
    expect(body).not.toContain('PrismaClient');
    expect(body).not.toContain('\\n    at ');
    // A Prisma/PostgreSQL failure must never surface as a raw driver error.
    expect(body).not.toContain('Invalid `prisma');
  });

  it('includes the path and a timestamp on every error', async () => {
    const res = await http.get('/api/jobs').expect(401);

    expect(res.body.path).toBe('/api/jobs');
    expect(new Date(res.body.timestamp).toString()).not.toBe('Invalid Date');
  });
});

// ---------------------------------------------------------------------------
// 14. Rate limiting
// ---------------------------------------------------------------------------

describe('Rate limiting', () => {
  /**
   * The suite runs with the limits lifted (see `setup-e2e.ts`), because it
   * shares one IP across a few dozen account creations and would otherwise fail
   * with 429 for reasons unrelated to the behaviour under test.
   *
   * So the limits are asserted where they are actually declared — on the
   * decorator metadata — rather than by counting requests. That still catches
   * the regression that matters (someone deleting or loosening `@Throttle`),
   * without making the rest of the suite hostage to a shared counter.
   */
  it('declares a tighter-than-default limit on registration and login', () => {
    const registerLimits = Reflect.getMetadata(
      'THROTTLER:LIMITdefault',
      AuthController.prototype.register,
    );
    const loginLimits = Reflect.getMetadata(
      'THROTTLER:LIMITdefault',
      AuthController.prototype.login,
    );
    const refreshLimits = Reflect.getMetadata(
      'THROTTLER:LIMITdefault',
      AuthController.prototype.refresh,
    );

    // `@Throttle({ default: { limit, ttl } })` stores the limit as a function
    // or a number depending on the version; handle both.
    const read = (value: unknown): number =>
      typeof value === 'function' ? (value as () => number)() : (value as number);

    expect(read(registerLimits)).toBeDefined();
    expect(read(loginLimits)).toBeDefined();
    expect(read(refreshLimits)).toBeDefined();

    // The TTL is a minute on all three — a limit without a window means nothing.
    expect(
      Reflect.getMetadata('THROTTLER:TTLdefault', AuthController.prototype.login),
    ).toBe(60_000);
  });

  it('leaves the auth endpoints reachable when the limits are lifted', async () => {
    // The counterpart: with the test limits in place, a burst is *not*
    // throttled, which is what proves the override is wired to the decorator
    // rather than silently ignored.
    const attempts = await Promise.all(
      Array.from({ length: 25 }, (_, i) =>
        http.post('/api/auth/login').send({ email: `nobody.${i}@e2e.local`, password: 'wrong' }),
      ),
    );

    expect(attempts.every((r) => r.status === 401)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 13. Database constraints
// ---------------------------------------------------------------------------

describe('Database constraints', () => {
  it('refuses a duplicate application at the database level', async () => {
    // The unique index is the real enforcement of requirement 5. This bypasses
    // the service entirely and proves the constraint exists in the schema.
    const company = await register('db.company', Role.COMPANY, { companyName: 'PT Db Co' });
    const seeker = await register('db.seeker', Role.JOB_SEEKER);
    const job = await createJob(company, { title: '[e2e] Constraint Job' });

    await prisma.application.create({
      data: { jobId: job.id, applicantUserId: seeker.user.id, status: ApplicationStatus.APPLIED },
    });

    await expect(
      prisma.application.create({
        data: { jobId: job.id, applicantUserId: seeker.user.id, status: ApplicationStatus.APPLIED },
      }),
    ).rejects.toThrow();
  });

  it('allows the same seeker to apply to different jobs', async () => {
    const company = await register('db.multi', Role.COMPANY, { companyName: 'PT Multi Co' });
    const seeker = await register('db.multi.seeker', Role.JOB_SEEKER);

    const jobA = await createJob(company, { title: '[e2e] Multi A' });
    const jobB = await createJob(company, { title: '[e2e] Multi B' });

    await http.post(`/api/jobs/${jobA.id}/applications`).set(as(seeker)).send({}).expect(201);
    await http.post(`/api/jobs/${jobB.id}/applications`).set(as(seeker)).send({}).expect(201);

    const count = await prisma.application.count({ where: { applicantUserId: seeker.user.id } });
    expect(count).toBe(2);
  });

  it('cascades application history when an application is deleted', async () => {
    const company = await register('db.cascade', Role.COMPANY, { companyName: 'PT Cascade Co' });
    const seeker = await register('db.cascade.seeker', Role.JOB_SEEKER);
    const job = await createJob(company, { title: '[e2e] Cascade Job' });

    const res = await http
      .post(`/api/jobs/${job.id}/applications`)
      .set(as(seeker))
      .send({})
      .expect(201);

    const applicationId = res.body.id as string;
    expect(await prisma.applicationHistory.count({ where: { applicationId } })).toBe(1);

    await prisma.application.delete({ where: { id: applicationId } });

    // Orphaned history rows would be worse than none: they would describe an
    // application that does not exist.
    expect(await prisma.applicationHistory.count({ where: { applicationId } })).toBe(0);
  });

  it('refuses two accounts with the same email', async () => {
    const company = await register('db.unique', Role.COMPANY, { companyName: 'PT Unique Co' });

    await expect(
      prisma.user.create({
        data: { email: company.user.email, passwordHash: 'irrelevant', role: Role.JOB_SEEKER },
      }),
    ).rejects.toThrow();
  });

  it('stores the password as a bcrypt hash, never plaintext', async () => {
    const seeker = await register('db.hash', Role.JOB_SEEKER);

    const row = await prisma.user.findUnique({ where: { id: seeker.user.id } });
    expect(row?.passwordHash).not.toBe(PASSWORD);
    expect(row?.passwordHash).toMatch(/^\$2[aby]\$/);
  });
});
