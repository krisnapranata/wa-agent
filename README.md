# WA Bot Rawat Inap (NestJS + Baileys + MySQL)

Bot WhatsApp yang mengirim alert **Resume Medis** & **Surat Kontrol** ke petugas dan menjawab pertanyaan data pasien.

## 1. Set Environment Variables
Salin `.env.example` menjadi `.env`, lalu isi:
- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` — koneksi MySQL SIMRS (harus bisa diakses dari server bot).
- `ADMIN_API_KEY` — kunci rahasia untuk endpoint admin (header `x-api-key` atau `?key=`).
- `AUTH_STORE=mysql` (disarankan; session disimpan di tabel `wa_auth_state`) atau `file` (folder `SESSION_DIR`, default `/home/ubuntu/wa_sessions`).
- Aturan alert: `ALERT_LOOKBACK_DAYS` (default 7 hari terakhir), `KONTROL_DEADLINE_HOURS` (24), `RESUME_DONE_STATUS` (`selesai`).
- Nama tabel bisa diganti: `TBL_PASIEN`, `TBL_RESUME`, `TBL_KONTROL`, `TBL_DIAGNOSA`.

## 2. Jalankan Service
```
yarn install
yarn build
node dist/main.js
```
Tabel bot (`broadcast_numbers`, `wa_auth_state`, `api_keys`, `broadcast_log`) dibuat otomatis. SQL manual: `sql/001_bot_tables.sql`.
Dokumentasi API: `/api-docs`.

## 3. Scan QR Code
- Buka `http://SERVER:3000/qr?key=ADMIN_API_KEY` (QR juga tampil di terminal).
- WhatsApp di HP → **Perangkat Tertaut** → **Tautkan Perangkat** → scan.
- Session tersimpan, tidak perlu scan ulang setelah restart. Cek: `GET /status`.

## 4. Mengisi Tabel broadcast_numbers
Via API:
```
curl -X POST http://SERVER:3000/broadcast/numbers -H "x-api-key: KEY" -H "Content-Type: application/json" \
  -d '{"nama_petugas":"Ns. Rina","nomor_wa":"081234567890"}'
```
Atau SQL: `INSERT INTO broadcast_numbers (nama_petugas, nomor_wa, aktif) VALUES ('Ns. Rina','6281234567890',1);`
Nonaktifkan: `PUT /broadcast/numbers/:id` body `{"aktif":false}`.
**Hanya nomor aktif di tabel ini yang dilayani bot** (keamanan data pasien).

## Dashboard Web
Buka `http://SERVER:3000/dashboard` (atau `http://SERVER:3000/`), lalu masuk dengan nilai `ADMIN_API_KEY`.
- **Ringkasan**: status WhatsApp & database, jumlah pasien belum resume / belum surat kontrol, QR bila perlu scan.
- **Pasien Alert**: daftar pasien per kategori + lama sejak pulang; klik baris untuk detail (diagnosa, resume, kontrol).
- **Cari Pasien**: cari nama / NoRM.
- **Broadcast**: pratinjau pesan (tanpa kirim), kirim manual, riwayat broadcast.
- **Petugas**: tambah / ubah / aktif-nonaktifkan / hapus nomor penerima.
- **WhatsApp**: status koneksi, QR, sambungkan ulang, logout perangkat.
- **Uji Bot**: simulasi chat ke bot tanpa WhatsApp.

## Deploy dengan Docker
Semua berkas Docker ada di `nodejs_space/`. Satu image, dua peran:
- `wabot_web`: API, dashboard, dan koneksi WhatsApp.
- `wabot_scheduler`: broadcast otomatis pada jam `BROADCAST_TIMES` (mis. `08:00,14:00`) dan keepalive tiap `KEEPALIVE_MINUTES`.
- `wabot_nginx`: satu-satunya yang membuka port host (bawaan `8030`), juga tergabung ke network Nginx Proxy Manager.

Database SIMRS **tidak** ikut di compose; bot memakai MySQL SIMRS yang sudah ada (`DB_HOST`). Bila MySQL ada di host yang sama, pakai `DB_HOST=host.docker.internal`.
```
cd nodejs_space
cp deploy/env.production.contoh .env.production   # isi DB_*, ADMIN_API_KEY, BROADCAST_TIMES
# Bila nama network NPM bukan proxy_default: tulis NPM_NETWORK=<nama> di nodejs_space/.env (compose membaca .env untuk variabel ini)
docker compose up -d --build
docker compose ps                                  # wabot_web harus "healthy"
curl http://127.0.0.1:8030/healthz                 # -> ok
```
Di NPM: Proxy Host → `wabot_nginx`, port `80`. Session WhatsApp tersimpan di MySQL (`AUTH_STORE=mysql`), jadi build ulang container tidak perlu scan QR lagi.
Mesin pengembang (DB di host, port 8030): `docker compose -f docker-compose.lokal.yml up -d --build`.

## Perintah Bot
`menu`/`help`, `pasien [nama/NoRM]`, `cari [nama/NoRM]`, `[NoRM]`, `pasien yang mana?`, `status resume`, `status kontrol`.

## Endpoint
| Method | Path | Ket |
|---|---|---|
| GET | /dashboard | Dashboard web admin (login dengan API key) |
| GET | /dashboard/api/alerts, /dashboard/api/patients | Data untuk dashboard |
| GET | /healthz | Healthcheck ringan (Docker) |
| GET | /status | Status WA, DB, jumlah pasien alert (publik) |
| GET | /qr | Halaman QR (`?format=png|json`) |
| POST | /broadcast/manual | `{"tipe":"all|resume|kontrol","dry_run":false}` |
| POST | /broadcast/check-resume | 1x cek resume (untuk scheduled task) |
| POST | /broadcast/check-kontrol | 1x cek surat kontrol (untuk scheduled task) |
| GET/POST/PUT/DELETE | /broadcast/numbers | Kelola nomor tujuan |
| GET | /broadcast/logs | Riwayat broadcast |
| POST | /whatsapp/keepalive | Jaga koneksi tetap hidup |
| POST | /whatsapp/logout | Logout & scan ulang |
| POST | /bot/test | Simulasi pesan masuk |

## Asumsi Skema
- `pasien(norm, nama_pasien, tgl_masuk, tgl_pulang, ruangan, kelas, status_pasien)`
- `resume_medis(id, norm, status, created_at)` — dianggap selesai jika `status='selesai'`
- `surat_kontrol(id, norm, tanggal_kontrol, created_at)`
- `diagnosa_pasien(norm, kode_icd, nama_diagnosa, tipe)`
Broadcast dilewati bila tidak ada pasien yang perlu di-alert.
