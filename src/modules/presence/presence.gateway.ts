import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PresenceService } from './presence.service';

@WebSocketGateway({ namespace: '/presence', cors: true })
export class PresenceGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(PresenceGateway.name);

  constructor(
    private presenceService: PresenceService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth?.token || client.handshake.headers?.authorization?.replace('Bearer ', '');
      if (!token) {
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
      });
      const userId = payload.sub;

      // Attach userId to socket
      (client as any).userId = userId;

      // Join user-specific room
      client.join(`user:${userId}`);

      // Mark online
      await this.presenceService.userConnected(userId, client.id);

      // Broadcast to others
      this.server.emit('user:online', { userId, lastSeen: new Date().toISOString() });

      this.logger.log(`Client connected: ${client.id} (user: ${userId})`);
    } catch {
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    const userId = (client as any).userId;
    if (!userId) return;

    await this.presenceService.userDisconnected(userId, client.id);

    // Only broadcast offline if truly offline (no more sockets)
    if (!this.presenceService.isOnline(userId)) {
      this.server.emit('user:offline', { userId, lastSeen: new Date().toISOString() });
    }

    this.logger.log(`Client disconnected: ${client.id} (user: ${userId})`);
  }

  @SubscribeMessage('presence:ping')
  handlePing(@ConnectedSocket() client: Socket): void {
    // Heartbeat — keep alive
    client.emit('presence:pong', { timestamp: new Date().toISOString() });
  }
}
