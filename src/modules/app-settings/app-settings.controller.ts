import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AppSettingsService } from './app-settings.service';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Settings')
@Controller('settings')
export class AppSettingsController {
  constructor(private settingsService: AppSettingsService) {}

  @Get('app')
  @Public()
  @ApiOperation({ summary: 'Get global app settings (cached 5 min)' })
  async getAppSettings() {
    return this.settingsService.getSettings();
  }
}
