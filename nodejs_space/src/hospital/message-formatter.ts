import { Injectable } from '@nestjs/common';
import { fmtDateTime, fmtToday } from '../common/format';
import { AlertPatient, PatientDetail } from './hospital.service';

@Injectable()
export class MessageFormatter {
  private list(patients: AlertPatient[]): string {
    return patients
      .map(
        (p, i) =>
          `${i + 1}. ${p.norm} - ${p.nama_pasien} (Pulang: ${fmtDateTime(p.tgl_pulang)}, Ruangan: ${p.ruangan || '-'})`,
      )
      .join('\n');
  }

  private more(total: number, shown: number): string {
    return total > shown ? `\n...dan ${total - shown} pasien lainnya.\n` : '';
  }

  resumeAlert(patients: AlertPatient[], total = patients.length): string {
    return (
      `🏥 *ALERT RESUME MEDIS*\nTanggal: ${fmtToday()}\n\n` +
      `Pasien berikut sudah pulang namun BELUM ada Resume Medis:\n` +
      `${this.list(patients)}\n${this.more(total, patients.length)}\n` +
      `Mohon segera lengkapi. Terima kasih 🙏`
    );
  }

  kontrolAlert(patients: AlertPatient[], total = patients.length, hours = 24): string {
    return (
      `🏥 *ALERT SURAT KONTROL*\nTanggal: ${fmtToday()}\n\n` +
      `Pasien berikut belum dibuatkan Surat Kontrol (>${hours} jam):\n` +
      `${this.list(patients)}\n${this.more(total, patients.length)}\n` +
      `Mohon segera buatkan. Terima kasih 🙏`
    );
  }

  patientInfo(p: PatientDetail): string {
    const diag = p.diagnosa.length
      ? p.diagnosa
          .map((d) => `${d.nama_diagnosa}${d.kode_icd ? ` (${d.kode_icd})` : ''}${d.tipe ? ` - ${d.tipe}` : ''}`)
          .join('\n          ')
      : '-';
    const kontrol = p.surat_kontrol.ada
      ? `Ada${p.surat_kontrol.tanggal_kontrol ? ` (kontrol: ${fmtDateTime(p.surat_kontrol.tanggal_kontrol).slice(0, 11)})` : ''}`
      : 'Belum';
    return (
      `📋 *Informasi Pasien*\n\n` +
      `NoRM   : ${p.norm}\n` +
      `Nama   : ${p.nama_pasien}\n` +
      `Ruangan: ${p.ruangan || '-'}${p.kelas ? ` (Kelas ${p.kelas})` : ''}\n` +
      `Tgl Masuk: ${fmtDateTime(p.tgl_masuk)}\n` +
      `Tgl Pulang: ${p.tgl_pulang ? fmtDateTime(p.tgl_pulang) : 'Masih dirawat'}\n` +
      `Diagnosa: ${diag}\n` +
      `Status Resume: ${p.status_resume}\n` +
      `Surat Kontrol: ${kontrol}`
    );
  }

  searchResults(term: string, rows: { norm: string; nama_pasien: string }[]): string {
    return (
      `🔎 Ditemukan ${rows.length} pasien untuk "${term}":\n\n` +
      rows.map((r, i) => `${i + 1}. ${r.norm} - ${r.nama_pasien}`).join('\n') +
      `\n\nKetik NoRM untuk melihat detail, contoh: *${rows[0].norm}*`
    );
  }

  help(): string {
    return (
      `🤖 *Menu Bot Rawat Inap*\n\n` +
      `• *pasien [nama/NoRM]* — cari info pasien\n` +
      `• *cari [nama/NoRM]* — cari info pasien\n` +
      `• *[NoRM]* — langsung kirim NoRM, contoh: 000123\n` +
      `• *status resume* — daftar pasien pulang belum resume medis\n` +
      `• *status kontrol* — daftar pasien belum surat kontrol\n` +
      `• *help* / *menu* — tampilkan menu ini`
    );
  }
}
