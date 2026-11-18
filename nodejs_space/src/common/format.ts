const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const BULAN_PANJANG = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];
const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

function tz(): string {
  return process.env.APP_TIMEZONE || 'Asia/Makassar';
}

function parts(d: Date) {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz(),
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false,
  });
  const o: Record<string, string> = {};
  for (const p of f.formatToParts(d)) o[p.type] = p.value;
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(o.weekday);
  return {
    y: o.year, m: Number(o.month) - 1, d: o.day.padStart(2, '0'),
    hh: o.hour === '24' ? '00' : o.hour, mm: o.minute, wd,
  };
}

function toDate(v: unknown): Date | null {
  if (v === null || v === undefined || v === '') return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return isNaN(d.getTime()) ? null : d;
}

/** 17 Nov 2026 14:30 */
export function fmtDateTime(v: unknown): string {
  const d = toDate(v);
  if (!d) return '-';
  const p = parts(d);
  return `${p.d} ${BULAN[p.m]} ${p.y} ${p.hh}:${p.mm}`;
}

/** Rabu, 18 November 2026 */
export function fmtToday(): string {
  const p = parts(new Date());
  return `${HARI[p.wd]}, ${p.d} ${BULAN_PANJANG[p.m]} ${p.y}`;
}

/** Normalize a phone number to 628xxxxxxxx format. Returns null if invalid. */
export function normalizePhone(input: string): string | null {
  let n = String(input || '').replace(/[^0-9]/g, '');
  if (n.startsWith('0')) n = '62' + n.slice(1);
  else if (n.startsWith('8')) n = '62' + n;
  if (!/^[1-9][0-9]{7,15}$/.test(n)) return null;
  return n;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
