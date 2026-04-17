import {
  Injectable,
  Logger,
  Inject,
  forwardRef,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { MatchmakingQueue } from '../matchmaking/schemas/matchmaking-queue.schema';
import { MatchmakingService } from '../matchmaking/matchmaking.service';
import { FakeUsersService } from './fake-users.service';
import { AppSettingsService } from '../app-settings/app-settings.service';
import { AppGateway } from '../socket/app.gateway';
import { MultiplayerService } from '../multiplayer/multiplayer.service';

@Injectable()
export class FakeMatchOrchestrator implements OnModuleDestroy {
  private readonly logger = new Logger(FakeMatchOrchestrator.name);
  private timers = new Map<string, NodeJS.Timeout>();

  constructor(
    @InjectModel(MatchmakingQueue.name)
    private queueModel: Model<MatchmakingQueue>,
    private matchmakingService: MatchmakingService,
    private fakeUsersService: FakeUsersService,
    private settingsService: AppSettingsService,
    @Inject(forwardRef(() => AppGateway)) private appGateway: AppGateway,
    @Inject(forwardRef(() => MultiplayerService))
    private multiplayerService: MultiplayerService,
  ) {}

  onModuleDestroy() {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }

  // Kullanıcı kuyruga katıldığında çağrılır (gateway'den)
  async scheduleIfNeeded(userId: string, entryId: string): Promise<void> {
    // settings.fakeMatch kapalıysa return
    const settings = await this.settingsService.getSettings();
    if (!settings.fakeMatch) return;

    // Zaten timer varsa return
    if (this.timers.has(userId)) return;

    // 10 saniye gerçek kullanıcı arama penceresi
    const REAL_SEARCH_WINDOW_MS = 10_000;

    const timer = setTimeout(async () => {
      this.timers.delete(userId);

      try {
        // Kullanıcı hâlâ waiting mi kontrol et
        const entry = await this.queueModel.findById(entryId);
        if (!entry || entry.status !== 'waiting') return;

        // 0-5 sn random delay ile fake atama (gerçekçi görünsün)
        const fakeAppearDelay = Math.floor(Math.random() * 5_000);

        const delayTimer = setTimeout(async () => {
          await this.assignFakeMatch(userId, entryId);
        }, fakeAppearDelay);

        // Delay timer'ını da takip et
        this.timers.set(`${userId}:delay`, delayTimer);
      } catch (err) {
        this.logger.error(
          `scheduleIfNeeded error for ${userId}: ${(err as Error).message}`,
        );
      }
    }, REAL_SEARCH_WINDOW_MS);

    this.timers.set(userId, timer);
    this.logger.debug(
      `Scheduled fake match for ${userId} in ${REAL_SEARCH_WINDOW_MS}ms`,
    );
  }

  cancelTimer(userId: string): void {
    // Ana timer'ı iptal et
    const timer = this.timers.get(userId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(userId);
    }
    // Delay timer'ını da iptal et
    const delayTimer = this.timers.get(`${userId}:delay`);
    if (delayTimer) {
      clearTimeout(delayTimer);
      this.timers.delete(`${userId}:delay`);
    }
    // Accept timer'ını da iptal et
    const acceptTimer = this.timers.get(`${userId}:accept`);
    if (acceptTimer) {
      clearTimeout(acceptTimer);
      this.timers.delete(`${userId}:accept`);
    }
  }

  private async assignFakeMatch(
    userId: string,
    entryId: string,
  ): Promise<void> {
    try {
      // Race protection: tekrar kontrol et
      const entry = await this.queueModel.findById(entryId);
      if (!entry || entry.status !== 'waiting') return;

      // Uyumlu fake user bul
      const fakeResult = await this.fakeUsersService.pickCompatibleFakeUser({
        preference: entry.preference,
        playerGender: entry.playerGender,
        languageCode: entry.languageCode,
        excludeUserId: userId,
      });

      if (!fakeResult) {
        this.logger.debug(`No compatible fake user found for ${userId}`);
        return;
      }

      const fakeUserId = fakeResult.userId;

      // Fake user için queue entry oluştur
      await this.queueModel.create({
        userId: new Types.ObjectId(fakeUserId),
        status: 'matched',
        matchedWith: new Types.ObjectId(userId),
        matchedGender: entry.playerGender,
        isFake: true,
        preference: entry.preference,
        playerGender: fakeResult.gender,
        languageCode: entry.languageCode,
      });

      // Gerçek kullanıcının entry'sini güncelle
      await this.queueModel.findByIdAndUpdate(entryId, {
        status: 'matched',
        matchedWith: new Types.ObjectId(fakeUserId),
        matchedGender: fakeResult.gender,
      });

      // Gerçek kullanıcıya socket ile bildirim gönder
      this.appGateway.server
        .to(`matchmaking:${userId}`)
        .emit('matchmaking:matched', {
          partnerId: fakeUserId,
          partnerGender: fakeResult.gender,
        });

      this.logger.log(`Fake matched: ${userId} <-> ${fakeUserId}`);

      // Fake accept/decline simülasyonu başlat
      this.simulateFakeAcceptance(userId, fakeUserId, entryId);
    } catch (err) {
      this.logger.error(
        `assignFakeMatch error for ${userId}: ${(err as Error).message}`,
      );
    }
  }

  private simulateFakeAcceptance(
    realUserId: string,
    fakeUserId: string,
    realEntryId: string,
  ): void {
    // 2-5 sn random delay
    const acceptDelay = 2_000 + Math.floor(Math.random() * 3_000);
    // %90 kabul, %10 red
    const willAccept = Math.random() < 0.9;

    const timer = setTimeout(async () => {
      this.timers.delete(`${realUserId}:accept`);

      try {
        if (willAccept) {
          // Fake kabul et
          const entry = await this.matchmakingService.acceptMatch(fakeUserId);
          if (!entry) return;

          const partnerId = entry.matchedWith?.toString();
          if (!partnerId) return;

          if (entry.status === 'completed') {
            // İkisi de kabul etti -> session oluştur
            const session =
              await this.multiplayerService.createSessionFromMatchmaking(
                realUserId,
                fakeUserId,
              );
            const sessionId = session._id.toString();

            await this.matchmakingService.setSessionId(
              realUserId,
              fakeUserId,
              sessionId,
            );

            this.appGateway.server
              .to(`matchmaking:${realUserId}`)
              .emit('matchmaking:completed', { sessionId });

            this.logger.log(
              `Fake acceptance completed: ${realUserId} <-> ${fakeUserId}, session: ${sessionId}`,
            );
          } else {
            // Gerçek kullanıcı henüz kabul etmedi, sadece partner-accepted bildir
            this.appGateway.server
              .to(`matchmaking:${realUserId}`)
              .emit('matchmaking:partner-accepted', {});

            this.logger.debug(
              `Fake accepted, waiting for real user: ${realUserId}`,
            );
          }
        } else {
          // Fake reddetti
          await this.matchmakingService.declineMatch(fakeUserId);

          // Gerçek kullanıcıya partner-declined bildir
          this.appGateway.server
            .to(`matchmaking:${realUserId}`)
            .emit('matchmaking:partner-declined', {});

          this.logger.log(`Fake declined: ${realUserId} <-> ${fakeUserId}`);

          // Gerçek kullanıcı tekrar aramaya dönecek, yeni fake timer başlat
          // Entry ID'yi yeniden oku (waiting'e geri alınmış olmalı)
          const updatedEntry = await this.queueModel.findOne({
            userId: new Types.ObjectId(realUserId),
            status: 'waiting',
          });
          if (updatedEntry) {
            await this.scheduleIfNeeded(
              realUserId,
              updatedEntry._id.toString(),
            );
          }
        }
      } catch (err) {
        this.logger.error(
          `simulateFakeAcceptance error: ${(err as Error).message}`,
        );
      }
    }, acceptDelay);

    this.timers.set(`${realUserId}:accept`, timer);
    this.logger.debug(
      `Scheduled fake ${willAccept ? 'accept' : 'decline'} for ${realUserId} in ${acceptDelay}ms`,
    );
  }
}
