import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@WebSocketGateway({ namespace: '/multiplayer', cors: true })
export class MultiplayerGateway {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(MultiplayerGateway.name);

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  private getUserId(client: Socket): string | null {
    try {
      const token = client.handshake.auth?.token || client.handshake.headers?.authorization?.replace('Bearer ', '');
      if (!token) return null;
      return this.jwtService.verify(token, { secret: this.configService.get('JWT_ACCESS_SECRET') }).sub;
    } catch { return null; }
  }

  @SubscribeMessage('multiplayer:join')
  handleJoin(@ConnectedSocket() client: Socket, @MessageBody() data: { sessionId: string }) {
    const userId = this.getUserId(client);
    if (!userId) return;
    client.join(`mp:${data.sessionId}`);
    this.logger.log(`User ${userId} joined multiplayer room: ${data.sessionId}`);
  }

  // Emit helpers — service'den çağrılır
  emitSessionUpdate(sessionId: string, session: any) {
    this.server.to(`mp:${sessionId}`).emit('session:updated', session);
  }

  emitProgressNew(sessionId: string, progress: any) {
    this.server.to(`mp:${sessionId}`).emit('progress:new', progress);
  }

  emitSessionCompleted(sessionId: string, data: { endingType?: string }) {
    this.server.to(`mp:${sessionId}`).emit('session:completed', data);
  }
}
