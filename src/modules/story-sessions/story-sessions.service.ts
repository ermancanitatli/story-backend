import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { StorySession } from './schemas/story-session.schema';
import { StoryProgress } from './schemas/story-progress.schema';
import { StoriesService } from '../stories/stories.service';
import { AiService, GrokResponse } from '../ai/ai.service';
import { buildSystemPrompt, buildUserMessage, PromptParams } from '../ai/prompts/system-prompt.builder';
import { CreateSessionDto } from './dto/create-session.dto';
import { SubmitChoiceDto } from './dto/submit-choice.dto';

const EMOTION_MULTIPLIER = 3;
const STEPS_PER_CHAPTER = 8;

@Injectable()
export class StorySessionsService {
  private readonly logger = new Logger(StorySessionsService.name);

  constructor(
    @InjectModel(StorySession.name) private sessionModel: Model<StorySession>,
    @InjectModel(StoryProgress.name) private progressModel: Model<StoryProgress>,
    private storiesService: StoriesService,
    private aiService: AiService,
  ) {}

  /**
   * Yeni story session olu��tur ve ilk Grok çağrısını yap.
   */
  async createSession(userId: string, dto: CreateSessionDto): Promise<{
    session: StorySession;
    progress: StoryProgress;
  }> {
    const story = await this.storiesService.findById(dto.storyId);

    // Story clone oluştur
    const storyClone = {
      title: story.title,
      genre: story.genre,
      summary: story.summary,
      characters: story.characters || [],
      chapters: story.chapters || [],
      customization: dto.customizations || {},
    };

    // Session oluştur
    const session = await this.sessionModel.create({
      userId: new Types.ObjectId(userId),
      storyId: new Types.ObjectId(dto.storyId),
      status: 'active',
      storyClone,
      currentChapter: 1,
      chapterStepCount: 0,
      currentStep: 0,
      storyProgress: 0,
      emotionalStates: { intimacy: 0, anger: 0, worry: 0, trust: 0, excitement: 0, sadness: 0 },
      lastPlayedAt: new Date(),
    });

    // İlk Grok çağrısı
    const progress = await this.processStoryRequest({
      session,
      type: 'start',
      playerName: dto.playerName,
      playerGender: dto.playerGender,
      languageCode: dto.languageCode,
    });

    return { session, progress };
  }

  /**
   * Kullanıcı seçim gönderdi — yeni Grok çağrısı yap.
   */
  async submitChoice(userId: string, sessionId: string, dto: SubmitChoiceDto): Promise<StoryProgress> {
    const session = await this.sessionModel.findOne({
      _id: sessionId,
      userId: new Types.ObjectId(userId),
    });

    if (!session) throw new NotFoundException('Session not found');
    if (session.status !== 'active') throw new BadRequestException('Session is not active');

    // Mevcut progress'e user choice kaydet
    if (session.lastProgressId) {
      await this.progressModel.findByIdAndUpdate(session.lastProgressId, {
        userChoice: {
          id: dto.choiceId,
          text: dto.choiceText,
          type: dto.choiceType || 'action',
        },
      });
    }

    // Yeni Grok çağrısı
    const progress = await this.processStoryRequest({
      session,
      type: 'continue',
      userChoice: dto.choiceText,
    });

    return progress;
  }

  /**
   * Session bilgilerini getir.
   */
  async getSession(userId: string, sessionId: string): Promise<StorySession> {
    const session = await this.sessionModel.findOne({
      _id: sessionId,
      userId: new Types.ObjectId(userId),
    });
    if (!session) throw new NotFoundException('Session not found');
    return session;
  }

  /**
   * Son progress'i getir.
   */
  async getLatestProgress(sessionId: string): Promise<StoryProgress | null> {
    return this.progressModel
      .findOne({ sessionId: new Types.ObjectId(sessionId) })
      .sort({ stepNumber: -1 })
      .exec();
  }

  /**
   * Kullanıcının tüm session'larını listele.
   */
  async getUserSessions(userId: string): Promise<StorySession[]> {
    return this.sessionModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ lastPlayedAt: -1 })
      .limit(50)
      .exec();
  }

  /**
   * Grok API çağrıs�� yap ve progress kaydet.
   */
  private async processStoryRequest(params: {
    session: StorySession;
    type: 'start' | 'continue';
    userChoice?: string;
    playerName?: string;
    playerGender?: string;
    languageCode?: string;
  }): Promise<StoryProgress> {
    const { session, type, userChoice } = params;
    const clone = session.storyClone;

    // Recent history (son 10 progress)
    const recentProgressDocs = await this.progressModel
      .find({ sessionId: session._id })
      .sort({ stepNumber: -1 })
      .limit(10)
      .exec();
    const recentHistory = recentProgressDocs
      .reverse()
      .map((p) => p.currentScene)
      .filter(Boolean);

    // Prompt oluştur
    const promptParams: PromptParams = {
      storyTitle: clone?.title || 'Untitled',
      storySummary: clone?.summary || '',
      characters: (clone?.characters || []) as any[],
      currentChapter: session.currentChapter,
      playerName: params.playerName,
      playerGender: params.playerGender,
      languageCode: params.languageCode,
      emotionalStates: session.emotionalStates as any,
      censorship: true,
      recentHistory,
    };

    const systemPrompt = buildSystemPrompt(promptParams);
    const userMessage = buildUserMessage({
      type,
      userChoice,
      recentHistory,
    });

    // Grok API çağrısı
    const grokResponse = await this.aiService.callGrokAPI({
      systemPrompt,
      userMessage,
    });

    // Emotional state hesapla (×3 multiplier, clamp -100 to +100)
    const emotionalChanges = grokResponse.effects?.emotionalChanges || {};
    const updatedEmotions = { ...session.emotionalStates };
    for (const [key, delta] of Object.entries(emotionalChanges)) {
      if (key in updatedEmotions) {
        const current = (updatedEmotions as any)[key] || 0;
        (updatedEmotions as any)[key] = Math.max(
          -100,
          Math.min(100, current + (delta as number) * EMOTION_MULTIPLIER),
        );
      }
    }

    // Chapter progress hesapla
    const newStep = session.currentStep + 1;
    const newChapterStep = session.chapterStepCount + 1;
    let newChapter = session.currentChapter;
    let isChapterTransition = false;

    if (newChapterStep >= STEPS_PER_CHAPTER && !grokResponse.isEnding) {
      newChapter += 1;
      isChapterTransition = true;
    }

    // Progress kaydet
    const progress = await this.progressModel.create({
      sessionId: session._id,
      userId: session.userId,
      stepNumber: newStep,
      currentScene: grokResponse.currentScene,
      choices: grokResponse.choices,
      currentChapter: newChapter,
      chapterStepCount: isChapterTransition ? 0 : newChapterStep,
      effects: grokResponse.effects,
      emotionalStates: emotionalChanges,
      isChapterTransition,
      isEnding: grokResponse.isEnding || false,
      endingType: grokResponse.endingType,
    });

    // Session güncelle
    const sessionUpdate: any = {
      currentStep: newStep,
      currentChapter: newChapter,
      chapterStepCount: isChapterTransition ? 0 : newChapterStep,
      emotionalStates: updatedEmotions,
      lastPlayedAt: new Date(),
      lastProgressId: progress._id.toString(),
    };

    if (grokResponse.isEnding) {
      sessionUpdate.status = 'completed';
      sessionUpdate.completedAt = new Date();
    }

    await this.sessionModel.findByIdAndUpdate(session._id, sessionUpdate);

    this.logger.log(
      `Progress created: session=${session._id}, step=${newStep}, chapter=${newChapter}${grokResponse.isEnding ? ' [ENDING]' : ''}`,
    );

    return progress;
  }
}
