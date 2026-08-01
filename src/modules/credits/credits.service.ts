import { BadRequestException, HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { AppSettingsService } from '../app-settings/app-settings.service';
import { ErrorCodes } from '../../common/filters/error-codes';

/**
 * Sunucu fiyatlı harcama sebepleri.
 *
 * 🔴 İstemcinin gönderdiği `amount` ARTIK KULLANILMIYOR. Eskiden istemci
 * `{ amount: 1, reason: "unlock_story_x" }` gönderip 100 kredilik hikaye açabiliyordu.
 * Fiyat yalnızca burada, sunucuda belirlenir.
 *
 * Hikaye açma bu uca AİT DEĞİLDİR — `POST /api/stories/:id/unlock` kullanılır,
 * çünkü kredi düşümü ile entitlement kaydı atomik olmak zorundadır.
 */
export type SpendReason = 'custom_input' | 'custom_input_multiplayer';

const SPEND_REASONS: SpendReason[] = ['custom_input', 'custom_input_multiplayer'];

@Injectable()
export class CreditsService {
  private readonly logger = new Logger(CreditsService.name);

  constructor(
    private usersService: UsersService,
    private settingsService: AppSettingsService,
  ) {}

  async getBalance(userId: string): Promise<{ credits: number }> {
    const user = await this.usersService.findByIdOrFail(userId);
    return { credits: user.credits };
  }

  /** Sebebe karşılık gelen SUNUCU fiyatı. İstemci girdisi yok. */
  private async priceForReason(reason: SpendReason): Promise<number> {
    const settings = await this.settingsService.getSettings();
    switch (reason) {
      case 'custom_input':
      case 'custom_input_multiplayer':
        return Math.max(0, settings.customInputCreditCost ?? 10);
    }
  }

  /**
   * Kredi harca. Fiyat `reason` üzerinden SUNUCUDA belirlenir.
   *
   * @param clientAmount istemcinin gönderdiği tutar — yalnızca uyumsuzluk loglamak için;
   *        ücretlendirmede ASLA kullanılmaz.
   */
  async spendCredits(
    userId: string,
    reason: string,
    clientAmount?: number,
  ): Promise<{ credits: number; spent: number; reason: string }> {
    const normalized = (reason ?? '').trim();

    // Hikaye açma artık burada değil — istemciyi doğru uca yönlendir.
    if (normalized.startsWith('unlock_story')) {
      throw new BadRequestException({
        code: ErrorCodes.INVALID_SPEND_REASON,
        message:
          'Story unlocks must go through POST /api/stories/:id/unlock so the charge and the entitlement stay atomic.',
        reason: normalized,
      });
    }

    if (!SPEND_REASONS.includes(normalized as SpendReason)) {
      throw new BadRequestException({
        code: ErrorCodes.INVALID_SPEND_REASON,
        message: 'Unknown spend reason.',
        reason: normalized,
        allowed: SPEND_REASONS,
      });
    }

    const amount = await this.priceForReason(normalized as SpendReason);

    if (typeof clientAmount === 'number' && clientAmount !== amount) {
      this.logger.warn(
        `Client/server price mismatch for reason=${normalized}: client sent ${clientAmount}, server charged ${amount} (user=${userId})`,
      );
    }

    if (amount === 0) {
      const user = await this.usersService.findByIdOrFail(userId);
      return { credits: user.credits, spent: 0, reason: normalized };
    }

    const credits = await this.usersService.tryModifyCredits(userId, -amount);
    if (credits === null) {
      const user = await this.usersService.findByIdOrFail(userId);
      throw new HttpException(
        {
          code: ErrorCodes.INSUFFICIENT_CREDITS,
          message: 'Not enough credits.',
          required: amount,
          balance: user.credits,
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    return { credits, spent: amount, reason: normalized };
  }

  async grantCredits(userId: string, amount: number, reason: string): Promise<{ credits: number }> {
    if (amount <= 0) throw new BadRequestException('Amount must be positive');
    const credits = await this.usersService.modifyCredits(userId, amount);
    this.logger.log(`Credits granted: user=${userId} amount=+${amount} reason=${reason}`);
    return { credits };
  }
}
