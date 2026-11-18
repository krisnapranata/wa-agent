import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HospitalService, AlertPatient } from '../hospital/hospital.service';
import { MessageFormatter } from '../hospital/message-formatter';
import { NumbersService } from '../numbers/numbers.service';
import { fmtDateTime, fmtToday } from '../common/format';

/**
 * Logika balasan otomatis untuk pesan WhatsApp masuk.
 * Mengembalikan teks balasan atau null (tidak membalas).
 */
@Injectable()
export class BotService {
  private readonly logger = new Logger(BotService.name);

  constructor(
    private readonly hospital: HospitalService,
    private readonly fmt: MessageFormatter,
    private readonly numbers: NumbersService,
    private readonly config: ConfigService,
  ) {}

  private flag(key: string, def: string): boolean {
    return String(this.config.get(key, def)).toLowerCase() === 'true';
  }

  async handleMessage(text: string, phone: string | null): Promise<string | null> {
    // Keamanan data pasien: hanya nomor terdaftar & aktif di broadcast_numbers yang dilayani
    if (this.flag('BOT_ONLY_REGISTERED', 'true')) {
      const allowed = phone ? await this.numbers.isActiveNumber(phone) : false;
      if (!allowed) {
        this.logger.warn(`Pesan dari nomor tidak terdaftar (${phone ?? 'unknown'}) diabaikan`);
        return this.flag('BOT_REPLY_UNREGISTERED', 'false')
          ? 'Maaf, nomor Anda tidak terdaftar untuk menggunakan layanan bot ini.'
          : null;
      }
    }

    try {
      return await this.route(text);
    } catch (err) {
      this.logger.error(`Error memproses perintah "${text}": ${(err as Error).message}`);
      return '⚠️ Maaf, terjadi kesalahan saat mengambil data. Silakan coba lagi nanti.';
    }
  }

  /** Public for testing: route a command text to its reply */
  async route(raw: string): Promise<string | null> {
    const text = raw.trim().replace(/\s+/g, ' ');
    const lower = text.toLowerCase().replace(/[?!.]+$/, '').trim();

    if (/^(help|menu|bantuan|start|halo|hai|hi|\/start|\/help)$/.test(lower)) {
      return this.fmt.help();
    }
    if (/^status\s+resume$/.test(lower)) return this.resumeSummary();
    if (/^status\s+(kontrol|surat\s+kontrol)$/.test(lower)) return this.kontrolSummary();

    // "pasien mana", "pasien yang mana", "pasien siapa saja" -> daftar pasien yang perlu ditindaklanjuti
    if (/^pasien(\s+(yang\s+)?(mana|siapa)(\s+saja)?)?$/.test(lower)) {
      return this.pendingPatientsSummary();
    }

    const m = text.match(/^(pasien|cari|cek|info)\s+(.+)$/i);
    if (m) return this.searchAndReply(m[2].trim());

    // Pesan berisi NoRM saja
    if (/^[0-9][0-9.\-]{2,19}$/.test(lower)) return this.searchAndReply(lower);

    if (this.flag('BOT_REPLY_UNKNOWN', 'true')) {
      return 'Maaf, perintah tidak dikenali. Ketik *menu* untuk melihat daftar perintah.';
    }
    return null;
  }

  private async searchAndReply(term: string): Promise<string> {
    if (term.length < 2) return 'Kata kunci terlalu pendek. Contoh: *pasien budi* atau *pasien 000123*';
    const rows = await this.hospital.searchPatients(term, 10);
    if (!rows.length) return `❌ Pasien dengan kata kunci "${term}" tidak ditemukan.`;
    if (rows.length === 1) {
      const detail = await this.hospital.getPatientDetail(rows[0].norm);
      return detail ? this.fmt.patientInfo(detail) : `❌ Data pasien ${rows[0].norm} tidak ditemukan.`;
    }
    return this.fmt.searchResults(term, rows);
  }

  private async withDiagnosis(list: AlertPatient[]): Promise<string> {
    const lines: string[] = [];
    for (const [i, p] of list.entries()) {
      const d = await this.hospital.getPatientDetail(p.norm);
      const diag = d?.diagnosa[0]?.nama_diagnosa ?? '-';
      lines.push(
        `${i + 1}. ${p.norm} - ${p.nama_pasien}\n   Diagnosa: ${diag}\n   Pulang: ${fmtDateTime(p.tgl_pulang)}, Ruangan: ${p.ruangan || '-'}`,
      );
    }
    return lines.join('\n');
  }

  private async resumeSummary(): Promise<string> {
    const [list, total] = await Promise.all([
      this.hospital.findPatientsWithoutResume(20),
      this.hospital.countPatientsWithoutResume(),
    ]);
    if (!total) return `✅ Semua pasien pulang sudah memiliki Resume Medis.\nTanggal: ${fmtToday()}`;
    return (
      `📝 *Pasien Pulang Belum Resume Medis* (${total} pasien)\nTanggal: ${fmtToday()}\n\n` +
      (await this.withDiagnosis(list)) +
      (total > list.length ? `\n\n...dan ${total - list.length} pasien lainnya.` : '')
    );
  }

  private async kontrolSummary(): Promise<string> {
    const hours = Number(this.config.get('KONTROL_DEADLINE_HOURS', '24'));
    const [list, total] = await Promise.all([
      this.hospital.findPatientsWithoutKontrol(20),
      this.hospital.countPatientsWithoutKontrol(),
    ]);
    if (!total) return `✅ Tidak ada pasien yang terlambat dibuatkan Surat Kontrol (>${hours} jam).\nTanggal: ${fmtToday()}`;
    return (
      `📅 *Pasien Belum Surat Kontrol >${hours} jam* (${total} pasien)\nTanggal: ${fmtToday()}\n\n` +
      (await this.withDiagnosis(list)) +
      (total > list.length ? `\n\n...dan ${total - list.length} pasien lainnya.` : '')
    );
  }

  private async pendingPatientsSummary(): Promise<string> {
    const resume = await this.resumeSummary();
    const kontrol = await this.kontrolSummary();
    return `${resume}\n\n${kontrol}\n\nKetik *pasien [nama/NoRM]* untuk detail pasien.`;
  }
}
