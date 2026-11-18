import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { HospitalModule } from '../hospital/hospital.module';
import { NumbersModule } from '../numbers/numbers.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { BroadcastController } from './broadcast.controller';
import { BroadcastService } from './broadcast.service';

@Module({
  imports: [AuthModule, HospitalModule, NumbersModule, WhatsappModule],
  providers: [BroadcastService],
  controllers: [BroadcastController],
  exports: [BroadcastService],
})
export class BroadcastModule {}
