/**
 * End-to-end verification of the running API against the seeded database.
 *
 * This is a manual smoke script rather than the Jest suite (see
 * `test/app.e2e-spec.ts` for that). It exists to exercise the real HTTP surface
 * — cookies, headers, status codes — which is exactly where the interesting
 * requirements live.
 *
 *   node apitest.js
 */
const http = require('http');

const HOST = '127.0.0.1';
const PORT = 3000;
const PASSWORD = 'Password123!';

let passed = 0;
let failed = 0;

function check(label, condition, detail) {
  if (condition) {
    passed += 1;
    console.log('   PASS  ' + label + (detail !== undefined ? '  [' + detail + ']' : ''));
  } else {
    failed += 1;
    console.log('   FAIL  ' + label + (detail !== undefined ? '  [' + detail + ']' : ''));
  }
}

function request(method, path, options) {
  options = options || {};
  return new Promise(function (resolve, reject) {
    const data = options.body ? JSON.stringify(options.body) : null;
    const headers = {};
    if (data) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(data);
    }
    if (options.token) headers['Authorization'] = 'Bearer ' + options.token;
    if (options.cookie) headers['Cookie'] = options.cookie;

    const req = http.request(
      { host: HOST, port: PORT, path: path, method: method, headers: headers },
      function (res) {
        let buf = '';
        res.on('data', function (c) { buf += c; });
        res.on('end', function () {
          let parsed = buf;
          try { parsed = JSON.parse(buf); } catch (e) { /* non-JSON body */ }
          resolve({ status: res.statusCode, body: parsed, headers: res.headers });
        });
      },
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function login(email) {
  return request('POST', '/api/auth/login', { body: { email: email, password: PASSWORD } });
}

function section(title) {
  console.log('\n' + title);
}

async function main() {
  // -------------------------------------------------------------------------
  section('1. Unauthenticated access is refused (auth requirement)');
  let r = await request('GET', '/api/jobs');
  check('GET /api/jobs without a token -> 401', r.status === 401, 'got ' + r.status);

  // -------------------------------------------------------------------------
  section('2. Login returns an access token and an httpOnly refresh cookie');
  r = await login('seeker@demo.com');
  check('login -> 200', r.status === 200, 'got ' + r.status);
  if (r.status !== 200) {
    console.log('   body: ' + JSON.stringify(r.body));
    process.exit(1);
  }
  const seekerToken = r.body.accessToken;
  const setCookieHeader = (r.headers['set-cookie'] || [])[0] || '';
  const cookiePair = setCookieHeader.split(';')[0];

  check('access token present in body', typeof seekerToken === 'string' && seekerToken.length > 20);
  check('access token NOT returned as a cookie', !setCookieHeader.includes(seekerToken.slice(0, 20)));
  check('refresh cookie is HttpOnly', /HttpOnly/i.test(setCookieHeader), setCookieHeader.replace(/^[^;]+;/, ''));
  check('refresh cookie is SameSite=Lax', /SameSite=Lax/i.test(setCookieHeader));
  check('expiresIn is 900s (15m)', r.body.expiresIn === 900, 'got ' + r.body.expiresIn);

  // -------------------------------------------------------------------------
  section('3. Credential failures are refused');
  r = await login('seeker@demo.com');
  r = await request('POST', '/api/auth/login', { body: { email: 'seeker@demo.com', password: 'wrong-password' } });
  check('wrong password -> 401', r.status === 401, 'got ' + r.status);

  r = await request('POST', '/api/auth/login', { body: { email: 'nobody@demo.com', password: PASSWORD } });
  check('unknown email -> 401', r.status === 401, 'got ' + r.status);
  check(
    'identical message for both (no account enumeration)',
    r.body.message === 'Invalid email or password',
    r.body.message,
  );

  // -------------------------------------------------------------------------
  section('4. GET /api/auth/me');
  r = await request('GET', '/api/auth/me', { token: seekerToken });
  check('me -> 200', r.status === 200, 'got ' + r.status);
  check('me returns the right user', r.body.email === 'seeker@demo.com', r.body.email);
  check('password hash is never exposed', !('passwordHash' in r.body));
  check('no refresh token in the me response', !JSON.stringify(r.body).includes('refreshToken'));

  // -------------------------------------------------------------------------
  section('5. Job listing (requirement 2)');
  r = await request('GET', '/api/jobs?limit=50', { token: seekerToken });
  check('list -> 200', r.status === 200);
  const jobs = r.body.data || [];
  check('meta.total is present', typeof r.body.meta.total === 'number', 'total=' + r.body.meta.total);
  check('page size respected', jobs.length <= 50, jobs.length + ' rows');

  const sample = jobs[0];
  if (sample) {
    check('job has title', typeof sample.title === 'string');
    check('job has company.companyName', !!(sample.company && sample.company.companyName));
    check('job has location', typeof sample.location === 'string');
    check('job has jobType', typeof sample.jobType === 'string');
    check('job has salary fields', 'salaryMin' in sample && 'salaryMax' in sample);
    check('job carries hasApplied', typeof sample.hasApplied === 'boolean');
  }

  check(
    'inactive job is hidden from the listing',
    !jobs.some(function (j) { return j.title.indexOf('Closed') !== -1; }),
  );
  check(
    'undisclosed salary survives as null (renders "Negotiable")',
    jobs.some(function (j) { return j.salaryMin === null && j.salaryMax === null; }),
  );
  check(
    'all five JobTypes are represented in the seed',
    new Set(jobs.map(function (j) { return j.jobType; })).size >= 4,
    Array.from(new Set(jobs.map(function (j) { return j.jobType; }))).join(','),
  );

  // Pagination actually pages.
  const page1 = await request('GET', '/api/jobs?limit=3&page=1', { token: seekerToken });
  const page2 = await request('GET', '/api/jobs?limit=3&page=2', { token: seekerToken });
  check('pagination limit honoured', page1.body.data.length === 3, page1.body.data.length + ' rows');
  check(
    'page 2 returns different rows than page 1',
    page1.body.data[0].id !== page2.body.data[0].id,
  );

  // -------------------------------------------------------------------------
  section('6. Duplicate application is refused (requirement 5)');
  const appliedJob = jobs.find(function (j) { return j.hasApplied; });
  check('at least one seeded job already has an application from this seeker', !!appliedJob);
  if (appliedJob) {
    check('hasApplied=true reflected on the listing', appliedJob.hasApplied === true);
    r = await request('POST', '/api/jobs/' + appliedJob.id + '/applications', { token: seekerToken, body: {} });
    check('re-applying -> 409 Conflict', r.status === 409, 'got ' + r.status + ' ' + r.body.message);
  }

  // -------------------------------------------------------------------------
  section('7. A fresh application succeeds (requirements 3 & 9)');
  const notApplied = jobs.find(function (j) { return !j.hasApplied; });
  check('an unapplied job exists for this to be meaningful', !!notApplied);
  if (notApplied) {
    r = await request('POST', '/api/jobs/' + notApplied.id + '/applications', {
      token: seekerToken,
      body: { coverLetter: 'Automated verification of the apply endpoint.' },
    });
    check('apply -> 201', r.status === 201, 'got ' + r.status + ' ' + JSON.stringify(r.body));
    check('new application starts as APPLIED', r.body.status === 'APPLIED', r.body.status);
    const newAppId = r.body.id;

    r = await request('GET', '/api/applications/me/' + newAppId, { token: seekerToken });
    check('the new application has exactly one history entry', r.body.history.length === 1, r.body.history.length);
    check('the initial entry is APPLIED', r.body.history[0].status === 'APPLIED', r.body.history[0].status);
    check(
      'the initial entry is attributed to the system, not a user',
      r.body.history[0].changedByUserId === null,
      String(r.body.history[0].changedByUserId),
    );

    // Clean up so re-runs stay idempotent in spirit.
    r = await request('POST', '/api/jobs/' + notApplied.id + '/applications', { token: seekerToken, body: {} });
    check('immediately re-applying still -> 409', r.status === 409, 'got ' + r.status);
  }

  // -------------------------------------------------------------------------
  section('8. Role boundaries: a Company cannot apply (requirement 6 guard)');
  r = await login('company@demo.com');
  check('company login -> 200', r.status === 200, 'got ' + r.status);
  const companyToken = r.body.accessToken;

  const anyJob = jobs[0];
  r = await request('POST', '/api/jobs/' + anyJob.id + '/applications', { token: companyToken, body: {} });
  check('company applying -> 403', r.status === 403, 'got ' + r.status + ' ' + r.body.message);

  r = await request('GET', '/api/applications/me', { token: companyToken });
  check('company reading "my applications" -> 403', r.status === 403, 'got ' + r.status);

  // -------------------------------------------------------------------------
  section('9. Role boundaries: a Job Seeker cannot create or manage jobs');
  r = await request('POST', '/api/jobs', {
    token: seekerToken,
    body: { title: 'x', description: 'x', location: 'x', jobType: 'FULL_TIME' },
  });
  check('seeker creating a job -> 403', r.status === 403, 'got ' + r.status);

  r = await request('GET', '/api/jobs/mine', { token: seekerToken });
  check('seeker reading /jobs/mine -> 403', r.status === 403, 'got ' + r.status);

  // -------------------------------------------------------------------------
  section('10. Company creates a job (requirement 6)');
  r = await request('POST', '/api/jobs', {
    token: companyToken,
    body: {
      title: 'Verification Engineer',
      description: 'Created by the automated verification script.',
      location: 'Yogyakarta, Indonesia',
      jobType: 'CONTRACT',
      salaryMin: 7_000_000,
      salaryMax: 9_000_000,
    },
  });
  check('create job -> 201', r.status === 201, 'got ' + r.status + ' ' + JSON.stringify(r.body));
  const createdJobId = r.body.id;
  check('created job belongs to the calling company', !!createdJobId);

  r = await request('POST', '/api/jobs', {
    token: companyToken,
    body: { title: 'Bad', description: 'x', location: 'x', jobType: 'FULL_TIME', salaryMin: 9_000_000, salaryMax: 1_000_000 },
  });
  check('salaryMin > salaryMax -> 400', r.status === 400, 'got ' + r.status);

  r = await request('POST', '/api/jobs', {
    token: companyToken,
    body: { title: 'Bad', description: 'x', location: 'x', jobType: 'NOT_A_TYPE' },
  });
  check('invalid enum value -> 400 (API validation)', r.status === 400, 'got ' + r.status);

  r = await request('POST', '/api/jobs', {
    token: companyToken,
    body: { title: 'Sneaky', description: 'x', location: 'x', jobType: 'FULL_TIME', companyUserId: 'someone-else' },
  });
  check('unknown property is rejected -> 400 (whitelist)', r.status === 400, 'got ' + r.status);

  // -------------------------------------------------------------------------
  section('11. Company reads candidates on its own job (requirement 7)');
  r = await request('GET', '/api/jobs/mine', { token: companyToken });
  check('GET /api/jobs/mine -> 200', r.status === 200, 'got ' + r.status);
  const ownJobs = r.body;
  const jobWithCandidates = ownJobs.find(function (j) { return j.applicationCount > 0; });
  check('a company job has candidates', !!jobWithCandidates, jobWithCandidates && jobWithCandidates.title);

  r = await request('GET', '/api/jobs/' + jobWithCandidates.id + '/applications', { token: companyToken });
  check('read candidates -> 200', r.status === 200, 'got ' + r.status);
  const candidates = r.body;
  check('candidates returned', candidates.length > 0, candidates.length + ' candidates');
  check('candidate exposes their email', !!(candidates[0].candidate && candidates[0].candidate.email));
  check('candidate includes full history', Array.isArray(candidates[0].history));
  check('candidate never exposes a password hash', !('passwordHash' in candidates[0].candidate));

  r = await request('GET', '/api/jobs/' + jobWithCandidates.id + '/applications?status=SHORTLISTED', { token: companyToken });
  check('status filter works', r.status === 200 && r.body.every(function (c) { return c.status === 'SHORTLISTED'; }), r.body.length + ' rows');

  // -------------------------------------------------------------------------
  section('12. Cross-tenant isolation: 404, not 403 (authorization)');
  r = await login('startup@demo.com');
  const otherCompanyToken = r.body.accessToken;

  r = await request('GET', '/api/jobs/' + jobWithCandidates.id + '/applications', { token: otherCompanyToken });
  check("another company reading candidates -> 404", r.status === 404, 'got ' + r.status + ' ' + r.body.message);

  r = await request('PATCH', '/api/jobs/' + jobWithCandidates.id, {
    token: otherCompanyToken,
    body: { title: 'Hijacked' },
  });
  check("another company editing the job -> 404", r.status === 404, 'got ' + r.status);

  // -------------------------------------------------------------------------
  section('13. Status change is recorded in history (requirements 8 & 9)');
  const target = candidates[0];
  const historyBefore = target.history.length;
  const statusBefore = target.status;

  r = await request('PATCH', '/api/applications/' + target.id + '/status', {
    token: companyToken,
    body: { status: 'SHORTLISTED', note: 'Verification: moving to shortlist.' },
  });
  check('status change -> 200', r.status === 200, 'got ' + r.status + ' ' + JSON.stringify(r.body));
  check('response reports the transition', r.body.previousStatus === statusBefore && r.body.status === 'SHORTLISTED');

  r = await request('GET', '/api/jobs/' + jobWithCandidates.id + '/applications', { token: companyToken });
  const updated = r.body.find(function (c) { return c.id === target.id; });
  check('current status updated', updated.status === 'SHORTLISTED', updated.status);
  check(
    'history grew by exactly one entry',
    updated.history.length === historyBefore + 1,
    historyBefore + ' -> ' + updated.history.length,
  );
  const newest = updated.history[updated.history.length - 1];
  check('newest history entry has the new status', newest.status === 'SHORTLISTED', newest.status);
  check('newest history entry attributes the company', newest.changedByUserId !== null);
  check('the note was persisted', newest.note === 'Verification: moving to shortlist.', newest.note);
  check('full history chain is preserved', updated.history[0].status === 'APPLIED', updated.history[0].status);

  // -------------------------------------------------------------------------
  section('14. Status rules');
  r = await request('PATCH', '/api/applications/' + target.id + '/status', {
    token: companyToken,
    body: { status: 'APPLIED' },
  });
  check('setting APPLIED manually -> 400', r.status === 400, 'got ' + r.status + ' ' + r.body.message);

  r = await request('PATCH', '/api/applications/' + target.id + '/status', {
    token: companyToken,
    body: { status: 'NOT_A_REAL_STATUS' },
  });
  check('invalid status -> 400', r.status === 400, 'got ' + r.status);

  // No-op: same status again should not write a duplicate history row.
  r = await request('PATCH', '/api/applications/' + target.id + '/status', {
    token: companyToken,
    body: { status: 'SHORTLISTED' },
  });
  check('no-op status change reports changed=false', r.body.changed === false, JSON.stringify(r.body));

  r = await request('GET', '/api/jobs/' + jobWithCandidates.id + '/applications', { token: companyToken });
  const afterNoop = r.body.find(function (c) { return c.id === target.id; });
  check(
    'no-op did not add a history row',
    afterNoop.history.length === updated.history.length,
    afterNoop.history.length + ' vs ' + updated.history.length,
  );

  // Reopening a REJECTED application must work — there is no state machine.
  r = await request('PATCH', '/api/applications/' + target.id + '/status', {
    token: companyToken,
    body: { status: 'REJECTED', note: 'Verification: reject.' },
  });
  check('-> REJECTED', r.status === 200 && r.body.status === 'REJECTED', JSON.stringify(r.body));
  r = await request('PATCH', '/api/applications/' + target.id + '/status', {
    token: companyToken,
    body: { status: 'REVIEWING', note: 'Verification: reopened after rejection.' },
  });
  check(
    'REJECTED can be reopened to REVIEWING (no state machine)',
    r.status === 200 && r.body.status === 'REVIEWING',
    JSON.stringify(r.body),
  );

  // A company may not touch an application belonging to another company.
  r = await request('PATCH', '/api/applications/' + target.id + '/status', {
    token: otherCompanyToken,
    body: { status: 'ACCEPTED' },
  });
  check('cross-tenant status change -> 404', r.status === 404, 'got ' + r.status);

  // -------------------------------------------------------------------------
  section('15. Seeker sees own applications with statuses (requirement 4)');
  r = await request('GET', '/api/applications/me?includeHistory=true', { token: seekerToken });
  check('my applications -> 200', r.status === 200, 'got ' + r.status);
  check('applications returned', r.body.length > 0, r.body.length + ' applications');
  check('each carries a status', r.body.every(function (a) { return !!a.status; }));
  check('each carries its job', r.body.every(function (a) { return a.job && a.job.title; }));
  check('includeHistory adds the timeline', r.body.every(function (a) { return Array.isArray(a.history); }));
  const statuses = Array.from(new Set(r.body.map(function (a) { return a.status; })));
  check('the seed spread applications across several statuses', statuses.length >= 3, statuses.join(','));

  // A seeker may not read another seeker's application.
  r = await login('andi@demo.com');
  const otherSeekerToken = r.body.accessToken;
  const myAppId = (await request('GET', '/api/applications/me', { token: seekerToken })).body[0].id;
  r = await request('GET', '/api/applications/me/' + myAppId, { token: otherSeekerToken });
  check("another seeker reading my application -> 404", r.status === 404, 'got ' + r.status);

  // -------------------------------------------------------------------------
  section('16. Refresh rotation and real logout (session security)');
  r = await request('POST', '/api/auth/refresh', { cookie: cookiePair });
  check('refresh with the cookie -> 200', r.status === 200, 'got ' + r.status);
  check('a new access token was issued', !!r.body.accessToken);
  const rotatedCookie = ((r.headers['set-cookie'] || [])[0] || '').split(';')[0];
  check('a new refresh cookie was set (rotation)', rotatedCookie !== cookiePair && rotatedCookie.length > 0);

  r = await request('POST', '/api/auth/refresh', { cookie: cookiePair });
  check('reusing the OLD refresh cookie -> 401', r.status === 401, 'got ' + r.status + ' ' + r.body.message);

  r = await request('POST', '/api/auth/logout', { cookie: rotatedCookie });
  check('logout -> 204', r.status === 204, 'got ' + r.status);

  r = await request('POST', '/api/auth/refresh', { cookie: rotatedCookie });
  check('refresh after logout -> 401 (server-side revocation)', r.status === 401, 'got ' + r.status);

  // -------------------------------------------------------------------------
  section('17. Error shape is consistent');
  r = await request('GET', '/api/jobs/not-a-uuid', { token: seekerToken });
  check('malformed uuid -> 400', r.status === 400, 'got ' + r.status);
  check('error body has statusCode/error/message/path/timestamp',
    'statusCode' in r.body && 'error' in r.body && 'message' in r.body && 'path' in r.body && 'timestamp' in r.body,
    JSON.stringify(r.body));

  r = await request('GET', '/api/jobs/00000000-0000-0000-0000-000000000000', { token: seekerToken });
  check('well-formed but absent uuid -> 404', r.status === 404, 'got ' + r.status);

  r = await request('GET', '/api/jobs/nowhere', { token: 'garbage.token.value' });
  check('garbage token -> 401', r.status === 401, 'got ' + r.status);

  // -------------------------------------------------------------------------
  console.log('\n' + '='.repeat(60));
  console.log('  ' + passed + ' passed, ' + failed + ' failed');
  console.log('='.repeat(60));
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(function (e) {
  console.error('FATAL: ' + e.message);
  process.exit(1);
});
