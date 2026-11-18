/**
 * Penjadwal broadcast (proses terpisah, BUKAN bagian dari aplikasi NestJS).
 * Dijalankan sebagai peran `scheduler` di container (lihat docker/entrypoint.sh) atau manual:
 *   node dist/scheduler.js
 *
 * Memanggil endpoint service web lewat HTTP, sehingga hanya ada satu koneksi WhatsApp (di service web).
 *   SCHEDULER_TARGET          URL service web (default http://127.0.0.1:3000)
 *   ADMIN_API_KEY             API key untuk endpoint admin
 *   BROADCAST_TIMES           jam broadcast resume & kontrol, dipisah koma, mis. "08:00,14:00" (kosong = nonaktif)
 *   KEEPALIVE_MINUTES         interval POST /whatsapp/keepalive (default 15, 0 = nonaktif)
 *   APP_TIMEZONE              zona waktu jam di atas (default Asia/Makassar)
 */
const target = (
  process.env.SCHEDULER_TARGET || 'http://127.0.0.1:3000'
).replace(/\/+$/, '');
const apiKey = process.env.ADMIN_API_KEY || '';
const tz = process.env.APP_TIMEZONE || 'Asia/Makassar';
const keepaliveMin = Number(process.env.KEEPALIVE_MINUTES ?? '15');
const times = String(process.env.BROADCAST_TIMES ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
  .map((s) => {
    const m = s.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
    if (!m)
      throw new Error(`BROADCAST_TIMES tidak valid: "${s}" (format HH:MM)`);
    return `${m[1].padStart(2, '0')}:${m[2]}`;
  });

const log = (msg: string) =>
  console.log(`${new Date().toISOString()} [Scheduler] ${msg}`);

function nowHHMM(): { key: string; hhmm: string } {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
      .formatToParts(new Date())
      .map((x) => [x.type, x.value]),
  );
  const hh = p.hour === '24' ? '00' : p.hour;
  const hhmm = `${hh}:${p.minute}`;
  return { key: `${p.year}-${p.month}-${p.day} ${hhmm}`, hhmm };
}

async function call(path: string): Promise<void> {
  try {
    const res = await fetch(target + path, {
      method: 'POST',
      headers: { 'x-api-key': apiKey },
      signal: AbortSignal.timeout(180_000),
    });
    const body = await res.text();
    log(`POST ${path} -> ${res.status} ${body.slice(0, 300)}`);
  } catch (e) {
    log(`POST ${path} gagal: ${(e as Error).message}`);
  }
}

let lastRun = '';
let running = false;
async function tick() {
  const { key, hhmm } = nowHHMM();
  if (running || key === lastRun || !times.includes(hhmm)) return;
  lastRun = key;
  running = true;
  try {
    await call('/broadcast/check-resume');
    await call('/broadcast/check-kontrol');
  } finally {
    running = false;
  }
}

if (!apiKey) {
  console.error('[Scheduler] ADMIN_API_KEY belum diset — scheduler berhenti');
  process.exit(1);
}
log(
  `Target ${target}, zona ${tz}, broadcast: ${times.length ? times.join(', ') : 'nonaktif'}, keepalive: ${keepaliveMin > 0 ? keepaliveMin + ' menit' : 'nonaktif'}`,
);
setInterval(() => void tick(), 20_000);
if (keepaliveMin > 0)
  setInterval(() => void call('/whatsapp/keepalive'), keepaliveMin * 60_000);
for (const sig of ['SIGTERM', 'SIGINT'] as const)
  process.on(sig, () => process.exit(0));
