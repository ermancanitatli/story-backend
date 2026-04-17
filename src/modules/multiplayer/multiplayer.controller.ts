import { Controller, Post, Get, Patch, Param, Body, Inject, forwardRef } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { MultiplayerService } from './multiplayer.service';
import { AppGateway } from '../socket/app.gateway';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { FakeMoveService } from '../fake-users/fake-move.service';
import { UsersService } from '../users/users.service';

@ApiTags('Multiplayer')
@ApiBearerAuth()
@Controller('multiplayer')
export class MultiplayerController {
  constructor(
    private multiplayerService: MultiplayerService,
    @Inject(forwardRef(() => AppGateway)) private appGateway: AppGateway,
    @Inject(forwardRef(() => FakeMoveService)) private fakeMoveService: FakeMoveService,
    private usersService: UsersService,
  ) {}

  @Post('invite')
  @ApiOperation({ summary: 'Create multiplayer invite' })
  async invite(
    @CurrentUser() user: JwtPayload,
    @Body() body: { guestId: string; storyId: string },
  ) {
    const session = await this.multiplayerService.createSession(user.sub, body.guestId, body.storyId);
    this.appGateway.emitSessionUpdate(session._id.toString(), session);
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
    this.appGateway.emitSessionUpdate(id, session);
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
    this.appGateway.emitSessionUpdate(id, session);
    return session;
  }

  @Post(':id/accept')
  @ApiOperation({ summary: 'Accept multiplayer session' })
  async accept(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    const session = await this.multiplayerService.updateSessionField(id, user.sub, 'accepted', true);
    this.appGateway.emitSessionUpdate(id, session);
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

    // Emit real-time events (dil bazlı lokalize)
    const session = await this.multiplayerService.getSession(id);
    this.appGateway.emitLocalizedProgress(
      id,
      progress,
      session.hostId.toString(),
      session.guestId.toString(),
      session.hostLanguageCode || 'en',
      session.guestLanguageCode || 'en',
    );

    if (progress.isEnding) {
      this.appGateway.emitSessionCompleted(id, { endingType: progress.endingType });
    }

    // Sonraki oyuncu fake user ise otomatik hamle planla
    if (!progress.isEnding && progress.activePlayerId) {
      const nextUser = await this.usersService.findById(progress.activePlayerId.toString());
      if (nextUser?.isFake) {
        this.fakeMoveService.scheduleFakeMove(id, progress.activePlayerId.toString());
      }
    }

    return progress;
  }

  @Get(':id/progress')
  @ApiOperation({ summary: 'Get latest multiplayer progress' })
  async getProgress(@Param('id', ParseObjectIdPipe) id: string) {
    return this.multiplayerService.getLatestProgress(id);
  }
}
