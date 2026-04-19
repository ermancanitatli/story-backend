import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Public } from '../../common/decorators/public.decorator';
import { SessionAuthGuard } from './guards/session-auth.guard';
import { StoriesService } from '../stories/stories.service';
import { StorageService } from '../storage/storage.service';
import { CreateStoryDto } from '../stories/dto/create-story.dto';
import { UpdateStoryDto } from '../stories/dto/update-story.dto';
import { ListStoryQueryDto } from '../stories/dto/list-story-query.dto';

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

@Controller('panel/api/stories')
@Public()
@UseGuards(SessionAuthGuard)
export class PanelStoriesController {
  constructor(
    private stories: StoriesService,
    private storage: StorageService,
  ) {}

  @Get()
  list(@Query() query: ListStoryQueryDto) {
    return this.stories.adminList(query);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.stories.findById(id);
  }

  @Post()
  create(@Body() dto: CreateStoryDto) {
    return this.stories.adminCreate(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateStoryDto) {
    return this.stories.adminUpdate(id, dto);
  }

  @Delete(':id')
  async softDelete(@Param('id') id: string) {
    await this.stories.adminSoftDelete(id);
    return { deleted: true };
  }

  @Post(':id/duplicate')
  duplicate(@Param('id') id: string) {
    return this.stories.adminDuplicate(id);
  }

  @Get(':id/active-sessions')
  async activeSessions(@Param('id') id: string) {
    const count = await this.stories.activeSessionCount(id);
    return { count };
  }

  @Post(':id/images/presign')
  async presignImageUpload(
    @Param('id') storyId: string,
    @Body() body: { contentType: string; kind?: 'cover' | 'gallery' | 'character' },
  ) {
    const ct = body.contentType?.toLowerCase();
    if (!ct || !ALLOWED_IMAGE_TYPES.includes(ct)) {
      throw new BadRequestException(
        'İzin verilen türler: ' + ALLOWED_IMAGE_TYPES.join(', '),
      );
    }
    const ext = ct.split('/')[1].replace('jpeg', 'jpg');
    const imageId = randomUUID();
    const subdir = body.kind === 'character' ? 'characters' : 'images';
    const path = `stories/${storyId}/${subdir}/${imageId}.${ext}`;

    const { uploadUrl, publicUrl } = await this.storage.presignPutObject(
      path,
      ct,
      15 * 60,
    );

    return { uploadUrl, publicUrl, imageId, path };
  }

  @Post(':id/images')
  addImage(
    @Param('id') id: string,
    @Body()
    body: {
      url: string;
      thumbnail?: string;
      title?: string;
      alt?: string;
      type: 'cover' | 'gallery';
    },
  ) {
    return this.stories.addImage(id, body);
  }

  @Delete(':id/images/:index')
  async deleteImage(
    @Param('id') id: string,
    @Param('index') index: string,
    @Query('type') type: 'cover' | 'gallery' = 'gallery',
  ) {
    await this.stories.deleteImage(id, parseInt(index, 10), type);
    return { deleted: true };
  }

  @Put(':id/images/order')
  async reorderImages(
    @Param('id') id: string,
    @Body() body: { type: 'cover' | 'gallery'; orderedIndexes: number[] },
  ) {
    await this.stories.reorderImages(id, body.type, body.orderedIndexes);
    return { reordered: true };
  }
}
