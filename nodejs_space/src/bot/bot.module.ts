import { Module } from '@nestjs/common';
import { HospitalModule } from '../hospital/hospital.module';
import { NumbersModule } from '../numbers/numbers.module';
import { BotService } from './bot.service';

@Module({
  imports: [HospitalModule, NumbersModule],
  providers: [BotService],
  exports: [BotService],
})
export class BotModule {}
