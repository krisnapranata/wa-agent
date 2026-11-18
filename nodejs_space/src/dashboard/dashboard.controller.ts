import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiExcludeEndpoint,
  ApiOperation,
  ApiQuery,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { HospitalService } from '../hospital/hospital.service';

/** Halaman HTML dashboard (publik — data di dalamnya diambil lewat API ber-API key) */
@Controller()
export class DashboardPageController {
  private html: string | null = null;

  @Get('dashboard')
  @ApiExcludeEndpoint()
  page(@Res() res: Response) {
    // Dibaca sekali lalu di-cache; file disalin ke dist/ oleh nest-cli (lihat "assets" di nest-cli.json)
    if (!this.html)
      this.html = fs.readFileSync(
        path.join(__dirname, 'dashboard.html'),
        'utf8',
      );
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Frame-Options', 'DENY');
    res.send(this.html);
  }

  @Get()
  @ApiExcludeEndpoint()
  root(@Res() res: Response) {
    res.redirect('/dashboard');
  }
}

/** Data tambahan untuk dashboard */
@ApiTags('Dashboard')
@ApiSecurity('api-key')
@UseGuards(ApiKeyGuard)
@Controller('dashboard/api')
export class DashboardApiController {
  constructor(
    private readonly hospital: HospitalService,
    private readonly config: ConfigService,
  ) {}

  @Get('alerts')
  @ApiOperation({
    summary: 'Daftar pasien belum Resume Medis & belum Surat Kontrol',
  })
  async alerts() {
    const [resumeList, resumeTotal, kontrolList, kontrolTotal] =
      await Promise.all([
        this.hospital.findPatientsWithoutResume(),
        this.hospital.countPatientsWithoutResume(),
        this.hospital.findPatientsWithoutKontrol(),
        this.hospital.countPatientsWithoutKontrol(),
      ]);
    return {
      resume: { total: resumeTotal, list: resumeList },
      kontrol: { total: kontrolTotal, list: kontrolList },
      settings: {
        lookback_days: Number(this.config.get('ALERT_LOOKBACK_DAYS', '7')),
        kontrol_deadline_hours: Number(
          this.config.get('KONTROL_DEADLINE_HOURS', '24'),
        ),
        max_patients: Number(this.config.get('ALERT_MAX_PATIENTS', '50')),
        resume_done_status: this.config.get<string>(
          'RESUME_DONE_STATUS',
          'selesai',
        ),
        timezone: this.config.get<string>('APP_TIMEZONE', 'Asia/Makassar'),
      },
    };
  }

  @Get('patients')
  @ApiOperation({ summary: 'Cari pasien berdasarkan nama atau NoRM' })
  @ApiQuery({ name: 'q', required: true })
  search(@Query('q') q = '') {
    const term = String(q).trim();
    if (term.length < 2) return [];
    return this.hospital.searchPatients(term, 25);
  }

  @Get('patients/:norm')
  @ApiOperation({
    summary: 'Detail pasien (diagnosa, status resume, surat kontrol)',
  })
  async detail(@Param('norm') norm: string) {
    const d = await this.hospital.getPatientDetail(norm);
    if (!d) throw new NotFoundException(`Pasien ${norm} tidak ditemukan`);
    return d;
  }
}
