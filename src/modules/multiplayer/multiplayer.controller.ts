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

  @Get()
  @ApiOperation({ summary: 'List user multiplayer sessions' })
  async listSessions(@CurrentUser() user: JwtPayload) {
    return this.multiplayerService.getUserSessions(user.sub);
  }

  @Post('batch-delete')
  @ApiOperation({ summary: 'Delete multiplayer sessions' })
  async deleteSessions(
    @CurrentUser() user: JwtPayload,
    @Body() body: { sessionIds: string[] },
  ) {
    const deleted = await this.multiplayerService.deleteSessions(user.sub, body.sessionIds);
    return { deleted };
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

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel a multiplayer session' })
  async cancelSession(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() body: { reason?: string },
  ) {
    const session = await this.multiplayerService.cancelSession(id, user.sub, body?.reason);
    this.appGateway.emitSessionUpdate(id, session);
    return session;
  }

  @Post(':id/decline')
  @ApiOperation({ summary: 'Decline a multiplayer invite' })
  async declineSession(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    const session = await this.multiplayerService.cancelSession(id, user.sub, 'declined');
    this.appGateway.emitSessionUpdate(id, session);
    return session;
  }

  @Get(':id/progress')
  @ApiOperation({ summary: 'Get latest multiplayer progress (localized)' })
  async getProgress(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    const progress = await this.multiplayerService.getLatestProgress(id);
    if (!progress) return null;

    // Multi-perspective veya bilingual progress ise kullanıcının rolüne/diline göre lokalize et
    const scenesObj = (progress as any).scenes;
    if (scenesObj) {
      const session = await this.multiplayerService.getSession(id);
      const isHost = session.hostId.toString() === user.sub;
      const lang = isHost
        ? session.hostLanguageCode || 'en'
        : session.guestLanguageCode || 'en';

      const plain =
        typeof (progress as any).toObject === 'function'
          ? (progress as any).toObject()
          : { ...progress };

      // 1) Same-language dual perspective → scenes.host / scenes.guest
      if (scenesObj.host || scenesObj.guest) {
        plain.currentScene =
          (isHost ? scenesObj.host : scenesObj.guest) ||
          scenesObj.host ||
          scenesObj.guest ||
          progress.currentScene;
      } else {
        // 2) Bilingual → scenes[lang]
        plain.currentScene =
          scenesObj[lang] || Object.values(scenesObj)[0] || progress.currentScene;
      }

      plain.choices =
        (progress as any).localizedChoices?.[lang] ||
        Object.values((progress as any).localizedChoices || {})[0] ||
        progress.choices;

      delete plain.scenes;
      delete plain.localizedChoices;
      return plain;
    }

    return progress;
  }
}
