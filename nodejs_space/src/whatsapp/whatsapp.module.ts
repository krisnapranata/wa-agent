import { Module } from '@nestjs/common';
import { BotModule } from '../bot/bot.module';
import { WhatsappService } from './whatsapp.service';
import { WhatsappController } from './whatsapp.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [BotModule, AuthModule],
  providers: [WhatsappService],
  controllers: [WhatsappController],
  exports: [WhatsappService],
})
export class WhatsappModule {}
