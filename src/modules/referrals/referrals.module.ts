import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ReferralsController } from './referrals.controller';
import { ReferralsService } from './referrals.service';
import { ReferralReward, ReferralRewardSchema } from './schemas/referral-reward.schema';
import { UsersModule } from '../users/users.module';
import { CreditsModule } from '../credits/credits.module';
import { AppSettingsModule } from '../app-settings/app-settings.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: ReferralReward.name, schema: ReferralRewardSchema }]),
    UsersModule,
    CreditsModule,
    AppSettingsModule,
  ],
  controllers: [ReferralsController],
  providers: [ReferralsService],
})
export class ReferralsModule {}
