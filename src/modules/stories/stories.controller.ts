import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { StoriesService } from './stories.service';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';

@ApiTags('Stories')
@ApiBearerAuth()
@Controller('stories')
export class StoriesController {
  constructor(private storiesService: StoriesService) {}

  @Get()
  @ApiOperation({ summary: 'List all stories (paginated)' })
  @ApiResponse({ status: 200, description: 'Paginated story list' })
  async findAll(@Query() pagination: PaginationDto) {
    return this.storiesService.findAll(pagination);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get story by ID' })
  @ApiResponse({ status: 200, description: 'Story details' })
  @ApiResponse({ status: 404, description: 'Story not found' })
  async findById(@Param('id', ParseObjectIdPipe) id: string) {
    return this.storiesService.findById(id);
  }
}
