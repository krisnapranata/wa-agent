import { CanActivate, ExecutionContext, Injectable, Logger, OnApplicationBootstrap, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { DatabaseService } from '../database/database.service';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/** Validasi API key (header x-api-key atau query ?key=) terhadap hash di tabel api_keys */
@Injectable()
export class ApiKeyGuard implements CanActivate, OnApplicationBootstrap {
  private readonly logger = new Logger(ApiKeyGuard.name);
  constructor(private readonly db: DatabaseService, private readonly config: ConfigService) {}

  async onApplicationBootstrap() {
    const key = this.config.get<string>('ADMIN_API_KEY');
    if (!key) return this.logger.warn('ADMIN_API_KEY belum diset — endpoint admin tidak bisa diakses');
    try {
      await this.db.ensureSchema();
      await this.db.execute('INSERT IGNORE INTO api_keys (nama, key_hash) VALUES (?, ?)', ['admin', sha256(key)]);
    } catch (e) {
      this.logger.error(`Gagal menyiapkan api_keys: ${(e as Error).message}`);
    }
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const key = (req.headers['x-api-key'] as string) || (req.query?.key as string);
    if (!key) throw new UnauthorizedException('API key diperlukan (header x-api-key atau ?key=)');
    await this.db.ensureSchema();
    const rows = await this.db.query('SELECT id FROM api_keys WHERE key_hash = ? AND aktif = 1 LIMIT 1', [sha256(key)]);
    if (!rows.length) throw new UnauthorizedException('API key tidak valid');
    return true;
  }
}
