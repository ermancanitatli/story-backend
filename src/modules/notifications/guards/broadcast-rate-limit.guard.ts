import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import Redis from 'ioredis';

/**
 * Broadcast notifications için Redis tabanlı rate-limit / cooldown guard.
 *
 * Kullanım: Panel broadcast endpoint'inde `@UseGuards(BroadcastRateLimitGuard)`
 * ile kullanılacak (bkz. NOTIF-05). Admin override için `?force=true` query
 * parametresi loglanarak geçirilir.
 *
 * Mekanizma:
 *  - `SET notification:broadcast:lock 1 EX 300 NX` ile lock alınır.
 *  - Lock zaten varsa 429 + retryAfter döner.
 *  - Cooldown süresi: 5 dakika (NOTIF-04 spec).
 */

export const BROADCAST_LOCK_KEY = 'notification:broadcast:lock';
export const BROADCAST_COOLDOWN_SECONDS = 300; // 5 dk

@Injectable()
export class BroadcastRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(BroadcastRateLimitGuard.name);

  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();

    // Admin override: ?force=true ile cooldown bypass edilir, loglanır.
    if (req?.query?.force === 'true' || req?.query?.force === true) {
      const adminId = req?.user?.id ?? req?.user?.uid ?? 'unknown';
      this.logger.warn(
        `Broadcast rate-limit OVERRIDE used by admin=${adminId} ` +
          `path=${req?.originalUrl ?? req?.url ?? 'n/a'}`,
      );
      // Override durumunda lock'u yine de set ederek yeni cooldown başlat.
      await this.redis.set(
        BROADCAST_LOCK_KEY,
        '1',
        'EX',
        BROADCAST_COOLDOWN_SECONDS,
      );
      return true;
    }

    // SET NX EX — yalnızca lock yoksa set eder.
    const acquired = await this.redis.set(
      BROADCAST_LOCK_KEY,
      '1',
      'EX',
      BROADCAST_COOLDOWN_SECONDS,
      'NX',
    );

    if (acquired !== 'OK') {
      const ttl = await this.redis.ttl(BROADCAST_LOCK_KEY);
      const retryAfter = ttl > 0 ? ttl : BROADCAST_COOLDOWN_SECONDS;
      throw new HttpException(
        {
          code: 'RATE_LIMITED',
          message: 'Yayın gönderim bekleme süresi aktif',
          retryAfter,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
