import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { StorageService } from './storage.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';

@ApiTags('Storage')
@ApiBearerAuth()
@Controller('storage')
export class StorageController {
  constructor(private storageService: StorageService) {}

  @Post('presigned-url')
  @ApiOperation({ summary: 'Get presigned PUT URL for S3 upload' })
  async getPresignedUrl(
    @CurrentUser() user: JwtPayload,
    @Body() body: { path: string; contentType: string },
  ) {
    // Ensure path is scoped to user
    const key = body.path.startsWith('users/')
      ? body.path
      : `users/${user.sub}/${body.path}`;
    return this.storageService.presignPutObject(key, body.contentType);
  }
}
