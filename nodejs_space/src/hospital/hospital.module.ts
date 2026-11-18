import { Module } from '@nestjs/common';
import { HospitalService } from './hospital.service';
import { MessageFormatter } from './message-formatter';

@Module({
  providers: [HospitalService, MessageFormatter],
  exports: [HospitalService, MessageFormatter],
})
export class HospitalModule {}
