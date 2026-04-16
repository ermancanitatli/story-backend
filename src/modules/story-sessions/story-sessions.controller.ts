import { Controller, Post, Get, Param, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { StorySessionsService } from './story-sessions.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { SubmitChoiceDto } from './dto/submit-choice.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';

@ApiTags('Story Sessions')
@ApiBearerAuth()
@Controller('story-sessions')
export class StorySessionsController {
  constructor(private sessionsService: StorySessionsService) {}

  @Post()
  @ApiOperation({ summary: 'Create new story session and get first scene' })
  @ApiResponse({ status: 201, description: 'Session created with first progress' })
  async createSession(@CurrentUser() user: JwtPayload, @Body() dto: CreateSessionDto) {
    return this.sessionsService.createSession(user.sub, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List user sessions' })
  async getUserSessions(@CurrentUser() user: JwtPayload) {
    return this.sessionsService.getUserSessions(user.sub);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get session details' })
  async getSession(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    return this.sessionsService.getSession(user.sub, id);
  }

  @Get(':id/progress')
  @ApiOperation({ summary: 'Get latest progress for session' })
  async getLatestProgress(@Param('id', ParseObjectIdPipe) id: string) {
    return this.sessionsService.getLatestProgress(id);
  }

  @Post(':id/choice')
  @ApiOperation({ summary: 'Submit user choice and get next scene' })
  @ApiResponse({ status: 201, description: 'Choice submitted, new progress returned' })
  async submitChoice(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: SubmitChoiceDto,
  ) {
    return this.sessionsService.submitChoice(user.sub, id, dto);
  }
}
