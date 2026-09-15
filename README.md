# IndoKerja.id — Manajemen Lamaran Kerja

Implementasi sederhana dari alur lamaran kerja IndoKerja.id: pencari kerja menelusuri dan
melamar pekerjaan, perusahaan memasang lowongan dan mengelola kandidat yang masuk melalui
alur status, dan setiap perubahan status tercatat dalam riwayat yang bersifat *append-only*.

| | |
|---|---|
| **Frontend** | React 18 + TypeScript + Vite 6, TanStack Query, Tailwind CSS |
| **Backend** | Node.js + TypeScript + NestJS 10 |
| **Database** | PostgreSQL 16 via Prisma 5 |
| **API** | REST, didokumentasikan dengan Swagger/OpenAPI |

---

## Daftar isi

1. [Fitur](#1-fitur)
2. [Menjalankan cepat](#2-menjalankan-cepat)
3. [Akun demo](#3-akun-demo)
4. [Struktur proyek](#4-struktur-proyek)
5. [Menjalankan tanpa Docker](#5-menjalankan-tanpa-docker)
   - [5.1 PostgreSQL 18 native](#51-postgresql-18-native)
6. [Variabel environment](#6-variabel-environment)
7. [Skema database](#7-skema-database)
8. [Memverifikasi hasil build](#8-memverifikasi-hasil-build)
9. [Keputusan desain](#9-keputusan-desain)
10. [Pemecahan masalah](#10-pemecahan-masalah)

---

## 1. Fitur

### Sebagai Pencari Kerja

- Mendaftar atau masuk.
- Menelusuri lowongan aktif — judul, perusahaan, lokasi, gaji, jenis pekerjaan — dengan
  pencarian dan filter berdasarkan lokasi dan jenis pekerjaan, serta paginasi.
- Membuka detail lowongan untuk membaca deskripsi lengkap dan melamar, opsional dengan
  surat lamaran.
- **Melamar maksimal satu kali per lowongan.** Tombol dinonaktifkan di UI dan database
  menolak percobaan kedua.
- Melacak setiap lamaran beserta status terkini, dan membuka salah satunya untuk melihat
  seluruh riwayat status lengkap dengan catatan dari perusahaan.

### Sebagai Perusahaan

- Mendaftar atau masuk (pendaftaran sekaligus membuat profil perusahaan dalam transaksi yang
  sama).
- Membuat lowongan dengan rentang gaji, atau mengosongkan gaji untuk ditampilkan sebagai
  "Negotiable".
- Mengelola lowongan sendiri: menyuntingnya, atau menonaktifkannya untuk menariknya dari
  daftar. Menonaktifkan tidak pernah mengganggu lamaran yang sudah masuk.
- Melihat kandidat yang melamar ke setiap lowongan miliknya, beserta surat lamaran dan
  riwayatnya.
- Memindahkan kandidat melalui `Reviewing` → `Shortlisted` → `Rejected` / `Accepted`.
  **Status apa pun boleh diikuti status apa pun**, sehingga kandidat yang ditolak bisa dibuka
  kembali setelah wawancara.
- Setiap perubahan ditulis ke riwayat lamaran dengan stempel waktu, pengguna yang melakukan
  perubahan, dan catatan opsional.

### Yang sengaja tidak dilakukan

Ini adalah implementasi untuk keperluan penilaian dengan ruang lingkup terbatas. Tidak ada
pengiriman email, tidak ada unggah berkas atau penyimpanan CV, tidak ada peran admin, tidak
ada reset kata sandi, dan tidak ada paginasi pada daftar lamaran. Brief meminta kebenaran
fungsional, kode yang bersih, desain database yang baik, API yang solid, dan keamanan — jadi
usaha diarahkan ke sana, bukan ke keluasan fitur.

---

## 2. Menjalankan cepat

### Prasyarat

- **Node.js 20–22** (`node --version`) — versi 24 belum didukung
- **PostgreSQL 16 atau lebih baru** — bisa memakai Docker Compose yang sudah disertakan, atau
  instalasi native ([§5](#5-menjalankan-tanpa-docker) membahas jalur native)

### Langkah-langkah

```bash
# 1. Clone dan masuk ke folder repo
git clone <repository-url> jobapp
cd jobapp

# 2. Jalankan PostgreSQL (lewati jika memakai instalasi native — lihat §5.1)
docker compose up -d

# 3. Konfigurasi dan jalankan backend
cd backend
cp .env.example .env          # Windows: copy .env.example .env
npm install
npx prisma migrate deploy     # membuat skema
npm run seed                  # memuat data demo
npm run start:dev             # http://localhost:3000/api
```

API sudah berjalan:

- Basis API — <http://localhost:3000/api>
- Swagger UI — <http://localhost:3000/api/docs>

Di **terminal kedua**:

```bash
# 4. Jalankan frontend
cd frontend
npm install
npm run dev                   # http://localhost:5173
```

Buka <http://localhost:5173> dan masuk memakai salah satu [akun demo](#3-akun-demo).

> **Port.** Backend mendengarkan di `3000`, dev server frontend di `5173`, dan PostgreSQL di
> `5432` (Docker) atau `5433` (instalasi native — lihat [§5.1](#51-postgresql-18-native)).
> Frontend mem-proxy `/api/*` ke backend, jadi tidak ada konfigurasi CORS yang perlu diubah
> selama pengembangan dan tidak ada URL API yang perlu ditulis manual di klien.

---

## 3. Akun demo

`npm run seed` membuat akun-akun ini. **Semua akun memakai kata sandi `Password123!`** (bisa
diganti lewat variabel environment `SEED_PASSWORD`).

| Peran | Email | Perusahaan |
|---|---|---|
| Pencari Kerja | `seeker@demo.com` | — |
| Pencari Kerja | `andi@demo.com` | — |
| Pencari Kerja | `siti@demo.com` | — |
| Perusahaan | `company@demo.com` | PT Teknologi Nusantara |
| Perusahaan | `startup@demo.com` | Kopi Digital Indonesia |
| Perusahaan | `enterprise@demo.com` | Bank Sentosa Digital |

Halaman login punya tombol sekali-klik yang mengisi kredensial ini otomatis.

**Seed dirancang supaya tidak ada tampilan yang kosong.** Seed membuat 9 lowongan aktif
(ditambah 1 yang sengaja nonaktif) yang mencakup kelima jenis pekerjaan di Jakarta, Bandung,
Surabaya, dan remote, dengan sebagian gaji dicantumkan dan minimal satu yang tidak. Seed juga
membuat 10 lamaran yang tersebar di **setiap** status, termasuk satu kasus buka kembali
`REJECTED → REVIEWING` dan satu lamaran pada lowongan nonaktif — sehingga tampilan pelacakan
pelamar dan riwayat status keduanya punya isi nyata saat pertama kali dibuka. Satu lowongan
dibiarkan tanpa pelamar supaya tampilan kosong (*empty state*) juga bisa dilihat.

`seeker@demo.com` memiliki lamaran yang mencakup status `SHORTLISTED`, `REVIEWING`, `REJECTED`,
dan `ACCEPTED`, sehingga satu kali login saja sudah memperlihatkan seluruh rentang hasil.

---

## 4. Struktur proyek

```
jobapp/
├── docker-compose.yml          PostgreSQL 16
├── CONTEXT.md                  Glosarium domain — kosakata bersama
├── README.md                   Berkas ini
├── docs/
│   ├── API.md                  Dokumentasi API (endpoint, autentikasi, error, contoh curl)
│   └── adr/                    Architecture Decision Records
│       ├── 0001-single-user-table-with-role-discriminator.md
│       ├── 0002-status-history-authoritative-current-status-denormalized.md
│       ├── 0003-duplicate-applications-prevented-by-unique-constraint.md
│       ├── 0004-access-token-in-memory-refresh-token-httponly-cookie.md
│       └── 0005-authorization-guards-mutations-role-guards-reads.md
│
├── backend/
│   ├── .env.example            Salin menjadi .env
│   ├── apitest.js              Skrip verifikasi end-to-end dengan 90 asersi
│   ├── test/
│   │   ├── jest-e2e.json       Konfigurasi Jest untuk suite e2e
│   │   ├── setup-e2e.ts        Memuat .env, melonggarkan rate limit
│   │   └── app.e2e-spec.ts     Suite Jest end-to-end dengan 109 asersi
│   ├── prisma/
│   │   ├── schema.prisma       Model, enum, constraint  ← deliverable skema
│   │   ├── migrations/         Riwayat migrasi SQL      ← deliverable migrasi
│   │   └── seed.ts             Data demo
│   └── src/
│       ├── main.ts             Bootstrap: helmet, CORS, validasi, Swagger
│       ├── app.module.ts       Modul root, rate limiting global
│       ├── config/             Konfigurasi environment bertipe
│       ├── prisma/             PrismaService (global)
│       ├── common/             Guard, decorator, exception filter
│       ├── auth/               Registrasi, login, refresh, logout
│       ├── jobs/               Daftar lowongan dan lowongan milik perusahaan
│       └── applications/       Melamar, pelacakan pelamar, alur status
│
└── frontend/
    ├── vite.config.ts          Dev server + proxy /api
    ├── tailwind.config.js      Token desain
    └── src/
        ├── api/                Klien Axios, pembungkus endpoint, tipe bersama
        ├── auth/               AuthContext — status sesi
        ├── components/         Layout, komponen UI dasar
        ├── pages/              Satu berkas per halaman
        ├── routes/             Guard rute
        └── lib/                Pemformat
```

### Mulai membaca dari mana

| Untuk memahami… | Baca |
|---|---|
| Kosakata ("Candidate" itu apa, kenapa "Closed" bukan status) | `CONTEXT.md` |
| Alasan di balik suatu keputusan | `docs/adr/` |
| Kontrak API | `docs/API.md`, atau Swagger di `/api/docs` |
| Bagaimana duplikat benar-benar dicegah | `backend/prisma/schema.prisma` → model `Application` |
| Bagaimana sesi bekerja | `docs/adr/0004` + `frontend/src/api/client.ts` |

---

## 5. Menjalankan tanpa Docker

PostgreSQL 16 atau lebih baru apa pun bisa dipakai; yang berubah hanya connection string.

**Memakai PostgreSQL lokal yang sudah ada:**

```bash
# Membuat role dan database
psql -U postgres -c "CREATE ROLE indokerja LOGIN PASSWORD 'indokerja' CREATEDB;"
psql -U postgres -c "CREATE DATABASE indokerja OWNER indokerja;"
```

```bash
cd backend
cp .env.example .env
# Sunting .env agar portnya cocok dengan server Anda:
#   DATABASE_URL="postgresql://indokerja:indokerja@localhost:5432/indokerja?schema=public"

npx prisma migrate deploy
npm run seed
npm run start:dev
```

> **`CREATEDB` wajib ada.** `migrate dev` milik Prisma membuat *shadow database* sementara
> untuk mendeteksi perbedaan skema. Tanpa `CREATEDB` pada role tersebut, migrasi gagal dengan
> `P3014 — could not create the shadow database`. Berikan dengan
> `ALTER ROLE indokerja CREATEDB;`.

**Memakai host atau port lain:** ubah `DATABASE_URL` di `backend/.env`. Ada dua pilihan port
yang didukung: `5432` untuk stack Docker (lihat `docker-compose.yml`) dan `5433` untuk
instalasi PostgreSQL 18 native yang didokumentasikan di [§5.1](#51-postgresql-18-native).
Pilihan Anda harus sama dengan port yang benar-benar didengarkan server.

### 5.1 PostgreSQL 18 native

Mesin acuan untuk proyek ini menjalankan PostgreSQL 18 yang dipasang secara native, bukan
Docker, dan terdaftar sebagai layanan Windows `postgresql-x64-18`.

| Pengaturan | Nilai |
|---|---|
| Direktori instalasi | `C:\Program Files\PostgreSQL\18` |
| Direktori data | `C:\Program Files\PostgreSQL\18\data` |
| Port | `5433` |
| Nama layanan | `postgresql-x64-18` |
| Role / kata sandi | `indokerja` / `indokerja` |
| Database | `indokerja` |

Karena ini layanan Windows sungguhan, ia ikut menyala bersama sistem — tidak ada proses
database yang perlu dijalankan manual. Pastikan ia mendengarkan dengan:

```bash
netstat -ano | grep LISTENING | grep ":5433"
```

`pg_dump`, `psql`, dan `pg_restore` semuanya sudah termasuk dalam installer, jadi pencadangan
dan kueri ad-hoc tidak butuh perkakas tambahan:

```bash
"/c/Program Files/PostgreSQL/18/bin/pg_dump.exe" \
  -h 127.0.0.1 -p 5433 -U indokerja -d indokerja -f "C:/path/to/backup.sql"
```

> **Jebakan path Windows.** Berikan path bergaya `C:/...` ke biner PostgreSQL. Git Bash
> mengubah `/tmp/...` menjadi path MSYS yang tidak bisa dibaca biner tersebut, sehingga
> `pg_dump -f /tmp/x.sql` gagal secara *senyap* — berkas tidak tertulis, exit code 0.

**Migrasi saat pengembangan.** Untuk perubahan skema selama pengembangan gunakan
`npx prisma migrate dev --name <deskripsi>`, yang menulis migrasi SQL baru *sekaligus*
menerapkannya. Untuk produksi (dan checkout bersih oleh penilai) gunakan
`npx prisma migrate deploy`, yang hanya menerapkan migrasi yang sudah ada di
`prisma/migrations/`.

---

## 6. Variabel environment

Seluruh konfigurasi backend berada di `backend/.env`. Hanya `DATABASE_URL` dan
`JWT_ACCESS_SECRET` yang tidak punya nilai default yang masuk akal.

| Variabel | Default | Kegunaan |
|---|---|---|
| `NODE_ENV` | `development` | Set ke `production` untuk mengaktifkan pemeriksaan pengerasan di bawah |
| `PORT` | `3000` | Port yang didengarkan backend |
| `DATABASE_URL` | — | **Wajib.** Connection string PostgreSQL |
| `JWT_ACCESS_SECRET` | — | **Wajib.** Kunci penandatanganan access token |
| `JWT_ACCESS_EXPIRES_IN` | `15m` | Masa berlaku access token |
| `JWT_REFRESH_EXPIRES_IN_DAYS` | `7` | Masa berlaku refresh token dalam hari |
| `BCRYPT_ROUNDS` | `10` | Biaya hashing kata sandi |
| `CORS_ORIGIN` | `http://localhost:5173` | Satu-satunya origin yang boleh mengirim permintaan berkredensial |
| `SEED_PASSWORD` | `Password123!` | Kata sandi untuk setiap akun demo |

Frontend tidak butuh konfigurasi: ia memanggil `/api/*` pada origin-nya sendiri dan dev server
Vite mem-proxy-nya ke port 3000. Untuk build produksi, sajikan `frontend/dist` di belakang
reverse proxy yang mengarahkan `/api` ke backend.

### Pengerasan produksi

Saat `NODE_ENV=production`, aplikasi **menolak menyala** daripada berjalan tanpa keamanan yang
memadai:

- `JWT_ACCESS_SECRET` harus minimal 32 karakter dan tidak boleh berupa placeholder
  pengembangan. Buat dengan `openssl rand -base64 48`.
- `CORS_ORIGIN` harus berupa origin eksplisit. `*` ditolak, karena wildcard tidak bisa
  dikombinasikan dengan permintaan berkredensial — dan mengizinkannya berarti situs web mana
  pun bisa memicu panggilan terautentikasi ke API.

Cookie refresh juga otomatis menjadi `Secure` di produksi, sehingga **produksi mewajibkan
HTTPS**.

---

## 7. Skema database

Enam tabel. Bagian yang menarik justru constraint-nya — beberapa persyaratan ditegakkan oleh
database, bukan oleh kode aplikasi, karena kode aplikasi tidak bisa bertahan terhadap kondisi
balapan (*race condition*).

```
users ──┬── company_profiles        (1:1, hanya untuk perusahaan)
        ├── refresh_tokens          (1:N, di-hash, bisa dicabut)
        ├── jobs                    (1:N, sebagai perusahaan pemilik)
        └── applications            (1:N, sebagai pelamar)
                                      │
jobs ─── applications ── application_history   (1:N, append-only)
```

| Tabel | Kegunaan | Constraint penting |
|---|---|---|
| `users` | Semua akun, pencari kerja maupun perusahaan | `email` unik |
| `company_profiles` | Data tampilan perusahaan | `user_id` unik (1:1) |
| `refresh_tokens` | Sesi aktif | `token_hash` unik, `expires_at`, `revoked_at` |
| `jobs` | Lowongan pekerjaan | FK ke perusahaan pemilik; batas gaji boleh null |
| `applications` | Satu lamaran per (lowongan, pencari kerja) | **`UNIQUE (job_id, applicant_user_id)`** |
| `application_history` | Jejak status append-only | FK dengan `ON DELETE CASCADE`; `changed_by_user_id` boleh null |

### Tiga keputusan yang perlu disorot

**Lamaran duplikat dicegah oleh constraint unik, bukan oleh pengecekan.**
`@@unique([jobId, applicantUserId])` adalah sumber kebenaran untuk persyaratan nomor 5.
Service *juga* memeriksa lebih dulu, untuk memberi pesan error yang ramah pada jalur umum —
tetapi jika dua permintaan masuk bersamaan, database menolak yang kalah dan API
menerjemahkan pelanggaran itu menjadi `409`. Pengecekan di level aplikasi saja akan membuat
kedua permintaan lolos pengecekan lalu keduanya melakukan insert. Lihat
[ADR-0003](docs/adr/0003-duplicate-applications-prevented-by-unique-constraint.md).

**Status terkini didenormalisasi, tetapi riwayatnya yang otoritatif.**
`applications.status` ada supaya kueri daftar tidak perlu mencari baris terbaru di riwayat
untuk setiap lamaran. Kolom ini *selalu* ditulis dalam transaksi yang sama dengan baris
riwayat, sehingga keduanya tidak mungkin menyimpang. Lihat
[ADR-0002](docs/adr/0002-status-history-authoritative-current-status-denormalized.md).

**`application_history.changed_by_user_id` sengaja boleh null.**
Entri `APPLIED` pertama ditulis oleh sistem saat pencari kerja melamar — tidak ada pengguna
yang bertindak. `NULL` mencatat fakta itu secara jujur. Jika perusahaan yang bertindak
kemudian dihapus, kolom ini di-set `NULL` alih-alih ikut terhapus: riwayat tentang apa yang
terjadi harus bertahan lebih lama daripada akun yang melakukannya.

Untuk memeriksa skema secara interaktif: `cd backend && npx prisma studio`.

---

## 8. Memverifikasi hasil build

### Suite tes otomatis (Jest e2e)

`backend/test/app.e2e-spec.ts` menjalankan aplikasi Nest yang sebenarnya terhadap database
PostgreSQL yang sebenarnya dan menggerakkannya lewat HTTP — tidak ada yang di-*mock*. Ini
pemeriksaan menyeluruh yang paling cepat:

```bash
cd backend
npm run test:e2e
```

Yang diharapkan: **109 passed, 109 total**.

Suite ini membuat akun-akunnya sendiri di domain `@e2e.local` dan membersihkannya setelah
selesai, sehingga bisa dijalankan terhadap database dalam kondisi apa pun dan tidak
mengganggu data demo hasil seed. Suite ini memang melonggarkan rate limit lewat variabel
environment (`test/setup-e2e.ts`) — suite melakukan beberapa lusin pembuatan akun dari satu IP,
yang jika tidak dilonggarkan akan memicu batas registrasi saat sedang menguji perilaku lain.
Batasnya sendiri tetap diuji lewat metadata decorator.

Yang dicakup, dalam 14 blok: login dan registrasi, rotasi refresh token dan deteksi
pemakaian ulang, logout dan logout-all, daftar/cari/filter/paginasi lowongan, visibilitas
detail lowongan, melamar, aturan duplikat (termasuk balapan konkuren yang sesungguhnya),
lamaran milik pencari kerja itu sendiri, pengelolaan lowongan oleh perusahaan, validasi,
pelacakan pelamar, alur status lengkap, bentuk error yang seragam, rate limiting, dan
constraint database itu sendiri.

### Skrip smoke end-to-end manual

`backend/apitest.js` adalah skrip dengan 90 asersi yang memeriksa persyaratan yang sama
terhadap API yang sedang berjalan, mencetak setiap asersi saat dijalankan:

```bash
# Terminal 1: pastikan API sedang berjalan
cd backend && npm run start:dev

# Terminal 2
cd backend && node apitest.js
```

Output yang diharapkan berakhir dengan `90 passed, 0 failed`.

> Berbeda dengan suite Jest, skrip ini **mengubah data Anda** (ia melamar ke lowongan
> sungguhan dan mengubah status sungguhan). Jalankan `npm run seed` setelahnya untuk
> mengembalikan kondisi demo yang bersih.

### Pemeriksaan tipe dan build

```bash
cd backend  && npm run build          # tsc via nest build
cd frontend && npm run typecheck      # tsc --noEmit
cd frontend && npm run build          # bundel produksi ke dist/
```

### Pengujian API secara interaktif

Buka <http://localhost:3000/api/docs>. Masuk melalui `POST /api/auth/login`, salin
`accessToken`, klik **Authorize**, lalu tempelkan. Semua endpoint selain `refresh`/`logout`
kemudian bisa dipanggil dari browser.

### Mengatur ulang database

```bash
cd backend
npm run db:reset    # drop, migrasi ulang, seed ulang — menghapus semua data
```

---

## 9. Keputusan desain

Masing-masing tercatat sebagai ADR di [`docs/adr/`](docs/adr/) lengkap dengan alasannya,
alternatif yang dipertimbangkan, dan kondisi yang seharusnya membuat keputusan itu ditinjau
ulang. Versi singkatnya:

| # | Keputusan | Alasan |
|---|---|---|
| [0001](docs/adr/0001-single-user-table-with-role-discriminator.md) | Satu tabel `users` dengan diskriminator peran, bukan tabel terpisah untuk pencari kerja/perusahaan | Autentikasi identik untuk keduanya; tabel terpisah akan menduplikasi hash kata sandi, relasi token, dan kueri login |
| [0002](docs/adr/0002-status-history-authoritative-current-status-denormalized.md) | Status terkini didenormalisasi ke `applications`, riwayat tetap otoritatif | Daftar menjadi cepat tanpa subkueri berkorelasi; ditulis secara transaksional sehingga keduanya tidak mungkin menyimpang |
| [0003](docs/adr/0003-duplicate-applications-prevented-by-unique-constraint.md) | Lamaran duplikat diblokir oleh constraint unik di database | Pengecekan di level aplikasi adalah balapan, bukan jaminan |
| [0004](docs/adr/0004-access-token-in-memory-refresh-token-httponly-cookie.md) | Access token di memori, refresh token di cookie httpOnly, dirotasi | Menjauhkan kedua token tersimpan dari jangkauan XSS; rotasi membuat token yang dicuri bisa terdeteksi |
| [0005](docs/adr/0005-authorization-guards-mutations-role-guards-reads.md) | Guard peran pada mutasi, pengecekan kepemilikan di service yang mengembalikan `404` | Peran bersifat kasar dan statis; kepemilikan bersifat per-baris dan mengembalikan `403` akan mengonfirmasi bahwa suatu sumber daya itu ada |

Dua pilihan lain yang bukan ADR tetapi penting:

- **Tipe di frontend dipelihara manual** (`frontend/src/api/types.ts`), bukan dihasilkan dari
  spesifikasi Swagger atau dibagikan lewat paket workspace. `packages/types` bersama akan
  menjamin keduanya tetap sinkron tetapi menambah langkah build dan ketergantungan urutan
  instalasi pada repo dua aplikasi; permukaannya kecil, jarang berubah, dan setiap fieldnya
  diuji oleh `apitest.js`. Trade-off-nya dicatat di komentar kepala berkas tersebut.
- **Argon2 akan menjadi hash kata sandi yang lebih baik daripada bcrypt** pada 2026, tetapi
  bcrypt sudah teruji lama, tersedia tanpa rantai perkakas build native, dan memadai pada
  cost factor 10 untuk ruang lingkup ini. Batas pemotongan 72 byte ditangani dengan menolak
  kata sandi yang lebih panjang secara langsung, bukan dengan mengabaikan sisanya diam-diam.

---

## 10. Pemecahan masalah

**`P1001: Can't reach database server`**
PostgreSQL tidak berjalan atau `DATABASE_URL` salah. Untuk stack Docker, periksa
`docker compose ps`; untuk instalasi native, periksa layanan Windows (`services.msc` →
`postgresql-x64-18`) atau pastikan portnya mendengarkan. Uji koneksi langsung:
`psql "$DATABASE_URL" -c 'select 1'`.

**`P3014: could not create the shadow database` / `permission denied to create database`**
Role-nya tidak punya `CREATEDB`. Jalankan
`psql -U postgres -c "ALTER ROLE indokerja CREATEDB;"`. Hanya `migrate dev` yang
membutuhkannya; `migrate deploy` tidak.

**`ECONNREFUSED 127.0.0.1:5433`**
Anda diarahkan ke instalasi PostgreSQL 18 native tetapi layanannya tidak berjalan. Nyalakan
layanan `postgresql-x64-18`, atau ubah `DATABASE_URL` ke `5432` jika maksud Anda memakai
Docker.

**Error `JWT_ACCESS_SECRET` saat startup**
Anda menjalankan `NODE_ENV=production` tetapi dengan secret placeholder. Set nilai
sesungguhnya: `openssl rand -base64 48`.

**`401` pada setiap permintaan, tepat setelah login**
Access token dikirim tetapi ditolak. Pastikan headernya adalah
`Authorization: Bearer <token>` — dengan spasi, dan tanpa tanda kutip di sekitar token. Jika
Anda memanggil lewat proxy, periksa apakah proxy menghapus header tersebut.

**Login berhasil tetapi sesi hilang saat halaman dimuat ulang**
Cookie refresh tidak tersimpan atau tidak terkirim, sehingga `/auth/refresh` gagal saat
aplikasi dimuat. Penyebabnya, diurutkan dari yang paling mungkin: frontend berada di origin
yang berbeda dari backend (periksa `CORS_ORIGIN` di `backend/.env` — harus sama persis dengan
origin frontend, termasuk portnya); koneksinya bukan HTTPS sementara `NODE_ENV=production`
(cookie menjadi `Secure`); atau cookie diblokir di browser.

**Logout tidak bekerja di Swagger UI**
Ini memang perilaku yang diharapkan. Swagger berjalan di origin API sendiri dan cookie
refresh di-set pada origin tersebut, sehingga `logout` dan `refresh` memerlukan sesi browser
yang sudah memegang cookie itu, atau `refreshToken` eksplisit di body. Lihat
[§7 dokumentasi API](docs/API.md#7-quick-start-with-curl) untuk panduan curl yang menangani
cookie dengan benar memakai cookie jar.

**`429 Too Many Requests` saat pengujian**
Rute autentikasi memang dibatasi 5–10 permintaan per menit per IP. Tunggu satu menit, atau
mulai ulang backend untuk menghapus penghitung di memori.

**Build frontend gagal dengan error TypeScript setelah mengubah tipe API**
Tipe di frontend dipelihara manual, jadi perubahan DTO di backend harus dicerminkan di
`frontend/src/api/types.ts`. `npm run typecheck` menangkap setiap ketidakcocokan.

---

## Lisensi

Ditulis sebagai penilaian teknis. Tidak ditujukan untuk penggunaan produksi.
