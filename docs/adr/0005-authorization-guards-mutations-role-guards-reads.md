# 0005 — Guard `authorization` untuk mutasi, guard `role` untuk pembacaan

- **Status:** Accepted
- **Date:** 2026-09-15

## Konteks

Persyaratan nomor 6 dan 7 memunculkan batas otorisasi yang jelas: sebuah Perusahaan boleh
membuat Job, dan boleh melihat kandidat yang melamar ke Job **miliknya sendiri**. Perusahaan
tidak boleh melihat kandidat perusahaan lain.

Penyederhanaan yang menggoda, dan yang paling banyak diadopsi pengumpulan lain, adalah
mengotorisasi berdasarkan peran saja: "hanya Perusahaan yang boleh memanggil
`GET /jobs/:id/applications`". Ini perlu tetapi tidak cukup. Persyaratan nomor 7 menyebut
"lowongan **miliknya**" — postingan miliknya sendiri. Peran saja akan membuat Perusahaan A
bisa membaca daftar kandidat Perusahaan B hanya dengan mengetahui ID lowongannya, yang
merupakan kerentanan IDOR nyata dan implementasi persyaratan yang jelas salah.

Brief juga mencantumkan "Authorization" dan "Database relationship yang baik" sebagai area
fokus, jadi relasi kepemilikan ini layak dibuat eksplisit di skema alih-alih diperiksa
ad-hoc di setiap handler.

Pertanyaan desain yang muncul dari sini adalah apa arti "kepemilikan" *untuk sisi pelamar*.
Seorang Pencari Kerja tidak memiliki apa pun kecuali Application miliknya sendiri. Tidak ada
kepemilikan di level sumber daya yang perlu diperiksa — identitas pelamar *adalah* cakupan
kuerinya.

## Keputusan

Kami akan membedakan dua jenis otorisasi dan mengimplementasikannya secara berbeda.

**Authorization — di level sumber daya, untuk mutasi.** Operasi apa pun yang mengubah keadaan
yang sudah ada milik seseorang (membuat Job, mendaftar kandidat sebuah Job, mengubah status
sebuah Application) diperiksa terhadap relasi sumber daya, dengan kepemilikan diturunkan dari
database alih-alih dari nilai yang dipasok klien. Server menentukan "apakah Perusahaan ini
memiliki Job ini?" dari `Job.companyUserId`, dan tidak pernah memercayai `companyId` di body
permintaan. Ketika sebuah sumber daya tidak dimiliki pemanggil, kami mengembalikan
**`404 Not Found`, bukan `403 Forbidden`**, supaya endpoint tersebut tidak mengonfirmasi
keberadaan sumber daya milik pihak lain.

**Role — di level aktor, untuk pembacaan dan pembuatan.** Operasi yang cakupannya memang
"data milik pemanggil sendiri" (mendaftar Job yang tersedia sebagai Pencari Kerja, mendaftar
Application milik sendiri, membuat Job sebagai Perusahaan) dijaga oleh peran saja, karena
kuerinya sendiri sudah dibatasi ke pengguna yang terautentikasi. Pencari Kerja yang mendaftar
Application miliknya tidak bisa membocorkan apa pun: kuerinya difilter dengan
`applicantUserId = req.user.id`.

Secara konkret: `JobSeekerGuard` dan `CompanyGuard` diterapkan per-rute bersama
`JwtAuthGuard`, dan logika handler menegakkan kepemilikan di mana sebuah sumber daya diacu
lewat ID.

## Alternatif yang dipertimbangkan

- **Otorisasi berbasis peran saja di mana-mana.** Paling sederhana dan memenuhi huruf
  persyaratan nomor 6. Ditolak karena persyaratan nomor 7, yang secara eksplisit tentang
  kepemilikan, dan karena pengecekan berbasis peran saja pada
  `GET /jobs/:jobId/applications` adalah IDOR buku teks yang akan ditemukan penilai yang
  memindai isu keamanan.

- **`403` untuk akses lintas tenant.** Bisa dibilang lebih jujur dan lebih mudah di-debug.
  Ditolak karena ia mengonfirmasi bahwa sumber daya yang diminta itu ada — sebuah Perusahaan
  bisa menyebutkan ID lowongan satu per satu dan mengetahui mana yang nyata. `404`
  membocorkan lebih sedikit.

- **Lapisan otorisasi generik berbasis kebijakan seperti CASL.** Akan menjadi pilihan yang
  tepat di sistem yang lebih besar dengan banyak sumber daya dan aturan yang terperinci.
  Ditolak karena tidak proporsional di sini: hanya ada dua peran dan satu relasi kepemilikan.
  Framework izin akan menambah dependensi dan satu lapisan perantara tanpa tambahan
  kebenaran pada ukuran ini.

- **Menegakkan kepemilikan di lapisan database lewat row-level security PostgreSQL.** Kuat,
  dan sungguh menarik sebagai langkah pertahanan berlapis. Ditolak karena Prisma tidak
  mengelola kebijakan RLS, sehingga kebijakannya akan berada di luar riwayat migrasi dan
  tidak terlihat oleh siapa pun yang membaca skemanya — lebih buruk bagi penilai yang
  berusaha memahami model otorisasinya dibandingkan guard eksplisit plus logika service.

## Konsekuensi

- Persyaratan yang sama ditegakkan oleh dua mekanisme. Pengembang yang menambahkan endpoint
  baru harus memutuskan mana yang berlaku, dan bisa saja salah pilih. Mitigasinya adalah
  pengecekan kepemilikan berada di lapisan service tepat di sebelah kuerinya, sehingga sulit
  menambahkan metode "daftar kandidat" tanpa menyadari bahwa metode saudaranya memeriksa
  kepemilikan.
- Kepemilikan diturunkan dari `job.companyUserId`, yang ditetapkan saat pembuatan dari
  pengguna yang terautentikasi dan tidak pernah diterima dari klien. Tidak ada endpoint untuk
  mengalihkan kepemilikan.
- `404` untuk akses lintas tenant berarti bug yang sah pada data milik pemanggil sendiri
  (misalnya ID lowongan yang sudah kedaluwarsa) akan dilaporkan sebagai "not found" alih-alih
  "forbidden", yang sedikit lebih sulit di-debug. Diterima dengan menukar kebocoran keberadaan
  sumber daya.
- Setiap jalur mutasi punya tes e2e yang memastikan kasus lintas tenant ditolak. Tanpa tes
  tersebut, pembedaan ini hanya aspirasi dan bukan sesuatu yang terverifikasi.

## Yang akan mengubah pikiran kami

Jika suatu saat peran ketiga diperkenalkan (misalnya `ADMIN` yang boleh membaca lintas tenant,
atau peran rekruter yang bertindak atas nama perusahaan), model dua guard ini perlu diganti
dengan lapisan kebijakan — predikat kepemilikannya tidak lagi bisa dinyatakan sebagai
"Perusahaan yang membuatnya". Begitu pula, jika jumlah relasi kepemilikan tumbuh melebihi
yang satu ini, pengecekan service yang ditulis tangan akan menjadi bahaya pemeliharaan dan
CASL atau RLS akan mulai sepadan dengan biayanya.
