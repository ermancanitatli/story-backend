import { Controller, Post, Get, Param, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UserHandlesService } from './user-handles.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';

@ApiTags('User Handles')
@ApiBearerAuth()
@Controller('user-handles')
export class UserHandlesController {
  constructor(private handlesService: UserHandlesService) {}

  @Get('check/:handle')
  @ApiOperation({ summary: 'Check handle availability' })
  async check(@Param('handle') handle: string) {
    return this.handlesService.checkAvailability(handle);
  }

  @Post('request')
  @ApiOperation({ summary: 'Request/change handle' })
  async request(@CurrentUser() user: JwtPayload, @Body() body: { handle: string }) {
    return this.handlesService.requestHandle(user.sub, body.handle);
  }
}
