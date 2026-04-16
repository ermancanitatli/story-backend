import { Controller, Post, Get, Patch, Delete, Param, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { FriendshipsService } from './friendships.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';

@ApiTags('Friendships')
@ApiBearerAuth()
@Controller('friendships')
export class FriendshipsController {
  constructor(private friendshipsService: FriendshipsService) {}

  @Post('request')
  @ApiOperation({ summary: 'Send friend request' })
  async sendRequest(@CurrentUser() user: JwtPayload, @Body() body: { toUserId: string }) {
    return this.friendshipsService.sendRequest(user.sub, body.toUserId);
  }

  @Patch('request/:id/accept')
  @ApiOperation({ summary: 'Accept friend request' })
  async accept(@CurrentUser() user: JwtPayload, @Param('id', ParseObjectIdPipe) id: string) {
    return this.friendshipsService.acceptRequest(id, user.sub);
  }

  @Patch('request/:id/decline')
  @ApiOperation({ summary: 'Decline friend request' })
  async decline(@CurrentUser() user: JwtPayload, @Param('id', ParseObjectIdPipe) id: string) {
    await this.friendshipsService.declineRequest(id, user.sub);
    return { success: true };
  }

  @Get()
  @ApiOperation({ summary: 'List friends' })
  async list(@CurrentUser() user: JwtPayload) {
    return this.friendshipsService.getFriends(user.sub);
  }

  @Get('requests/incoming')
  @ApiOperation({ summary: 'List incoming friend requests' })
  async incoming(@CurrentUser() user: JwtPayload) {
    return this.friendshipsService.getIncomingRequests(user.sub);
  }

  @Get('alerts')
  @ApiOperation({ summary: 'Get friend alert counts' })
  async alerts(@CurrentUser() user: JwtPayload) {
    return this.friendshipsService.getAlerts(user.sub) || { incomingPending: 0, acceptedPending: 0 };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remove friend' })
  async remove(@CurrentUser() user: JwtPayload, @Param('id', ParseObjectIdPipe) id: string) {
    await this.friendshipsService.removeFriend(user.sub, id);
    return { success: true };
  }
}
