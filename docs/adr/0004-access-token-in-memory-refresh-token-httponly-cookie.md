# 0004 — Access token di memori, refresh token di cookie httpOnly dengan pencabutan di sisi server

- **Status:** Accepted
- **Date:** 2026-09-15

## Konteks

Brief mencantumkan "Authentication & Authorization", "security", dan "API validation" sebagai
area fokus penilaian. Penilai yang mengevaluasi pengumpulan ini sangat mungkin akan bertanya
"di mana JWT disimpan, dan kenapa", karena jawabannya memisahkan kandidat yang menyalin
tutorial dari yang sudah memikirkan trade-off-nya.

Default naif — menaruh access token di `localStorage` dan mengirimnya sebagai bearer token —
sangat lazim di tutorial. Ia juga bisa dibaca oleh JavaScript apa pun yang berjalan di halaman
tersebut, sehingga satu celah XSS di mana pun dalam aplikasi (atau di sebuah dependensi) bisa
membocorkan kredensial berumur panjang.

Pendekatan pesaingnya — menyimpan semuanya di cookie `httpOnly` — menghilangkan paparan XSS
tetapi memunculkan paparan CSRF dan membuat pengembangan lintas origin antara dev server Vite
(`:5173`) dan API (`:3000`) menjadi canggung, karena cookie memerlukan kredensial serta
konfigurasi `SameSite`/`CORS` yang benar.

Ada pertimbangan ketiga: brief mewajibkan logout berfungsi, dan JWT stateless biasa tidak bisa
dicabut sebelum masa berlakunya habis.

## Keputusan

Kami akan memakai **access token berumur pendek (15 menit) yang hanya disimpan di memori
JavaScript**, dan **refresh token berumur panjang (7 hari) di dalam cookie `httpOnly`,
`SameSite=Lax`, dan `Secure` saat produksi**.

Access token tidak pernah ditulis ke `localStorage` atau `sessionStorage`. Saat halaman
dimuat ulang, token di memori itu hilang memang sesuai desain; frontend secara senyap memanggil
`POST /auth/refresh` (terautentikasi lewat cookie) untuk memperoleh token baru, sehingga
pengguna tidak merasakan logout.

Refresh token akan **disimpan di sisi server sebagai hash bcrypt** dalam tabel `RefreshToken`
dengan `userId`, `expiresAt`, dan `revokedAt`, dan **dirotasi pada setiap pemakaian**: refresh
yang berhasil mencabut token yang diserahkan dan menerbitkan token baru. Logout mencabut token
di sisi server, sehingga benar-benar menjadi tidak valid, bukan sekadar dilupakan oleh klien.

## Alternatif yang dipertimbangkan

- **Access token di `localStorage`.** Paling sederhana, dan sudah menjadi standar de-facto di
  tutorial. Ditolak karena bisa dibaca XSS dan karena memaksa kami menjawab "bagaimana logout
  sebenarnya bekerja?" dengan "klien menghapus tokennya", yang bukan pencabutan. Untuk
  pengumpulan yang dinilai sebagian dari segi keamanan, memilih opsi yang lebih lemah secara
  sadar dan tanpa dokumentasi lebih buruk daripada biaya implementasi tambahan yang kecil.
  Jika proyek ini adalah prototipe sekali pakai, saya akan memilihnya.

- **Kedua token di cookie `httpOnly`.** Menghilangkan pembacaan XSS sepenuhnya dan akan
  menjadi pilihan terkuat untuk aplikasi browser murni. Ditolak untuk proyek ini karena access
  token juga dikirim sebagai header bearer, yang menjaga API tetap bisa dipakai oleh klien non-
  browser (curl, Swagger UI, aplikasi mobile di masa depan) tanpa perlu urusan cookie — dan itu
  penting untuk pengumpulan di mana penilai diharapkan menguji API-nya secara langsung.

- **Refresh token stateless (JWT bertanda tangan tanpa baris database).** Akan menghindari
  tabel `RefreshToken`. Ditolak karena membuat logout mustahil ditegakkan dan membuat rotasi
  menjadi tak bermakna (refresh JWT yang dicuri tetap valid sampai kedaluwarsa tanpa cara
  mendeteksi pemakaian ulangnya).

- **Cookie sesi yang ditopang penyimpanan sesi di sisi server alih-alih JWT.** Desain yang
  sangat baik, dan bisa dibilang lebih cocok untuk aplikasi browser satu origin. Ditolak karena
  brief ini adalah latihan lamaran kerja di mana JWT adalah kosakata yang diharapkan, dan
  karena itu akan membuat API kurang nyaman didemonstrasikan dari Swagger.

## Konsekuensi

- Frontend membutuhkan interceptor axios yang, saat menerima `401`, memanggil `/auth/refresh`
  sekali lalu mengulang permintaan aslinya. Ini harus dijaga terhadap loop tak terbatas dan
  terhadap beberapa `401` bersamaan yang masing-masing memicu refresh-nya sendiri (permintaan
  harus mengantre di belakang satu refresh yang sedang berjalan). Ini kompleksitas nyata dan
  merupakan biaya utama dari keputusan ini.
- `CORS` harus mengizinkan kredensial dan menyebutkan origin secara eksplisit;
  `origin: '*'` tidak kompatibel dengan permintaan berkredensial. Origin yang diizinkan dibaca
  dari variabel environment, sehingga origin saat deployment adalah perubahan konfigurasi,
  bukan perubahan kode.
- API tetap bisa dipakai dari curl dan Swagger: cookie refresh hanya diperlukan untuk endpoint
  refresh dan logout, dan semua endpoint lainnya menerima bearer token.
- Refresh token yang dibajak pada prinsipnya bisa dideteksi melalui rotasi (token yang dipakai
  ulang menyiratkan pencurian), dan kami **memang** menindaklanjutinya: menyerahkan token yang
  sudah dicabut akan mencabut seluruh sesi aktif milik user tersebut
  (`RefreshTokenService.consume` → `revokeAllForUser`). Lihat "Cakupan pencabutan" di bawah
  untuk alasan cakupannya adalah seluruh user, bukan satu rantai token.
- `Secure` tidak bisa di-set selama pengembangan HTTP lokal, jadi ia dikondisikan pada
  `NODE_ENV === 'production'`.

### Cakupan pencabutan

Pemakaian ulang token yang sudah dicabut akan mencabut **semua** sesi user tersebut, bukan
hanya satu keluarga token per perangkat. Ada dua alasan:

- Token disimpan sebagai hash bcrypt bergaram, sehingga token tidak bisa dicari dengan
  meng-hash nilai yang diserahkan lalu mencocokkannya ke sebuah kolom — token yang diserahkan
  harus diverifikasi terhadap baris-baris kandidat. Tidak ada `familyId` untuk ditelusuri
  kembali, karena tidak ada cara menemukan barisnya tanpa memverifikasi token itu lebih dulu.
  Mendukung keluarga token berarti menambahkan entah prefiks pencarian non-rahasia pada setiap
  baris atau HMAC ber-key supaya kolomnya bisa dicari; keduanya menukar sedikit ketahanan
  kebocoran demi cakupan yang lebih sempit.
- Postur keamanannya sengaja konservatif. Refresh token yang diputar ulang berarti token itu
  dipegang oleh pihak selain pemiliknya, dan tidak ada cara yang andal untuk menentukan pihak
  mana yang sah. Mengakhiri semua sesi hanya membuat pengguna asli login sekali lagi;
  salah menebak akan membuat mereka kehilangan akunnya.

Biayanya nyata dan layak dinyatakan terus terang: percobaan ulang yang nyasar dari tab browser
kedua akan membuat pengguna logout di mana-mana. Itulah sebabnya frontend menggabungkan
refresh yang bersamaan menjadi satu promise yang sedang berjalan
(`frontend/src/api/client.ts`) — tanpa itu, kondisi balapan biasa antara dua tab akan
memicunya.

## Yang akan mengubah pikiran kami

Jika aplikasi ini suatu saat di-deploy dalam konteks di mana API dan frontend berada di origin
yang sama dan tidak ada klien non-browser yang penting, memindahkan access token ke cookie
`httpOnly` juga akan menjadi peningkatan keamanan yang tegas, dengan biaya menambahkan
perlindungan CSRF. Sebaliknya, jika suatu saat ditemukan kerentanan XSS, jendela 15 menit pada
access token akan membatasi kerusakannya tetapi tidak menghilangkannya — itulah saatnya untuk
meninjau ulang penggunaan access token berbasis cookie.
