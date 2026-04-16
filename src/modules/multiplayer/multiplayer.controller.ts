import { Controller, Post, Get, Patch, Param, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { MultiplayerService } from './multiplayer.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';

@ApiTags('Multiplayer')
@ApiBearerAuth()
@Controller('multiplayer')
export class MultiplayerController {
  constructor(private multiplayerService: MultiplayerService) {}

  @Post('invite')
  @ApiOperation({ summary: 'Create multiplayer invite' })
  async invite(
    @CurrentUser() user: JwtPayload,
    @Body() body: { guestId: string; storyId: string },
  ) {
    return this.multiplayerService.createSession(user.sub, body.guestId, body.storyId);
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
    return this.multiplayerService.updateSessionField(id, user.sub, 'name', body.name);
  }

  @Patch(':id/gender')
  @ApiOperation({ summary: 'Submit player gender' })
  async submitGender(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() body: { gender: string },
  ) {
    return this.multiplayerService.updateSessionField(id, user.sub, 'gender', body.gender);
  }

  @Post(':id/accept')
  @ApiOperation({ summary: 'Accept multiplayer session' })
  async accept(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    return this.multiplayerService.updateSessionField(id, user.sub, 'accepted', true);
  }

  @Post(':id/choice')
  @ApiOperation({ summary: 'Submit multiplayer choice' })
  async submitChoice(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() body: { choiceId: string; choiceText: string; choiceType?: string },
  ) {
    return this.multiplayerService.submitChoice(id, user.sub, {
      id: body.choiceId,
      text: body.choiceText,
      type: body.choiceType,
    });
  }

  @Get(':id/progress')
  @ApiOperation({ summary: 'Get latest multiplayer progress' })
  async getProgress(@Param('id', ParseObjectIdPipe) id: string) {
    return this.multiplayerService.getLatestProgress(id);
  }
}
