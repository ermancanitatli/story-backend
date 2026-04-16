import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Connection } from 'mongoose';
import { InjectConnection } from '@nestjs/mongoose';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(@InjectConnection() private connection: Connection) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Health check' })
  async check() {
    const mongoState = this.connection.readyState;
    const mongoStatus = mongoState === 1 ? 'connected' : 'disconnected';

    return {
      status: mongoState === 1 ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      services: {
        mongodb: mongoStatus,
      },
    };
  }
}
