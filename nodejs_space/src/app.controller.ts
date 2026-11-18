import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { DatabaseService } from './database/database.service';
import { HospitalService } from './hospital/hospital.service';
import { WhatsappService } from './whatsapp/whatsapp.service';

@ApiTags('Status')
@Controller()
export class AppController {
  constructor(private readonly wa: WhatsappService, private readonly db: DatabaseService, private readonly hospital: HospitalService) {}

  @Get('status')
  @ApiOperation({ summary: 'Status koneksi WhatsApp, database, dan jumlah pasien alert' })
  async status() {
    const dbOk = await this.db.ping();
    let alerts: any = null;
    let alertError: string | null = null;
    if (dbOk) {
      try {
        const [resume, kontrol] = await Promise.all([this.hospital.countPatientsWithoutResume(), this.hospital.countPatientsWithoutKontrol()]);
        alerts = { belum_resume: resume, belum_surat_kontrol: kontrol };
      } catch (e) {
        alertError = (e as Error).message;
      }
    }
    const w = this.wa.getInfo();
    return {
      whatsapp: { status: w.status, connected: w.connected, qr_available: w.qr_available, account: w.account, last_error: w.last_error, qr_page: '/qr?key=API_KEY' },
      database: { connected: dbOk },
      alerts,
      alert_error: alertError,
      server_time: new Date().toISOString(),
    };
  }
}
