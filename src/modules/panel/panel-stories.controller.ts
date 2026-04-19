import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { SessionAuthGuard } from './guards/session-auth.guard';
import { StoriesService } from '../stories/stories.service';
import { CreateStoryDto } from '../stories/dto/create-story.dto';
import { UpdateStoryDto } from '../stories/dto/update-story.dto';
import { ListStoryQueryDto } from '../stories/dto/list-story-query.dto';

@Controller('panel/api/stories')
@Public()
@UseGuards(SessionAuthGuard)
export class PanelStoriesController {
  constructor(private stories: StoriesService) {}

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
}
