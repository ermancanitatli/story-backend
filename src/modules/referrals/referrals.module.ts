import { Module } from '@nestjs/common';
import { ReferralsController } from './referrals.controller';
import { ReferralsService } from './referrals.service';
import { UsersModule } from '../users/users.module';
import { CreditsModule } from '../credits/credits.module';
import { AppSettingsModule } from '../app-settings/app-settings.module';

@Module({
  imports: [UsersModule, CreditsModule, AppSettingsModule],
  controllers: [ReferralsController],
  providers: [ReferralsService],
})
export class ReferralsModule {}
