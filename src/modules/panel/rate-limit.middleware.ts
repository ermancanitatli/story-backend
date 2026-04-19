import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import Redis from 'ioredis';
import { Request, Response } from 'express';

export function createLoginRateLimiter(redisClient: Redis) {
  return rateLimit({
    windowMs: parseInt(
      process.env.PANEL_RATE_LIMIT_WINDOW_MS || String(15 * 60 * 1000),
      10,
    ),
    max: parseInt(process.env.PANEL_RATE_LIMIT_MAX || '5', 10),
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true, // başarılı login counter'ı artırmasın
    store: new RedisStore({
      prefix: 'panel-rl:login:',
      sendCommand: (...args: string[]) =>
        (redisClient as any).call(...args) as any,
    }),
    keyGenerator: (req: Request) => req.ip ?? 'unknown',
    handler: (req: Request, res: Response) => {
      return res.status(429).render('panel/rate-limited', {
        layout: false,
        retryAfter: res.getHeader('Retry-After'),
      });
    },
  });
}

export function createPanelNamespaceLimiter(redisClient: Redis) {
  return rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    store: new RedisStore({
      prefix: 'panel-rl:ns:',
      sendCommand: (...args: string[]) =>
        (redisClient as any).call(...args) as any,
    }),
    keyGenerator: (req: Request) => req.ip ?? 'unknown',
  });
}
