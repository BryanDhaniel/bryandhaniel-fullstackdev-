# 0001 — Satu tabel User dengan diskriminator Role

- **Status:** Accepted
- **Date:** 2026-09-15

## Konteks

Sistem ini punya dua jenis aktor terautentikasi: Pencari Kerja dan Perusahaan. Keduanya
melakukan autentikasi dengan cara yang identik (email + kata sandi, penerbitan token yang
sama, siklus hidup sesi yang sama) tetapi sangat berbeda dalam hal yang boleh mereka lakukan —
Pencari Kerja melamar Job, Perusahaan membuat Job dan mengelola Application yang masuk.

Pertanyaan pemodelan yang jelas adalah apakah keduanya sebaiknya menjadi satu tabel dengan
diskriminator, atau dua tabel dengan kredensial terpisah. Keduanya umum di sistem produksi,
dan pilihan ini mahal untuk dibalik karena menentukan bentuk setiap foreign key, setiap guard
autentikasi, dan setiap payload JWT di hilirnya.

Brief juga meminta "database relationship yang baik" sebagai kriteria penilaian eksplisit,
jadi jawabannya harus bisa dipertahankan berdasarkan substansinya, bukan sekadar karena
praktis.

## Keputusan

Kami akan memodelkan kedua aktor sebagai satu tabel `User` yang membawa enum `role`
(`JOB_SEEKER` | `COMPANY`), dengan field deskriptif khusus perusahaan dipisahkan ke relasi
satu-ke-satu `CompanyProfile` yang hanya ada untuk User yang role-nya `COMPANY`.

`Job.companyUserId` dan `Application.applicantUserId` keduanya merujuk langsung ke `User.id`.

## Alternatif yang dipertimbangkan

- **Dua tabel: `JobSeeker` dan `Company`, masing-masing dengan kredensialnya sendiri.**
  Argumen terkuat untuk ini adalah bahwa ia membuat batas domain menjadi eksplisit dan
  mencegah baris perusahaan membawa field pencari kerja yang nullable (atau sebaliknya).
  Kami menolaknya karena ia menduplikasi hashing kata sandi, penerbitan token, rotasi refresh
  token, dan pembatasan login ke dalam dua jalur kode yang harus tetap identik perilakunya
  selamanya. Ia juga memaksa setiap guard autentikasi menjawab "tabel mana yang harus saya
  lihat?" dan membuat `subjectId` polimorfik pada `RefreshToken` menjadi keharusan — sebuah
  foreign key yang tidak bisa ditegakkan oleh database. Keberatan soal kolom nullable
  terjawab dengan memindahkan field khusus perusahaan ke `CompanyProfile`, dan itulah
  perbaikan yang sebenarnya; hasilnya `User` hanya menyisakan sangat sedikit kolom opsional.

- **Satu tabel `User`, semua field profil inline, tanpa `CompanyProfile`.** Paling sederhana,
  tetapi ini menempatkan kolom deskripsi perusahaan, situs web, dan logo pada setiap baris
  pencari kerja. Karena kami sudah membutuhkan relasi itu untuk field deskriptifnya dan
  biayanya hanya satu join yang hanya dilakukan saat menampilkan perusahaan, pemisahan ini
  nyaris gratis.

## Konsekuensi

- Autentikasi diimplementasikan sekali. Tidak ada risiko perbedaan perilaku antara "login
  pencari kerja" dan "login perusahaan" karena hanya ada satu login.
- Perubahan `Role` adalah pembaruan satu kolom, dan kami sudah menetapkan bahwa role bersifat
  tetap setelah registrasi (lihat `CONTEXT.md`). Jika kebijakan itu pernah dilonggarkan,
  dampaknya besar: Job milik sebuah Perusahaan yang sudah ada akan tetap dimiliki oleh akun
  yang kini menjadi Pencari Kerja, dan `JobSeekerGuard` serta `CompanyGuard` akan saling
  bertentangan soal itu.
- `CompanyProfile` bersifat opsional. User `COMPANY` tanpa profil mungkin ada di database,
  sehingga lapisan tampilan harus menangani profil bernilai null alih-alih menganggapnya
  selalu ada. Registrasi membuatnya secara atomik untuk mencegah hal ini dalam praktik.
- `Role` adalah enum database. Menambahkan aktor ketiga (misalnya `ADMIN`) adalah sebuah
  migrasi, bukan perubahan konfigurasi.

## Yang akan mengubah pikiran kami

Jika Perusahaan dan Pencari Kerja membutuhkan autentikasi yang benar-benar berbeda — misalnya
perusahaan diwajibkan memakai SSO/verifikasi domain untuk masuk, atau pencari kerja memakai
OTP telepon sementara perusahaan memakai kata sandi — maka justifikasi "satu jalur
autentikasi" akan runtuh sepenuhnya dan dua tabel menjadi pilihan yang benar. Begitu pula jika
field khusus perusahaan tumbuh sampai jauh melebihi field bersama, diskriminator ini akan
mulai memakan lebih banyak daripada yang ia hemat.
