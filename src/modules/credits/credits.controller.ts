import { Controller, Post, Get, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CreditsService } from './credits.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { Public } from '../../common/decorators/public.decorator';
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard';

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
  @ApiOperation({
    summary: 'Spend credits (fiyat sunucuda belirlenir)',
    description:
      '⚠️ `amount` alanı ARTIK YOK SAYILIYOR — fiyat `reason` üzerinden sunucuda belirlenir. ' +
      'Geçerli sebepler: `custom_input`, `custom_input_multiplayer`. ' +
      '`unlock_story_*` sebepleri 400 `INVALID_SPEND_REASON` döner; hikaye açma için ' +
      'POST /api/stories/:id/unlock kullanılmalıdır.',
  })
  async spend(
    @CurrentUser() user: JwtPayload,
    @Body() body: { reason: string; amount?: number },
  ) {
    return this.creditsService.spendCredits(user.sub, body?.reason, body?.amount);
  }

  @Post('grant')
  @Public()
  @UseGuards(AdminAuthGuard)
  @ApiOperation({ summary: 'Grant credits (admin/webhook)' })
  async grant(@Body() body: { userId: string; amount: number; reason: string }) {
    return this.creditsService.grantCredits(body.userId, body.amount, body.reason);
  }
}
