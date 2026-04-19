import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import * as session from 'express-session';
import * as expressLayouts from 'express-ejs-layouts';
import RedisStore from 'connect-redis';
import { NestExpressApplication } from '@nestjs/platform-express';
import { WinstonModule } from 'nest-winston';
import { join } from 'path';
import { AppModule } from './app.module';
import { resolveSessionSecret } from './modules/panel/session-secret.helper';
import { winstonConfig } from './common/logger/winston.config';
import { requestIdMiddleware } from './common/middleware/request-id.middleware';
import { ApiJsonExceptionFilter } from './common/filters/api-json-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    rawBody: true,
    logger: WinstonModule.createLogger(winstonConfig),
  });

  // Request correlation id — must run before everything else so downstream
  // middleware / guards / controllers can read req.id and ALS store.
  app.use(requestIdMiddleware);

  // Behind Coolify/Traefik reverse proxy: trust first proxy so req.secure / X-Forwarded-Proto are honored.
  app.set('trust proxy', 1);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3000);
  const prefix = configService.get<string>('API_PREFIX', 'api');
  const corsOrigin = configService.get<string>('CORS_ORIGIN', '*');

  // Admin panel: EJS view engine + static assets (public/panel-assets)
  app.setBaseViewsDir(join(__dirname, '..', 'views'));
  app.setViewEngine('ejs');
  app.use(expressLayouts);
  app.set('layout', false); // default: layout YOK — controller opt-in ile açar
  app.useStaticAssets(join(__dirname, '..', 'public'));

  // Admin panel: express-session (Redis store, mevcut Redis'i kullanır)
  // SESSION_SECRET env'de yoksa otomatik üretilir ve .env'e yazılır.
  const sessionSecret = resolveSessionSecret();
  const sessionHost = configService.get<string>('REDIS_HOST', 'localhost');
  const sessionPort = configService.get<number>('REDIS_PORT', 6379);
  const sessionPassword = configService.get<string>('REDIS_PASSWORD') || undefined;
  const sessionRedis = new Redis({
    host: sessionHost,
    port: sessionPort,
    password: sessionPassword,
  });
  app.use(
    session({
      store: new RedisStore({ client: sessionRedis, prefix: 'panel-sess:' }),
      name: 'panel.sid',
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000, // 24 saat
      },
    }),
  );

  // Socket.IO Redis Adapter (cluster-safe)
  const redisHost = configService.get<string>('REDIS_HOST', 'localhost');
  const redisPort = configService.get<number>('REDIS_PORT', 6379);
  const redisPassword = configService.get<string>('REDIS_PASSWORD') || undefined;
  try {
    const pubClient = new Redis({ host: redisHost, port: redisPort, password: redisPassword });
    const subClient = pubClient.duplicate();
    const redisIoAdapter = new IoAdapter(app);
    (redisIoAdapter as any).createIOServer = function (port: number, options?: any) {
      const server = IoAdapter.prototype.createIOServer.call(this, port, {
        ...options,
        cors: {
          origin: corsOrigin === '*' ? true : corsOrigin.split(',').map((o: string) => o.trim()),
          credentials: true,
        },
        transports: ['websocket', 'polling'],
      });
      server.adapter(createAdapter(pubClient, subClient));
      return server;
    };
    app.useWebSocketAdapter(redisIoAdapter);
    console.log('🔌 Socket.IO Redis adapter configured');
  } catch (err) {
    console.warn('⚠️ Redis adapter failed, using default Socket.IO adapter:', (err as Error).message);
  }

  // Global prefix — /panel rotalarını hariç tut (admin panel üst düzey path'te)
  app.setGlobalPrefix(prefix, {
    exclude: ['panel', 'panel/(.*)'],
  });

  // CORS
  app.enableCors({
    origin: corsOrigin === '*' ? true : corsOrigin.split(',').map((o) => o.trim()),
    credentials: true,
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Global JSON error filter — API rotaları için standart envelope.
  // `/panel/*` HTML rotaları scoped `PanelHtmlExceptionFilter` ile
  // controller düzeyinde override edilir (CC-02).
  app.useGlobalFilters(new ApiJsonExceptionFilter());

  // Swagger
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Story Backend API')
    .setDescription('Story App Backend — REST + Socket.IO')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  await app.listen(port);
  console.log(`🚀 Story Backend running on port ${port}`);
  console.log(`📚 Swagger docs at http://localhost:${port}/docs`);
}

bootstrap();
