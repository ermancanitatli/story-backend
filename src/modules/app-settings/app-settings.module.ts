import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AppSettingsController } from './app-settings.controller';
import { AppSettingsService } from './app-settings.service';
import { AppSettingsDoc, AppSettingsDocSchema } from './schemas/app-settings.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: AppSettingsDoc.name, schema: AppSettingsDocSchema }]),
  ],
  controllers: [AppSettingsController],
  providers: [AppSettingsService],
  exports: [AppSettingsService],
})
export class AppSettingsModule {}
