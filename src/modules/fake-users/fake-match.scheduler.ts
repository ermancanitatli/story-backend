import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cron } from '@nestjs/schedule';
import { MatchmakingQueue } from '../matchmaking/schemas/matchmaking-queue.schema';
import { AppSettingsService } from '../app-settings/app-settings.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class FakeMatchScheduler {
  private readonly logger = new Logger(FakeMatchScheduler.name);

  constructor(
    @InjectModel(MatchmakingQueue.name) private queueModel: Model<MatchmakingQueue>,
    private settingsService: AppSettingsService,
    private usersService: UsersService,
  ) {}

  /**
   * Her 2 dakikada bir: stale fake queue entry'lerini temizle
   * (index.ts cleanupStaleFakeQueue, satır 752-784)
   */
  @Cron('*/2 * * * *')
  async cleanupStaleFakeQueue() {
    this.logger.debug('Cleanup stale fake queue running');

    try {
      const cutoff = new Date(Date.now() - 15 * 1000);

      const result = await this.queueModel.deleteMany({
        isFake: true,
        status: 'waiting',
        createdAt: { $lt: cutoff },
      });

      if (result.deletedCount > 0) {
        this.logger.log(`Cleaned up ${result.deletedCount} stale fake queue entries`);
      }
    } catch (err) {
      this.logger.warn(`cleanupStaleFakeQueue error: ${(err as Error).message}`);
    }
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
