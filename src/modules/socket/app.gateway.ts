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
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PresenceService } from '../presence/presence.service';
import { MatchmakingService } from '../matchmaking/matchmaking.service';
import { MultiplayerService } from '../multiplayer/multiplayer.service';
import { FakeMatchOrchestrator } from '../fake-users/fake-match-orchestrator.service';

@WebSocketGateway({ cors: true })
export class AppGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(AppGateway.name);

  constructor(
    private presenceService: PresenceService,
    private matchmakingService: MatchmakingService,
    @Inject(forwardRef(() => MultiplayerService)) private multiplayerService: MultiplayerService,
    @Inject(forwardRef(() => FakeMatchOrchestrator)) private fakeMatchOrchestrator: FakeMatchOrchestrator,
    private jwtService: JwtService,
    private configService: ConfigService,
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
      // Both accepted -> create multiplayer session
      const session = await this.multiplayerService.createSessionFromMatchmaking(userId, partnerId);
      const sessionId = session._id.toString();

      await this.matchmakingService.setSessionId(userId, partnerId, sessionId);

      client.emit('matchmaking:completed', { sessionId });
      this.server.to(`matchmaking:${partnerId}`).emit('matchmaking:completed', { sessionId });
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

  emitSessionUpdate(sessionId: string, session: any) {
    this.server.to(`mp:${sessionId}`).emit('multiplayer:session-update', session);
  }

  emitProgressNew(sessionId: string, progress: any) {
    this.server.to(`mp:${sessionId}`).emit('multiplayer:progress-new', progress);
  }

  emitSessionCompleted(sessionId: string, data: { endingType?: string }) {
    this.server.to(`mp:${sessionId}`).emit('multiplayer:ended', data);
  }
}
