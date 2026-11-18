import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, Put, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { NumbersService } from '../numbers/numbers.service';
import { BroadcastService } from './broadcast.service';
import { CreateNumberDto, ManualBroadcastDto, UpdateNumberDto } from './dto';

@ApiTags('Broadcast')
@ApiSecurity('api-key')
@UseGuards(ApiKeyGuard)
@Controller('broadcast')
export class BroadcastController {
  constructor(private readonly broadcast: BroadcastService, private readonly numbers: NumbersService) {}

  @Post('manual')
  @HttpCode(200)
  @ApiOperation({ summary: 'Trigger broadcast manual sekarang (resume / kontrol / all)' })
  async manual(@Body() dto: ManualBroadcastDto) {
    const tipe = dto.tipe ?? 'all';
    const dry = dto.dry_run ?? false;
    const results = [];
    if (tipe === 'resume' || tipe === 'all') results.push(await this.broadcast.run('resume', dry));
    if (tipe === 'kontrol' || tipe === 'all') results.push(await this.broadcast.run('kontrol', dry));
    return { results };
  }

  @Post('check-resume')
  @HttpCode(200)
  @ApiOperation({ summary: 'Satu iterasi cek pasien pulang belum resume (dipanggil scheduled task tiap jam)' })
  checkResume() {
    return this.broadcast.run('resume');
  }

  @Post('check-kontrol')
  @HttpCode(200)
  @ApiOperation({ summary: 'Satu iterasi cek pasien belum surat kontrol >24 jam (dipanggil scheduled task tiap jam)' })
  checkKontrol() {
    return this.broadcast.run('kontrol');
  }

  @Get('logs')
  @ApiOperation({ summary: 'Riwayat broadcast terakhir' })
  logs() {
    return this.broadcast.recentLogs();
  }

  @Get('numbers')
  @ApiOperation({ summary: 'Daftar nomor WA tujuan broadcast' })
  list() {
    return this.numbers.list();
  }

  @Get('numbers/:id')
  @ApiOperation({ summary: 'Detail nomor broadcast' })
  get(@Param('id', ParseIntPipe) id: number) {
    return this.numbers.get(id);
  }

  @Post('numbers')
  @ApiOperation({ summary: 'Tambah nomor WA tujuan broadcast' })
  create(@Body() dto: CreateNumberDto) {
    return this.numbers.create(dto.nama_petugas, dto.nomor_wa, dto.aktif ?? true);
  }

  @Put('numbers/:id')
  @ApiOperation({ summary: 'Update / nonaktifkan nomor (aktif=false)' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateNumberDto) {
    return this.numbers.update(id, dto);
  }

  @Delete('numbers/:id')
  @ApiOperation({ summary: 'Hapus nomor broadcast' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.numbers.remove(id);
  }
}
