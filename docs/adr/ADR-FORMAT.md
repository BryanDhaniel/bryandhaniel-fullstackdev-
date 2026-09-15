# Format ADR

Satu berkas per keputusan, di `docs/adr/`, dinamai `NNNN-judul-dalam-kebab-case.md`.

```markdown
# NNNN — <Judul>

- **Status:** Proposed | Accepted | Superseded by NNNN
- **Date:** YYYY-MM-DD

## Konteks

Situasi apa yang memaksa adanya keputusan? Constraint apa yang sedang berlaku? Bersikap
konkretlah: sebutkan persyaratannya, desain yang sudah ada, atau insiden yang membuat ini
mendesak. Anggap pembacanya tidak memiliki konteks apa pun dari Anda.

## Keputusan

Apa yang akan kami lakukan, dinyatakan dalam kalimat aktif: "Kami akan...". Satu paragraf
biasanya cukup. Jika perlu berupa daftar, kemungkinan itu sebenarnya dua keputusan.

## Alternatif yang dipertimbangkan

- **<Alternatif>** — kenapa ditolak. "Lebih sederhana" bukan alasan; sebutkan apa biayanya.
- **<Alternatif>** — kenapa ditolak.

## Konsekuensi

Apa yang menjadi kenyataan sebagai akibatnya. Sertakan bagian yang buruk. ADR yang tidak
mencantumkan sisi negatifnya adalah ADR yang belum dipikirkan matang — setiap keputusan nyata
memiliki biaya.

## Yang akan mengubah pikiran kami

Bukti atau kondisi konkret yang seharusnya membuka kembali keputusan ini. Tanpa bagian ini,
ADR terbaca seolah permanen, yang mengundang orang untuk mematuhinya secara buta atau
mengabaikannya sama sekali.
```

## Kapan menulis satu ADR

Ketiganya harus terpenuhi:

1. **Sulit dibalik** — mengubah arah nanti memakan usaha nyata.
2. **Mengejutkan tanpa konteks** — pembaca di masa depan akan bertanya "kenapa ini bisa
   begini?"
3. **Hasil dari trade-off nyata** — ada alternatif sungguhan dan salah satunya dipilih
   dengan alasan yang dinyatakan.

Jika salah satu tidak terpenuhi, lewati. ADR adalah catatan atas keputusan yang tanpanya
seseorang akan membatalkannya secara tidak sengaja, bukan log atas semua yang pernah dibuat.
