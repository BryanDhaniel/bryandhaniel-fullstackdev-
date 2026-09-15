# IndoKerja.id — Dokumentasi API

REST API untuk platform lamaran kerja IndoKerja.id.

- **Base URL:** `http://localhost:3000/api`
- **Dokumentasi interaktif (Swagger UI):** `http://localhost:3000/api/docs`
- **OpenAPI JSON:** `http://localhost:3000/api/docs-json` (bisa diimpor ke Postman/Insomnia)
- **Content type:** `application/json` untuk semua request dan response body

---

## Daftar isi

1. [Model autentikasi](#1-model-autentikasi)
2. [Role dan izin](#2-role-dan-izin)
3. [Kosakata status](#3-kosakata-status)
4. [Format error](#4-format-error)
5. [Endpoint](#5-endpoint)
   - [Auth](#51-auth)
   - [Jobs](#52-jobs)
   - [Applications](#53-applications)
6. [Ketertelusuran requirement](#6-ketertelusuran-requirement)
7. [Mulai cepat dengan curl](#7-mulai-cepat-dengan-curl)

---

## 1. Model autentikasi

Dua token, dua masa hidup yang berbeda, dua lokasi penyimpanan yang berbeda. Alasannya
tercatat di [`docs/adr/0004`](./adr/0004-access-token-in-memory-refresh-token-httponly-cookie.md).

| | Access token | Refresh token |
|---|---|---|
| **Format** | JWT (ditandatangani, HS256) | String acak opaque (bukan JWT) |
| **Masa hidup** | 15 menit | 7 hari |
| **Transport** | `Authorization: Bearer <token>` | cookie httpOnly `refresh_token` |
| **Disimpan sebagai** | Tidak disimpan — hanya ada di memori klien | hash bcrypt di tabel `refresh_tokens` |
| **Bisa dicabut** | Tidak (kedaluwarsa sendiri) | Ya (pencabutan di sisi server) |

### Alur

```
POST /api/auth/login
  -> 200 { accessToken, expiresIn, user, refreshTokenExpiresAt }
  -> Set-Cookie: refresh_token=<opaque>; HttpOnly; SameSite=Lax; Path=/
```

1. Klien menyimpan `accessToken` **di memori**. Token ini tidak dipersistenkan, jadi menutup
   tab berarti klien kehilangan token tersebut.
2. Saat access token kedaluwarsa, request apa pun mengembalikan `401`. Klien memanggil
   `POST /api/auth/refresh`; browser melampirkan cookie secara otomatis dan access token
   **baru** dikembalikan.
3. Refresh token **di-rotasi**: setiap refresh yang berhasil mencabut token yang dikirim dan
   menerbitkan penggantinya. Mengirim token yang sudah dicabut dianggap sebagai pencurian dan
   **mencabut semua sesi aktif milik user tersebut**, sehingga semua perangkat dipaksa login
   ulang. (Cakupannya adalah user, bukan rantai token per perangkat — alasannya ada di
   [ADR-0004](./adr/0004-access-token-in-memory-refresh-token-httponly-cookie.md#revocation-scope).)
4. Karena ada rotasi, klien tidak boleh menembakkan dua refresh secara bersamaan. Frontend
   menggabungkannya menjadi satu promise yang sedang berjalan (`frontend/src/api/client.ts`) —
   tanpa itu, race biasa antar dua tab akan mengeluarkan user dari semua perangkat.

### Memakai API dari klien non-browser

Cookie hanyalah kemudahan untuk browser, bukan keharusan. `POST /api/auth/refresh` dan
`POST /api/auth/logout` juga menerima token di dalam body JSON:

```http
POST /api/auth/refresh
Content-Type: application/json

{ "refreshToken": "<opaque token>" }
```

Cookie diprioritaskan bila keduanya dikirim. Untuk panduan memakai curl, lihat
[§7](#7-mulai-cepat-dengan-curl).

### Batas rate

Diterapkan secara global sebesar 100 request / 60 detik per IP, dengan batas yang lebih ketat
di titik yang paling menguntungkan penyalahgunaan. Melewati batas akan mengembalikan `429`.

| Endpoint | Batas |
|---|---|
| `POST /api/auth/register` | 5 / 60s |
| `POST /api/auth/login` | 10 / 60s |
| `POST /api/auth/refresh` | 30 / 60s |

---

## 2. Role dan izin

Seorang user adalah `JOB_SEEKER` atau `COMPANY`. Role ini ditetapkan saat registrasi
([ADR-0001](./adr/0001-single-user-table-with-role-discriminator.md)) dan tidak bisa diubah
oleh endpoint mana pun.

| Endpoint | Job Seeker | Company | Anonim |
|---|:---:|:---:|:---:|
| `POST /api/auth/register` | — | — | ✅ |
| `POST /api/auth/login` | — | — | ✅ |
| `POST /api/auth/refresh` | — | — | ✅ (dengan cookie/token) |
| `POST /api/auth/logout` | — | — | ✅ (dengan cookie/token) |
| `POST /api/auth/logout-all` | ✅ | ✅ | ❌ |
| `GET /api/auth/me` | ✅ | ✅ | ❌ |
| `GET /api/jobs` | ✅ | ✅ | ❌ |
| `GET /api/jobs/:id` | ✅ | ✅ | ❌ |
| `GET /api/jobs/mine` | ❌ `403` | ✅ | ❌ |
| `POST /api/jobs` | ❌ `403` | ✅ | ❌ |
| `PATCH /api/jobs/:id` | ❌ `403` | ✅ (hanya milik sendiri) | ❌ |
| `POST /api/jobs/:jobId/applications` | ✅ | ❌ `403` | ❌ |
| `GET /api/applications/me` | ✅ | ❌ `403` | ❌ |
| `GET /api/applications/me/:id` | ✅ (hanya milik sendiri) | ❌ `403` | ❌ |
| `GET /api/jobs/:jobId/applications` | ❌ `403` | ✅ (hanya job sendiri) | ❌ |
| `PATCH /api/applications/:id/status` | ❌ `403` | ✅ (hanya job sendiri) | ❌ |

### `403` versus `404` — baca ini sebelum debugging

Ada dua pemeriksaan berbeda, di dua lapisan berbeda
([ADR-0005](./adr/0005-authorization-guards-mutations-role-guards-reads.md)):

- **Role salah → `403 Forbidden`.** Job Seeker yang memanggil `POST /api/jobs` ditolak oleh
  role guard sebelum data apa pun dibaca.
- **Pemilik salah → `404 Not Found`.** Company yang meminta kandidat untuk job milik
  *perusahaan lain* mendapat `404`, bukan `403`. Mengembalikan `403` akan mengonfirmasi bahwa
  job tersebut ada, sehingga penyerang bisa menyebutkan ID yang valid satu per satu. Bagi
  pemanggilnya, resource itu memang "tidak ditemukan".

Jadi jika Anda menguji akses lintas tenant dan mengharapkan `403`, `404` adalah hasil yang
benar.

---

## 3. Kosakata status

Sebuah application memiliki tepat satu status saat ini. Database hanya mengizinkan lima nilai
berikut (sebuah enum PostgreSQL):

| Status | Arti |
|---|---|
| `APPLIED` | Status awal, ditetapkan oleh sistem saat pencari kerja melamar. **Tidak bisa di-set oleh Company.** |
| `REVIEWING` | Perusahaan sudah membuka lamaran tersebut. |
| `SHORTLISTED` | Pelamar dilanjutkan ke tahap berikutnya. |
| `REJECTED` | Pelamar tidak dilanjutkan. |
| `ACCEPTED` | Pelamar telah diterima. |

**Status apa pun boleh diikuti status apa pun** — termasuk `REJECTED` → `REVIEWING`, karena
perusahaan yang membuka kembali kandidat setelah interview adalah alur kerja yang nyata, bukan
kesalahan data.

`APPLIED` ditolak dengan `400` jika Company mencoba menetapkannya. Itu adalah status awal
yang diberikan sistem; membiarkan perusahaan menulisnya berarti mereka bisa menulis ulang
sejarah sementara tabel history tetap menunjukkan yang sebenarnya.

Setiap perubahan yang diterima menambahkan satu baris ke history application. Menetapkan
status yang **sudah** menjadi status saat ini adalah **no-op**: mengembalikan `200` dengan
`changed: false` dan tidak menulis baris history, sehingga jejak audit tidak pernah memuat
entri berurutan yang duplikat.

---

## 4. Format error

Setiap error — validasi, auth, database, maupun yang tidak tertangani — mengembalikan bentuk
yang sama:

```json
{
  "statusCode": 409,
  "error": "Conflict",
  "message": "You have already applied to this job",
  "path": "/api/jobs/8b1f2c3d-.../applications",
  "timestamp": "2026-09-15T13:04:22.108Z"
}
```

`message` berupa **string** untuk sebagian besar error, dan **array of string** untuk kegagalan
validasi `400` (satu entri per field yang tidak valid), jadi klien harus menangani keduanya:

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": [
    "title should not be empty",
    "jobType must be one of the following values: FULL_TIME, PART_TIME, CONTRACT, INTERNSHIP, FREELANCE"
  ],
  "path": "/api/jobs",
  "timestamp": "2026-09-15T13:04:22.108Z"
}
```

### Kode status yang dipakai

| Kode | Arti di API ini |
|---|---|
| `200` | Berhasil (baca, update, ubah status) |
| `201` | Dibuat (register, buat job, melamar) |
| `204` | Berhasil tanpa body (logout, logout-all) |
| `400` | Validasi gagal, rentang gaji terbalik, job tidak aktif, mencoba menetapkan `APPLIED` |
| `401` | Access token hilang/kedaluwarsa/tidak valid, kredensial salah, refresh token tidak bisa dipakai |
| `403` | Sudah terautentikasi tetapi **role**-nya salah untuk endpoint ini |
| `404` | Resource tidak ada **atau bukan milik pemanggil** (disengaja) |
| `409` | Duplikat — email sudah terdaftar, atau sudah melamar job ini |
| `429` | Batas rate terlampaui |
| `500` | Error server tak terduga (isi internal tidak pernah bocor) |

### Perilaku validasi

`ValidationPipe` global berjalan dengan `whitelist: true` dan `forbidNonWhitelisted: true`.
Konsekuensi yang perlu diketahui saat memanggil API:

- **Properti yang tidak dikenal** di body request menghasilkan `400`, bukan diabaikan diam-diam.
  Nama field yang salah ketik langsung terlihat.
- Properti yang bukan bagian dari DTO dibuang sebelum bisa mencapai service, jadi klien tidak
  bisa menyelundupkan sesuatu seperti `companyUserId` agar ikut berpengaruh.
- Nilai enum divalidasi secara ketat — `"full_time"` ditolak; harus `"FULL_TIME"`.

---

## 5. Endpoint

### 5.1 Auth

---

#### `POST /api/auth/register`

Membuat user. Registrasi sebagai `COMPANY` juga membuat profil perusahaan **dalam transaksi
yang sama**, sehingga perusahaan tidak akan pernah ada tanpa nama untuk ditampilkan pada
lowongannya.

**Auth:** tidak ada · **Batas rate:** 5/60s

| Field | Tipe | Wajib | Catatan |
|---|---|---|---|
| `email` | string | ✅ | Email valid, maks 254 karakter, unik |
| `password` | string | ✅ | Min 8, maks 72 karakter (bcrypt memotong di atas 72 byte) |
| `role` | `"JOB_SEEKER"` \| `"COMPANY"` | ✅ | Tetap sepanjang usia akun |
| `companyName` | string | ✅ saat `role=COMPANY` | Tidak boleh kosong, maks 150 karakter. Diabaikan untuk `JOB_SEEKER` |

```json
{
  "email": "newuser@example.com",
  "password": "Password123!",
  "role": "COMPANY",
  "companyName": "PT Contoh Sejahtera"
}
```

**Response `201`** — bentuk yang sama dengan login, ditambah header `Set-Cookie`.

**Error**

| Kode | Kapan |
|---|---|
| `400` | Validasi gagal, atau `companyName` hilang/kosong saat `role=COMPANY` |
| `409` | `"An account with this email already exists"` |
| `429` | Batas rate terlampaui |

Perhatikan bahwa `companyName` divalidasi dengan `@ValidateIf`, bukan `@IsOptional()`.
Yang terakhir akan melewati *semua* validator pada properti tersebut saat nilainya
`undefined`, sehingga field itu praktis menjadi opsional bagi perusahaan. Field teks wajib di
seluruh API juga menolak nilai yang hanya berisi spasi, bukan cuma string kosong — judul
bernilai `"   "` adalah `400`, karena jika tidak, service akan memangkasnya menjadi `""` dan
menyimpan job tanpa nama.

---

#### `POST /api/auth/login`

**Auth:** tidak ada · **Batas rate:** 10/60s

| Field | Tipe | Wajib |
|---|---|---|
| `email` | string | ✅ |
| `password` | string | ✅ |

**Response `200`**

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 900,
  "user": {
    "id": "3f1a2b4c-5d6e-7f80-9a1b-2c3d4e5f6071",
    "email": "seeker@demo.com",
    "role": "JOB_SEEKER",
    "createdAt": "2026-09-15T13:00:00.000Z"
  },
  "refreshTokenExpiresAt": "2026-09-22T13:00:00.000Z"
}
```

Header response:

```
Set-Cookie: refresh_token=<opaque>; Max-Age=604800; Path=/; Expires=...; HttpOnly; SameSite=Lax
```

User `COMPANY` juga membawa `companyProfile`:

```json
"companyProfile": {
  "companyName": "PT Teknologi Nusantara",
  "description": "Platform engineering company building logistics software...",
  "website": "https://teknologi-nusantara.example.com",
  "logoUrl": null
}
```

Refresh token **tidak pernah** ada di body JSON — hanya di cookie httpOnly, sehingga JavaScript
halaman tidak bisa membacanya.

**Error**

| Kode | Kapan |
|---|---|
| `400` | Validasi gagal |
| `401` | `"Invalid email or password"` — dikembalikan identik untuk email yang tidak dikenal *maupun* password yang salah, sehingga responsnya tidak bisa dipakai untuk mencari tahu alamat email mana yang terdaftar |
| `429` | Batas rate terlampaui |

---

#### `POST /api/auth/refresh`

Menukar refresh token yang valid dengan access token baru. Token yang dikirim akan dicabut dan
diganti (rotasi).

**Auth:** refresh token via cookie httpOnly **atau** body request · **Batas rate:** 30/60s

| Field | Tipe | Wajib |
|---|---|---|
| `refreshToken` | string | ❌ — kosongkan bila mengirim cookie |

**Response `200`** — bentuk identik dengan login, dengan `Set-Cookie` baru.

**Error**

| Kode | Kapan |
|---|---|
| `400` | Body tidak valid |
| `401` | Token hilang, kedaluwarsa, dicabut, atau sudah dipakai. Penggunaan ulang mencabut semua sesi milik user tersebut. |

---

#### `POST /api/auth/logout`

Mencabut refresh token yang dikirim di sisi server dan menghapus cookie.

**Auth:** refresh token via cookie atau body · **Batas rate:** global (100/60s)

Sengaja **tidak** mewajibkan access token yang valid: logout dengan access token yang sudah
kedaluwarsa harus tetap berhasil, jika tidak, sebuah sesi mustahil diakhiri dengan bersih.

**Response `204`** — tanpa body.

---

#### `POST /api/auth/logout-all`

Mencabut semua refresh token milik user yang terautentikasi — "logout dari semua tempat".

**Auth:** Bearer access token

**Response `204`** — tanpa body.

**Error:** `401` bila belum terautentikasi.

---

#### `GET /api/auth/me`

Mengembalikan profil user yang terautentikasi.

**Auth:** Bearer access token

**Response `200`** — sebuah `UserResponseDto` (objek yang sama dengan field `user` pada `login`).

Dipakai frontend saat boot: karena access token hanya hidup di memori, reload halaman akan
menghilangkannya, dan aplikasi memanggil `/auth/me` setelah refresh senyap untuk memulihkan
sesi.

**Error:** `401` bila belum terautentikasi.

---

### 5.2 Jobs

---

#### `GET /api/jobs`

Daftar job dengan paginasi. **Mengimplementasikan requirement 2.**

**Auth:** semua user yang terautentikasi (Job Seeker atau Company)

**Query parameter**

| Nama | Tipe | Default | Catatan |
|---|---|---|---|
| `page` | integer ≥ 1 | `1` | Berbasis 1 |
| `limit` | integer 1–50 | `10` | Nilai di atas 50 ditolak dengan `400` |
| `q` | string ≤ 100 | — | Tidak peka huruf besar/kecil, mencakup judul job, nama perusahaan, dan deskripsi |
| `location` | string ≤ 100 | — | Pencocokan sebagian, tidak peka huruf besar/kecil |
| `jobType` | enum | — | `FULL_TIME`, `PART_TIME`, `CONTRACT`, `INTERNSHIP`, `FREELANCE` |

**Response `200`**

```json
{
  "data": [
    {
      "id": "8b1f2c3d-4e5f-6071-8293-a4b5c6d7e8f9",
      "title": "Backend Engineer (Node.js)",
      "description": "Design and build REST services for our logistics platform...",
      "location": "Jakarta, Indonesia",
      "jobType": "FULL_TIME",
      "salaryMin": 12000000,
      "salaryMax": 20000000,
      "currency": "IDR",
      "hasApplied": true,
      "createdAt": "2026-09-03T13:00:00.000Z",
      "company": {
        "id": "a1b2c3d4-...",
        "companyName": "PT Teknologi Nusantara",
        "logoUrl": null,
        "website": "https://teknologi-nusantara.example.com"
      }
    }
  ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 9,
    "totalPages": 1,
    "hasNextPage": false
  }
}
```

Catatan:

- **Hanya job aktif yang dikembalikan.** Lowongan tidak aktif tidak terlihat di sini oleh
  siapa pun, termasuk pemiliknya (yang melihatnya lewat `GET /api/jobs/mine`).
- **`hasApplied`** memberi tahu Job Seeker yang memanggil apakah mereka sudah melamar, sehingga
  UI bisa menonaktifkan tombol Apply sebelum user mengkliknya. Nilainya selalu `false` untuk
  Company.
- **`salaryMin`/`salaryMax` bisa keduanya `null`**, artinya gaji tidak diungkapkan
  ("Negotiable"). Ini sengaja dibuat berbeda dari gaji bernilai `0`. Jangan mengasumsikan
  kedua field itu selalu ada.

**Error:** `400` (`limit` salah, `jobType` tidak dikenal, atau query parameter tidak dikenal),
`401`.

---

#### `GET /api/jobs/mine`

Lowongan milik perusahaan yang terautentikasi, **termasuk yang tidak aktif**, masing-masing
dengan jumlah pelamar. **Mendukung requirement 6** (mengelola lowongan sendiri).

> Catatan rute: `/jobs/mine` dideklarasikan sebelum `/jobs/:id`. Klien apa pun yang memanggil
> `GET /api/jobs/mine` dan mengharapkan job dengan id `"mine"` akan menerima daftar ini —
> id-nya berupa UUID, jadi dalam praktiknya hal itu tidak mungkin bentrok.

**Auth:** hanya `COMPANY`

**Response `200`** — array `JobResponseDto` plus dua field tambahan:

```json
[
  {
    "id": "8b1f2c3d-...",
    "title": "Backend Engineer (Node.js)",
    "...": "same fields as the listing (salary fields may be null)",
    "isActive": true,
    "applicationCount": 2
  }
]
```

**Error:** `401`, `403` (pemanggil adalah Job Seeker).

---

#### `GET /api/jobs/:id`

Detail job. **Mengimplementasikan requirement 3** (tampilan detail yang mendahului proses
melamar).

**Auth:** semua user yang terautentikasi

**Response `200`** — sebuah `JobResponseDto` (bentuk sama dengan entri pada daftar).

**Aturan visibilitas:** job yang **tidak aktif** hanya dikembalikan kepada perusahaan yang
memilikinya. Bagi yang lain — termasuk perusahaan lain — responsnya `404`. Ini mencegah
lowongan yang sudah ditarik ditemukan lewat ID-nya.

**Error**

| Kode | Kapan |
|---|---|
| `400` | `:id` bukan UUID yang valid |
| `401` | Belum terautentikasi |
| `404` | Job tidak ada, **atau** job tidak aktif dan pemanggil bukan pemiliknya |

---

#### `POST /api/jobs`

Membuat lowongan job. **Mengimplementasikan requirement 6.**

**Auth:** hanya `COMPANY`

| Field | Tipe | Wajib | Catatan |
|---|---|---|---|
| `title` | string | ✅ | Tidak boleh kosong, ≤ 150 karakter |
| `description` | string | ✅ | Tidak boleh kosong, ≤ 5000 karakter |
| `location` | string | ✅ | Tidak boleh kosong, ≤ 150 karakter |
| `jobType` | enum | ✅ | Salah satu dari lima nilai `JobType` |
| `salaryMin` | integer ≥ 0 | ❌ | Kosongkan **kedua** batas untuk gaji yang tidak diungkapkan |
| `salaryMax` | integer ≥ 0 | ❌ | Harus ≥ `salaryMin` |
| `currency` | string | ❌ | Default `IDR`, ≤ 10 karakter |
| `isActive` | boolean | ❌ | Default `true` |

```json
{
  "title": "Backend Engineer (Node.js)",
  "description": "Design and build REST services for our logistics platform.",
  "location": "Jakarta, Indonesia",
  "jobType": "FULL_TIME",
  "salaryMin": 12000000,
  "salaryMax": 20000000
}
```

Perusahaan pemilik diambil **dari access token**, bukan dari body request — tidak ada field
yang memungkinkan klien memasang job atas nama perusahaan lain.

**Response `201`** — `JobResponseDto` yang baru dibuat.

**Error**

| Kode | Kapan |
|---|---|
| `400` | Validasi gagal, atau `salaryMin > salaryMax` |
| `401` | Belum terautentikasi |
| `403` | Pemanggil adalah Job Seeker |

---

#### `PATCH /api/jobs/:id`

Memperbarui lowongan job. Kirim hanya field yang ingin diubah.

**Auth:** hanya `COMPANY`, dan hanya pemilik job tersebut

Mengatur `isActive: false` menarik lowongan itu: hilang dari `GET /api/jobs` dan menolak
lamaran baru. **Lamaran yang sudah ada tidak tersentuh dan statusnya tetap** — history pelamar
bukan milik perusahaan untuk ditulis ulang.

Untuk mengubah gaji yang diungkapkan kembali menjadi "Negotiable", kirim `null` secara eksplisit:

```json
{ "salaryMin": null, "salaryMax": null }
```

**Response `200`** — `JobResponseDto` yang sudah diperbarui.

**Error**

| Kode | Kapan |
|---|---|
| `400` | Validasi gagal, `salaryMin > salaryMax`, atau field tidak dikenal |
| `401` | Belum terautentikasi |
| `403` | Pemanggil adalah Job Seeker |
| `404` | Job tidak ada, **atau** job milik perusahaan lain |

---

### 5.3 Applications

---

#### `POST /api/jobs/:jobId/applications`

Melamar sebuah job. **Mengimplementasikan requirement 3 dan 5.**

**Auth:** hanya `JOB_SEEKER`

| Field | Tipe | Wajib | Catatan |
|---|---|---|---|
| `coverLetter` | string | ❌ | ≤ 3000 karakter |

```json
{ "coverLetter": "I have five years building Node.js services..." }
```

Saat berhasil, API menulis **dua baris dalam satu transaksi**: application itu sendiri, dan
entri history `APPLIED` awal dengan `changedByUserId: null` (yang menetapkannya adalah sistem,
bukan user). Tidak ada keadaan di mana sebuah application ada tanpa history.

**Aturan duplikat (requirement 5)** ditegakkan oleh unique constraint database pada
`(jobId, applicantUserId)` — lihat [ADR-0003](./adr/0003-duplicate-applications-prevented-by-unique-constraint.md).
Percobaan kedua mengembalikan `409`. Ini tetap berlaku meski dua request datang bersamaan:
yang menjadi penengah adalah database, bukan kode aplikasi.

**Response `201`** — application yang baru dibuat.

**Error**

| Kode | Kapan |
|---|---|
| `400` | Job tidak aktif, atau `coverLetter` terlalu panjang |
| `401` | Belum terautentikasi |
| `403` | Pemanggil adalah Company |
| `404` | Job tidak ada |
| `409` | `"You have already applied to this job"` |

---

#### `GET /api/applications/me`

Lamaran milik pencari kerja yang terautentikasi beserta statusnya saat ini.
**Mengimplementasikan requirement 4.**

**Auth:** hanya `JOB_SEEKER`

| Query | Tipe | Default | Catatan |
|---|---|---|---|
| `includeHistory` | boolean | `false` | `true` menambahkan history status lengkap ke setiap item |

**Response `200`**

```json
[
  {
    "id": "9c8b7a65-4321-0fed-cba9-876543210fed",
    "status": "SHORTLISTED",
    "coverLetter": "I have five years building Node.js services...",
    "createdAt": "2026-09-03T13:00:00.000Z",
    "updatedAt": "2026-09-03T15:00:00.000Z",
    "job": {
      "id": "8b1f2c3d-...",
      "title": "Backend Engineer (Node.js)",
      "location": "Jakarta, Indonesia",
      "jobType": "FULL_TIME",
      "isActive": true,
      "company": { "id": "a1b2c3d4-...", "companyName": "PT Teknologi Nusantara" }
    }
  }
]
```

`job.isActive` disertakan agar UI bisa menandai lowongan yang sudah ditarik, tanpa
menyembunyikan lamarannya — riwayat lamaran milik pencari kerja itu sendiri tetap terlihat.

**Error:** `401`, `403` (pemanggil adalah Company).

---

#### `GET /api/applications/me/:id`

Satu lamaran milik pemanggil, selalu beserta history lengkapnya.

**Auth:** hanya `JOB_SEEKER`

**Response `200`** — sebuah `MyApplicationResponseDto` dengan `history`:

```json
{
  "id": "9c8b7a65-...",
  "status": "SHORTLISTED",
  "...": "as above",
  "history": [
    {
      "id": "1a2b3c4d-...",
      "status": "APPLIED",
      "changedByUserId": null,
      "note": "Application submitted",
      "createdAt": "2026-09-03T13:00:00.000Z"
    },
    {
      "id": "2b3c4d5e-...",
      "status": "REVIEWING",
      "changedByUserId": "a1b2c3d4-...",
      "note": "Strong systems background, moving to technical screen.",
      "createdAt": "2026-09-03T14:00:00.000Z"
    },
    {
      "id": "3c4d5e6f-...",
      "status": "SHORTLISTED",
      "changedByUserId": "a1b2c3d4-...",
      "note": "Passed technical screen. Scheduling on-site.",
      "createdAt": "2026-09-03T15:00:00.000Z"
    }
  ]
}
```

**Error**

| Kode | Kapan |
|---|---|
| `400` | `:id` bukan UUID yang valid |
| `401` | Belum terautentikasi |
| `403` | Pemanggil adalah Company |
| `404` | Lamaran tidak ada, **atau** milik pencari kerja lain |

---

#### `GET /api/jobs/:jobId/applications`

Para kandidat yang melamar ke salah satu job milik perusahaan.
**Mengimplementasikan requirement 7.**

**Auth:** hanya `COMPANY`, dan hanya untuk job yang dimiliki perusahaan tersebut

| Query | Tipe | Catatan |
|---|---|---|
| `status` | enum | Filter berdasarkan status saat ini, mis. `?status=REVIEWING` |

**Response `200`** — kandidat beserta history lengkapnya:

```json
[
  {
    "id": "9c8b7a65-...",
    "status": "REVIEWING",
    "coverLetter": "Backend engineer with Go and Node experience...",
    "createdAt": "2026-09-06T13:00:00.000Z",
    "candidate": { "id": "b2c3d4e5-...", "email": "andi@demo.com" },
    "history": [
      { "status": "APPLIED",   "changedByUserId": null,          "note": "Application submitted", "createdAt": "..." },
      { "status": "REVIEWING", "changedByUserId": "a1b2c3d4-...", "note": "Good domain fit.",      "createdAt": "..." }
    ]
  }
]
```

Email kandidat diungkapkan di sini — itu adalah kumpulan kandidat milik perusahaan tersebut dan
mereka perlu menghubungi orangnya. Perhatikan nama field-nya: `candidate`, bukan `applicant`.
API menyimpan istilah "Candidate" untuk sudut pandang Company, dan perbedaan ini penting
(seorang Job Seeker adalah Candidate hanya pada job yang ia lamar, dan orang asing bagi
perusahaan lain). Hash password dan refresh token mereka berada di baris yang sama dan tidak
pernah diserialisasi.

**Error**

| Kode | Kapan |
|---|---|
| `400` | `:jobId` bukan UUID yang valid, atau nilai `status` tidak dikenal |
| `401` | Belum terautentikasi |
| `403` | Pemanggil adalah Job Seeker |
| `404` | Job tidak ada, **atau** job milik perusahaan lain |

---

#### `PATCH /api/applications/:id/status`

Mengubah status seorang kandidat. **Mengimplementasikan requirement 8 dan 9.**

**Auth:** hanya `COMPANY`, untuk lamaran pada job yang dimiliki perusahaan tersebut

| Field | Tipe | Wajib | Catatan |
|---|---|---|---|
| `status` | enum | ✅ | Status apa pun kecuali `APPLIED` |
| `note` | string | ❌ | ≤ 1000 karakter, disimpan pada baris history |

```json
{
  "status": "SHORTLISTED",
  "note": "Passed technical screen. Scheduling on-site."
}
```

Status pada application dan baris history baru ditulis dalam **satu transaksi**
([ADR-0002](./adr/0002-status-history-authoritative-current-status-denormalized.md)), sehingga
status saat ini yang didenormalisasi tidak akan pernah menyimpang dari history-nya.

**Response `200`**

Sebuah perubahan nyata. Responsnya sengaja minimal — hanya menegaskan apa yang berubah dan
dari mana, yang merupakan semua yang dibutuhkan UI Company untuk memperbarui barisnya:

```json
{
  "id": "9c8b7a65-...",
  "status": "SHORTLISTED",
  "previousStatus": "REVIEWING",
  "changed": true
}
```

Baris history yang dibuat **tidak** disertakan dalam respons ini. Untuk membaca timeline setelah
perubahan, ambil ulang application-nya — `GET /api/applications/me/:id` untuk pelamar, atau
`GET /api/jobs/:jobId/applications` untuk Company (yang responsnya memuat `history` tiap
kandidat).

Menetapkan status yang **sudah** dimiliki application adalah no-op — `200` dengan
`changed: false`, `previousStatus` sama dengan status saat ini, dan **tanpa** baris history,
sehingga jejak audit tidak pernah memuat duplikat berurutan:

```json
{
  "id": "9c8b7a65-...",
  "status": "SHORTLISTED",
  "previousStatus": "SHORTLISTED",
  "changed": false
}
```

**Error**

| Kode | Kapan |
|---|---|
| `400` | `status` bernilai `APPLIED` (status awal pemberian sistem), atau `status` hilang/tidak dikenal |
| `401` | Belum terautentikasi |
| `403` | Pemanggil adalah Job Seeker |
| `404` | Lamaran tidak ada, **atau** berada pada job perusahaan lain |

---

## 6. Ketertelusuran requirement

| # | Requirement | Di mana diimplementasikan |
|---|---|---|
| 1 | Login sebagai Job Seeker atau Company | `POST /api/auth/register`, `POST /api/auth/login` |
| 2 | Pencari kerja melihat job (judul, perusahaan, lokasi, gaji, tipe) | `GET /api/jobs` |
| 3 | Pencari kerja melihat detail dan bisa melamar | `GET /api/jobs/:id`, `POST /api/jobs/:jobId/applications` |
| 4 | Pencari kerja melihat job yang dilamar dan statusnya | `GET /api/applications/me` |
| 5 | Tidak ada lamaran duplikat | Unique constraint DB `(jobId, applicantUserId)` → `409`; lihat ADR-0003 |
| 6 | Company membuat lowongan job | `POST /api/jobs`, `PATCH /api/jobs/:id`, `GET /api/jobs/mine` |
| 7 | Company melihat kandidatnya sendiri | `GET /api/jobs/:jobId/applications` |
| 8 | Company mengubah status (5 nilai) | `PATCH /api/applications/:id/status` |
| 9 | Setiap perubahan tersimpan di history | Tabel `application_history`, ditulis secara transaksional; `GET /api/applications/me/:id` mengembalikannya |
| 10 | Data di PostgreSQL | Skema Prisma + migrasi di `backend/prisma/` |

Lintas aspek: **Auth & otorisasi** (§1, §2) · **Validasi API** (§4) · **Penanganan error**
(§4) · **Relasi DB** (§6) · **UI responsif** (breakpoint Tailwind di `frontend/`) · **Kode
yang mudah dipelihara** (modul berlapis, ADR, tipe bersama).

---

## 7. Mulai cepat dengan curl

Jalankan stack-nya lebih dulu — lihat [`README.md`](../README.md) di root. Diasumsikan API ada
di `http://localhost:3000` dan data demo hasil seed sudah dimuat (`npm run seed`).

```bash
API=http://localhost:3000/api
JAR=/tmp/indokerja-cookies.txt     # cookie jar curl menggantikan peran browser
```

### Login sebagai Job Seeker

```bash
curl -s -c $JAR -X POST $API/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"seeker@demo.com","password":"Password123!"}'
```

Ambil `accessToken` dari respons dan simpan:

```bash
ACCESS=$(curl -s -c $JAR -X POST $API/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"seeker@demo.com","password":"Password123!"}' \
  | python -c 'import sys,json; print(json.load(sys.stdin)["accessToken"])')
```

### Menelusuri job (requirement 2)

```bash
curl -s $API/jobs?limit=3 -H "Authorization: Bearer $ACCESS"
```

### Mencari dan memfilter

```bash
curl -s "$API/jobs?q=engineer&jobType=FULL_TIME&location=jakarta" \
  -H "Authorization: Bearer $ACCESS"
```

### Melihat job dan melamar (requirement 3 dan 5)

```bash
JOB=$(curl -s "$API/jobs?limit=1" -H "Authorization: Bearer $ACCESS" \
  | python -c 'import sys,json; print(json.load(sys.stdin)["data"][0]["id"])')

curl -s -X POST "$API/jobs/$JOB/applications" \
  -H "Authorization: Bearer $ACCESS" -H 'Content-Type: application/json' \
  -d '{"coverLetter":"I would love to work on this."}'
```

Melamar untuk kedua kalinya untuk melihat aturan duplikat:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST "$API/jobs/$JOB/applications" \
  -H "Authorization: Bearer $ACCESS" -H 'Content-Type: application/json' -d '{}'
# -> 409
```

### Lamaran saya beserta statusnya (requirement 4)

```bash
curl -s "$API/applications/me?includeHistory=true" -H "Authorization: Bearer $ACCESS"
```

### Refresh access token

Cookie jar menyediakan cookie refresh, persis seperti yang dilakukan browser:

```bash
curl -s -b $JAR -c $JAR -X POST $API/auth/refresh
```

Menggunakan rotasi dengan benar berarti cookie di dalam jar diganti pada setiap panggilan.
Melewati jar milik curl (memakai ulang token mentah dua kali) justru memicu perilaku
"penggunaan ulang mencabut semua sesi".

### Logout

```bash
curl -s -o /dev/null -w '%{http_code}\n' -b $JAR -c $JAR -X POST $API/auth/logout
# -> 204
```

### Beralih ke akun Company (requirement 6–9)

```bash
CACCESS=$(curl -s -c $JAR -X POST $API/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"company@demo.com","password":"Password123!"}' \
  | python -c 'import sys,json; print(json.load(sys.stdin)["accessToken"])')
```

Membuat lowongan job:

```bash
NEWJOB=$(curl -s -X POST $API/jobs \
  -H "Authorization: Bearer $CACCESS" -H 'Content-Type: application/json' \
  -d '{
        "title":"Platform Engineer",
        "description":"Own our internal platform services.",
        "location":"Jakarta, Indonesia",
        "jobType":"FULL_TIME",
        "salaryMin":15000000,
        "salaryMax":24000000
      }' | python -c 'import sys,json; print(json.load(sys.stdin)["id"])')
```

Menampilkan lowongan sendiri, termasuk yang tidak aktif:

```bash
curl -s $API/jobs/mine -H "Authorization: Bearer $CACCESS"
```

Menampilkan kandidat untuk sebuah job (requirement 7) — job backend hasil seed memiliki pelamar:

```bash
curl -s "$API/jobs/$(curl -s $API/jobs/mine -H "Authorization: Bearer $CACCESS" \
  | python -c 'import sys,json,os; j=json.load(sys.stdin); print([x for x in j if x["applicationCount"]>0][0]["id"])')/applications" \
  -H "Authorization: Bearer $CACCESS"
```

Mengubah status seorang kandidat (requirement 8):

```bash
APP=$(curl -s "$API/applications/me" -H "Authorization: Bearer $ACCESS" \
  | python -c 'import sys,json; print(json.load(sys.stdin)[0]["id"])')

curl -s -X PATCH "$API/applications/$APP/status" \
  -H "Authorization: Bearer $CACCESS" -H 'Content-Type: application/json' \
  -d '{"status":"SHORTLISTED","note":"Strong portfolio. Scheduling a call."}'
```

Pastikan history bertambah tepat satu (requirement 9):

```bash
curl -s "$API/applications/me/$APP" -H "Authorization: Bearer $ACCESS" \
  | python -c 'import sys,json; [print(h["status"], "|", h["note"]) for h in json.load(sys.stdin)["history"]]'
```

### Melihat model otorisasi

```bash
# Role salah -> 403: pencari kerja tidak bisa membuat job
curl -s -o /dev/null -w '%{http_code}\n' -X POST $API/jobs \
  -H "Authorization: Bearer $ACCESS" -H 'Content-Type: application/json' \
  -d '{"title":"x","description":"x","location":"x","jobType":"FULL_TIME"}'
# -> 403

# Tanpa token -> 401
curl -s -o /dev/null -w '%{http_code}\n' $API/jobs
# -> 401

# Lintas tenant -> 404, bukan 403 (job milik perusahaan lain)
curl -s -o /dev/null -w '%{http_code}\n' \
  "$API/jobs/$(curl -s "$API/jobs?limit=50" -H "Authorization: Bearer $ACCESS" \
    | python -c 'import sys,json; j=json.load(sys.stdin)["data"]; print([x for x in j if x["jobType"]=="FREELANCE"][0]["id"])')/applications" \
  -H "Authorization: Bearer $CACCESS"
# -> 404 ketika job itu bukan milik company@demo.com
```

### Job tidak aktif disembunyikan (efek samping requirement 6)

Seed memuat satu lowongan yang sengaja dinonaktifkan. Lowongan itu tidak pernah muncul di
daftar publik:

```bash
curl -s "$API/jobs?limit=50" -H "Authorization: Bearer $ACCESS" \
  | python -c 'import sys,json; print([j["title"] for j in json.load(sys.stdin)["data"]]); print("closed jobs listed above?")'
# "DevOps Engineer (Closed)" tidak ada
```

### Gaji yang tidak diungkapkan tetap `null`

```bash
curl -s "$API/jobs?limit=50" -H "Authorization: Bearer $ACCESS" \
  | python -c '
import sys, json
for j in json.load(sys.stdin)["data"]:
    if j["salaryMin"] is None:
        print(j["title"], "->", j["salaryMin"], j["salaryMax"], "(Negotiable)")'
```

---

## Membuat ulang spesifikasi OpenAPI

Swagger dihasilkan dari DTO saat boot, sehingga tidak mungkin menyimpang dari kodenya. Untuk
mengekspornya:

```bash
curl -s http://localhost:3000/api/docs-json -o openapi.json
```

## Verifikasi otomatis

`backend/apitest.js` adalah skrip end-to-end dengan 90 assertion yang menguji setiap requirement
di atas terhadap API yang hidup dan database yang nyata:

```bash
cd backend
node apitest.js
```
