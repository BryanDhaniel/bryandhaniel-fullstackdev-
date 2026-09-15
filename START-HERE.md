# IndoKerja.id — Manual Start Guide

Everything is currently **stopped**, except PostgreSQL 18, which runs as a
Windows service and starts automatically with the machine.

Open **3 terminals**. For each one, `cd` into the project first:

```bash
cd /c/Users/bryan/OneDrive/Documents/Project/jobapp
```

---

## 0. PostgreSQL — nothing to do

The database is **PostgreSQL 18**, installed natively at
`C:\Program Files\PostgreSQL\18` and registered as Windows service
`postgresql-x64-18`. Windows starts it for you on boot.

- Port **5433**
- Role `indokerja` / password `indokerja`, database `indokerja`
- Data lives in `C:\Program Files\PostgreSQL\18\data`

Check it is up:

```bash
netstat -ano | grep LISTENING | grep ":5433"
```

To manage it, open **Services** (`Win+R` → `services.msc`) and look for
`postgresql-x64-18`, or use pgAdmin from the Start menu.

> **Why not port 5432?** An older embedded PostgreSQL 16 used to hold this
> data on port `5432`. It has been replaced and removed entirely — port 5432
> now belongs to nothing. PostgreSQL 18 on `5433` is the only database
> involved, so there is no chance of editing the wrong one.

---

## 1. Backend API

```bash
cd /c/Users/bryan/OneDrive/Documents/Project/jobapp/backend
npm run start:dev
```

- Wait for: `Nest application successfully started`
- API: http://localhost:3000
- Swagger docs: http://localhost:3000/api/docs

---

## 2. Frontend dev server

```bash
cd /c/Users/bryan/OneDrive/Documents/Project/jobapp/frontend
npm run dev
```

- Open http://localhost:5173
- Only run **one** instance. A second one silently moves to port 5174 and the
  API's CORS setting (`CORS_ORIGIN=http://localhost:5173`) will reject it.

---

## 3. Prisma Studio (optional — database GUI)

```bash
cd /c/Users/bryan/OneDrive/Documents/Project/jobapp/backend
npx prisma studio
```

- Open http://localhost:5555
- Browse and edit every table visually.

---

## Demo logins

Password for all seeded accounts: `Password123!`

| Role     | Email                |
|----------|----------------------|
| Seeker   | `seeker@demo.com`    |
| Seeker   | `seeker2@demo.com`   |
| Company  | `company@demo.com`   |
| Company  | `company2@demo.com`  |
| Company  | `company3@demo.com`  |

---

## Sanity checks

Confirm the API is really yours (and not a stale process on the same port):

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/docs   # 200
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/jobs   # 401 (needs auth)
curl -s http://localhost:5173 | grep -o "<title>[^<]*</title>"            # IndoKerja.id
```

---

## If something goes wrong

**`ECONNREFUSED 127.0.0.1:5433`**

PostgreSQL is not running. Open `services.msc` and start
`postgresql-x64-18`.

**Port already in use**

Find the current owner of any port:

```bash
netstat -ano | grep LISTENING | grep ":3000"
```

The last column is the PID. Stop it from the PowerShell tool:

```powershell
Stop-Process -Id <PID> -Force
```

**Reset the database to seeded state**

```bash
cd /c/Users/bryan/OneDrive/Documents/Project/jobapp/backend
npm run db:reset
```

> Destructive — drops all data and re-applies every migration plus the seed.

---

## Backups

`pg_dump` and `psql` now ship with the PostgreSQL 18 install, so backups are
a one-liner:

```bash
"/c/Program Files/PostgreSQL/18/bin/pg_dump.exe" \
  -h 127.0.0.1 -p 5433 -U indokerja -d indokerja \
  -f "C:/path/to/backup.sql"
```

A snapshot from before the PostgreSQL 18 migration is kept at:

```
.backup/indokerja_pre_migration.sql      # original dump
.backup/indokerja_pg18_restore.sql       # same, with public-schema lines stripped
```

Restore either one into an empty database:

```bash
"/c/Program Files/PostgreSQL/18/bin/psql.exe" \
  -h 127.0.0.1 -p 5433 -U indokerja -d indokerja \
  -f "C:/path/to/backup.sql"
```

`.backup/` is git-ignored — it may contain personal data.

> **Windows path gotcha:** always pass `C:/...` style paths to the PostgreSQL
> binaries. Git Bash rewrites `/tmp/...` into an MSYS path they cannot resolve,
> and `pg_dump -f /tmp/x.sql` fails *silently*, writing no file and exiting 0.
