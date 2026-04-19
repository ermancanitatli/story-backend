import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { BroadcastNotificationDto } from './dto/broadcast-notification.dto';
import { OneSignalBroadcastResponse } from './dto/onesignal-response.dto';

const ONESIGNAL_MAX_EXTERNAL_IDS_PER_REQUEST = 2000;
const ONESIGNAL_NOTIFICATIONS_URL = 'https://onesignal.com/api/v1/notifications';

@Injectable()
export class NotificationService implements OnModuleInit {
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
    }
  }

  onModuleInit(): void {
    if (this.appId && this.apiKey) {
      this.logger.log(`🔔 OneSignal initialized (appId=${this.appId.slice(0, 8)}...)`);
    } else {
      this.logger.warn('🔕 OneSignal credentials missing — notifications will fail');
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

  /**
   * Multilingual broadcast push (v2 aliases API).
   *
   * - `includeExternalIds` kullanıldığında `include_aliases.external_id` v2 sözdizimi uygulanır.
   * - 2000+ id varsa otomatik olarak 2000'lik chunk'lara bölünür, her chunk ayrı çağrı yapar.
   * - Credentials eksikse *silently* yutmak yerine **throw** eder (config sorunu gürültüyle farkedilsin).
   * - OneSignal response'u parse edilip `{ id, recipients, errors }` döndürülür.
   *   Birden fazla batch varsa: recipients toplanır, ilk id/errors dönen set edilir.
   */
  async sendBroadcast(dto: BroadcastNotificationDto): Promise<OneSignalBroadcastResponse> {
    if (!this.appId || !this.apiKey) {
      throw new Error(
        'OneSignal credentials are not configured (ONESIGNAL_APP_ID / ONESIGNAL_REST_API_KEY required for sendBroadcast)',
      );
    }

    const basePayload: Record<string, any> = {
      app_id: this.appId,
      headings: dto.headings,
      contents: dto.contents,
    };

    if (dto.bigPicture) {
      basePayload.big_picture = dto.bigPicture;
      basePayload.ios_attachments = { default: dto.bigPicture };
    }
    if (dto.url) basePayload.url = dto.url;
    if (dto.data) basePayload.data = dto.data;
    if (dto.sendAfter) basePayload.send_after = dto.sendAfter;
    if (dto.filters && dto.filters.length > 0) basePayload.filters = dto.filters;

    const externalIds = dto.includeExternalIds ?? [];

    // Filtered / segment-wide broadcast (no external ids)
    if (externalIds.length === 0) {
      if (!dto.filters || dto.filters.length === 0) {
        // Hedef yoksa OneSignal built-in "Subscribed Users" segmentine yolla.
        basePayload.included_segments = ['Subscribed Users'];
      }
      return this.postNotification(basePayload);
    }

    // External id targeting — chunk to 2000
    const chunks = this.chunk(externalIds, ONESIGNAL_MAX_EXTERNAL_IDS_PER_REQUEST);

    let aggregatedRecipients = 0;
    let firstId = '';
    let firstErrors: any = undefined;

    for (const chunk of chunks) {
      const payload = {
        ...basePayload,
        include_aliases: { external_id: chunk },
        target_channel: 'push',
      };

      const response = await this.postNotification(payload);
      aggregatedRecipients += response.recipients ?? 0;
      if (!firstId) firstId = response.id;
      if (!firstErrors && response.errors) firstErrors = response.errors;
    }

    return {
      id: firstId,
      recipients: aggregatedRecipients,
      errors: firstErrors,
    };
  }

  /**
   * OneSignal user tag update via external_id alias.
   * Fire-and-forget pattern: başarısızlık sessizce loglanır, throw etmez.
   */
  async updateUserTags(userId: string, tags: Record<string, string>): Promise<void> {
    if (!this.appId || !this.apiKey) {
      this.logger.warn('OneSignal credentials missing, skipping tag update');
      return;
    }
    try {
      const res = await fetch(
        `https://onesignal.com/api/v1/apps/${this.appId}/users/by/external_id/${encodeURIComponent(userId)}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Basic ${this.apiKey}`,
          },
          body: JSON.stringify({ tags }),
        },
      );
      if (!res.ok) {
        const body = await res.text();
        this.logger.warn(`OneSignal tag update failed ${res.status}: ${body}`);
        return;
      }
      this.logger.debug(`OneSignal tags updated for ${userId}: ${JSON.stringify(tags)}`);
    } catch (err) {
      this.logger.warn(`OneSignal tag update exception: ${(err as Error).message}`);
    }
  }

  private async postNotification(body: Record<string, any>): Promise<OneSignalBroadcastResponse> {
    const response = await fetch(ONESIGNAL_NOTIFICATIONS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    const text = await response.text();
    let parsed: any = {};
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      // Non-JSON response
    }

    if (!response.ok) {
      const msg = `OneSignal broadcast failed (${response.status}): ${text}`;
      this.logger.error(msg);
      throw new Error(msg);
    }

    this.logger.log(
      `OneSignal broadcast ok id=${parsed.id ?? '?'} recipients=${parsed.recipients ?? 0}`,
    );

    return {
      id: parsed.id ?? '',
      recipients: typeof parsed.recipients === 'number' ? parsed.recipients : 0,
      errors: parsed.errors,
    };
  }

  private chunk<T>(arr: T[], size: number): T[][] {
    if (size <= 0) return [arr];
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      out.push(arr.slice(i, i + size));
    }
    return out;
  }
}
