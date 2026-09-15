# 0002 — Riwayat status bersifat otoritatif, status terkini adalah model baca yang didenormalisasi

- **Status:** Accepted
- **Date:** 2026-09-15

## Konteks

Persyaratan nomor 9 menyatakan bahwa setiap perubahan status harus tercatat dalam riwayat
lamaran. Persyaratan nomor 4 ("melihat lamaran saya dan statusnya") dan persyaratan nomor 7
("perusahaan melihat kandidat untuk lowongannya") keduanya membutuhkan pembacaan status
*terkini* sebuah Application, dan keduanya termasuk kueri terpanas dalam aplikasi ini — setiap
tampilan daftar menyentuh salah satunya.

Ini menciptakan ketegangan klasik. Riwayat bersifat append-only dan benar secara
konstruksi, tetapi menurunkan status terkini darinya berarti subkueri berkorelasi atau join
`DISTINCT ON (application_id) ... ORDER BY created_at DESC` pada setiap baris di setiap
daftar. Menyimpan status terkini di baris Application cepat dibaca tetapi memunculkan sumber
kebenaran kedua yang bisa menyimpang dari riwayatnya.

Sebuah application bisa bertransisi berkali-kali (Applied → Reviewing → Rejected → Reviewing
→ Shortlisted), jadi "riwayat" bukan sekadar catatan pembuatan.

## Keputusan

Kami akan menyimpan keduanya: kolom `Application.status` yang menampung status terkini, dan
tabel `ApplicationHistory` yang bersifat append-only yang menampung setiap status yang pernah
dimiliki application tersebut.

Keduanya ditulis **di dalam satu transaksi database tunggal** pada setiap perubahan status,
sehingga keduanya tidak mungkin menyimpang pada penulisan yang sudah ter-commit. Entri riwayat
untuk keadaan `Applied` awal ditulis oleh transaksi yang sama yang membuat Application
tersebut, bukan ditunda sampai perubahan pertama.

Jika keduanya sampai tidak sepakat pada baris yang sudah ada, `ApplicationHistory` secara
definisi adalah yang benar dan `Application.status` yang rusak; ia diperbaiki dari riwayat,
tidak pernah sebaliknya.

## Alternatif yang dipertimbangkan

- **Menurunkan status terkini hanya dari riwayat.** Ini posisi paling murni dan memang
  menggoda — satu sumber kebenaran berarti penyimpangan menjadi mustahil. Kami menolaknya
  karena dua kueri paling sering dalam sistem ini akan sama-sama berubah menjadi join
  window-function pada tabel yang tumbuh tanpa batas (setiap perubahan status menambah satu
  baris, selamanya). Untuk aplikasi berskala penilaian, angka absolutnya kecil, tetapi bentuk
  kuerinya adalah jenis yang diperhatikan penilai, dan "endpoint daftar mengagregasi log
  audit" adalah desain yang tidak bertahan saat bertemu volume data nyata.

- **Simpan status terkini saja, catat perubahannya ke logger aplikasi.** Ditolak:
  persyaratannya secara eksplisit menyebut riwayat harus *disimpan*, dan log bukan data
  domain yang bisa dikueri. Perusahaan ingin melihat riwayatnya sendiri lewat API, bukan
  dengan membaca log server.

- **Perubahan status sebagai event dengan Application yang event-sourced.** Ditolak karena
  tidak proporsional. Event sourcing penuh berarti memutar ulang event untuk membangun setiap
  model baca, dan itu mesin yang besar hanya untuk sebuah field status dengan lima nilai.
  Pendekatan kolom terdenormalisasi menangkap manfaat auditnya tanpa mesin tersebut.

## Konsekuensi

- Setiap perubahan status adalah transaksi, bukan `update` biasa. Ini tidak bisa ditawar dan
  tidak boleh dioptimasi hilang — kedua penulisan itu adalah satu unit pekerjaan.
- `Application.status` secara teknis adalah data yang redundan. Pengembang di masa depan
  mungkin tergoda untuk "merapikan ini" dengan menghapus kolomnya dan join ke riwayat. ADR ini
  ada untuk menghentikan itu.
- Penulisan secara praktik menjadi berurutan per application. Dua perubahan status yang
  bersamaan bisa saling menyisipkan entri riwayatnya; karena riwayat diurutkan berdasarkan
  `created_at` dan penulis terakhir yang menang pada kolom `status`, hasilnya tetap konsisten,
  tetapi urutan dua entri pada saat yang sama persis tidak dijamin. Bukan masalah pada skala
  ini; dicatat demi kejujuran.
- Kami sengaja **tidak** menegakkan transisi yang sah antar status (lihat `CONTEXT.md`),
  sehingga urutan riwayat tidak mengandung makna state machine — ia adalah catatan tentang apa
  yang terjadi, bukan urutan yang tervalidasi.

## Yang akan mengubah pikiran kami

Jika suatu saat state machine sungguhan diperkenalkan (keputusan yang secara eksplisit kami
tolak), riwayatnya akan memerlukan validasi transisi dan ADR ini perlu ditinjau ulang. Secara
terpisah, jika baris Application suatu saat perlu didaftar pada volume di mana bahkan kolom
terdenormalisasi pun tidak cukup, materialized view adalah langkah berikutnya — tetapi itu
perubahan performa, bukan perubahan atas keputusan ini.
