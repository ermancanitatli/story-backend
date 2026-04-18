import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private readonly appId: string | null = null;
  private readonly apiKey: string | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly usersService: UsersService,
  ) {
    const appId = this.config.get<string>('ONESIGNAL_APP_ID');
    const apiKey = this.config.get<string>('ONESIGNAL_REST_API_KEY');

    if (appId && apiKey) {
      this.appId = appId;
      this.apiKey = apiKey;
      this.logger.log('OneSignal client initialized');
    } else {
      this.logger.warn('OneSignal credentials not configured — push notifications disabled');
    }
  }

  /**
   * Belirli player ID listesine push bildirim gönder (direkt cihaz hedefleme).
   */
  async sendToUser(params: {
    playerIds: string[];
    title: string;
    message: string;
    data?: Record<string, string>;
  }): Promise<void> {
    if (!this.appId || !this.apiKey || params.playerIds.length === 0) return;

    try {
      const response = await fetch('https://onesignal.com/api/v1/notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${this.apiKey}`,
        },
        body: JSON.stringify({
          app_id: this.appId,
          include_player_ids: params.playerIds,
          headings: { en: params.title },
          contents: { en: params.message },
          data: params.data ?? {},
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        this.logger.warn(`OneSignal responded with ${response.status}: ${body}`);
        return;
      }

      this.logger.debug(`Push sent to ${params.playerIds.length} device(s): "${params.title}"`);
    } catch (err) {
      // Push başarısız olsa da ana akış devam etmeli — sessizce logla
      this.logger.warn(`Push notification failed: ${(err as Error).message}`);
    }
  }

  /**
   * Kullanıcı ID'si ile push gönder — DB'den player ID'yi çeker.
   */
  async sendToUserId(
    userId: string,
    title: string,
    message: string,
    data?: Record<string, string>,
  ): Promise<void> {
    if (!this.appId || !this.apiKey) return;

    try {
      const user = await this.usersService.findById(userId);
      if (!user?.oneSignalPlayerId) return;

      await this.sendToUser({
        playerIds: [user.oneSignalPlayerId],
        title,
        message,
        data,
      });
    } catch (err) {
      this.logger.warn(`Push to user ${userId} failed: ${(err as Error).message}`);
    }
  }
}
