import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { MultiplayerService } from '../multiplayer/multiplayer.service';
import { AppGateway } from '../socket/app.gateway';
import { UsersService } from '../users/users.service';

@Injectable()
export class FakeMoveService {
  private readonly logger = new Logger(FakeMoveService.name);
  private timers = new Map<string, NodeJS.Timeout>();

  constructor(
    @Inject(forwardRef(() => MultiplayerService)) private multiplayerService: MultiplayerService,
    @Inject(forwardRef(() => AppGateway)) private appGateway: AppGateway,
    private usersService: UsersService,
  ) {}

  /**
   * Fake user'ın sırası geldiğinde otomatik hamle planla.
   * 3-8 saniye random delay ile mevcut seçeneklerden rastgele birini seçer.
   */
  scheduleFakeMove(sessionId: string, fakeUserId: string): void {
    const delay = 3_000 + Math.floor(Math.random() * 5_000); // 3-8 sn
    const timerKey = `${sessionId}:${fakeUserId}`;

    // Duplicate timer koruması
    if (this.timers.has(timerKey)) return;

    const timer = setTimeout(async () => {
      this.timers.delete(timerKey);
      await this.executeMove(sessionId, fakeUserId);
    }, delay);

    this.timers.set(timerKey, timer);
    this.logger.debug(`Scheduled fake move for session ${sessionId} in ${delay}ms`);
  }

  /**
   * Fake user için otomatik hamle yap.
   */
  private async executeMove(sessionId: string, fakeUserId: string): Promise<void> {
    try {
      const session = await this.multiplayerService.getSession(sessionId);

      // Hâlâ fake user'ın sırası mı kontrol et
      if (session.phase !== 'playing') return;
      if (session.activePlayerId?.toString() !== fakeUserId) return;

      // Son progress'ten seçenekleri al
      const latestProgress = await this.multiplayerService.getLatestProgress(sessionId);
      if (!latestProgress || !latestProgress.choices || latestProgress.choices.length === 0) {
        this.logger.warn(`No choices available for fake move in session ${sessionId}`);
        return;
      }

      // Rastgele bir seçenek seç
      const choices = latestProgress.choices as any[];
      const randomChoice = choices[Math.floor(Math.random() * choices.length)];

      this.logger.log(`Fake move: session=${sessionId}, choice="${randomChoice.text}"`);

      // Hamle yap
      const progress = await this.multiplayerService.submitChoice(sessionId, fakeUserId, {
        id: randomChoice.id || randomChoice._id || String(Math.random()),
        text: randomChoice.text,
        type: randomChoice.type || 'action',
      });

      // Socket event'lerini emit et
      this.appGateway.emitProgressNew(sessionId, progress);

      if (progress.isEnding) {
        this.appGateway.emitSessionCompleted(sessionId, { endingType: progress.endingType });
      }

      // Eğer sonraki hamle de fake user'da ise tekrar planla
      const updatedSession = await this.multiplayerService.getSession(sessionId);
      if (updatedSession.phase === 'playing' && updatedSession.activePlayerId) {
        const nextUser = await this.usersService.findById(updatedSession.activePlayerId.toString());
        if (nextUser?.isFake) {
          this.scheduleFakeMove(sessionId, updatedSession.activePlayerId.toString());
        }
      }
    } catch (err) {
      this.logger.error(`Fake move failed for session ${sessionId}: ${(err as Error).message}`);
    }
  }

  cancelTimer(sessionId: string, userId: string): void {
    const timerKey = `${sessionId}:${userId}`;
    const timer = this.timers.get(timerKey);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(timerKey);
    }
  }
}
