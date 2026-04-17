import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { MultiplayerSession } from './schemas/multiplayer-session.schema';
import { MultiplayerProgress } from './schemas/multiplayer-progress.schema';
import { StoriesService } from '../stories/stories.service';
import { AiService } from '../ai/ai.service';
import { buildSystemPrompt, buildUserMessage } from '../ai/prompts/system-prompt.builder';
import { UsersService } from '../users/users.service';

@Injectable()
export class MultiplayerService {
  private readonly logger = new Logger(MultiplayerService.name);

  constructor(
    @InjectModel(MultiplayerSession.name) private sessionModel: Model<MultiplayerSession>,
    @InjectModel(MultiplayerProgress.name) private progressModel: Model<MultiplayerProgress>,
    private storiesService: StoriesService,
    private aiService: AiService,
    private usersService: UsersService,
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

  /**
   * Matchmaking sonrası session oluştur.
   * Kullanıcı profillerinden isim/cinsiyet otomatik alınır,
   * rastgele hikaye seçilir ve doğrudan 'playing' phase'inde başlatılır.
   * İlk AI sahnesi arka planda üretilir.
   */
  async createSessionFromMatchmaking(hostId: string, guestId: string): Promise<MultiplayerSession> {
    // Kullanıcı profillerini çek
    const [hostUser, guestUser] = await Promise.all([
      this.usersService.findById(hostId),
      this.usersService.findById(guestId),
    ]);

    const hostName = hostUser?.displayName || hostUser?.userHandle || 'Player 1';
    const guestName = guestUser?.displayName || guestUser?.userHandle || 'Player 2';
    const hostGender = hostUser?.appSettings?.extra?.multiplayerGender || 'male';
    const guestGender = guestUser?.appSettings?.extra?.multiplayerGender || 'female';

    // Rastgele hikaye seç
    const result = await this.storiesService.findAll({ page: 1, limit: 50 });
    const stories = result.data;
    if (!stories || stories.length === 0) {
      throw new BadRequestException('No stories available for matchmaking');
    }
    const picked = stories[Math.floor(Math.random() * stories.length)];
    const storyId = picked._id as Types.ObjectId;
    const storyClone = {
      title: picked.title,
      genre: picked.genre,
      summary: picked.summary,
      characters: picked.characters,
      chapters: picked.chapters,
    };

    const session = await this.sessionModel.create({
      hostId: new Types.ObjectId(hostId),
      guestId: new Types.ObjectId(guestId),
      storyId,
      phase: 'playing',
      activePlayerId: new Types.ObjectId(hostId),
      nextPlayerId: new Types.ObjectId(guestId),
      hostName,
      guestName,
      hostGender,
      guestGender,
      hostAccepted: true,
      guestAccepted: true,
      storyClone,
      emotionalStates: { intimacy: 0, anger: 0, worry: 0, trust: 0, excitement: 0, sadness: 0 },
    });

    // İlk AI sahnesini senkron üret — iOS session fetch ettiğinde progress hazır olur
    try {
      await this.generateInitialScene(session);
    } catch (err) {
      this.logger.error(`Initial scene generation failed for session ${session._id}: ${(err as Error).message}`);
    }

    return session;
  }

  /**
   * İlk AI sahnesini üret ve progress olarak kaydet.
   */
  private async generateInitialScene(session: MultiplayerSession): Promise<void> {
    const clone = session.storyClone || {};
    const systemPrompt = buildSystemPrompt({
      storyTitle: clone.title || 'Interactive Story',
      storySummary: clone.summary || '',
      characters: (clone.characters || []) as any[],
      currentChapter: 1,
      emotionalStates: session.emotionalStates as any,
      censorship: true,
      isMultiplayer: true,
      hostName: session.hostName,
      guestName: session.guestName,
      activePlayerName: session.hostName,
    });
    const userMessage = buildUserMessage({ type: 'start', userChoice: '', recentHistory: [] });

    const grokResponse = await this.aiService.callGrokAPI({ systemPrompt, userMessage });

    // Choices'ı normalize et — Grok bazen farklı format dönebiliyor
    const normalizedChoices = this.normalizeChoices(grokResponse.choices);

    const progress = await this.progressModel.create({
      sessionId: session._id,
      activePlayerId: session.activePlayerId,
      turnOrder: 1,
      currentScene: grokResponse.currentScene,
      choices: normalizedChoices,
      currentChapter: 1,
      effects: grokResponse.effects,
      isEnding: false,
    });

    await this.sessionModel.findByIdAndUpdate(session._id, {
      lastProgressId: progress._id.toString(),
      turnOrder: 1,
      currentStep: 1,
    });

    this.logger.log(`Initial scene generated for matchmaking session ${session._id}`);
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
      choices: this.normalizeChoices(grokResponse.choices),
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

  /**
   * Grok API'den dönen choices'ı normalize et.
   * Grok bazen farklı formatlar dönebiliyor (string, obje, eksik alanlar).
   */
  private normalizeChoices(choices: any): { id: string; text: string; type: string }[] {
    if (!Array.isArray(choices)) {
      this.logger.warn(`Choices is not an array, creating defaults`);
      return [
        { id: '1', text: 'Continue the conversation', type: 'dialogue' },
        { id: '2', text: 'Explore the surroundings', type: 'exploration' },
        { id: '3', text: 'Take a bold action', type: 'action' },
        { id: '4', text: 'Make a careful decision', type: 'decision' },
      ];
    }

    return choices.map((c: any, i: number) => {
      if (typeof c === 'string') {
        return { id: String(i + 1), text: c, type: 'action' };
      }
      return {
        id: String(c.id ?? c._id ?? i + 1),
        text: String(c.text ?? c.label ?? c.description ?? `Choice ${i + 1}`),
        type: String(c.type ?? 'action'),
      };
    });
  }
}
