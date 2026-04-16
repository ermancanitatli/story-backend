import { Module } from '@nestjs/common';
import { PresenceGateway } from './presence.gateway';
import { PresenceService } from './presence.service';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [UsersModule, AuthModule],
  providers: [PresenceGateway, PresenceService],
  exports: [PresenceService],
})
export class PresenceModule {}
