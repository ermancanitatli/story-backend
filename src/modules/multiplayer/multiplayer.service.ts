import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { MultiplayerSession } from './schemas/multiplayer-session.schema';
import { MultiplayerProgress } from './schemas/multiplayer-progress.schema';
import { StoriesService } from '../stories/stories.service';
import { AiService } from '../ai/ai.service';
import { buildSystemPrompt, buildUserMessage } from '../ai/prompts/system-prompt.builder';

@Injectable()
export class MultiplayerService {
  private readonly logger = new Logger(MultiplayerService.name);

  constructor(
    @InjectModel(MultiplayerSession.name) private sessionModel: Model<MultiplayerSession>,
    @InjectModel(MultiplayerProgress.name) private progressModel: Model<MultiplayerProgress>,
    private storiesService: StoriesService,
    private aiService: AiService,
  ) {}

  async createSession(hostId: string, guestId: string, storyId: string): Promise<MultiplayerSession> {
    const story = await this.storiesService.findById(storyId);
    return this.sessionModel.create({
      hostId: new Types.ObjectId(hostId),
      guestId: new Types.ObjectId(guestId),
      storyId: new Types.ObjectId(storyId),
      phase: 'invite',
      activePlayerId: new Types.ObjectId(hostId),
      nextPlayerId: new Types.ObjectId(guestId),
      storyClone: { title: story.title, genre: story.genre, summary: story.summary, characters: story.characters, chapters: story.chapters },
      emotionalStates: { intimacy: 0, anger: 0, worry: 0, trust: 0, excitement: 0, sadness: 0 },
    });
  }

  async createSessionFromMatchmaking(hostId: string, guestId: string): Promise<MultiplayerSession> {
    return this.sessionModel.create({
      hostId: new Types.ObjectId(hostId),
      guestId: new Types.ObjectId(guestId),
      phase: 'character-selection',
      activePlayerId: new Types.ObjectId(hostId),
      nextPlayerId: new Types.ObjectId(guestId),
      emotionalStates: { intimacy: 0, anger: 0, worry: 0, trust: 0, excitement: 0, sadness: 0 },
    });
  }

  async getSession(sessionId: string): Promise<MultiplayerSession> {
    const session = await this.sessionModel.findById(sessionId);
    if (!session) throw new NotFoundException('Session not found');
    return session;
  }

  async updateSessionField(sessionId: string, userId: string, field: string, value: any): Promise<MultiplayerSession> {
    const session = await this.getSession(sessionId);
    const isHost = session.hostId.toString() === userId;
    const isGuest = session.guestId.toString() === userId;
    if (!isHost && !isGuest) throw new BadRequestException('Not a participant');

    const update: any = {};
    if (field === 'name') update[isHost ? 'hostName' : 'guestName'] = value;
    else if (field === 'gender') update[isHost ? 'hostGender' : 'guestGender'] = value;
    else if (field === 'accepted') update[isHost ? 'hostAccepted' : 'guestAccepted'] = value;

    let updated = await this.sessionModel.findByIdAndUpdate(sessionId, update, { new: true });

    // Phase transition: invite → character-selection (both accepted)
    if (updated!.hostAccepted && updated!.guestAccepted && updated!.phase === 'invite') {
      updated = await this.sessionModel.findByIdAndUpdate(sessionId, { phase: 'character-selection' }, { new: true });
    }

    // Phase transition: character-selection → playing (both have name & gender)
    if (
      updated!.phase === 'character-selection' &&
      updated!.hostName && updated!.guestName &&
      updated!.hostGender && updated!.guestGender
    ) {
      updated = await this.sessionModel.findByIdAndUpdate(sessionId, { phase: 'playing' }, { new: true });
    }

    return updated!;
  }

  async submitChoice(sessionId: string, userId: string, choice: { id: string; text: string; type?: string }): Promise<MultiplayerProgress> {
    const session = await this.getSession(sessionId);
    if (session.phase !== 'playing') throw new BadRequestException('Session not in playing phase');
    if (session.activePlayerId?.toString() !== userId) throw new BadRequestException('Not your turn');

    // Save choice to current progress
    if (session.lastProgressId) {
      await this.progressModel.findByIdAndUpdate(session.lastProgressId, {
        userChoice: { id: choice.id, text: choice.text, type: choice.type || 'action' },
      });
    }

    // Generate next scene
    const recentDocs = await this.progressModel.find({ sessionId: session._id }).sort({ turnOrder: -1 }).limit(10);
    const recentHistory = recentDocs.reverse().map((p) => p.currentScene);

    const clone = session.storyClone || {};
    const systemPrompt = buildSystemPrompt({
      storyTitle: clone.title || '',
      storySummary: clone.summary || '',
      characters: (clone.characters || []) as any[],
      currentChapter: session.currentChapter,
      emotionalStates: session.emotionalStates as any,
      censorship: true,
      isMultiplayer: true,
      hostName: session.hostName,
      guestName: session.guestName,
      activePlayerName: session.nextPlayerId?.toString() === session.hostId?.toString() ? session.hostName : session.guestName,
    });
    const userMessage = buildUserMessage({ type: 'continue', userChoice: choice.text, recentHistory });

    const grokResponse = await this.aiService.callGrokAPI({ systemPrompt, userMessage });

    // Create progress
    const newTurn = session.turnOrder + 1;
    const progress = await this.progressModel.create({
      sessionId: session._id,
      activePlayerId: session.nextPlayerId,
      turnOrder: newTurn,
      currentScene: grokResponse.currentScene,
      choices: grokResponse.choices,
      currentChapter: session.currentChapter,
      effects: grokResponse.effects,
      isEnding: grokResponse.isEnding || false,
      endingType: grokResponse.endingType,
    });

    // Swap turns
    const sessionUpdate: any = {
      activePlayerId: session.nextPlayerId,
      nextPlayerId: session.activePlayerId,
      turnOrder: newTurn,
      lastProgressId: progress._id.toString(),
      currentStep: session.currentStep + 1,
    };
    if (grokResponse.isEnding) {
      sessionUpdate.phase = 'ended';
      sessionUpdate.completedAt = new Date();
    }
    await this.sessionModel.findByIdAndUpdate(sessionId, sessionUpdate);

    return progress;
  }

  async getLatestProgress(sessionId: string): Promise<MultiplayerProgress | null> {
    return this.progressModel.findOne({ sessionId: new Types.ObjectId(sessionId) }).sort({ turnOrder: -1 });
  }
}
