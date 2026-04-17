import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { MatchmakingService } from './matchmaking.service';
import { MultiplayerService } from '../multiplayer/multiplayer.service';

@WebSocketGateway({ namespace: '/matchmaking', cors: true })
export class MatchmakingGateway {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(MatchmakingGateway.name);

  constructor(
    private matchmakingService: MatchmakingService,
    private multiplayerService: MultiplayerService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  private getUserId(client: Socket): string | null {
    try {
      const token = client.handshake.auth?.token || (client.handshake.query?.token as string) || client.handshake.headers?.authorization?.replace('Bearer ', '');
      if (!token) return null;
      const payload = this.jwtService.verify(token, { secret: this.configService.get('JWT_ACCESS_SECRET') });
      return payload.sub;
    } catch {
      return null;
    }
  }

  @SubscribeMessage('matchmaking:join')
  async handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { preference?: string; playerGender?: string; languageCode?: string },
  ) {
    const userId = this.getUserId(client);
    if (!userId) return;

    client.join(`matchmaking:${userId}`);
    const entry = await this.matchmakingService.joinQueue(userId, data);

    if (entry.status === 'matched' && entry.matchedWith) {
      // Eşleşme bulundu
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
    }
  }

  @SubscribeMessage('matchmaking:accept')
  async handleAccept(@ConnectedSocket() client: Socket) {
    const userId = this.getUserId(client);
    if (!userId) return;

    const entry = await this.matchmakingService.acceptMatch(userId);
    if (!entry) return;

    const partnerId = entry.matchedWith?.toString();
    if (!partnerId) return;

    if (entry.status === 'completed') {
      // İkisi de kabul etti → gerçek multiplayer session oluştur
      const session = await this.multiplayerService.createSessionFromMatchmaking(userId, partnerId);
      const sessionId = session._id.toString();

      // Queue entry'lerine sessionId kaydet
      await this.matchmakingService.setSessionId(userId, partnerId, sessionId);

      client.emit('matchmaking:completed', { sessionId });
      this.server.to(`matchmaking:${partnerId}`).emit('matchmaking:completed', { sessionId });
    } else {
      // Partner henüz kabul etmedi — partner'a bildir
      this.server.to(`matchmaking:${partnerId}`).emit('matchmaking:partner-accepted', {});
    }
  }

  @SubscribeMessage('matchmaking:decline')
  async handleDecline(@ConnectedSocket() client: Socket) {
    const userId = this.getUserId(client);
    if (!userId) return;

    await this.matchmakingService.declineMatch(userId);
    client.emit('matchmaking:declined', {});
  }

  @SubscribeMessage('matchmaking:cancel')
  async handleCancel(@ConnectedSocket() client: Socket) {
    const userId = this.getUserId(client);
    if (!userId) return;

    await this.matchmakingService.cancelQueue(userId);
    client.emit('matchmaking:cancelled', {});
  }
}
