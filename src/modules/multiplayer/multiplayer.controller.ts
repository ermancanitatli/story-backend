import { Controller, Post, Get, Patch, Param, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { MultiplayerService } from './multiplayer.service';
import { MultiplayerGateway } from './multiplayer.gateway';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';

@ApiTags('Multiplayer')
@ApiBearerAuth()
@Controller('multiplayer')
export class MultiplayerController {
  constructor(
    private multiplayerService: MultiplayerService,
    private multiplayerGateway: MultiplayerGateway,
  ) {}

  @Post('invite')
  @ApiOperation({ summary: 'Create multiplayer invite' })
  async invite(
    @CurrentUser() user: JwtPayload,
    @Body() body: { guestId: string; storyId: string },
  ) {
    const session = await this.multiplayerService.createSession(user.sub, body.guestId, body.storyId);
    this.multiplayerGateway.emitSessionUpdate(session._id.toString(), session);
    return session;
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get multiplayer session' })
  async getSession(@Param('id', ParseObjectIdPipe) id: string) {
    return this.multiplayerService.getSession(id);
  }

  @Patch(':id/name')
  @ApiOperation({ summary: 'Submit player name' })
  async submitName(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() body: { name: string },
  ) {
    const session = await this.multiplayerService.updateSessionField(id, user.sub, 'name', body.name);
    this.multiplayerGateway.emitSessionUpdate(id, session);
    return session;
  }

  @Patch(':id/gender')
  @ApiOperation({ summary: 'Submit player gender' })
  async submitGender(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() body: { gender: string },
  ) {
    const session = await this.multiplayerService.updateSessionField(id, user.sub, 'gender', body.gender);
    this.multiplayerGateway.emitSessionUpdate(id, session);
    return session;
  }

  @Post(':id/accept')
  @ApiOperation({ summary: 'Accept multiplayer session' })
  async accept(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    const session = await this.multiplayerService.updateSessionField(id, user.sub, 'accepted', true);
    this.multiplayerGateway.emitSessionUpdate(id, session);
    return session;
  }

  @Post(':id/choice')
  @ApiOperation({ summary: 'Submit multiplayer choice' })
  async submitChoice(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() body: { choiceId: string; choiceText: string; choiceType?: string },
  ) {
    const progress = await this.multiplayerService.submitChoice(id, user.sub, {
      id: body.choiceId,
      text: body.choiceText,
      type: body.choiceType,
    });

    // Emit real-time events
    this.multiplayerGateway.emitProgressNew(id, progress);

    if (progress.isEnding) {
      this.multiplayerGateway.emitSessionCompleted(id, { endingType: progress.endingType });
    }

    return progress;
  }

  @Get(':id/progress')
  @ApiOperation({ summary: 'Get latest multiplayer progress' })
  async getProgress(@Param('id', ParseObjectIdPipe) id: string) {
    return this.multiplayerService.getLatestProgress(id);
  }
}
