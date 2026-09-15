# IndoKerja.id — Glosarium Domain

Berkas ini adalah **glosarium dan hanya itu**. Berkas ini mencatat makna kanonik setiap istilah
domain. Tidak ada detail implementasi, tidak ada bentuk API, dan tidak ada keputusan teknis di
dalamnya — semua itu ada di `docs/adr/`.

Jika sebuah istilah dipakai di kode atau percakapan dengan cara yang bertentangan dengan
berkas ini, pertentangan itu adalah bug dan harus diselesaikan di sini lebih dulu.

---

## Aktor

### User

Akun yang bisa melakukan autentikasi. Setiap aktor terautentikasi dalam sistem ini adalah
User.

Sebuah User memiliki tepat satu **Role**, ditetapkan saat registrasi dan tidak pernah berubah
setelahnya. Tidak ada mekanisme untuk mengubah Pencari Kerja menjadi Perusahaan atau
sebaliknya; melakukannya akan membatalkan kepemilikan setiap Job dan Application yang
terhubung dengan akun tersebut.

### Role

Satu-satunya klasifikasi yang menentukan apa yang boleh dilakukan seorang User. Tepatnya dua
nilai:

- **Pencari Kerja (Job Seeker)** — seseorang yang sedang mencari pekerjaan.
- **Perusahaan (Company)** — organisasi yang memasang lowongan.

Role adalah batas otorisasi, bukan preferensi tampilan. Role bukan tingkatan langganan, bukan
penanda terverifikasi/belum terverifikasi, dan bukan tingkat izin.

### Pencari Kerja (Job Seeker)

Seorang User yang Role-nya Pencari Kerja. Boleh menelusuri Job, melamar Job, dan melihat
Application miliknya sendiri.

Seorang Pencari Kerja bukan "kandidat". Lihat **Candidate** di bawah.

### Perusahaan (Company)

Seorang User yang Role-nya Perusahaan. Boleh membuat Job, serta melihat dan memproses
Application yang masuk ke Job miliknya.

Sebuah Perusahaan adalah *akun pengguna yang mewakili sebuah organisasi*. Ia bukan organisasi
itu sendiri — lihat **Company Profile**.

### Profil Perusahaan (Company Profile)

Atribut deskriptif organisasi di balik sebuah User Perusahaan: nama tampilan, deskripsi, situs
web, logo. Hanya ada untuk User yang Role-nya Perusahaan.

Profil Perusahaan adalah data presentasi. Kepemilikan sebuah Job ditentukan oleh User
Perusahaan yang membuatnya, tidak pernah oleh Profil Perusahaan.

---

## Perekrutan

### Job (Lowongan)

Satu lowongan pekerjaan, dibuat oleh tepat satu Perusahaan. Membawa judul, deskripsi, lokasi,
rentang gaji, dan jenis pekerjaan.

Sebuah Job **dimiliki** oleh Perusahaan yang membuatnya. Kepemilikan bersifat permanen dan
tidak bisa dialihkan. Setiap pemeriksaan otorisasi tentang sebuah Job menjawab pertanyaan
"apakah Perusahaan ini memiliki Job ini?"

Sebuah Job berada dalam keadaan **aktif** atau **nonaktif**. Hanya Job aktif yang muncul di
daftar publik dan hanya Job aktif yang bisa dilamar. Nonaktif adalah keadaan visibilitas,
bukan tahapan siklus hidup — lihat **Closed** di bawah.

### Job Type (Jenis Pekerjaan)

Bentuk hubungan kerja yang ditawarkan sebuah Job. Tepatnya lima nilai: Full Time, Part Time,
Contract, Internship, Freelance.

Job Type menggambarkan *sifat keterlibatan*. Ia bukan kategori pekerjaan, industri, atau
tingkat senioritas, dan bukan penanda pengaturan kerja (remote/hybrid/on-site) — itu konsep
terpisah yang tidak dimodelkan sistem ini.

### Salary (Gaji)

Kompensasi yang ditawarkan sebuah Job, dinyatakan sebagai jumlah minimum dan maksimum dalam
suatu mata uang (default Rupiah).

Sebuah Salary boleh sepenuhnya tidak ada, yang berarti kompensasinya tidak diungkapkan.
Salary yang tidak ada ditampilkan sebagai "Negotiable" dan berbeda dari Salary bernilai nol.

### Application (Lamaran)

Pernyataan minat seorang Pencari Kerja terhadap Job tertentu. Dibuat oleh Pencari Kerja,
terhadap sebuah Job, pada satu titik waktu.

Sebuah Application adalah **catatan berumur panjang**, bukan peristiwa. Ia ada sejak
dikirimkan dan tetap ada meskipun Job-nya kemudian menjadi nonaktif.

Setiap Application membawa tepat satu **Status terkini** dan **Status History** yang bersifat
append-only. Status terkini dan ujung Status History selalu sepakat; keduanya adalah dua
pandangan atas fakta yang sama, bukan dua fakta yang independen.

### Applicant (Pelamar)

Pencari Kerja yang mengirimkan sebuah Application. Berbeda dari **Candidate** — seorang
Applicant menjadi Candidate hanya dari sudut pandang Perusahaan.

### Candidate (Kandidat)

Seorang Pencari Kerja *sebagaimana dilihat oleh Perusahaan*, dalam konteks Job milik
Perusahaan tersebut. Seorang Pencari Kerja yang melamar sebuah Job menjadi Candidate pada Job
itu.

"Candidate" adalah istilah yang relatif terhadap peran, bukan entitas. Tidak ada tabel
Candidate, tidak ada identitas Candidate, dan tidak ada siklus hidup Candidate. Pencari Kerja
yang sama secara bersamaan adalah Candidate pada satu Job dan sekadar Pencari Kerja terhadap
Job milik Perusahaan lain.

### Status

Kedudukan terkini sebuah Application, dari sudut pandang Perusahaan. Tepatnya lima nilai:

| Status | Makna |
| --- | --- |
| **Applied** | Application sudah ada dan belum dipertimbangkan. Status awal, ditetapkan oleh sistem. |
| **Reviewing** | Perusahaan sedang mengevaluasi Application secara aktif. |
| **Shortlisted** | Perusahaan menilai Applicant sebagai kandidat kuat. |
| **Rejected** | Perusahaan menolak Application tersebut. |
| **Accepted** | Perusahaan telah memberikan tawaran, atau Application tersebut berakhir menguntungkan si Applicant. |

Hanya Perusahaan yang boleh mengubah Status. Status **bukan** keadaan lamaran yang dikendalikan
si Pelamar: Pencari Kerja tidak bisa menarik lamaran, dan "Withdrawn" sengaja bukan sebuah
Status.

**Setiap Status bisa dicapai dari Status mana pun.** Tidak ada urutan yang diwajibkan dan
tidak ada Status terminal. `Rejected` tidak berarti dibuang permanen — Perusahaan boleh
mengembalikan Application yang `Rejected` ke `Reviewing`, itulah sebabnya tidak ada Status
yang dianggap final. Pencari Kerja tidak boleh diperlihatkan bahasa yang menyiratkan bahwa
Rejected itu tidak bisa dibatalkan.

`Applied` istimewa hanya dalam satu hal: ia ditulis oleh sistem saat Application dibuat dan
tidak pernah bisa ditetapkan oleh Perusahaan setelahnya.

### Status History (Riwayat Status)

Catatan append-only atas setiap Status yang pernah dimiliki sebuah Application, secara
berurutan, lengkap dengan waktu perubahannya, siapa yang mengubahnya, dan catatan opsional.

Sebuah entri ditulis:

- saat Application dibuat (mencatat `Applied`), dan
- pada setiap perubahan Status berikutnya.

Entri tidak pernah diubah dan tidak pernah dihapus. Status History adalah jejak audit: jika ia
dan Status terkini sebuah Application saling bertentangan, Status History-lah yang benar dan
Status terkini yang rusak.

### Apply / Pengiriman Lamaran

Tindakan membuat sebuah Application. Seorang Pencari Kerja boleh mengirim **paling banyak
satu** Application per Job. Percobaan kedua dan seterusnya adalah duplikat dan ditolak.

Batasan ini berlaku per **Job**, bukan per perusahaan, per judul, atau per peran. Pencari
Kerja yang sudah melamar satu Job tetap bebas melamar Job lain di Perusahaan yang sama,
termasuk Job dengan judul yang identik.

---

## Istilah yang sengaja TIDAK dipakai

Istilah-istilah ini muncul dalam diskusi dan ditolak. Mencatatnya mencegahnya masuk kembali.

- **"Job Listing"** — sinonim dari Job. Pakai **Job**.
- **"Employer"** — sinonim dari Company. Pakai **Company**.
- **"Applicant"** untuk sudut pandang Perusahaan — pakai **Candidate** ketika perspektif
  Perusahaan yang jadi soal. Perbedaan ini membawa informasi.
- **"Application Status"** sebagai entitas terpisah — Status adalah atribut sebuah
  Application. Pakai **Status** dan **Status History**.
- **"Closed"** sebagai nilai Status — penutupan adalah properti sebuah Job (`nonaktif`), bukan
  properti sebuah Application. Job yang ditutup tidak mengubah Status Application yang ada
  terhadapnya.
- **"Withdrawn"** sebagai nilai Status — Pencari Kerja tidak bisa menarik Application.
- **"Verified"** sebagai kualifikasi Role atau Status — sistem ini tidak memverifikasi
  perusahaan.
