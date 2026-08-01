import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MultiplayerService } from './multiplayer.service';

/**
 * Sessizlik hatırlatması cron'u.
 *
 * Saatte bir tarar; asıl mantık (pencere, atomik claim, fake user filtresi)
 * MultiplayerService.dispatchTurnReminders içinde — Mongo erişimi orada kalsın.
 *
 * Redis kullanılmadı: "bir kez gönder" garantisi zaten session dokümanındaki
 * `turnReminderSentAt` alanının atomik claim'iyle sağlanıyor. Ayrı bir TTL
 * store eklemek durumu ikiye böler ve restart'a dayanıksız hale getirir.
 */
@Injectable()
export class MultiplayerReminderScheduler {
  private readonly logger = new Logger(MultiplayerReminderScheduler.name);
  private running = false;

  constructor(private readonly multiplayerService: MultiplayerService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async handleTurnReminders(): Promise<void> {
    // Uzun süren bir tarama bir sonrakiyle üst üste binmesin.
    if (this.running) {
      this.logger.debug('Previous reminder sweep still running, skipping');
      return;
    }
    this.running = true;
    try {
      await this.multiplayerService.dispatchTurnReminders();
    } catch (err) {
      this.logger.error(`Turn reminder sweep failed: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
