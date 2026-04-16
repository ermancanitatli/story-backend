import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export function createRedisClient(config: ConfigService): Redis {
  return new Redis({
    host: config.get<string>('REDIS_HOST', 'localhost'),
    port: config.get<number>('REDIS_PORT', 6379),
    password: config.get<string>('REDIS_PASSWORD') || undefined,
    maxRetriesPerRequest: null, // Required for BullMQ
    enableReadyCheck: true,
    retryStrategy: (times: number) => Math.min(times * 50, 2000),
  });
}
