import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UnlocksService } from './unlocks.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';

@ApiTags('Unlocks')
@ApiBearerAuth()
@Controller('unlocks')
export class UnlocksController {
  constructor(private unlocksService: UnlocksService) {}

  @Get('stories')
  @ApiOperation({
    summary: 'Kullanıcının açtığı hikayeler (sunucu tarafı entitlement)',
    description:
      'iOS bunu uygulama açılışında çağırır ve UserDefaults yerine tek doğruluk kaynağı olarak kullanır. ' +
      '`isPremium: true` iken tüm ücretli hikayeler açık gösterilmelidir; premium kullanıcı için ' +
      'her hikayenin ayrı kaydı bulunmaz.',
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        isPremium: { type: 'boolean' },
        storyIds: { type: 'array', items: { type: 'string' } },
        unlocks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              storyId: { type: 'string' },
              source: { type: 'string', enum: ['credit', 'premium', 'admin'] },
              creditsSpent: { type: 'number' },
              unlockedAt: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
  })
  async listStories(@CurrentUser() user: JwtPayload) {
    return this.unlocksService.listUnlocks(user.sub);
  }
}
