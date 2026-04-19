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
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];

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

  // ---------------------------------------------------------------------------
  // Chapter-level media endpoints (STORY-CH)
  // ---------------------------------------------------------------------------

  @Post(':id/chapters/:chapterIdx/presign')
  async presignChapterMedia(
    @Param('id') storyId: string,
    @Param('chapterIdx') chapterIdxStr: string,
    @Body() body: { contentType: string; kind: 'image' | 'video' },
  ) {
    const chapterIdx = parseInt(chapterIdxStr, 10);
    if (Number.isNaN(chapterIdx) || chapterIdx < 0) {
      throw new BadRequestException('Geçersiz chapter index');
    }
    const ct = body.contentType?.toLowerCase();
    const kind = body.kind;
    if (kind !== 'image' && kind !== 'video') {
      throw new BadRequestException('kind: image | video olmalı');
    }
    const allowed = kind === 'image' ? ALLOWED_IMAGE_TYPES : ALLOWED_VIDEO_TYPES;
    if (!ct || !allowed.includes(ct)) {
      throw new BadRequestException(
        `İzin verilen türler (${kind}): ${allowed.join(', ')}`,
      );
    }
    const ext = ct.split('/')[1].replace('jpeg', 'jpg').replace('quicktime', 'mov');
    const imageId = randomUUID();
    const subdir = kind === 'image' ? 'images' : 'videos';
    const path = `stories/${storyId}/chapters/${chapterIdx}/${subdir}/${imageId}.${ext}`;

    const { uploadUrl, publicUrl } = await this.storage.presignPutObject(
      path,
      ct,
      15 * 60,
    );

    return { uploadUrl, publicUrl, imageId, path, mimeType: ct };
  }

  @Post(':id/chapters/:chapterIdx/media')
  async addChapterMedia(
    @Param('id') storyId: string,
    @Param('chapterIdx') chapterIdxStr: string,
    @Body()
    body: {
      url: string;
      thumbnail?: string;
      title?: string;
      alt?: string;
      order?: number;
      hidden?: boolean;
      mimeType?: string;
    },
  ) {
    const chapterIdx = parseInt(chapterIdxStr, 10);
    if (Number.isNaN(chapterIdx) || chapterIdx < 0) {
      throw new BadRequestException('Geçersiz chapter index');
    }
    if (!body?.url) throw new BadRequestException('url zorunlu');
    const updated = await this.stories.addChapterMedia(storyId, chapterIdx, body);
    const chapter = (updated as any)?.chapters?.[chapterIdx];
    const items = chapter?.mediaItems || [];
    return { item: items[items.length - 1], mediaItems: items };
  }

  @Patch(':id/chapters/:chapterIdx/media/:itemId')
  async updateChapterMedia(
    @Param('id') storyId: string,
    @Param('chapterIdx') chapterIdxStr: string,
    @Param('itemId') itemId: string,
    @Body()
    body: Partial<{
      title: string;
      alt: string;
      order: number;
      hidden: boolean;
      thumbnail: string;
      mimeType: string;
    }>,
  ) {
    const chapterIdx = parseInt(chapterIdxStr, 10);
    if (Number.isNaN(chapterIdx) || chapterIdx < 0) {
      throw new BadRequestException('Geçersiz chapter index');
    }
    const updated = await this.stories.updateChapterMedia(
      storyId,
      chapterIdx,
      itemId,
      body,
    );
    const items = (updated as any)?.chapters?.[chapterIdx]?.mediaItems || [];
    return { item: items.find((m: any) => m._id === itemId), mediaItems: items };
  }

  @Delete(':id/chapters/:chapterIdx/media/:itemId')
  async deleteChapterMedia(
    @Param('id') storyId: string,
    @Param('chapterIdx') chapterIdxStr: string,
    @Param('itemId') itemId: string,
  ) {
    const chapterIdx = parseInt(chapterIdxStr, 10);
    if (Number.isNaN(chapterIdx) || chapterIdx < 0) {
      throw new BadRequestException('Geçersiz chapter index');
    }
    await this.stories.deleteChapterMedia(storyId, chapterIdx, itemId);
    return { deleted: true };
  }

  @Put(':id/chapters/:chapterIdx/media/order')
  async reorderChapterMedia(
    @Param('id') storyId: string,
    @Param('chapterIdx') chapterIdxStr: string,
    @Body() body: { orderedItemIds: string[] },
  ) {
    const chapterIdx = parseInt(chapterIdxStr, 10);
    if (Number.isNaN(chapterIdx) || chapterIdx < 0) {
      throw new BadRequestException('Geçersiz chapter index');
    }
    if (!Array.isArray(body?.orderedItemIds)) {
      throw new BadRequestException('orderedItemIds array olmalı');
    }
    await this.stories.reorderChapterMedia(
      storyId,
      chapterIdx,
      body.orderedItemIds,
    );
    return { reordered: true };
  }
}
