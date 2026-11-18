import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { DatabaseModule } from './database/database.module';
import { HospitalModule } from './hospital/hospital.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { BroadcastModule } from './broadcast/broadcast.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule, HospitalModule, WhatsappModule, BroadcastModule],
  controllers: [AppController],
})
export class AppModule {}
