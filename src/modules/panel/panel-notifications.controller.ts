import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Logger,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { SessionAuthGuard } from './guards/session-auth.guard';
import { NotificationService } from '../notifications/notification.service';
import { UserSegmentationService } from '../notifications/user-segmentation.service';
import { NotificationHistoryService } from '../notifications/notification-history.service';
import { BroadcastRateLimitGuard } from '../notifications/guards/broadcast-rate-limit.guard';
import {
  EstimateNotificationDto,
  SendNotificationDto,
} from './dto/send-notification.dto';

/**
 * Panel → broadcast push notifications API.
 *
 * Endpoints:
 *  - POST /panel/api/notifications/estimate — segment için tahmini alıcı sayısı
 *  - POST /panel/api/notifications/send    — broadcast gönder (rate-limited)
 *  - GET  /panel/api/notifications/history — son N history kaydı
 *
 * Guard sırası: @Public() JWT bypass + SessionAuthGuard (panel session). Send
 * endpoint'inde ek olarak BroadcastRateLimitGuard (5 dk cooldown).
 */
@Controller('panel/api/notifications')
@Public()
@UseGuards(SessionAuthGuard)
export class PanelNotificationsController {
  private readonly logger = new Logger('PanelNotifications');

  constructor(
    private readonly notificationService: NotificationService,
    private readonly segmentationService: UserSegmentationService,
    private readonly historyService: NotificationHistoryService,
  ) {}

  @Post('estimate')
  async estimate(@Body() dto: EstimateNotificationDto) {
    const { count } = await this.segmentationService.estimate(dto.segment, {
      customUserIds: dto.customUserIds,
    });
    return { count };
  }

  @Post('send')
  @UseGuards(BroadcastRateLimitGuard)
  async send(@Body() dto: SendNotificationDto, @Req() req: any) {
    if (!dto.headings?.en || !dto.contents?.en) {
      throw new BadRequestException('EN headings/contents required');
    }

    const adminId = req.session?.adminId || 'unknown';
    const adminUsername = req.session?.username || 'unknown';

    // Segment resolve — external id listesi ve toplam sayı
    const { externalIds, count } = await this.segmentationService.resolve(
      dto.segment,
      { customUserIds: dto.customUserIds },
    );

    // Pending history kaydı oluştur
    const history = await this.historyService.create({
      senderAdminId: adminId,
      senderUsername: adminUsername,
      segment: dto.segment,
      customUserIds: dto.customUserIds,
      headings: dto.headings,
      contents: dto.contents,
      bigPicture: dto.bigPicture,
      url: dto.url,
      data: dto.data,
      estimatedRecipients: count,
      status: 'pending',
    });

    this.logger.log(
      `Broadcast initiated admin=${adminUsername} segment=${dto.segment} ` +
        `targets=${count} historyId=${history._id}`,
    );

    try {
      const response = await this.notificationService.sendBroadcast({
        headings: dto.headings,
        contents: dto.contents,
        includeExternalIds: externalIds,
        bigPicture: dto.bigPicture,
        url: dto.url,
        data: dto.data,
      });

      await this.historyService.updateStatus(history._id.toString(), {
        status: 'sent',
        oneSignalNotificationId: response.id,
        oneSignalResponseRaw: response as any,
        successCount: response.recipients,
      });

      return {
        historyId: history._id,
        estimatedRecipients: count,
        oneSignalId: response.id,
        recipients: response.recipients,
      };
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(
        `Broadcast failed historyId=${history._id} error=${message}`,
      );
      await this.historyService.updateStatus(history._id.toString(), {
        status: 'failed',
        errorMessage: message,
      });
      throw err;
    }
  }

  @Get('history')
  async history(@Query('limit') limit?: string) {
    const parsed = parseInt(limit || '50', 10);
    const lim = Math.min(Number.isFinite(parsed) ? parsed : 50, 200);
    return this.historyService.list(lim);
  }
}
