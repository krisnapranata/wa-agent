/**
 * @whiskeysockets/baileys v7 adalah paket ESM-only, sedangkan NestJS di-compile ke CommonJS.
 * `new Function` mencegah TypeScript mengubah `import()` menjadi `require()`,
 * sehingga paket ESM bisa dimuat dari kode CommonJS di semua versi Node.
 */
// eslint-disable-next-line @typescript-eslint/no-implied-eval
const dynamicImport = new Function('m', 'return import(m)') as (m: string) => Promise<any>;

let cached: any = null;

export async function loadBaileys(): Promise<any> {
  if (!cached) {
    const mod = await dynamicImport('@whiskeysockets/baileys');
    cached = { ...mod, makeWASocket: mod.makeWASocket ?? mod.default };
  }
  return cached;
}
