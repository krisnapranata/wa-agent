import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';

export interface AlertPatient {
  norm: string;
  nama_pasien: string;
  tgl_pulang: Date | string | null;
  ruangan: string | null;
}

export interface PatientDetail {
  norm: string;
  nama_pasien: string;
  ruangan: string | null;
  kelas: string | null;
  tgl_masuk: Date | string | null;
  tgl_pulang: Date | string | null;
  status_pasien: string | null;
  diagnosa: { kode_icd: string | null; nama_diagnosa: string; tipe: string | null }[];
  status_resume: string;
  surat_kontrol: { ada: boolean; tanggal_kontrol: Date | string | null };
}

/**
 * Query ke tabel-tabel existing SIMRS.
 * Nama tabel bisa di-override via env (TBL_PASIEN, TBL_RESUME, TBL_KONTROL, TBL_DIAGNOSA).
 */
@Injectable()
export class HospitalService {
  private readonly logger = new Logger(HospitalService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService,
  ) {}

  private tbl(envKey: string, def: string): string {
    const name = this.config.get<string>(envKey) || def;
    if (!/^[A-Za-z0-9_]+(\.[A-Za-z0-9_]+)?$/.test(name)) {
      throw new Error(`Nama tabel tidak valid pada ${envKey}: ${name}`);
    }
    return name.split('.').map((p) => `\`${p}\``).join('.');
  }

  private get T() {
    return {
      pasien: this.tbl('TBL_PASIEN', 'pasien'),
      resume: this.tbl('TBL_RESUME', 'resume_medis'),
      kontrol: this.tbl('TBL_KONTROL', 'surat_kontrol'),
      diagnosa: this.tbl('TBL_DIAGNOSA', 'diagnosa_pasien'),
    };
  }

  private lookbackDays(): number {
    return Math.max(1, Number(this.config.get('ALERT_LOOKBACK_DAYS', '7')));
  }

  private maxList(): number {
    return Math.max(1, Number(this.config.get('ALERT_MAX_PATIENTS', '50')));
  }

  private kontrolHours(): number {
    return Math.max(1, Number(this.config.get('KONTROL_DEADLINE_HOURS', '24')));
  }

  private resumeDoneStatus(): string {
    return this.config.get<string>('RESUME_DONE_STATUS', 'selesai');
  }

  /** Only count resume/kontrol created on/after the current admission (tgl_masuk) */
  private matchVisit(): boolean {
    return String(this.config.get('MATCH_CURRENT_VISIT', 'false')).toLowerCase() === 'true';
  }

  /** Pasien sudah pulang tapi belum ada resume medis berstatus selesai */
  async findPatientsWithoutResume(limit = this.maxList()): Promise<AlertPatient[]> {
    const T = this.T;
    const visit = this.matchVisit() ? 'AND r.created_at >= p.tgl_masuk' : '';
    return this.db.query<AlertPatient>(
      `SELECT p.norm, p.nama_pasien, p.tgl_pulang, p.ruangan
         FROM ${T.pasien} p
        WHERE p.tgl_pulang IS NOT NULL
          AND p.tgl_pulang <= NOW()
          AND p.tgl_pulang >= NOW() - INTERVAL ? DAY
          AND NOT EXISTS (
            SELECT 1 FROM ${T.resume} r
             WHERE r.norm = p.norm AND r.status = ? ${visit}
          )
        ORDER BY p.tgl_pulang ASC
        LIMIT ?`,
      [this.lookbackDays(), this.resumeDoneStatus(), limit],
    );
  }

  async countPatientsWithoutResume(): Promise<number> {
    const T = this.T;
    const visit = this.matchVisit() ? 'AND r.created_at >= p.tgl_masuk' : '';
    const rows = await this.db.query<{ c: number }>(
      `SELECT COUNT(*) AS c FROM ${T.pasien} p
        WHERE p.tgl_pulang IS NOT NULL AND p.tgl_pulang <= NOW()
          AND p.tgl_pulang >= NOW() - INTERVAL ? DAY
          AND NOT EXISTS (SELECT 1 FROM ${T.resume} r WHERE r.norm = p.norm AND r.status = ? ${visit})`,
      [this.lookbackDays(), this.resumeDoneStatus()],
    );
    return Number(rows[0]?.c ?? 0);
  }

  /** Pasien pulang > 24 jam (configurable) tapi belum ada surat kontrol */
  async findPatientsWithoutKontrol(limit = this.maxList()): Promise<AlertPatient[]> {
    const T = this.T;
    const visit = this.matchVisit() ? 'AND k.created_at >= p.tgl_masuk' : '';
    return this.db.query<AlertPatient>(
      `SELECT p.norm, p.nama_pasien, p.tgl_pulang, p.ruangan
         FROM ${T.pasien} p
        WHERE p.tgl_pulang IS NOT NULL
          AND p.tgl_pulang <= NOW() - INTERVAL ? HOUR
          AND p.tgl_pulang >= NOW() - INTERVAL ? DAY
          AND NOT EXISTS (SELECT 1 FROM ${T.kontrol} k WHERE k.norm = p.norm ${visit})
        ORDER BY p.tgl_pulang ASC
        LIMIT ?`,
      [this.kontrolHours(), this.lookbackDays(), limit],
    );
  }

  async countPatientsWithoutKontrol(): Promise<number> {
    const T = this.T;
    const visit = this.matchVisit() ? 'AND k.created_at >= p.tgl_masuk' : '';
    const rows = await this.db.query<{ c: number }>(
      `SELECT COUNT(*) AS c FROM ${T.pasien} p
        WHERE p.tgl_pulang IS NOT NULL
          AND p.tgl_pulang <= NOW() - INTERVAL ? HOUR
          AND p.tgl_pulang >= NOW() - INTERVAL ? DAY
          AND NOT EXISTS (SELECT 1 FROM ${T.kontrol} k WHERE k.norm = p.norm ${visit})`,
      [this.kontrolHours(), this.lookbackDays()],
    );
    return Number(rows[0]?.c ?? 0);
  }

  /** Cari pasien berdasarkan NoRM (persis) atau nama (LIKE) */
  async searchPatients(term: string, limit = 5): Promise<{ norm: string; nama_pasien: string }[]> {
    const T = this.T;
    const q = term.trim();
    if (!q) return [];
    if (/^[0-9.\-]+$/.test(q)) {
      const exact = await this.db.query<{ norm: string; nama_pasien: string }>(
        `SELECT norm, nama_pasien FROM ${T.pasien} WHERE norm = ? LIMIT 1`,
        [q],
      );
      if (exact.length) return exact;
      return this.db.query(
        `SELECT norm, nama_pasien FROM ${T.pasien} WHERE norm LIKE ? ORDER BY norm LIMIT ?`,
        [`%${q}%`, limit],
      );
    }
    return this.db.query(
      `SELECT norm, nama_pasien FROM ${T.pasien}
        WHERE nama_pasien LIKE ?
        ORDER BY (tgl_pulang IS NULL) DESC, tgl_masuk DESC
        LIMIT ?`,
      [`%${q}%`, limit],
    );
  }

  async getPatientDetail(norm: string): Promise<PatientDetail | null> {
    const T = this.T;
    const rows = await this.db.query<any>(
      `SELECT norm, nama_pasien, ruangan, kelas, tgl_masuk, tgl_pulang, status_pasien
         FROM ${T.pasien} WHERE norm = ? LIMIT 1`,
      [norm],
    );
    if (!rows.length) return null;
    const p = rows[0];

    const [diag, resume, kontrol] = await Promise.all([
      this.db
        .query<any>(
          `SELECT kode_icd, nama_diagnosa, tipe FROM ${T.diagnosa} WHERE norm = ?
            ORDER BY (tipe = 'utama') DESC`,
          [norm],
        )
        .catch((e) => {
          this.logger.warn(`Query diagnosa gagal: ${e.message}`);
          return [];
        }),
      this.db
        .query<any>(
          `SELECT status FROM ${T.resume} WHERE norm = ?
            ORDER BY (status = ?) DESC, created_at DESC LIMIT 1`,
          [norm, this.resumeDoneStatus()],
        )
        .catch((e) => {
          this.logger.warn(`Query resume gagal: ${e.message}`);
          return [];
        }),
      this.db
        .query<any>(
          `SELECT tanggal_kontrol FROM ${T.kontrol} WHERE norm = ? ORDER BY created_at DESC LIMIT 1`,
          [norm],
        )
        .catch((e) => {
          this.logger.warn(`Query surat kontrol gagal: ${e.message}`);
          return [];
        }),
    ]);

    return {
      norm: p.norm,
      nama_pasien: p.nama_pasien,
      ruangan: p.ruangan ?? null,
      kelas: p.kelas ?? null,
      tgl_masuk: p.tgl_masuk ?? null,
      tgl_pulang: p.tgl_pulang ?? null,
      status_pasien: p.status_pasien ?? null,
      diagnosa: diag,
      status_resume: resume[0]?.status ?? 'belum',
      surat_kontrol: { ada: kontrol.length > 0, tanggal_kontrol: kontrol[0]?.tanggal_kontrol ?? null },
    };
  }
}
