import { Module } from '@nestjs/common';
import { CreditsController } from './credits.controller';
import { CreditsService } from './credits.service';
import { UsersModule } from '../users/users.module';
import { AppSettingsModule } from '../app-settings/app-settings.module';

@Module({
  imports: [UsersModule, AppSettingsModule],
  controllers: [CreditsController],
  providers: [CreditsService],
  exports: [CreditsService],
})
export class CreditsModule {}
