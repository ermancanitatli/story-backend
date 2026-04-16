import { Injectable, Logger } from '@nestjs/common';
import { UsersService } from '../users/users.service';

@Injectable()
export class PresenceService {
  private readonly logger = new Logger(PresenceService.name);
  // In-memory online users map: userId -> Set<socketId>
  private onlineUsers = new Map<string, Set<string>>();

  constructor(private usersService: UsersService) {}

  async userConnected(userId: string, socketId: string): Promise<void> {
    if (!this.onlineUsers.has(userId)) {
      this.onlineUsers.set(userId, new Set());
    }
    this.onlineUsers.get(userId)!.add(socketId);

    // First connection for this user
    if (this.onlineUsers.get(userId)!.size === 1) {
      await this.usersService.updatePresence(userId, true);
      this.logger.log(`User online: ${userId}`);
    }
  }

  async userDisconnected(userId: string, socketId: string): Promise<void> {
    const sockets = this.onlineUsers.get(userId);
    if (sockets) {
      sockets.delete(socketId);
      // Last socket disconnected
      if (sockets.size === 0) {
        this.onlineUsers.delete(userId);
        await this.usersService.updatePresence(userId, false);
        this.logger.log(`User offline: ${userId}`);
      }
    }
  }

  isOnline(userId: string): boolean {
    return this.onlineUsers.has(userId) && this.onlineUsers.get(userId)!.size > 0;
  }

  getOnlineUserIds(): string[] {
    return Array.from(this.onlineUsers.keys());
  }
}
