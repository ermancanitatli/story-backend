import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { buildMongoUri, resolveDbName } from './config/database.config';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';

// Feature modules
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { StoriesModule } from './modules/stories/stories.module';
import { StorySessionsModule } from './modules/story-sessions/story-sessions.module';
import { AiModule } from './modules/ai/ai.module';
import { AppSettingsModule } from './modules/app-settings/app-settings.module';
import { PresenceModule } from './modules/presence/presence.module';
import { MatchmakingModule } from './modules/matchmaking/matchmaking.module';
import { MultiplayerModule } from './modules/multiplayer/multiplayer.module';
import { FriendshipsModule } from './modules/friendships/friendships.module';
import { UserHandlesModule } from './modules/user-handles/user-handles.module';
import { CreditsModule } from './modules/credits/credits.module';
import { BillingModule } from './modules/billing/billing.module';
import { ReferralsModule } from './modules/referrals/referrals.module';
import { StorageModule } from './modules/storage/storage.module';
import { FakeUsersModule } from './modules/fake-users/fake-users.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    // Config
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.example'],
    }),

    // MongoDB
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const env = config.get<string>('APP_ENV', 'dev');
        const uri = buildMongoUri({
          host: config.get<string>('MONGO_HOST', 'localhost'),
          port: config.get<number>('MONGO_PORT', 27017),
          username: config.get<string>('MONGO_USER', 'root'),
          password: config.get<string>('MONGO_PASS', 'change-me'),
          replicaSet: config.get<string>('MONGO_RS', 'rs0'),
          authSource: config.get<string>('MONGO_AUTH_SOURCE', 'admin'),
          directConnection: config.get<string>('MONGO_DIRECT_CONNECTION', 'true') === 'true',
        });
        const dbName = resolveDbName(env, {
          prod: config.get<string>('MONGO_DB_PROD', 'story_prod'),
          dev: config.get<string>('MONGO_DB_DEV', 'story_dev'),
        });
        console.log(`📦 MongoDB connecting to ${dbName} (${env})`);
        return {
          uri,
          dbName,
          minPoolSize: 2,
          maxPoolSize: 10,
          heartbeatFrequencyMS: 10000,
        };
      },
    }),

    // Rate limiting
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),

    // Scheduler
    ScheduleModule.forRoot(),

    // Feature modules
    AuthModule,
    UsersModule,
    StoriesModule,
    StorySessionsModule,
    AiModule,
    AppSettingsModule,
    PresenceModule,
    MatchmakingModule,
    MultiplayerModule,
    FriendshipsModule,
    UserHandlesModule,
    CreditsModule,
    BillingModule,
    ReferralsModule,
    StorageModule,
    FakeUsersModule,
    HealthModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
