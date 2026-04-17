import { Injectable, Logger, Inject, forwardRef, OnModuleDestroy } from '@nestjs/common';
import { MultiplayerService } from '../multiplayer/multiplayer.service';
import { AppGateway } from '../socket/app.gateway';
import { UsersService } from '../users/users.service';

@Injectable()
export class FakeMoveService implements OnModuleDestroy {
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
  scheduleFakeMove(sessionId: string, fakeUserId: string, chainDepth: number = 0): void {
    const MAX_CHAIN = 50;
    if (chainDepth >= MAX_CHAIN) {
      this.logger.warn(`Max fake move chain reached for session ${sessionId}`);
      return;
    }

    const delay = 3_000 + Math.floor(Math.random() * 5_000); // 3-8 sn
    const timerKey = `${sessionId}:${fakeUserId}`;

    // Duplicate timer koruması
    if (this.timers.has(timerKey)) return;

    const timer = setTimeout(async () => {
      this.timers.delete(timerKey);
      await this.executeMove(sessionId, fakeUserId, chainDepth);
    }, delay);

    this.timers.set(timerKey, timer);
    this.logger.debug(`Scheduled fake move for session ${sessionId} in ${delay}ms`);
  }

  /**
   * Fake user için otomatik hamle yap.
   */
  private async executeMove(sessionId: string, fakeUserId: string, chainDepth: number = 0): Promise<void> {
    try {
      const session = await this.multiplayerService.getSession(sessionId);

      // Her iki oyuncu da fake ise döngüye girmeyi engelle
      const [hostUser, guestUser] = await Promise.all([
        this.usersService.findById(session.hostId.toString()),
        this.usersService.findById(session.guestId.toString()),
      ]);
      if (hostUser?.isFake && guestUser?.isFake) {
        this.logger.error(`Both players are fake in session ${sessionId}, aborting fake moves`);
        return;
      }

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
      const choices = (latestProgress.choices || []) as any[];
      if (choices.length === 0) {
        this.logger.warn(`No choices available for fake move in session ${sessionId}`);
        return;
      }
      const randomChoice = choices[Math.floor(Math.random() * choices.length)];
      const choiceId = randomChoice.id || randomChoice._id?.toString();
      const choiceText = randomChoice.text;
      if (!choiceId || !choiceText) {
        this.logger.warn(`Invalid choice structure in session ${sessionId}`);
        return;
      }

      this.logger.log(`Fake move: session=${sessionId}, choice="${choiceText}"`);

      // Hamle yap
      const progress = await this.multiplayerService.submitChoice(sessionId, fakeUserId, {
        id: choiceId,
        text: choiceText,
        type: randomChoice.type || 'action',
      });

      // Socket event'lerini emit et (dil bazlı lokalize)
      // session değişkeni executeMove başında zaten fetch edildi
      this.appGateway.emitLocalizedProgress(
        sessionId,
        progress,
        session.hostId.toString(),
        session.guestId.toString(),
        session.hostLanguageCode || 'en',
        session.guestLanguageCode || 'en',
      );

      if (progress.isEnding) {
        this.appGateway.emitSessionCompleted(sessionId, { endingType: progress.endingType });
      }

      // Eğer sonraki hamle de fake user'da ise tekrar planla
      const updatedSession = await this.multiplayerService.getSession(sessionId);
      if (updatedSession.phase === 'playing' && updatedSession.activePlayerId) {
        const nextUser = await this.usersService.findById(updatedSession.activePlayerId.toString());
        if (nextUser?.isFake) {
          this.scheduleFakeMove(sessionId, updatedSession.activePlayerId.toString(), chainDepth + 1);
        }
      }
    } catch (err) {
      this.logger.error(`Fake move failed for session ${sessionId}: ${(err as Error).message}`);
    }
  }

  onModuleDestroy() {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
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
