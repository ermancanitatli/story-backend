import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PresenceService } from '../presence/presence.service';
import { MatchmakingService } from '../matchmaking/matchmaking.service';
import { MultiplayerService } from '../multiplayer/multiplayer.service';
import { StoryVoteService } from '../multiplayer/story-vote.service';
import { FakeMatchOrchestrator } from '../fake-users/fake-match-orchestrator.service';
import { User } from '../users/schemas/user.schema';
import { ErrorCodes } from '../../common/filters/error-codes';

@WebSocketGateway({ cors: true })
export class AppGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(AppGateway.name);

  constructor(
    private presenceService: PresenceService,
    private matchmakingService: MatchmakingService,
    @Inject(forwardRef(() => MultiplayerService)) private multiplayerService: MultiplayerService,
    @Inject(forwardRef(() => StoryVoteService)) private storyVoteService: StoryVoteService,
    @Inject(forwardRef(() => FakeMatchOrchestrator)) private fakeMatchOrchestrator: FakeMatchOrchestrator,
    private jwtService: JwtService,
    private configService: ConfigService,
    @InjectModel(User.name) private userModel: Model<User>,
  ) {}

  // ─── Helpers ────────────────────────────────────────────────

  private getUserId(client: Socket): string | null {
    return (client as any).userId ?? null;
  }

  // ─── Connection lifecycle ───────────────────────────────────

  async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth?.token ||
        (client.handshake.query?.token as string) ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
      });
      const userId: string = payload.sub;

      // Fresh lookup: reject banned / deleted users
      const user = await this.userModel
        .findById(userId)
        .select('isBanned bannedUntil isDeleted')
        .lean();

      if (!user) {
        client.emit('auth:rejected', { code: 'USER_NOT_FOUND' });
        client.disconnect(true);
        return;
      }

      if (user.isDeleted === true) {
        client.emit('auth:rejected', { code: 'USER_DELETED' });
        client.disconnect(true);
        return;
      }

      if (user.isBanned === true) {
        client.emit('auth:rejected', {
          code: 'USER_BANNED',
          bannedUntil: user.bannedUntil ?? null,
        });
        client.disconnect(true);
        return;
      }

      // Attach userId to socket for later use
      (client as any).userId = userId;

      // Join user-specific room
      client.join(`user:${userId}`);

      // Mark online
      await this.presenceService.userConnected(userId, client.id);

      // Broadcast to all clients
      this.server.emit('user:online', { userId, lastSeen: new Date().toISOString() });

      this.logger.log(`Client connected: ${client.id} (user: ${userId})`);
    } catch {
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    const userId = this.getUserId(client);
    if (!userId) return;

    await this.presenceService.userDisconnected(userId, client.id);

    // Only broadcast offline if truly offline (no more sockets)
    if (!this.presenceService.isOnline(userId)) {
      this.server.emit('user:offline', { userId, lastSeen: new Date().toISOString() });
      // Offline kullanıcının fake match timer'larını iptal et
      this.fakeMatchOrchestrator.cancelTimer(userId);
    }

    this.logger.log(`Client disconnected: ${client.id} (user: ${userId})`);
  }

  // ─── Presence ───────────────────────────────────────────────

  @SubscribeMessage('presence:ping')
  handlePing(@ConnectedSocket() client: Socket): void {
    client.emit('presence:pong', { timestamp: new Date().toISOString() });
  }

  // ─── Matchmaking ───────────────────────────────────────────

  @SubscribeMessage('matchmaking:join')
  async handleMatchmakingJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { preference?: string; playerGender?: string; languageCode?: string },
  ) {
    const userId = this.getUserId(client);
    if (!userId) return;

    client.join(`matchmaking:${userId}`);
    const entry = await this.matchmakingService.joinQueue(userId, data);

    if (entry.status === 'matched' && entry.matchedWith) {
      const partnerId = entry.matchedWith.toString();
      client.emit('matchmaking:matched', {
        partnerId,
        partnerGender: entry.matchedGender,
      });
      this.server.to(`matchmaking:${partnerId}`).emit('matchmaking:matched', {
        partnerId: userId,
        partnerGender: entry.playerGender,
      });
    } else {
      client.emit('matchmaking:waiting', { position: 1 });
      // Gerçek eşleşme bulunamazsa fake match planla
      this.fakeMatchOrchestrator.scheduleIfNeeded(userId, entry._id.toString());
    }
  }

  @SubscribeMessage('matchmaking:accept')
  async handleMatchmakingAccept(@ConnectedSocket() client: Socket) {
    const userId = this.getUserId(client);
    if (!userId) return;

    const entry = await this.matchmakingService.acceptMatch(userId);
    if (!entry) return;

    const partnerId = entry.matchedWith?.toString();
    if (!partnerId) return;

    if (entry.status === 'completed') {
      // Both accepted -> create multiplayer session in the story-voting phase.
      // `matchmaking:completed` ARTIK BURADA GÖNDERİLMEZ — oylama bitince
      // StoryVoteService gönderir. Anlamı değişmedi: "oyun hazır, gameplay'e geç".
      const partnerEntry = await this.matchmakingService.getQueueEntry(partnerId);
      const hostLang = entry.languageCode || 'en';
      const guestLang = partnerEntry?.languageCode || 'en';

      // Bu blokta atılan HER hata iki istemciyi de "eşleşti" ekranında sonsuza
      // kadar asılı bırakırdı: burası socket yolu, yakalanacak bir HTTP yanıtı yok.
      // NO_ACCESSIBLE_STORIES bunun en sık örneği.
      try {
        const session = await this.multiplayerService.createSessionFromMatchmaking(
          userId,
          partnerId,
          hostLang,
          guestLang,
        );
        const sessionId = session._id.toString();
        await this.matchmakingService.setSessionId(userId, partnerId, sessionId);
        await this.storyVoteService.begin(session);
      } catch (err) {
        this.emitMatchmakingError(userId, partnerId, err);
      }
    } else {
      // Partner hasn't accepted yet
      this.server.to(`matchmaking:${partnerId}`).emit('matchmaking:partner-accepted', {});
    }
  }

  @SubscribeMessage('matchmaking:decline')
  async handleMatchmakingDecline(@ConnectedSocket() client: Socket) {
    const userId = this.getUserId(client);
    if (!userId) return;

    const entry = await this.matchmakingService.declineMatch(userId);
    client.emit('matchmaking:declined', {});

    // Partner'a red bildirimi gönder
    if (entry?.matchedWith) {
      const partnerId = entry.matchedWith.toString();
      this.server.to(`matchmaking:${partnerId}`).emit('matchmaking:partner-declined', {});
    }

    // Fake timer'ı iptal et
    this.fakeMatchOrchestrator.cancelTimer(userId);
  }

  @SubscribeMessage('matchmaking:cancel')
  async handleMatchmakingCancel(@ConnectedSocket() client: Socket) {
    const userId = this.getUserId(client);
    if (!userId) return;

    await this.matchmakingService.cancelQueue(userId);
    client.emit('matchmaking:cancelled', {});

    // Fake timer'ı iptal et
    this.fakeMatchOrchestrator.cancelTimer(userId);
  }

  /**
   * Eşleşme kurulamadıysa iki tarafa da açıkça bildir.
   * `NO_ACCESSIBLE_STORIES` gibi hatalar burada görünür olmalı; aksi halde
   * istemci beklemeye devam eder.
   */
  private emitMatchmakingError(userId: string, partnerId: string, err: unknown): void {
    const response = (err as any)?.getResponse?.();
    const code = response?.code ?? ErrorCodes.INTERNAL_ERROR;
    const message = response?.message ?? (err as Error)?.message ?? 'Matchmaking failed';
    this.logger.error(`Matchmaking session creation failed (${userId} <-> ${partnerId}): ${message}`);
    // İKİ tarafa da gitmeli — yalnızca hatayı tetikleyene gönderilirse diğeri asılı kalır.
    this.emitToUser(userId, 'matchmaking:error', { sessionId: null, code, message });
    this.emitToUser(partnerId, 'matchmaking:error', { sessionId: null, code, message });
  }

  // ─── Hikaye oylaması ────────────────────────────────────────

  /**
   * Oyuncunun hikaye oyu. İlk oy geçerlidir; ikinci gönderim mevcut oyu
   * `alreadyVoted: true` ile geri döndürür (idempotent).
   */
  @SubscribeMessage('matchmaking:story-vote')
  async handleStoryVote(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: string; storyId: string },
  ) {
    const userId = this.getUserId(client);
    if (!userId) return;
    if (!data?.sessionId || !data?.storyId) {
      client.emit('matchmaking:story-vote-rejected', {
        sessionId: data?.sessionId ?? null,
        reason: 'INVALID_PAYLOAD',
      });
      return;
    }

    const result = await this.storyVoteService.castVote(data.sessionId, userId, data.storyId);
    if (result.ok) {
      client.emit('matchmaking:story-vote-accepted', {
        sessionId: data.sessionId,
        storyId: result.storyId,
        alreadyVoted: result.alreadyVoted,
      });
    } else {
      client.emit('matchmaking:story-vote-rejected', {
        sessionId: data.sessionId,
        reason: result.reason,
      });
    }
  }

  /**
   * Yeniden bağlanan istemci oylama durumunu ister.
   * Sunucu duruma göre `story-vote-started`, `story-vote-result` ve/veya
   * `matchmaking:completed` gönderir.
   */
  @SubscribeMessage('matchmaking:story-vote-state')
  async handleStoryVoteState(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: string },
  ) {
    const userId = this.getUserId(client);
    if (!userId || !data?.sessionId) return;
    await this.storyVoteService.emitStateTo(data.sessionId, userId);
  }

  // ─── Multiplayer ────────────────────────────────────────────

  @SubscribeMessage('multiplayer:join')
  handleMultiplayerJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: string },
  ) {
    const userId = this.getUserId(client);
    if (!userId) return;
    client.join(`mp:${data.sessionId}`);
    this.logger.log(`User ${userId} joined multiplayer room: ${data.sessionId}`);
  }

  // ─── Emit helpers (called from services / controllers) ─────

  /**
   * Kişisel oda üzerinden tek kullanıcıya event gönder.
   *
   * `matchmaking:{userId}` yerine `user:{userId}` kullanılır: kişisel odaya
   * her bağlantıda otomatik girilir, dolayısıyla socket koptuktan sonra
   * yeniden bağlanan istemci de mesajı almaya devam eder.
   */
  emitToUser(userId: string, event: string, payload: any) {
    this.server.to(`user:${userId}`).emit(event, payload);
  }

  emitSessionUpdate(sessionId: string, session: any) {
    this.server.to(`mp:${sessionId}`).emit('multiplayer:session-update', session);
  }

  emitProgressNew(sessionId: string, progress: any) {
    this.server.to(`mp:${sessionId}`).emit('multiplayer:progress-new', progress);
  }

  emitLocalizedProgress(
    sessionId: string,
    progress: any,
    hostId: string,
    guestId: string,
    hostLang: string,
    guestLang: string,
  ) {
    const hostProgress = this.buildLocalizedProgress(progress, hostLang);
    const guestProgress = this.buildLocalizedProgress(progress, guestLang);

    this.server.to(`user:${hostId}`).emit('multiplayer:progress-new', hostProgress);
    this.server.to(`user:${guestId}`).emit('multiplayer:progress-new', guestProgress);
  }

  private buildLocalizedProgress(progress: any, lang: string): any {
    // Tek dilli progress ise olduğu gibi dön
    if (!progress.scenes) return progress;

    // Çift dilli progress → kullanıcının diline göre düzleştir
    const localized = { ...progress };
    localized.currentScene =
      progress.scenes[lang] ||
      progress.scenes[Object.keys(progress.scenes)[0]] ||
      progress.currentScene;
    localized.choices =
      progress.localizedChoices?.[lang] ||
      progress.localizedChoices?.[Object.keys(progress.localizedChoices || {})[0]] ||
      progress.choices;
    // scenes ve localizedChoices'ı kaldır — iOS'a sadece currentScene ve choices gönder
    delete localized.scenes;
    delete localized.localizedChoices;
    return localized;
  }

  emitSessionCompleted(sessionId: string, data: { endingType?: string }) {
    this.server.to(`mp:${sessionId}`).emit('multiplayer:ended', data);
  }

  // ─── Admin helpers ──────────────────────────────────────────

  /**
   * Force-disconnect all active sockets for a user and notify them
   * with an `auth:rejected` event. Used when an admin bans or deletes
   * a user while they are online.
   */
  async kickUser(
    userId: string,
    code: 'USER_BANNED' | 'USER_DELETED' = 'USER_BANNED',
    reason?: string,
  ): Promise<void> {
    const room = `user:${userId}`;
    this.server.to(room).emit('auth:rejected', { code, reason });

    try {
      const sockets = await this.server.in(room).fetchSockets();
      sockets.forEach((s) => s.disconnect(true));
    } catch (err) {
      this.logger.warn(
        `kickUser(${userId}) fetchSockets failed: ${(err as Error)?.message ?? err}`,
      );
    }
  }
}
