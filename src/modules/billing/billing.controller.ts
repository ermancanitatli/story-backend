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
    // Auth validation — token MUST be in env, no hardcoded fallback
    const expectedToken = this.configService.get<string>('REVENUECAT_WEBHOOK_AUTH');
    if (!expectedToken) {
      throw new UnauthorizedException('REVENUECAT_WEBHOOK_AUTH not configured');
    }
    const token = (authHeader || '')
      .replace(/^(?:Bearer|Bearar)\s+/i, '') // Accept both Bearer and Bearar
      .replace(/\s+Bearar\s+.*$/i, '')       // Handle double format
      .trim();
    if (token !== expectedToken) {
      throw new UnauthorizedException('Invalid webhook auth');
    }

    return this.billingService.processWebhook(body);
  }
}
