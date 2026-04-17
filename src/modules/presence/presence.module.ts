import { Module } from '@nestjs/common';
import { PresenceService } from './presence.service';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [UsersModule],
  providers: [PresenceService],
  exports: [PresenceService],
})
export class PresenceModule {}
