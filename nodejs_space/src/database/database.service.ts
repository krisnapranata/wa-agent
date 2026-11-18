import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as mysql from 'mysql2/promise';
import { SCHEMA_SQL } from './schema';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private pool: mysql.Pool | null = null;
  private schemaReady: Promise<void> | null = null;

  constructor(private readonly config: ConfigService) {}

  /** Lazy pool creation so env vars are loaded first */
  getPool(): mysql.Pool {
    if (!this.pool) {
      this.pool = mysql.createPool({
        host: this.config.get<string>('DB_HOST', 'localhost'),
        port: Number(this.config.get<string>('DB_PORT', '3306')),
        user: this.config.get<string>('DB_USER', 'root'),
        password: this.config.get<string>('DB_PASSWORD', ''),
        database: this.config.get<string>('DB_NAME', ''),
        waitForConnections: true,
        connectionLimit: Number(this.config.get<string>('DB_POOL_SIZE', '5')),
        dateStrings: false,
        timezone: this.config.get<string>('DB_TIMEZONE', 'local'),
        charset: 'utf8mb4',
      });
      this.logger.log(
        `MySQL pool dibuat -> ${this.config.get('DB_HOST')}:${this.config.get('DB_PORT', '3306')}/${this.config.get('DB_NAME')}`,
      );
    }
    return this.pool;
  }

  /** Create the bot's own tables (broadcast_numbers, wa_auth_state, ...) if missing */
  ensureSchema(): Promise<void> {
    if (!this.schemaReady) {
      this.schemaReady = (async () => {
        for (const stmt of SCHEMA_SQL) {
          await this.getPool().query(stmt);
        }
        this.logger.log('Tabel internal bot siap (broadcast_numbers, wa_auth_state, api_keys, broadcast_log)');
      })().catch((err) => {
        this.schemaReady = null;
        throw err;
      });
    }
    return this.schemaReady;
  }

  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const [rows] = await this.getPool().query(sql, params);
    return rows as T[];
  }

  async execute(sql: string, params: any[] = []): Promise<mysql.ResultSetHeader> {
    const [res] = await this.getPool().query(sql, params);
    return res as mysql.ResultSetHeader;
  }

  async ping(): Promise<boolean> {
    try {
      await this.getPool().query('SELECT 1');
      return true;
    } catch (err) {
      this.logger.error(`Ping MySQL gagal: ${(err as Error).message}`);
      return false;
    }
  }

  async onModuleDestroy() {
    if (this.pool) await this.pool.end().catch(() => undefined);
  }
}
