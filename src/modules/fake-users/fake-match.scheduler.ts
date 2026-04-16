import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MatchmakingService } from '../matchmaking/matchmaking.service';
import { AppSettingsService } from '../app-settings/app-settings.service';
import { UsersService } from '../users/users.service';
import { FakeUsersService } from './fake-users.service';

@Injectable()
export class FakeMatchScheduler {
  private readonly logger = new Logger(FakeMatchScheduler.name);

  constructor(
    private matchmakingService: MatchmakingService,
    private settingsService: AppSettingsService,
    private usersService: UsersService,
    private fakeUsersService: FakeUsersService,
  ) {}

  /**
   * Her 1 dakikada bir: bekleyen kullanıcılara fake match planla
   * (index.ts scheduledFakeMatchSweep, satır 653-748)
   */
  @Cron('*/1 * * * *')
  async scheduledFakeMatchSweep() {
    const settings = await this.settingsService.getSettings();
    if (!settings.fakeMatch) return;

    const threshold = Math.min(settings.fakeMatchTimeSeconds || 10, 30);
    this.logger.debug(`Fake match sweep running (threshold: ${threshold}s)`);

    // TODO: Bekleyen kullanıcıları bul ve fake match yap
    // Bu implementasyon matchmakingService'e bağımlı — queue'daki
    // 'waiting' status'undaki kullanıcıları threshold'dan eski olanları bulup
    // fakeUsersService.pickCompatibleFakeUser() ile eşleştir
  }

  /**
   * Her 2 dakikada bir: stale fake queue entry'lerini temizle
   * (index.ts cleanupStaleFakeQueue, satır 752-784)
   */
  @Cron('*/2 * * * *')
  async cleanupStaleFakeQueue() {
    this.logger.debug('Cleanup stale fake queue running');
    // TODO: 15 saniyeden eski waiting fake user queue entry'lerini sil
  }

  /**
   * Her 2 dakikada bir: fake user'ları online tut
   * (index.ts keepFakePresenceOnline, satır 3709-3765)
   */
  @Cron('*/2 * * * *')
  async keepFakePresenceOnline() {
    try {
      const fakeUsers = await this.usersService.searchFakeUsers(300);
      if (fakeUsers.length === 0) return;

      await Promise.allSettled(
        fakeUsers.map((u) =>
          this.usersService.updatePresence(u._id.toString(), true),
        ),
      );

      this.logger.debug(`Kept ${fakeUsers.length} fake users online`);
    } catch (err) {
      this.logger.warn(`keepFakePresenceOnline error: ${(err as Error).message}`);
    }
  }
}
