import { ConflictException, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { normalizePhone } from '../common/format';

export interface BroadcastNumber {
  id: number;
  nama_petugas: string;
  nomor_wa: string;
  aktif: boolean;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class NumbersService {
  constructor(private readonly db: DatabaseService) {}

  private map(r: any): BroadcastNumber {
    return { ...r, aktif: Number(r.aktif) === 1 };
  }

  async list(onlyActive = false): Promise<BroadcastNumber[]> {
    await this.db.ensureSchema();
    const rows = await this.db.query(
      `SELECT id, nama_petugas, nomor_wa, aktif, created_at, updated_at FROM broadcast_numbers
       ${onlyActive ? 'WHERE aktif = 1' : ''} ORDER BY id`,
    );
    return rows.map((r) => this.map(r));
  }

  async get(id: number): Promise<BroadcastNumber> {
    await this.db.ensureSchema();
    const rows = await this.db.query(
      'SELECT id, nama_petugas, nomor_wa, aktif, created_at, updated_at FROM broadcast_numbers WHERE id = ?',
      [id],
    );
    if (!rows.length) throw new NotFoundException(`Nomor dengan id ${id} tidak ditemukan`);
    return this.map(rows[0]);
  }

  async create(nama_petugas: string, nomor_wa: string, aktif = true): Promise<BroadcastNumber> {
    await this.db.ensureSchema();
    const nomor = normalizePhone(nomor_wa);
    if (!nomor) throw new BadRequestException('Format nomor WA tidak valid (contoh: 6281234567890)');
    try {
      const res = await this.db.execute(
        'INSERT INTO broadcast_numbers (nama_petugas, nomor_wa, aktif) VALUES (?, ?, ?)',
        [nama_petugas.trim(), nomor, aktif ? 1 : 0],
      );
      return this.get(res.insertId);
    } catch (e: any) {
      if (e?.code === 'ER_DUP_ENTRY') throw new ConflictException(`Nomor ${nomor} sudah terdaftar`);
      throw e;
    }
  }

  async update(
    id: number,
    data: { nama_petugas?: string; nomor_wa?: string; aktif?: boolean },
  ): Promise<BroadcastNumber> {
    await this.get(id);
    const sets: string[] = [];
    const params: any[] = [];
    if (data.nama_petugas !== undefined) {
      sets.push('nama_petugas = ?');
      params.push(data.nama_petugas.trim());
    }
    if (data.nomor_wa !== undefined) {
      const nomor = normalizePhone(data.nomor_wa);
      if (!nomor) throw new BadRequestException('Format nomor WA tidak valid (contoh: 6281234567890)');
      sets.push('nomor_wa = ?');
      params.push(nomor);
    }
    if (data.aktif !== undefined) {
      sets.push('aktif = ?');
      params.push(data.aktif ? 1 : 0);
    }
    if (sets.length) {
      try {
        await this.db.execute(`UPDATE broadcast_numbers SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
      } catch (e: any) {
        if (e?.code === 'ER_DUP_ENTRY') throw new ConflictException('Nomor tersebut sudah terdaftar');
        throw e;
      }
    }
    return this.get(id);
  }

  async remove(id: number): Promise<{ deleted: true; id: number }> {
    await this.get(id);
    await this.db.execute('DELETE FROM broadcast_numbers WHERE id = ?', [id]);
    return { deleted: true, id };
  }

  async isActiveNumber(phone: string): Promise<boolean> {
    const nomor = normalizePhone(phone);
    if (!nomor) return false;
    await this.db.ensureSchema();
    const rows = await this.db.query('SELECT 1 FROM broadcast_numbers WHERE nomor_wa = ? AND aktif = 1 LIMIT 1', [
      nomor,
    ]);
    return rows.length > 0;
  }
}
