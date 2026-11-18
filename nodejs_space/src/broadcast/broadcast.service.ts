import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import { HospitalService } from '../hospital/hospital.service';
import { MessageFormatter } from '../hospital/message-formatter';
import { NumbersService } from '../numbers/numbers.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { sleep } from '../common/format';

export type BroadcastType = 'resume' | 'kontrol';

export interface BroadcastResult {
  tipe: BroadcastType;
  jumlah_pasien: number;
  skipped: boolean;
  reason?: string;
  terkirim: number;
  gagal: number;
  detail: { nomor_wa: string; nama_petugas: string; ok: boolean; error?: string }[];
  dry_run: boolean;
  preview?: string;
}

@Injectable()
export class BroadcastService {
  private readonly logger = new Logger(BroadcastService.name);

  constructor(
    private readonly hospital: HospitalService,
    private readonly fmt: MessageFormatter,
    private readonly numbers: NumbersService,
    private readonly wa: WhatsappService,
    private readonly db: DatabaseService,
    private readonly config: ConfigService,
  ) {}

  async run(tipe: BroadcastType, dryRun = false): Promise<BroadcastResult> {
    const hours = Number(this.config.get('KONTROL_DEADLINE_HOURS', '24'));
    const [patients, total] =
      tipe === 'resume'
        ? await Promise.all([this.hospital.findPatientsWithoutResume(), this.hospital.countPatientsWithoutResume()])
        : await Promise.all([this.hospital.findPatientsWithoutKontrol(), this.hospital.countPatientsWithoutKontrol()]);

    const base: BroadcastResult = { tipe, jumlah_pasien: total, skipped: false, terkirim: 0, gagal: 0, detail: [], dry_run: dryRun };
    if (!total) {
      this.logger.log(`[${tipe}] Tidak ada pasien yang perlu di-alert — broadcast dilewati`);
      return { ...base, skipped: true, reason: 'Tidak ada pasien yang perlu di-alert' };
    }
    const text = tipe === 'resume' ? this.fmt.resumeAlert(patients, total) : this.fmt.kontrolAlert(patients, total, hours);
    const targets = await this.numbers.list(true);
    if (!targets.length) {
      this.logger.warn(`[${tipe}] Tidak ada nomor aktif di broadcast_numbers`);
      return { ...base, skipped: true, reason: 'Tidak ada nomor aktif di broadcast_numbers', preview: text };
    }
    if (dryRun) return { ...base, preview: text, detail: targets.map((t) => ({ nomor_wa: t.nomor_wa, nama_petugas: t.nama_petugas, ok: false, error: 'dry_run' })) };

    if (!(await this.wa.waitUntilConnected())) {
      const reason = `WhatsApp belum tersambung (status: ${this.wa.getInfo().status}). Scan QR di /qr terlebih dahulu.`;
      this.logger.error(`[${tipe}] ${reason}`);
      await this.log(tipe, total, 0, targets.length, reason);
      return { ...base, skipped: true, reason, gagal: targets.length, preview: text };
    }

    const delay = Number(this.config.get('BROADCAST_DELAY_MS', '1500'));
    for (const t of targets) {
      try {
        await this.wa.sendText(t.nomor_wa, text);
        base.terkirim++;
        base.detail.push({ nomor_wa: t.nomor_wa, nama_petugas: t.nama_petugas, ok: true });
      } catch (e) {
        base.gagal++;
        base.detail.push({ nomor_wa: t.nomor_wa, nama_petugas: t.nama_petugas, ok: false, error: (e as Error).message });
        this.logger.error(`[${tipe}] Gagal kirim ke ${t.nomor_wa}: ${(e as Error).message}`);
      }
      await sleep(delay);
    }
    this.logger.log(`[${tipe}] Broadcast selesai: ${total} pasien, terkirim ${base.terkirim}, gagal ${base.gagal}`);
    await this.log(tipe, total, base.terkirim, base.gagal, null);
    return base;
  }

  private async log(tipe: string, pasien: number, ok: number, fail: number, ket: string | null) {
    await this.db
      .execute('INSERT INTO broadcast_log (tipe, jumlah_pasien, jumlah_terkirim, jumlah_gagal, keterangan) VALUES (?,?,?,?,?)', [tipe, pasien, ok, fail, ket?.slice(0, 500) ?? null])
      .catch((e) => this.logger.warn(`Gagal tulis broadcast_log: ${e.message}`));
  }

  async recentLogs(limit = 20) {
    await this.db.ensureSchema();
    return this.db.query('SELECT * FROM broadcast_log ORDER BY id DESC LIMIT ?', [limit]);
  }
}
