import { Controller, Post, Body, Headers, UnauthorizedException } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { BillingService } from './billing.service';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Billing')
@Controller('billing')
export class BillingController {
  constructor(
    private billingService: BillingService,
    private configService: ConfigService,
  ) {}

  @Post('revenuecat-webhook')
  @Public()
  @ApiOperation({ summary: 'RevenueCat webhook endpoint' })
  async handleWebhook(
    @Body() body: any,
    @Headers('authorization') authHeader: string,
  ) {
    // Auth validation
    const expectedToken = this.configService.get<string>('REVENUECAT_WEBHOOK_AUTH', 'AF8C84E8E3F959AF951F674A63352');
    const token = (authHeader || '').replace(/^Bearer\s+/i, '').replace(/\s+Bearar\s+.*$/i, '').trim();
    if (token !== expectedToken) {
      throw new UnauthorizedException('Invalid webhook auth');
    }

    return this.billingService.processWebhook(body);
  }
}
