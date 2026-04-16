import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ReferralsService } from './referrals.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';

@ApiTags('Referrals')
@ApiBearerAuth()
@Controller('referrals')
export class ReferralsController {
  constructor(private referralsService: ReferralsService) {}

  @Post('apply')
  @ApiOperation({ summary: 'Apply referral code' })
  async apply(@CurrentUser() user: JwtPayload, @Body() body: { ref: string }) {
    return this.referralsService.applyReferral(user.sub, body.ref);
  }
}
