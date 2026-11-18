import { Body, Controller, Get, HttpCode, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { BotService } from '../bot/bot.service';
import { TestMessageDto } from '../broadcast/dto';
import { WhatsappService } from './whatsapp.service';

@ApiTags('WhatsApp')
@ApiSecurity('api-key')
@UseGuards(ApiKeyGuard)
@Controller()
export class WhatsappController {
  constructor(private readonly wa: WhatsappService, private readonly bot: BotService) {}

  @Get('qr')
  @ApiOperation({ summary: 'Halaman QR code untuk scan WhatsApp (buka di browser: /qr?key=API_KEY)' })
  @ApiQuery({ name: 'format', required: false, enum: ['html', 'png', 'json'] })
  async qr(@Query('format') format: string = 'html', @Res() res: Response) {
    this.wa.start().catch(() => undefined);
    const info = this.wa.getInfo();
    if (format === 'json') {
      return res.json({ ...info, qr: this.wa.getQrRaw(), qr_image: await this.wa.getQrDataUrl() });
    }
    if (format === 'png') {
      const png = await this.wa.getQrPng();
      if (!png) return res.status(404).json({ message: 'QR tidak tersedia', status: info.status });
      res.setHeader('Content-Type', 'image/png');
      return res.send(png);
    }
    const img = await this.wa.getQrDataUrl();
    const body = info.connected
      ? `<div class="ok">✅ WhatsApp sudah tersambung<br><small>${info.account?.id ?? ''} ${info.account?.name ?? ''}</small></div>`
      : img
        ? `<img src="${img}" alt="QR"/><p>Buka WhatsApp → Perangkat Tertaut → Tautkan Perangkat, lalu scan QR ini.<br>QR diperbarui otomatis.</p>`
        : `<p>⏳ Menyiapkan QR code... (status: ${info.status})</p>${info.last_error ? `<small>${info.last_error}</small>` : ''}`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.send(`<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="${info.connected ? 30 : 5}"><title>Scan QR - WA Bot Rawat Inap</title>
<style>body{font-family:system-ui,sans-serif;background:#f4f6f8;color:#1f2933;display:flex;justify-content:center;padding:40px}
.card{background:#fff;border-radius:12px;padding:32px;box-shadow:0 2px 12px rgba(0,0,0,.08);text-align:center;max-width:420px}
img{width:300px;height:300px}.ok{font-size:20px;color:#0b7a3e}small{color:#52606d}</style></head>
<body><div class="card"><h2>🏥 WA Bot Rawat Inap</h2>${body}</div></body></html>`);
  }

  @Post('whatsapp/keepalive')
  @HttpCode(200)
  @ApiOperation({ summary: 'Jaga service & koneksi WA tetap aktif (dipanggil scheduled task tiap 15 menit)' })
  async keepalive() {
    await this.wa.waitUntilConnected(15000);
    return this.wa.getInfo();
  }

  @Post('whatsapp/logout')
  @HttpCode(200)
  @ApiOperation({ summary: 'Logout perangkat WhatsApp & hapus session (QR baru akan dibuat)' })
  async logout() {
    await this.wa.logout();
    return { message: 'Logout berhasil. Buka /qr untuk scan ulang.' };
  }

  @Post('bot/test')
  @HttpCode(200)
  @ApiOperation({ summary: 'Simulasi pesan masuk ke bot (tanpa WhatsApp) — untuk uji balasan' })
  async test(@Body() dto: TestMessageDto) {
    return { reply: await this.bot.route(dto.text) };
  }
}
