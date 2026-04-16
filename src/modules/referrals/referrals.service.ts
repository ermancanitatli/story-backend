import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { UsersService } from '../users/users.service';
import { CreditsService } from '../credits/credits.service';
import { AppSettingsService } from '../app-settings/app-settings.service';
import { ReferralReward } from './schemas/referral-reward.schema';

@Injectable()
export class ReferralsService {
  private readonly logger = new Logger(ReferralsService.name);

  constructor(
    private usersService: UsersService,
    private creditsService: CreditsService,
    private settingsService: AppSettingsService,
    @InjectModel(ReferralReward.name) private rewardModel: Model<ReferralReward>,
  ) {}

  async applyReferral(
    userId: string,
    referralCode: string,
  ): Promise<{ success: boolean; bonusCredits: number }> {
    // 1. Fetch user + referrer + settings in parallel
    const [user, settings] = await Promise.all([
      this.usersService.findByIdOrFail(userId),
      this.settingsService.getSettings(),
    ]);

    // 2. Self-referral check
    if (!referralCode || referralCode.trim() === '') {
      throw new BadRequestException('Referral code required');
    }

    // 3. Already referred check
    if (user.referredBy) throw new BadRequestException('Already has referrer');

    // 4. Fake user check
    if (user.isFake) throw new BadRequestException('Fake users cannot apply referrals');

    // 5. Find referrer by handle
    const referrer = await this.usersService.findByHandle(referralCode);
    if (!referrer) throw new BadRequestException('Invalid referral code');
    if (referrer._id.toString() === userId) throw new BadRequestException('Cannot refer yourself');
    if (referrer.isFake) throw new BadRequestException('Cannot be referred by fake user');

    const referrerId = referrer._id.toString();
    const deviceId = user.deviceId;
    const bonusCredits = settings.referralBonusCredits || 50;
    const dailyLimit = settings.referralDailyLimit || 3;

    // 6. Duplicate reward check (same newUserId)
    const existingByUser = await this.rewardModel.findOne({
      referrerId: new Types.ObjectId(referrerId),
      newUserId: new Types.ObjectId(userId),
    });
    if (existingByUser) throw new BadRequestException('Referral already applied');

    // 7. Device-based abuse check (same deviceId)
    const existingByDevice = await this.rewardModel.findOne({
      referrerId: new Types.ObjectId(referrerId),
      deviceId,
    });
    if (existingByDevice) throw new BadRequestException('Device already used for referral');

    // 8. Daily limit check
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const todayCount = await this.rewardModel.countDocuments({
      referrerId: new Types.ObjectId(referrerId),
      createdAt: { $gte: startOfDay },
    });
    if (todayCount >= dailyLimit) {
      throw new BadRequestException('Daily referral limit reached');
    }

    // 9. Grant credits + create reward + update user (best-effort atomicity)
    await this.creditsService.grantCredits(referrerId, bonusCredits, 'referral_bonus');

    await this.rewardModel.create({
      referrerId: new Types.ObjectId(referrerId),
      newUserId: new Types.ObjectId(userId),
      deviceId,
      bonus: bonusCredits,
    });

    await this.usersService.update(userId, { referredBy: referralCode } as any);

    this.logger.log(
      `Referral applied: ${userId} → ${referrerId}, bonus: ${bonusCredits}`,
    );

    return { success: true, bonusCredits };
  }
}
