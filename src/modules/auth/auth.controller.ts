import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { AnonymousLoginDto } from './dto/anonymous-login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from './strategies/jwt.strategy';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post('anonymous')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Anonymous login with device ID' })
  @ApiResponse({ status: 200, description: 'JWT tokens returned' })
  async anonymousLogin(@Body() dto: AnonymousLoginDto) {
    return this.authService.anonymousLogin(dto.deviceId);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiResponse({ status: 200, description: 'New JWT tokens returned' })
  @ApiResponse({ status: 401, description: 'Invalid refresh token' })
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshAccessToken(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout — revoke all refresh tokens' })
  @ApiResponse({ status: 200, description: 'All tokens revoked' })
  async logout(@CurrentUser() user: JwtPayload) {
    await this.authService.revokeAllTokens(user.sub);
    return { message: 'Logged out' };
  }
}
