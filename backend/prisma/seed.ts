/**
 * Seed data for IndoKerja.id.
 *
 * The goal is that a reviewer can open the app cold and see something
 * meaningful: jobs across every JobType and several cities, salary ranges both
 * disclosed and undisclosed, and applications spread across every Status so the
 * applicant-tracking view and the status-history timeline are not empty.
 *
 * Idempotent: wipes the domain tables and rebuilds, so it can be re-run.
 *
 *   npm run seed
 */
import { ApplicationStatus, JobType, PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const DEMO_PASSWORD = process.env.SEED_PASSWORD ?? 'Password123!';
const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS ?? 10);

/** Deterministic ids would collide across reseeds; email is the stable key. */
async function reset(): Promise<void> {
  // Order matters: children before parents. `application_history` cascades from
  // `applications`, but being explicit documents the dependency.
  await prisma.applicationHistory.deleteMany();
  await prisma.application.deleteMany();
  await prisma.job.deleteMany();
  await prisma.companyProfile.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
}

async function main(): Promise<void> {
  console.log('Seeding IndoKerja.id...\n');

  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed: NODE_ENV is production. This would delete real data.');
  }

  await reset();
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, BCRYPT_ROUNDS);

  // ---------------------------------------------------------------------------
  // Companies
  // ---------------------------------------------------------------------------
  const companies = await Promise.all(
    [
      {
        email: 'company@demo.com',
        companyName: 'PT Teknologi Nusantara',
        description:
          'Platform engineering company building logistics software for Indonesian SMEs.',
        website: 'https://teknologi-nusantara.example.com',
      },
      {
        email: 'startup@demo.com',
        companyName: 'Kopi Digital Indonesia',
        description: 'Consumer mobile apps for the F&B sector. Small team, high autonomy.',
        website: 'https://kopidigital.example.com',
      },
      {
        email: 'enterprise@demo.com',
        companyName: 'Bank Sentosa Digital',
        description: 'Digital banking arm of a national bank. Regulated, large-scale systems.',
        website: 'https://banksentosa.example.com',
      },
    ].map((company) =>
      prisma.user.create({
        data: {
          email: company.email,
          passwordHash,
          role: Role.COMPANY,
          companyProfile: {
            create: {
              companyName: company.companyName,
              description: company.description,
              website: company.website,
            },
          },
        },
      }),
    ),
  );

  const [teknologi, kopi, bank] = companies;

  // ---------------------------------------------------------------------------
  // Job seekers
  // ---------------------------------------------------------------------------
  const seekers = await Promise.all(
    ['seeker@demo.com', 'andi@demo.com', 'siti@demo.com'].map((email) =>
      prisma.user.create({
        data: { email, passwordHash, role: Role.JOB_SEEKER },
      }),
    ),
  );

  const [seeker, andi, siti] = seekers;

  // ---------------------------------------------------------------------------
  // Jobs
  // ---------------------------------------------------------------------------
  // Deliberate variety:
  //   - every JobType appears at least once
  //   - some salaries disclosed, some absent entirely ("Negotiable")
  //   - one inactive job, to prove it is hidden from the listing and refuses
  //     applications while its existing applications keep their status
  const jobDefinitions = [
    {
      companyUserId: teknologi.id,
      title: 'Backend Engineer (Node.js)',
      description:
        'Design and build REST services for our logistics platform. You will own services end to end: schema design, API contract, deployment. We run Node.js, PostgreSQL and Prisma.',
      location: 'Jakarta, Indonesia',
      jobType: JobType.FULL_TIME,
      salaryMin: 12_000_000,
      salaryMax: 20_000_000,
      isActive: true,
    },
    {
      companyUserId: teknologi.id,
      title: 'Frontend Engineer (React)',
      description:
        'Build the dashboards our logistics partners use daily. Strong React and TypeScript, an eye for responsive layout, and an interest in accessibility.',
      location: 'Jakarta, Indonesia',
      jobType: JobType.FULL_TIME,
      salaryMin: 10_000_000,
      salaryMax: 16_000_000,
      isActive: true,
    },
    {
      companyUserId: teknologi.id,
      title: 'QA Engineer (Contract)',
      description:
        'Six-month contract to build out our end-to-end test suite. Playwright experience preferred; you will be the second QA hire.',
      location: 'Remote, Indonesia',
      jobType: JobType.CONTRACT,
      salaryMin: 8_000_000,
      salaryMax: 11_000_000,
      isActive: true,
    },
    {
      companyUserId: kopi.id,
      title: 'Mobile Engineer (Flutter)',
      description:
        'Own our customer-facing app. Ship weekly, talk to users directly, and help us decide what to build next.',
      location: 'Bandung, Indonesia',
      jobType: JobType.FULL_TIME,
      salaryMin: 9_000_000,
      salaryMax: 15_000_000,
      isActive: true,
    },
    {
      companyUserId: kopi.id,
      title: 'Product Design Intern',
      description:
        'Three-month internship with a real product surface from week one. Portfolio required. Mentorship provided, but you will be expected to drive your own work.',
      location: 'Bandung, Indonesia',
      jobType: JobType.INTERNSHIP,
      salaryMin: 3_000_000,
      salaryMax: 4_500_000,
      isActive: true,
    },
    {
      companyUserId: kopi.id,
      title: 'Freelance Copywriter',
      description:
        'Occasional copy for product launches and app store listings. Indonesian and English. Paid per project.',
      location: 'Remote, Indonesia',
      jobType: JobType.FREELANCE,
      // Undisclosed salary: both bounds null renders as "Negotiable", which is
      // a distinct case from a salary of zero.
      salaryMin: null,
      salaryMax: null,
      isActive: true,
    },
    {
      companyUserId: bank.id,
      title: 'Senior Backend Engineer (Java)',
      description:
        'Core banking modernisation. High-transaction-volume services under regulatory constraints. Java, Spring Boot, Kafka, PostgreSQL.',
      location: 'Jakarta, Indonesia',
      jobType: JobType.FULL_TIME,
      salaryMin: 25_000_000,
      salaryMax: 40_000_000,
      isActive: true,
    },
    {
      companyUserId: bank.id,
      title: 'Data Analyst',
      description:
        'Turn transaction data into decisions for the retail banking team. SQL is essential; Python and dbt are a plus.',
      location: 'Jakarta, Indonesia',
      jobType: JobType.FULL_TIME,
      salaryMin: 11_000_000,
      salaryMax: 17_000_000,
      isActive: true,
    },
    {
      companyUserId: bank.id,
      title: 'IT Support Specialist (Part Time)',
      description:
        'Two days a week supporting the branch network. Hardware, networking and basic Active Directory administration.',
      location: 'Surabaya, Indonesia',
      jobType: JobType.PART_TIME,
      salaryMin: 4_000_000,
      salaryMax: 5_500_000,
      isActive: true,
    },
    {
      companyUserId: teknologi.id,
      title: 'DevOps Engineer (Closed)',
      description:
        'This posting has been filled and is kept inactive on purpose, to demonstrate that an ' +
        'inactive job is hidden from the public listing and refuses new applications while its ' +
        'existing applications keep their status.',
      location: 'Jakarta, Indonesia',
      jobType: JobType.FULL_TIME,
      salaryMin: 15_000_000,
      salaryMax: 22_000_000,
      isActive: false,
    },
  ];

  const jobs = await Promise.all(
    jobDefinitions.map((job) => prisma.job.create({ data: { currency: 'IDR', ...job } })),
  );

  const [
    backendJob,
    frontendJob,
    qaJob,
    mobileJob,
    designInternJob,
    copywriterJob,
    javaJob,
    dataJob,
    supportJob,
    closedJob,
  ] = jobs;

  // ---------------------------------------------------------------------------
  // Applications
  // ---------------------------------------------------------------------------
  /**
   * Creates an application and replays its history: one entry per status in the
   * chain, each with a plausible timestamp.
   *
   * This mirrors what the service does at runtime (the initial APPLIED entry is
   * written by the system, `changedByUserId: null`) and is the only way to seed
   * a multi-step history, since status changes are not directly writable.
   */
  async function seedApplication(params: {
    jobId: string;
    applicantUserId: string;
    statusChain: ApplicationStatus[];
    coverLetter?: string;
    noteByStatus?: Partial<Record<ApplicationStatus, string>>;
    daysAgo: number;
    companyUserId: string;
  }): Promise<void> {
    const createdAt = new Date(Date.now() - params.daysAgo * 86_400_000);

    const application = await prisma.application.create({
      data: {
        jobId: params.jobId,
        applicantUserId: params.applicantUserId,
        // Current status is the tip of the chain — the same invariant the
        // service maintains transactionally. See docs/adr/0002.
        status: params.statusChain[params.statusChain.length - 1],
        coverLetter: params.coverLetter ?? null,
        createdAt,
      },
    });

    await prisma.applicationHistory.createMany({
      data: params.statusChain.map((status, index) => ({
        applicationId: application.id,
        status,
        // The initial APPLIED entry is system-written; every later entry is
        // attributed to the company.
        changedByUserId: index === 0 ? null : params.companyUserId,
        note: index === 0 ? 'Application submitted' : (params.noteByStatus?.[status] ?? null),
        createdAt: new Date(createdAt.getTime() + index * 3_600_000),
      })),
    });
  }

  // seeker: applications spanning every status, so the seeker's "my
  // applications" view shows the full range of outcome states.
  await seedApplication({
    jobId: backendJob.id,
    applicantUserId: seeker.id,
    statusChain: [ApplicationStatus.APPLIED, ApplicationStatus.REVIEWING, ApplicationStatus.SHORTLISTED],
    coverLetter:
      'I have five years building Node.js services, most recently a payments API handling ' +
      'about 2M requests a day. I have worked with Prisma and PostgreSQL extensively.',
    noteByStatus: {
      [ApplicationStatus.REVIEWING]: 'Strong systems background, moving to technical screen.',
      [ApplicationStatus.SHORTLISTED]: 'Passed technical screen. Scheduling on-site.',
    },
    daysAgo: 12,
    companyUserId: teknologi.id,
  });

  await seedApplication({
    jobId: mobileJob.id,
    applicantUserId: seeker.id,
    statusChain: [ApplicationStatus.APPLIED, ApplicationStatus.REVIEWING],
    coverLetter: 'I shipped two Flutter apps to production and would love to work closer to users.',
    noteByStatus: { [ApplicationStatus.REVIEWING]: 'Portfolio looks good. Reviewing further.' },
    daysAgo: 6,
    companyUserId: kopi.id,
  });

  await seedApplication({
    jobId: javaJob.id,
    applicantUserId: seeker.id,
    statusChain: [ApplicationStatus.APPLIED, ApplicationStatus.REJECTED],
    noteByStatus: {
      [ApplicationStatus.REJECTED]: 'Requires deeper Java/Spring experience than the applicant has.',
    },
    daysAgo: 20,
    companyUserId: bank.id,
  });

  await seedApplication({
    jobId: dataJob.id,
    applicantUserId: seeker.id,
    statusChain: [ApplicationStatus.APPLIED, ApplicationStatus.ACCEPTED],
    coverLetter: 'SQL-heavy analytics work is exactly what I want to move into.',
    noteByStatus: { [ApplicationStatus.ACCEPTED]: 'Offer extended and accepted.' },
    daysAgo: 30,
    companyUserId: bank.id,
  });

  // The closed job: an application exists and keeps its status, demonstrating
  // that deactivating a job does not disturb existing applications.
  await seedApplication({
    jobId: closedJob.id,
    applicantUserId: seeker.id,
    statusChain: [ApplicationStatus.APPLIED, ApplicationStatus.REVIEWING],
    noteByStatus: { [ApplicationStatus.REVIEWING]: 'Role filled internally before review completed.' },
    daysAgo: 40,
    companyUserId: teknologi.id,
  });

  // andi: builds a candidate list on the backend job so the company view has
  // more than one row, and exercises the reject-then-reopen path.
  await seedApplication({
    jobId: backendJob.id,
    applicantUserId: andi.id,
    statusChain: [ApplicationStatus.APPLIED, ApplicationStatus.REVIEWING],
    coverLetter: 'Backend engineer with Go and Node experience. Interested in the logistics domain.',
    noteByStatus: { [ApplicationStatus.REVIEWING]: 'Good domain fit.' },
    daysAgo: 9,
    companyUserId: teknologi.id,
  });

  await seedApplication({
    jobId: qaJob.id,
    applicantUserId: andi.id,
    statusChain: [ApplicationStatus.APPLIED, ApplicationStatus.REJECTED, ApplicationStatus.REVIEWING],
    coverLetter: 'Playwright is my main tool. Available for the full six months.',
    noteByStatus: {
      [ApplicationStatus.REJECTED]: 'Expected more automation experience at first pass.',
      [ApplicationStatus.REVIEWING]:
        'Reopened after the interview: the earlier assessment was too hasty.',
    },
    daysAgo: 15,
    companyUserId: teknologi.id,
  });

  // siti: gives the frontend job a second candidate and spreads load.
  await seedApplication({
    jobId: frontendJob.id,
    applicantUserId: siti.id,
    statusChain: [ApplicationStatus.APPLIED],
    coverLetter: 'React and TypeScript daily for three years. I care a lot about accessible UI.',
    daysAgo: 2,
    companyUserId: teknologi.id,
  });

  await seedApplication({
    jobId: designInternJob.id,
    applicantUserId: siti.id,
    statusChain: [ApplicationStatus.APPLIED, ApplicationStatus.SHORTLISTED],
    noteByStatus: { [ApplicationStatus.SHORTLISTED]: 'Excellent portfolio for an intern.' },
    daysAgo: 4,
    companyUserId: kopi.id,
  });

  await seedApplication({
    jobId: copywriterJob.id,
    applicantUserId: siti.id,
    statusChain: [ApplicationStatus.APPLIED],
    daysAgo: 1,
    companyUserId: kopi.id,
  });

  // supportJob intentionally has no applications, so the UI can be seen in its
  // empty state.

  const counts = {
    users: await prisma.user.count(),
    jobs: await prisma.job.count(),
    applications: await prisma.application.count(),
    history: await prisma.applicationHistory.count(),
  };

  console.log('Seed complete.\n');
  console.log(`  users .............. ${counts.users}`);
  console.log(`  jobs ............... ${counts.jobs} (1 inactive)`);
  console.log(`  applications ....... ${counts.applications}`);
  console.log(`  history entries .... ${counts.history}\n`);
  console.log('Demo accounts (all use the same password):');
  console.log(`  Job Seeker  seeker@demo.com    / ${DEMO_PASSWORD}`);
  console.log(`  Job Seeker  andi@demo.com      / ${DEMO_PASSWORD}`);
  console.log(`  Company     company@demo.com   / ${DEMO_PASSWORD}  (PT Teknologi Nusantara)`);
  console.log(`  Company     startup@demo.com   / ${DEMO_PASSWORD}  (Kopi Digital Indonesia)`);
  console.log(`  Company     enterprise@demo.com/ ${DEMO_PASSWORD}  (Bank Sentosa Digital)`);
}

main()
  .catch((error) => {
    console.error('\nSeed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
