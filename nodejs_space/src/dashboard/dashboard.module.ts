import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { HospitalModule } from '../hospital/hospital.module';
import {
  DashboardApiController,
  DashboardPageController,
} from './dashboard.controller';

@Module({
  imports: [AuthModule, HospitalModule],
  controllers: [DashboardPageController, DashboardApiController],
})
export class DashboardModule {}
