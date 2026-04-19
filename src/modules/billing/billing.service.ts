import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RevenueCatEvent } from './schemas/revenuecat-event.schema';
import { UsersService } from '../users/users.service';
import { CreditsService } from '../credits/credits.service';
import { NotificationService } from '../notifications/notification.service';

const CREDIT_PRODUCTS: Record<string, number> = {
  'com.xting.credit.250': 250,
  'com.xting.credit.500': 500,
  'com.xting.credit.1250': 1250,
  'com.xting.credit.2500': 2500,
  'com.xting.credit.5000': 5000,
  'com.xting.credit.12500': 12500,
};

const SUBSCRIPTION_ACTIVE_EVENTS = ['INITIAL_PURCHASE', 'RENEWAL', 'PRODUCT_CHANGE', 'NON_RENEWING_PURCHASE', 'TRIAL_STARTED', 'TRIAL_CONVERTED'];
const SUBSCRIPTION_CANCEL_EVENTS = ['CANCELLATION', 'EXPIRATION', 'BILLING_ISSUE'];

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    @InjectModel(RevenueCatEvent.name) private eventModel: Model<RevenueCatEvent>,
    private usersService: UsersService,
    private creditsService: CreditsService,
    private notificationService: NotificationService,
  ) {}

  async processWebhook(body: any): Promise<{ success: boolean }> {
    const event = body.event || body;
    const eventId = event.id || `${event.app_user_id}_${event.type}_${Date.now()}`;

    // Idempotency check
    const existing = await this.eventModel.findOne({ eventId });
    if (existing) {
      this.logger.warn(`Duplicate event: ${eventId}`);
      return { success: true };
    }

    // Save event
    await this.eventModel.create({
      eventId,
      type: event.type,
      appUserId: event.app_user_id,
      productId: event.product_id,
      price: event.price,
      currency: event.currency,
      rawEvent: event,
    });

    const userId = event.app_user_id;
    const productId = event.product_id || '';
    const eventType = event.type || '';

    // Credit purchase
    if (CREDIT_PRODUCTS[productId]) {
      const amount = CREDIT_PRODUCTS[productId];
      await this.creditsService.grantCredits(userId, amount, `purchase:${productId}`);
      this.logger.log(`Granted ${amount} credits to ${userId} (${productId})`);
    }

    // Subscription
    if (productId.startsWith('com.xting.sub.')) {
      const plan = productId.split('.').pop() || 'unknown';
      if (SUBSCRIPTION_ACTIVE_EVENTS.includes(eventType)) {
        const expiresAt = event.expiration_at_ms ? new Date(event.expiration_at_ms) : undefined;
        await this.usersService.update(userId, {
          premium: { isPremium: true, plan, provider: 'revenuecat', expiresAt } as any,
        } as any);
        this.logger.log(`Premium activated: ${userId} (${plan})`);
        // OneSignal premium tag sync — fire-and-forget, webhook response'unu etkilemesin
        this.notificationService.updateUserTags(userId, { premium: 'true' }).catch(() => {});
      } else if (SUBSCRIPTION_CANCEL_EVENTS.includes(eventType)) {
        await this.usersService.update(userId, {
          premium: { isPremium: false } as any,
        } as any);
        this.logger.log(`Premium cancelled: ${userId}`);
        // OneSignal premium tag sync — fire-and-forget
        this.notificationService.updateUserTags(userId, { premium: 'false' }).catch(() => {});
      }
    }

    return { success: true };
  }
}
