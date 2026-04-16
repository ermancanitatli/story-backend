import { Controller, Get, Patch, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'User profile returned' })
  async getMe(@CurrentUser() user: JwtPayload) {
    return this.usersService.findByIdOrFail(user.sub);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update current user profile' })
  @ApiResponse({ status: 200, description: 'User profile updated' })
  async updateMe(@CurrentUser() user: JwtPayload, @Body() dto: UpdateUserDto) {
    return this.usersService.update(user.sub, dto);
  }

  @Patch('me/device-info')
  @ApiOperation({ summary: 'Update device information' })
  async updateDeviceInfo(
    @CurrentUser() user: JwtPayload,
    @Body() body: Record<string, any>,
  ) {
    return this.usersService.updateDeviceInfo(user.sub, body);
  }

  @Patch('me/stats/:statName')
  @ApiOperation({ summary: 'Increment a user stat' })
  async incrementStat(
    @CurrentUser() user: JwtPayload,
    @Param('statName') statName: string,
    @Body() body: { value?: number },
  ) {
    return this.usersService.incrementStat(user.sub, statName, body.value ?? 1);
  }

  @Get('search')
  @ApiOperation({ summary: 'Search users by handle' })
  async searchByHandle(@Query('q') query: string) {
    if (!query || query.length < 2) return [];
    return this.usersService.searchByHandle(query);
  }

  @Get(':id/public')
  @ApiOperation({ summary: 'Get user public profile (limited fields)' })
  async getPublicProfile(@Param('id', ParseObjectIdPipe) id: string) {
    return this.usersService.getPublicProfile(id);
  }
}
