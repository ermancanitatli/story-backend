import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Cron } from '@nestjs/schedule';
import { MatchmakingService } from '../matchmaking/matchmaking.service';
import { AppGateway } from '../socket/app.gateway';
import { MatchmakingQueue } from '../matchmaking/schemas/matchmaking-queue.schema';
import { AppSettingsService } from '../app-settings/app-settings.service';
import { UsersService } from '../users/users.service';
import { FakeUsersService } from './fake-users.service';

@Injectable()
export class FakeMatchScheduler {
  private readonly logger = new Logger(FakeMatchScheduler.name);

  constructor(
    @InjectModel(MatchmakingQueue.name) private queueModel: Model<MatchmakingQueue>,
    private matchmakingService: MatchmakingService,
    private appGateway: AppGateway,
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

    try {
      const cutoff = new Date(Date.now() - threshold * 1000);

      // Threshold'dan eski bekleyen gerçek kullanıcıları bul
      const waitingEntries = await this.queueModel.find({
        status: 'waiting',
        isFake: { $ne: true },
        createdAt: { $lt: cutoff },
      });

      if (waitingEntries.length === 0) return;

      this.logger.debug(`Found ${waitingEntries.length} waiting entries older than ${threshold}s`);

      for (const entry of waitingEntries) {
        try {
          const realUserId = entry.userId.toString();

          // Uyumlu fake user bul
          const fakeResult = await this.fakeUsersService.pickCompatibleFakeUser({
            preference: entry.preference,
            playerGender: entry.playerGender,
            languageCode: entry.languageCode,
            excludeUserId: realUserId,
          });

          if (!fakeResult) {
            this.logger.debug(`No compatible fake user found for ${realUserId}`);
            continue;
          }

          const fakeUserId = fakeResult.userId;

          // Fake user için queue entry oluştur
          await this.queueModel.create({
            userId: new Types.ObjectId(fakeUserId),
            status: 'matched',
            matchedWith: new Types.ObjectId(realUserId),
            matchedGender: entry.playerGender,
            isFake: true,
            preference: entry.preference,
            playerGender: fakeResult.gender,
            languageCode: entry.languageCode,
          });

          // Gerçek kullanıcının entry'sini güncelle
          await this.queueModel.findByIdAndUpdate(entry._id, {
            status: 'matched',
            matchedWith: new Types.ObjectId(fakeUserId),
            matchedGender: fakeResult.gender,
          });

          // Gerçek kullanıcıya socket ile bildirim gönder
          this.appGateway.server
            .to(`matchmaking:${realUserId}`)
            .emit('matchmaking:matched', {
              partnerId: fakeUserId,
              partnerGender: fakeResult.gender,
            });

          this.logger.log(`Fake matched: ${realUserId} <-> ${fakeUserId}`);
        } catch (err) {
          this.logger.warn(
            `Fake match failed for ${entry.userId}: ${(err as Error).message}`,
          );
        }
      }
    } catch (err) {
      this.logger.error(`scheduledFakeMatchSweep error: ${(err as Error).message}`);
    }
  }

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
