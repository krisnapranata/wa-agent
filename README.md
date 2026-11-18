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

## Perintah Bot
`menu`/`help`, `pasien [nama/NoRM]`, `cari [nama/NoRM]`, `[NoRM]`, `pasien yang mana?`, `status resume`, `status kontrol`.

## Endpoint
| Method | Path | Ket |
|---|---|---|
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
