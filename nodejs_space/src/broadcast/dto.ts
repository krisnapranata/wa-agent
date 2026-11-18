import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class ManualBroadcastDto {
  @ApiPropertyOptional({ enum: ['resume', 'kontrol', 'all'], default: 'all', description: 'Jenis broadcast' })
  @IsOptional()
  @IsIn(['resume', 'kontrol', 'all'])
  tipe?: 'resume' | 'kontrol' | 'all';

  @ApiPropertyOptional({ default: false, description: 'true = hanya preview pesan, tidak dikirim' })
  @IsOptional()
  @IsBoolean()
  dry_run?: boolean;
}

export class CreateNumberDto {
  @ApiProperty({ example: 'Ns. Rina (Melati)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nama_petugas!: string;

  @ApiProperty({ example: '6281234567890', description: 'Format 628xxx (08xxx otomatis dikonversi)' })
  @IsString()
  @IsNotEmpty()
  nomor_wa!: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  aktif?: boolean;
}

export class UpdateNumberDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) nama_petugas?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() nomor_wa?: string;
  @ApiPropertyOptional({ description: 'false = nonaktifkan nomor' }) @IsOptional() @IsBoolean() aktif?: boolean;
}

export class TestMessageDto {
  @ApiProperty({ example: 'pasien budi', description: 'Simulasikan pesan masuk ke bot' })
  @IsString()
  @IsNotEmpty()
  text!: string;
}
