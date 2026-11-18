import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import * as QRCode from 'qrcode';
import * as qrcodeTerminal from 'qrcode-terminal';
import pino from 'pino';
import { DatabaseService } from '../database/database.service';
import { BotService } from '../bot/bot.service';
import { sleep } from '../common/format';
import { loadBaileys } from './baileys-loader';
import { useMysqlAuthState } from './mysql-auth-state';

export type WaStatus = 'disabled' | 'idle' | 'connecting' | 'qr' | 'connected' | 'logged_out' | 'error';

@Injectable()
export class WhatsappService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly waLogger = pino({ level: process.env.BAILEYS_LOG_LEVEL || 'silent' });

  private sock: any = null;
  private status: WaStatus = 'idle';
  private qr: string | null = null;
  private qrUpdatedAt: Date | null = null;
  private connectedAt: Date | null = null;
  private lastError: string | null = null;
  private connecting: Promise<void> | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private stopped = false;
  private clearAuth: (() => Promise<void>) | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly db: DatabaseService,
    private readonly bot: BotService,
  ) {}

  private enabled(): boolean {
    return String(this.config.get('WA_ENABLED', 'true')).toLowerCase() !== 'false';
  }

  onApplicationBootstrap() {
    if (!this.enabled()) {
      this.status = 'disabled';
      this.logger.warn('WA_ENABLED=false — koneksi WhatsApp tidak dijalankan');
      return;
    }
    // Non-blocking: HTTP server tetap bisa start walau WA/DB bermasalah
    this.start().catch((e) => this.logger.error(`Gagal memulai WhatsApp: ${e.message}`));
  }

  async onModuleDestroy() {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    try {
      this.sock?.end?.(undefined);
    } catch {
      /* ignore */
    }
  }

  /** Mulai koneksi jika belum berjalan (idempotent) */
  start(): Promise<void> {
    if (!this.enabled()) return Promise.resolve();
    if (this.status === 'connected' || this.status === 'qr') return Promise.resolve();
    if (!this.connecting) {
      this.stopped = false;
      this.connecting = this.connect().finally(() => (this.connecting = null));
    }
    return this.connecting;
  }

  private async getAuth(baileys: any) {
    const store = String(this.config.get('AUTH_STORE', 'mysql')).toLowerCase();
    const sessionId = this.config.get<string>('WA_SESSION_ID', 'default');
    if (store === 'file') {
      const dir = path.resolve(this.config.get<string>('SESSION_DIR', '/home/ubuntu/wa_sessions'), sessionId);
      fs.mkdirSync(dir, { recursive: true });
      const { state, saveCreds } = await baileys.useMultiFileAuthState(dir);
      this.logger.log(`Session disimpan di folder: ${dir}`);
      return {
        state,
        saveCreds,
        clear: async () => fs.rmSync(dir, { recursive: true, force: true }),
      };
    }
    await this.db.ensureSchema();
    this.logger.log(`Session disimpan di MySQL (tabel wa_auth_state, session "${sessionId}")`);
    return useMysqlAuthState(this.db, baileys, sessionId);
  }

  private async connect(): Promise<void> {
    this.status = 'connecting';
    this.lastError = null;
    try {
      const b = await loadBaileys();
      const { state, saveCreds, clear } = await this.getAuth(b);
      this.clearAuth = clear;

      let version: number[] | undefined;
      try {
        const latest = await b.fetchLatestBaileysVersion();
        version = latest.version;
      } catch {
        version = undefined;
      }

      const sock = b.makeWASocket({
        version,
        auth: { creds: state.creds, keys: b.makeCacheableSignalKeyStore(state.keys, this.waLogger) },
        logger: this.waLogger,
        browser: b.Browsers.ubuntu('Chrome'),
        markOnlineOnConnect: false,
        syncFullHistory: false,
        shouldIgnoreJid: (jid: string) => b.isJidBroadcast(jid) || b.isJidNewsletter?.(jid),
        getMessage: async () => undefined,
      });
      this.sock = sock;

      sock.ev.on('creds.update', saveCreds);
      sock.ev.on('connection.update', (u: any) => this.onConnectionUpdate(u, b));
      sock.ev.on('messages.upsert', (m: any) => this.onMessages(m, b));
    } catch (err) {
      this.status = 'error';
      this.lastError = (err as Error).message;
      this.logger.error(`Koneksi WhatsApp gagal: ${this.lastError}`);
      this.scheduleReconnect();
    }
  }

  private async onConnectionUpdate(update: any, b: any) {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      this.qr = qr;
      this.qrUpdatedAt = new Date();
      this.status = 'qr';
      this.logger.log('QR code baru tersedia — scan via terminal atau buka GET /qr');
      qrcodeTerminal.generate(qr, { small: true });
    }
    if (connection === 'open') {
      this.status = 'connected';
      this.qr = null;
      this.connectedAt = new Date();
      this.reconnectAttempts = 0;
      this.logger.log(`✅ WhatsApp tersambung sebagai ${this.sock?.user?.id} (${this.sock?.user?.name ?? '-'})`);
    }
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      const reason = b.DisconnectReason[code] ?? lastDisconnect?.error?.message ?? 'unknown';
      this.lastError = `Terputus: ${reason} (${code ?? '-'})`;
      this.sock = null;
      this.connectedAt = null;
      if (this.stopped) return;
      if (code === b.DisconnectReason.loggedOut) {
        this.logger.warn('Perangkat logout dari WhatsApp — session dihapus, QR baru akan dibuat');
        this.status = 'logged_out';
        this.qr = null;
        await this.clearAuth?.().catch((e) => this.logger.error(`Gagal hapus session: ${e.message}`));
        this.scheduleReconnect(2000);
      } else {
        this.logger.warn(`Koneksi WhatsApp terputus (${reason}) — mencoba reconnect...`);
        this.status = 'connecting';
        this.scheduleReconnect(code === b.DisconnectReason.restartRequired ? 500 : undefined);
      }
    }
  }

  private scheduleReconnect(delayMs?: number) {
    if (this.stopped) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectAttempts++;
    const delay = delayMs ?? Math.min(60000, 2000 * 2 ** Math.min(this.reconnectAttempts - 1, 5));
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.status = 'idle';
      this.start().catch((e) => this.logger.error(`Reconnect gagal: ${e.message}`));
    }, delay);
  }

  private extractText(msg: any): string {
    const m = msg.message || {};
    const inner = m.ephemeralMessage?.message || m.viewOnceMessage?.message || m;
    return (
      inner.conversation ||
      inner.extendedTextMessage?.text ||
      inner.imageMessage?.caption ||
      inner.videoMessage?.caption ||
      ''
    ).trim();
  }

  /** Ambil nomor telepon pengirim (628xxx). Baileys v7 bisa memakai LID, jadi cek juga remoteJidAlt. */
  private extractPhone(msg: any): string | null {
    const candidates = [msg.key?.remoteJid, msg.key?.remoteJidAlt, msg.key?.participant, msg.key?.participantAlt];
    for (const jid of candidates) {
      if (typeof jid === 'string' && jid.endsWith('@s.whatsapp.net')) return jid.split('@')[0].split(':')[0];
    }
    return null;
  }

  private async onMessages(upsert: any, b: any) {
    if (upsert.type !== 'notify') return;
    for (const msg of upsert.messages || []) {
      try {
        if (!msg.message || msg.key?.fromMe) continue;
        const jid: string = msg.key.remoteJid;
        if (!jid || b.isJidGroup(jid) || b.isJidStatusBroadcast?.(jid)) continue;
        const text = this.extractText(msg);
        if (!text) continue;
        const phone = this.extractPhone(msg);
        this.logger.log(`📩 Pesan masuk dari ${phone ?? jid}: "${text.slice(0, 80)}"`);
        const reply = await this.bot.handleMessage(text, phone);
        if (reply && this.sock) {
          await this.sock.sendMessage(jid, { text: reply }, { quoted: msg });
          await this.sock.readMessages?.([msg.key]).catch(() => undefined);
        }
      } catch (err) {
        this.logger.error(`Gagal memproses pesan masuk: ${(err as Error).message}`);
      }
    }
  }

  /** Tunggu sampai tersambung (berguna saat cold start container) */
  async waitUntilConnected(timeoutMs = 25000): Promise<boolean> {
    if (this.isConnected()) return true;
    this.start().catch(() => undefined);
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
      if (this.isConnected()) return true;
      if (this.getInfo().status === 'qr' || this.getInfo().status === 'disabled') return false;
      await sleep(500);
    }
    return this.isConnected();
  }

  isConnected(): boolean {
    return this.status === 'connected' && !!this.sock;
  }

  /** Kirim pesan teks ke nomor 628xxx */
  async sendText(phone: string, text: string): Promise<void> {
    if (!this.isConnected()) throw new Error('WhatsApp belum tersambung');
    const jid = `${phone}@s.whatsapp.net`;
    if (String(this.config.get('WA_CHECK_NUMBER', 'true')).toLowerCase() !== 'false') {
      const res = await this.sock.onWhatsApp(phone).catch(() => null);
      if (Array.isArray(res) && res.length && res[0]?.exists === false) {
        throw new Error(`Nomor ${phone} tidak terdaftar di WhatsApp`);
      }
    }
    await this.sock.sendMessage(jid, { text });
  }

  async getQrDataUrl(): Promise<string | null> {
    if (!this.qr) return null;
    return QRCode.toDataURL(this.qr, { margin: 2, width: 320 });
  }

  async getQrPng(): Promise<Buffer | null> {
    if (!this.qr) return null;
    return QRCode.toBuffer(this.qr, { margin: 2, width: 320 });
  }

  getQrRaw(): string | null {
    return this.qr;
  }

  getInfo() {
    return {
      enabled: this.enabled(),
      status: this.status,
      connected: this.isConnected(),
      qr_available: !!this.qr,
      qr_updated_at: this.qrUpdatedAt,
      connected_at: this.connectedAt,
      account: this.sock?.user
        ? { id: this.sock.user.id, name: this.sock.user.name ?? null }
        : null,
      last_error: this.lastError,
      auth_store: String(this.config.get('AUTH_STORE', 'mysql')).toLowerCase(),
    };
  }

  /** Logout perangkat & hapus session, lalu buat QR baru */
  async logout(): Promise<void> {
    try {
      if (this.sock) await this.sock.logout();
    } catch (e) {
      this.logger.warn(`Logout error: ${(e as Error).message}`);
    }
    await this.clearAuth?.().catch(() => undefined);
    this.sock = null;
    this.qr = null;
    this.status = 'idle';
    this.scheduleReconnect(1500);
  }
}
