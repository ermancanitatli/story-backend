import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PanelController } from './panel.controller';

@Module({
  imports: [ConfigModule],
  controllers: [PanelController],
})
export class PanelModule {}
