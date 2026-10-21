# TugasKu — Aplikasi Pengumpulan & Penilaian Tugas Madrasah v2.0

Aplikasi web modern, responsif, dan hemat kuota untuk pengumpulan tugas murid (teks dan foto/gambar) serta penilaian guru dengan **backend langsung ke GitHub REST API** tanpa perantara Cloudflare Worker ataupun server pihak ketiga.

Proyek ini dibangun merujuk secara komprehensif pada spesifikasi **[RPD (Rancangan Pengembangan Dokumen)](file:///d:/1.%20Important/APK/TugasKu/rpd.md)** dan diimplementasikan menggunakan panduan desain **[Madrasah Modern Administration](file:///d:/1.%20Important/APK/TugasKu/Stitch/stitch_sistem_pengumpulan_tugas_madrasah/madrasah_modern_administration/DESIGN.md)** yang telah disiapkan di folder `Stitch`.

---

## 🚀 Fitur Unggulan

### 1. Backend Direct GitHub REST API (Tanpa Cloudflare)
- **Komunikasi Langsung**: Browser langsung membaca dan menulis data ke repositori GitHub privat (`https://api.github.com/repos/{owner}/{repo}/contents/...`) menggunakan Personal Access Token (PAT).
- **Otomasi Inisialisasi 1-Klik**: Di menu *Pengaturan & Backup*, admin cukup memasukkan Token GitHub dan Nama Repo, lalu mengklik tombol **"Inisialisasi Database Otomatis (1-Klik)"** untuk membuat seluruh struktur berkas database JSON (`config.json`, `kelas.json`, `users.json`, `tugas.json`, `audit_log.json`).
- **Optimistic Concurrency & Conflict Auto-Retry**: Penanganan commit Git dengan SHA tracking dan auto-retry otomatis jika terjadi konflik (HTTP 409).
- **Resilient Hybrid Cache**: Tetap dapat beroperasi lancar secara offline / lokal (*Offline-Ready*), dan otomatis menyinkronkan data dengan GitHub saat terhubung.

### 2. Autentikasi & Keamanan (RPD Bagian 3.1 & 8)
- **Pintu Masuk Tunggal**: Satu halaman login bersama untuk Admin dan Murid.
- **Tanpa Kredensial Terpampang**: Akun default admin (`admin` / `123456`) tidak pernah ditampilkan di halaman login atau antarmuka.
- **Enkripsi Kredensial**: Kata sandi disimpan dalam bentuk hash kriptografi **PBKDF2 dengan SHA-256 dan salt 16-byte unik** (Web Crypto API).
- **Proteksi Brute-Force**: 5 kali gagal login berturut-turut otomatis memblokir akses selama 5 menit dengan hitung mundur waktu riil.
- **Peringatan Sandi Bawaan**: Banner pengingat di panel admin jika sandi admin masih default `123456`.

### 3. Portal Admin & Guru (RPD Bagian 3.3)
- **Master Data Rombel (Kelas)**: CRUD kelas, pencegahan penghapusan kelas yang masih memuat murid.
- **Master Data Akun Murid**: CRUD murid, pencarian nama/NISN, filter kelas, seleksi massal, mutasi rombel massal, reset sandi massal, aktif/nonaktifkan massal, dan hapus massal.
- **Export & Import Excel (XLSX/CSV)**:
  - Unduh template import standar.
  - Pratinjau validasi baris sebelum import (valid, duplikat, dan galat format).
  - Pilihan perlakuan duplikat: **Lewati** atau **Perbarui**.
  - Opsi otomatis buat kelas baru jika kelas belum terdaftar.
- **Buat & Kelola Tugas**: Judul, instruksi, target multi-rombel, jenis bukti (Teks / Gambar), tenggat waktu, nilai maksimal, batas karakter teks, duplikasi tugas, dan penguncian tugas.
- **Rekap & Penilaian Tugas**:
  - Filter interaktif per Rombel dan Instrumen Tugas.
  - Kartu bento ringkasan: Total Siswa, Terkirim, Belum, Dinilai, dan Rerata Nilai.
  - Drawer penilaian murid dari sisi kanan (*Slide-over Drawer*) dengan tampilan jawaban teks atau galeri foto dengan Lightbox zoom.
  - Navigasi cepat *Murid Sebelumnya* / *Murid Berikutnya* untuk percepatan input nilai.
  - Kontrol publikasi nilai: per murid, seleksi massal, atau seluruh kelas.
- **Backup & Restore**:
  - Unduh arsip `.json` lengkap (dengan/tanpa foto).
  - Restore dengan pratinjau data, validasi kata sandi admin, mode *Ganti Semua* atau *Gabung*, serta pembuatan cadangan pengaman snapshot otomatis sebelum restore.
- **Log Audit**: Riwayat aktivitas administratif otomatis terekam secara imutabel.

### 4. Portal Murid / Murid (RPD Bagian 3.2)
- **Dashboard Murid**: Sapaan personal dengan nama dan rombel, 4 kartu ringkasan tugas, daftar tugas aktif mendesak terurut tenggat waktu terdekat.
- **Input Tugas & Kompresi Klien**:
  - Jawaban Teks: Kolom textarea dengan penghitung karakter *real-time*.
  - Jawaban Gambar: Unggah dari galeri atau kamera HP, maks. 2MB per gambar, maks. 5 gambar per kiriman.
  - **Kompresi Otomatis Klien**: Foto dikompresi otomatis via HTML5 Canvas menjadi format WebP hemat kuota sebelum dikirim.
  - Pratinjau foto langsung dan tombol hapus per foto.
  - **Anti Data Ganda**: 1 murid hanya memiliki 1 kiriman per tugas (kiriman ulang otomatis memperbarui kiriman lama).
  - Proteksi penguncian: Tidak dapat mengubah kiriman jika tugas dikunci, melewati tenggat, atau sudah dinilai.
- **Rekap Nilai Murid**:
  - Tab *Belum Dikerjakan* dan *Sudah Dikerjakan*.
  - **Nilai & Catatan Guru hanya terlihat jika sudah resmi dipublikasikan oleh guru** (sebelumnya tampil status *"Menunggu penilaian / publikasi"*).
- **Pengaturan Murid**: Ubah kata sandi murid dan keluar akun.

---

## 📁 Struktur Berkas

```
d:/1. Important/APK/TugasKu/
├── index.html                   # Halaman tunggal utama aplikasi (SPA)
├── rpd.md                       # Dokumen spesifikasi persyaratan (RPD)
├── README.md                    # Dokumentasi lengkap sistem
├── css/
│   └── custom.css               # Desain pelengkap, scrollbar, animasi, print layout
├── js/
│   ├── config.js                # Konfigurasi sistem, profil default, limit RPD
│   ├── crypto-utils.js          # PBKDF2/SHA-256 + salt, UTF-8 base64 helper
│   ├── github-backend.js        # Klien REST API GitHub langsung (tanpa Cloudflare)
│   ├── image-compressor.js      # Kompresor WebP otomatis di sisi klien (maks 2MB)
│   ├── xlsx-helper.js           # SheetJS helper untuk import/export Excel & CSV
│   ├── audit.js                 # Perekam riwayat aktivitas administratif
│   ├── storage.js               # Database layer gabungan (GitHub Direct + LocalStorage)
│   ├── auth.js                  # Manajemen sesi, proteksi brute-force, ganti sandi
│   └── app.js                   # Kontroller UI, router SPA, modal & drawer handler
└── Stitch/                      # Folder aset desain referensi
```

---

## 🔧 Panduan Menjalankan & Menghubungkan ke GitHub

### 1. Menjalankan Aplikasi
Aplikasi berbasis HTML/CSS/JS statis murni sehingga dapat dijalankan dengan cara:
- Buka langsung berkas `index.html` di browser modern (Chrome, Edge, Firefox, Safari), atau
- Buka via server lokal, contoh:
  ```bash
  npx --yes http-server -p 3000
  ```
  Lalu akses `http://localhost:3000` di browser Anda.

### 2. Login Pertama Kali (Admin)
- **Username**: `admin`
- **Kata Sandi**: `123456`
*(Kredensial bawaan ini tidak ditampilkan di halaman login demi memenuhi standar keamanan RPD 4.3).*

### 3. Konfigurasi Repositori GitHub
1. Buat sebuah repositori baru di GitHub (disarankan tipe **Private**), misal: `tugasku-data`.
2. Buat Personal Access Token (PAT) di GitHub:
   - Masuk ke **GitHub &rarr; Settings &rarr; Developer Settings &rarr; Personal access tokens**.
   - Berikan izin akses repository: `Contents` (Read & Write).
3. Buka menu **Pengaturan & Backup** di aplikasi TugasKu.
4. Isi data:
   - **GitHub Owner**: Nama akun / organisasi GitHub Anda.
   - **Nama Repositori**: `tugasku-data`
   - **Branch**: `main`
   - **Personal Access Token**: Token `ghp_...` Anda.
5. Klik tombol **"Inisialisasi Database Otomatis (1-Klik)"**.
6. Sistem akan otomatis membuat direktori `/data/` dan berkas JSON awal secara terstruktur di repositori GitHub Anda.
