import { CanActivate, ExecutionContext, Injectable, Logger, OnApplicationBootstrap, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'crypto';
import { DatabaseService } from '../database/database.service';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/** Validasi API key (header x-api-key atau query ?key=) terhadap hash di tabel api_keys */
@Injectable()
export class ApiKeyGuard implements CanActivate, OnApplicationBootstrap {
  private readonly logger = new Logger(ApiKeyGuard.name);
  constructor(private readonly db: DatabaseService, private readonly config: ConfigService) {}

  private seeded = false;

  async onApplicationBootstrap() {
    if (!this.config.get<string>('ADMIN_API_KEY')) {
      return this.logger.warn('ADMIN_API_KEY belum diset — endpoint admin tidak bisa diakses');
    }
    await this.seedAdminKey();
  }

  /** Simpan hash ADMIN_API_KEY ke api_keys. Diulang saat request berikutnya bila DB belum siap saat start. */
  private async seedAdminKey() {
    const key = this.config.get<string>('ADMIN_API_KEY');
    if (!key || this.seeded) return;
    try {
      await this.db.ensureSchema();
      await this.db.execute('INSERT IGNORE INTO api_keys (nama, key_hash) VALUES (?, ?)', ['admin', sha256(key)]);
      this.seeded = true;
    } catch (e) {
      this.logger.error(`Gagal menyiapkan api_keys (dicoba lagi saat request berikutnya): ${(e as Error).message}`);
    }
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const key = (req.headers['x-api-key'] as string) || (req.query?.key as string);
    if (!key) throw new UnauthorizedException('API key diperlukan (header x-api-key atau ?key=)');
    // ADMIN_API_KEY dari env selalu berlaku, walau DB sempat tidak terjangkau saat start
    const admin = this.config.get<string>('ADMIN_API_KEY');
    if (admin && timingSafeEqual(Buffer.from(sha256(key)), Buffer.from(sha256(admin)))) {
      void this.seedAdminKey();
      return true;
    }
    await this.db.ensureSchema();
    const rows = await this.db.query('SELECT id FROM api_keys WHERE key_hash = ? AND aktif = 1 LIMIT 1', [sha256(key)]);
    if (!rows.length) throw new UnauthorizedException('API key tidak valid');
    return true;
  }
}
