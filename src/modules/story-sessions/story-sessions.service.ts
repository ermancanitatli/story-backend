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
      languageCode: dto.languageCode,
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
      languageCode: session.languageCode,
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
   * Tek session ve progress'lerini sil.
   */
  async deleteSession(userId: string, sessionId: string): Promise<{ deleted: number }> {
    const objectId = new Types.ObjectId(sessionId);
    const result = await this.sessionModel.deleteOne({
      _id: objectId,
      userId: new Types.ObjectId(userId),
    });
    if (result.deletedCount === 0) {
      throw new NotFoundException('Session not found');
    }
    await this.progressModel.deleteMany({ sessionId: objectId });
    return { deleted: result.deletedCount };
  }

  /**
   * Birden fazla session'ı veya tamamını sil.
   */
  async batchDelete(
    userId: string,
    ids?: string[],
    all: boolean = false,
  ): Promise<{ deleted: number }> {
    const userObjectId = new Types.ObjectId(userId);

    if (all) {
      const sessions = await this.sessionModel.find({ userId: userObjectId }).select('_id').exec();
      const sessionIds = sessions.map((s) => s._id);
      if (sessionIds.length === 0) return { deleted: 0 };

      await this.progressModel.deleteMany({ sessionId: { $in: sessionIds } });
      const result = await this.sessionModel.deleteMany({ userId: userObjectId });
      return { deleted: result.deletedCount };
    }

    if (!ids || ids.length === 0) return { deleted: 0 };

    const objectIds = ids.map((id) => new Types.ObjectId(id));
    await this.progressModel.deleteMany({
      sessionId: { $in: objectIds },
      userId: userObjectId,
    });
    const result = await this.sessionModel.deleteMany({
      _id: { $in: objectIds },
      userId: userObjectId,
    });
    return { deleted: result.deletedCount };
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

    // === CHAPTER TRANSITION DETECTION (Grok çağrısından ÖNCE) ===
    // Bu step chapter boundary'yi geçiyor mu?
    const newChapterStepPreview = session.chapterStepCount + 1;
    const willTransition =
      type !== 'start' && newChapterStepPreview >= STEPS_PER_CHAPTER;
    const nextChapterIdx = willTransition
      ? session.currentChapter // 0-indexed next chapter in array (currentChapter 1-based, array 0-based)
      : -1;
    const nextChapter =
      willTransition && clone?.chapters && nextChapterIdx < clone.chapters.length
        ? clone.chapters[nextChapterIdx]
        : null;

    // Chapter transition + admin startingScene yazmışsa Grok'u atla
    const locale = params.languageCode || 'en';
    const nextChapterStartingScene = nextChapter
      ? nextChapter.startingSceneTranslations?.[locale] ||
        nextChapter.startingSceneTranslations?.['en'] ||
        nextChapter.startingScene ||
        null
      : null;

    // === Önceki chapter için one-shot transition block (chapter'a girdikten SONRAKİ ilk user choice'ta) ===
    // session.chapterStepCount === 0 && currentChapter > 1 ise, bu adım yeni chapter'ın 2. sahnesi.
    // Önceki chapter'ın gerçekte ne olduğunu Grok'a hatırlatmamız lazım.
    const justEnteredNewChapter =
      type === 'continue' && session.chapterStepCount === 0 && session.currentChapter > 1;
    const currentChapterIdx = session.currentChapter - 1; // 0-based
    const currentChapterData =
      clone?.chapters && currentChapterIdx >= 0 && currentChapterIdx < clone.chapters.length
        ? clone.chapters[currentChapterIdx]
        : null;
    const previousChapterData =
      clone?.chapters && currentChapterIdx - 1 >= 0
        ? clone.chapters[currentChapterIdx - 1]
        : null;

    let transitionBlock: string | undefined;
    if (justEnteredNewChapter && currentChapterData) {
      const curTitle = currentChapterData.title || '';
      const curSummary =
        currentChapterData.summary || '';
      const prevTitle = previousChapterData?.title || 'Previous chapter';
      transitionBlock = [
        `[CHAPTER TRANSITION — MANDATORY]`,
        `The previous chapter "${prevTitle}" just ended.`,
        `You are now in: "${curTitle}".`,
        curSummary ? `Chapter context (must be honored): ${curSummary}` : '',
        `Override any conflicting location/time/state from recent history if needed. The player is now in the new chapter's context. Respond from this new situation.`,
      ]
        .filter(Boolean)
        .join('\n');
    }

    // Prompt oluştur
    const promptParams: PromptParams = {
      storyTitle: clone?.title || 'Untitled',
      storySummary: clone?.summary || '',
      characters: (clone?.characters || []) as any[],
      currentChapter: session.currentChapter,
      chapterTitle: currentChapterData?.title,
      chapterSummary: currentChapterData?.summary,
      playerName: params.playerName,
      playerGender: params.playerGender,
      languageCode: params.languageCode,
      emotionalStates: session.emotionalStates as any,
      censorship: true,
      recentHistory,
      transitionBlock,
    } as any;

    // === CHAPTER TRANSITION PATH: Admin startingScene yazmışsa Grok atla ===
    type GrokLikeResponse = {
      currentScene?: string;
      scenes?: any;
      choices?: any;
      effects?: any;
      isEnding?: boolean;
      endingType?: string;
    };
    let grokResponse: GrokLikeResponse;
    let skippedGrok = false;

    if (willTransition && nextChapterStartingScene) {
      this.logger.log(
        `[chapter-transition] Skipping Grok for session ${session._id} — using deterministic startingScene for chapter ${(nextChapterIdx as number) + 1}`,
      );
      // Default 4 generic "continue" choice'u üret — AI sonraki adımda gerçek seçimleri üretecek
      grokResponse = {
        currentScene: nextChapterStartingScene,
        choices: [
          { id: 'c1', text: 'Devam et', type: 'neutral' },
          { id: 'c2', text: 'Etrafı incele', type: 'neutral' },
          { id: 'c3', text: 'Düşün', type: 'neutral' },
          { id: 'c4', text: 'Harekete geç', type: 'neutral' },
        ],
        effects: { emotionalChanges: {} },
        isEnding: false,
      };
      skippedGrok = true;
    } else {
      const systemPrompt = buildSystemPrompt(promptParams);
      const userMessage = buildUserMessage({
        type,
        userChoice,
        recentHistory,
      } as any);

      // Grok API çağrısı
      grokResponse = await this.aiService.callGrokAPI({
        systemPrompt,
        userMessage,
      });
    }

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

    // Skip Grok path için logger bilgisi
    if (skippedGrok) {
      this.logger.log(
        `[chapter-transition] Deterministic chapter ${newChapter} intro delivered`,
      );
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
      storyProgress: grokResponse.isEnding ? 100 : Math.min(Math.round((newStep / 50) * 100), 99),
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
