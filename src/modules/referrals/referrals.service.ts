import { Injectable, BadRequestException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { CreditsService } from '../credits/credits.service';
import { AppSettingsService } from '../app-settings/app-settings.service';

@Injectable()
export class ReferralsService {
  constructor(
    private usersService: UsersService,
    private creditsService: CreditsService,
    private settingsService: AppSettingsService,
  ) {}

  async applyReferral(userId: string, referralCode: string): Promise<{ success: boolean; bonusCredits: number }> {
    const user = await this.usersService.findByIdOrFail(userId);
    if (user.referredBy) throw new BadRequestException('Already has referrer');
    if (user.isFake) throw new BadRequestException('Fake users cannot apply referrals');

    // Find referrer by handle
    const referrer = await this.usersService.findByHandle(referralCode);
    if (!referrer) throw new BadRequestException('Invalid referral code');
    if (referrer._id.toString() === userId) throw new BadRequestException('Cannot refer yourself');

    const settings = await this.settingsService.getSettings();
    const bonusCredits = settings.referralBonusCredits || 50;

    // Grant credits to referrer
    await this.creditsService.grantCredits(referrer._id.toString(), bonusCredits, 'referral_bonus');

    // Mark user as referred
    await this.usersService.update(userId, { referredBy: referralCode } as any);

    return { success: true, bonusCredits };
  }
}
