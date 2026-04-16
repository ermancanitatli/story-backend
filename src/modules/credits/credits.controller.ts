import { Controller, Post, Get, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CreditsService } from './credits.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';

@ApiTags('Credits')
@ApiBearerAuth()
@Controller('credits')
export class CreditsController {
  constructor(private creditsService: CreditsService) {}

  @Get('balance')
  @ApiOperation({ summary: 'Get credit balance' })
  async getBalance(@CurrentUser() user: JwtPayload) {
    return this.creditsService.getBalance(user.sub);
  }

  @Post('spend')
  @ApiOperation({ summary: 'Spend credits' })
  async spend(@CurrentUser() user: JwtPayload, @Body() body: { amount: number; reason: string }) {
    return this.creditsService.spendCredits(user.sub, body.amount, body.reason);
  }

  @Post('grant')
  @ApiOperation({ summary: 'Grant credits (admin/webhook)' })
  async grant(@CurrentUser() user: JwtPayload, @Body() body: { amount: number; reason: string }) {
    return this.creditsService.grantCredits(user.sub, body.amount, body.reason);
  }
}
