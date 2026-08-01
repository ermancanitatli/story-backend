import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { StoriesService } from './stories.service';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { UnlocksService } from '../unlocks/unlocks.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';

@ApiTags('Stories')
@ApiBearerAuth()
@Controller('stories')
export class StoriesController {
  constructor(
    private storiesService: StoriesService,
    private unlocksService: UnlocksService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all stories (paginated)' })
  @ApiResponse({ status: 200, description: 'Paginated story list' })
  async findAll(@Query() pagination: PaginationDto) {
    return this.storiesService.findAll(pagination);
  }

  @Get('sync')
  @ApiOperation({ summary: 'Incremental sync for client caches' })
  @ApiResponse({ status: 200, description: 'Stories updated since given timestamp' })
  async sync(@Query('since') since?: string) {
    const storyModel = (this.storiesService as any).storyModel;
    const filter: any = { isPublished: true, deletedAt: { $exists: false } };
    if (since) {
      const sinceDate = new Date(since);
      if (!isNaN(sinceDate.getTime())) {
        filter.updatedAt = { $gt: sinceDate };
      }
    }
    const stories = await storyModel
      .find(filter)
      .sort({ updatedAt: -1 })
      .lean()
      .exec();
    return {
      stories,
      serverTime: new Date().toISOString(),
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get story by ID' })
  @ApiResponse({ status: 200, description: 'Story details' })
  @ApiResponse({ status: 404, description: 'Story not found' })
  async findById(@Param('id', ParseObjectIdPipe) id: string) {
    return this.storiesService.findById(id);
  }

  @Post(':id/unlock')
  @ApiOperation({
    summary: 'Kilitli hikayeyi aç (sunucu fiyatlı, atomik, idempotent)',
    description:
      'Fiyat SUNUCUDA `story.creditCost` üzerinden belirlenir — istek gövdesi YOKTUR, ' +
      'istemcinin gönderdiği hiçbir tutar dikkate alınmaz. Kredi düşümü ve entitlement ' +
      'kaydı tek Mongo transaction içindedir. Zaten açıksa / ücretsizse / kullanıcı ' +
      'premium ise kredi düşmeden başarı döner (`alreadyUnlocked: true`).',
  })
  @ApiResponse({
    status: 201,
    description: 'Unlock sonucu',
    schema: {
      type: 'object',
      properties: {
        storyId: { type: 'string' },
        unlocked: { type: 'boolean', example: true },
        alreadyUnlocked: { type: 'boolean' },
        source: { type: 'string', enum: ['free', 'credit', 'premium', 'admin'] },
        creditsSpent: { type: 'number', example: 100 },
        credits: { type: 'number', example: 250 },
        creditCost: { type: 'number', example: 100 },
      },
    },
  })
  @ApiResponse({ status: 402, description: 'INSUFFICIENT_CREDITS — details: { required, balance }' })
  @ApiResponse({ status: 404, description: 'Story not found' })
  async unlock(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    return this.unlocksService.unlockStory(user.sub, id);
  }
}
