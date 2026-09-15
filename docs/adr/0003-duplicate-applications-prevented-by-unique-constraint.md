# 0003 — Lamaran duplikat dicegah oleh constraint unik database

- **Status:** Accepted
- **Date:** 2026-09-15

## Konteks

Persyaratan nomor 5 melarang Pencari Kerja melamar ke lowongan yang sama lebih dari sekali.
Brief tidak menyebutkan *bagaimana* ini harus ditegakkan, tetapi ini salah satu persyaratan
fungsional yang disebutkan secara eksplisit, jadi ia akan diuji — kemungkinan dengan penilai
menekan tombol "Apply" dua kali, dan mungkin juga dengan penilai mengirim dua permintaan
sekaligus.

Ini adalah persyaratan kebenaran, bukan preferensi UX. Dua lamaran untuk pasangan
`(jobId, applicantUserId)` yang sama yang ada di database adalah kegagalan integritas data,
terlepas dari bagaimana UI berperilaku.

Ada kondisi balapan yang sudah dikenal luas pada implementasi naif: aplikasi membaca untuk
memeriksa apakah lamaran sudah ada, tidak menemukan apa pun, lalu melakukan insert. Dua
permintaan yang saling menyisipkan di antara operasi baca dan insert sama-sama tidak
menemukan apa pun, dan keduanya melakukan insert. Guard di kode aplikasi tidak menutup celah
ini.

## Keputusan

Kami akan menegakkan keunikan dengan constraint unik di level database pada
`Application (jobId, applicantUserId)`, yang dituliskan di Prisma sebagai
`@@unique([jobId, applicantUserId])` dan diwujudkan dalam sebuah migrasi.

Kami *juga* akan melakukan pra-pengecekan `findUnique` sebelum insert, supaya percobaan
duplikat yang biasa mengembalikan `409 Conflict` yang bersih dengan pesan yang ramah tanpa
memicu pelanggaran constraint. Pra-pengecekan itu adalah optimasi untuk jalur umum, bukan
jaminannya. Constraint database-lah jaminannya.

Jalur insert menangkap error Prisma `P2002` dan menerjemahkannya menjadi respons `409 Conflict`
yang sama. Dengan begitu kondisi balapan ditutup oleh database, dan pihak yang kalah dalam
balapan itu tetap menerima error yang benar dan berbentuk rapi.

## Alternatif yang dipertimbangkan

- **Pengecekan di level aplikasi saja.** Ditolak: ini sebenarnya tidak menegakkan
  persyaratannya. Celah antara `SELECT` dan `INSERT` memang kecil tetapi nyata, dan mode
  kegagalannya adalah data duplikat yang senyap, bukan sebuah error. Untuk persyaratan
  kebenaran yang eksplisit, ini tempat yang salah untuk bersikap optimistis.

- **Constraint unik saja, tanpa pra-pengecekan.** Benar secara fungsional, dan mengurangi satu
  kueri pada jalur normal. Ditolak karena setiap percobaan duplikat akan menghasilkan
  exception database di log, dan menerjemahkan `P2002` menjadi respons HTTP tetap
  membutuhkan kode penanganan error yang sama — jadi pra-pengecekan hanya memakan satu
  pencarian berindeks yang murah dan menjaga jalur normal bebas dari exception. Perlu dicatat
  ini berarti pengecekan terjadi dua kali pada kasus duplikat, dan itu tidak masalah:
  duplikat seharusnya jarang terjadi.

- **Baris "kunci lamaran" terpisah atau advisory lock per pencari kerja.** Ditolak karena
  terlalu rumit. Indeks unik adalah alat yang tepat untuk constraint ini dan tidak butuh
  protokol koordinasi apa pun.

## Konsekuensi

- Aturan duplikat tetap ditegakkan meskipun endpoint, skrip, atau berkas seed di masa depan
  lupa memeriksa lebih dulu. Penulis mana pun yang melanggarnya akan gagal dengan berisik di
  database.
- Penanganan `P2002` kini menjadi beban penting: ia harus dipetakan ke `409 Conflict` dan
  bukan ke `500` generik. Ada tes e2e yang memastikan hal ini.
- Constraint ini berlaku per `(jobId, applicantUserId)`, yang dengan tepat memperbolehkan
  seorang Pencari Kerja melamar ke dua Job berbeda di Perusahaan yang sama — termasuk dua Job
  dengan judul identik. Jika produk kelak menginginkan "satu lamaran per perusahaan", itu
  constraint yang berbeda dan sebuah migrasi.
- Pencari Kerja yang ditolak tidak bisa melamar ulang ke Job yang sama dengan membuat
  application *baru*; application yang ada dipindahkan kembali melalui status. Ini konsisten
  dengan tidak adanya status `Withdrawn`.

## Yang akan mengubah pikiran kami

Jika domain ini suatu saat memperbolehkan melamar ulang setelah penolakan sebagai application
yang benar-benar baru (membuang riwayat sebelumnya), constraint uniknya harus menjadi parsial
— unik hanya di antara application yang *masih hidup* — dan riwayatnya perlu membedakan
percobaan lamaran. Itu keputusan produk dengan biaya pemodelan yang nyata, dan akan
menggantikan ADR ini.
