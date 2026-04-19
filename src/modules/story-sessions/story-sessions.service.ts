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

// Memory / rolling summary kuralları
const ROLLING_SUMMARY_INTERVAL = 5;       // Her N step'te async regenerate
const IMMEDIATE_SCENES_COUNT = 2;         // Son N sahne raw (Tier 1)
const ROLLING_SOURCE_WINDOW = 5;          // Özete sokulacak sahne sayısı (son N, Tier 1 hariç)
const MIN_STEPS_FOR_ROLLING = 3;          // Bu step'ten önce summary üretmeye gerek yok
const isRollingEnabled = () =>
  (process.env.ENABLE_ROLLING_SUMMARY ?? 'true').toLowerCase() !== 'false';

// Chapter transition kuralları (esnek pacing):
//   1..MIN_STEPS-1   → AI'a sorma, normal akış
//   MIN_STEPS..SOFT_STEPS → AI kararı: chapter kapanışı yapmak istiyor mu?
//   (SOFT_STEPS+1)..MAX_STEPS-1 → AI'a "hikayeyi chapter sonuna yönlendir" direktifi
//   MAX_STEPS → zorla transition
// Son chapter'da hiçbir tetikleme yok — hikaye isEnding ile kapanır.
const MIN_STEPS_PER_CHAPTER = 5;
const SOFT_STEPS_PER_CHAPTER = 7;
const MAX_STEPS_PER_CHAPTER = 10;

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

    // Recent history (son 10 progress) — descending order, [0] = en son step
    const recentProgressDocs = await this.progressModel
      .find({ sessionId: session._id })
      .sort({ stepNumber: -1 })
      .limit(10)
      .exec();
    // ⚠️ .reverse() in-place array'i değiştirdiği için orijinali koru
    const recentHistory = [...recentProgressDocs]
      .reverse()
      .map((p) => p.currentScene)
      .filter(Boolean);

    // === CHAPTER TRANSITION DECISION (esnek pacing) ===
    // Kurallar:
    //   1..4  → normal akış, chapter transition tetiklenmez
    //   5..7  → AI'a "kapanış doğal mı?" sor (suggestChapterTransition flag)
    //   8..9  → AI'a "hikayeyi chapter sonuna yönlendir" direktifi (pressure)
    //   10    → zorla transition
    //   Son chapter → hiçbir tetikleme yok (isEnding ile kapanır)
    const locale = params.languageCode || 'en';
    const currentChapterIdx = session.currentChapter - 1; // 0-based
    const currentChapterData: any =
      clone?.chapters && currentChapterIdx >= 0 && currentChapterIdx < clone.chapters.length
        ? clone.chapters[currentChapterIdx]
        : null;
    const totalChapters = clone?.chapters?.length || 0;
    const isLastChapter =
      totalChapters > 0 && session.currentChapter >= totalChapters;

    const nextStepCount = session.chapterStepCount + 1; // bu çağrı bittiğinde chapterStepCount bu olacak
    const isStartCall = type === 'start';

    // Pacing durumları
    const inSoftWindow =
      !isStartCall &&
      !isLastChapter &&
      nextStepCount >= MIN_STEPS_PER_CHAPTER &&
      nextStepCount <= SOFT_STEPS_PER_CHAPTER;
    const inPressureWindow =
      !isStartCall &&
      !isLastChapter &&
      nextStepCount > SOFT_STEPS_PER_CHAPTER &&
      nextStepCount < MAX_STEPS_PER_CHAPTER;
    const mustForceTransition =
      !isStartCall && !isLastChapter && nextStepCount >= MAX_STEPS_PER_CHAPTER;

    // pacingHint: AI'ya normal scene generation'da verilecek pacing talimatı
    // 'soft'    → "natural chapter ending olabilir, suggestChapterTransition=true döndür"
    // 'pressure'→ "hikayeyi chapter kapanışına yönlendir, doğal bir kapanış bul"
    // 'force'   → bu bir transition — ama henüz kullanmıyoruz (willTransition farklı)
    // 'none'    → normal akış
    let pacingHint: 'none' | 'soft' | 'pressure' = 'none';
    if (inSoftWindow) pacingHint = 'soft';
    else if (inPressureWindow) pacingHint = 'pressure';

    // Bu çağrı yeni chapter'a geçişin ilk sahnesi mi?
    // Karar verme mantığı: force → evet; pressure/soft → AI'nın önceki sahneden gelen
    // suggestChapterTransition flag'ine göre karar verilir. İlk çağrıda bunu bilmiyoruz
    // (Grok'tan henüz cevap gelmedi). Bu yüzden willTransition iki noktada hesaplanır:
    //   (a) Şimdi (bu fonksiyonun başında): sadece 'force' için true
    //   (b) Grok cevabı geldikten sonra: soft/pressure window'da AI suggest ettiyse true
    let willTransition = mustForceTransition;

    // Önceki progress'in suggestChapterTransition flag'ini kontrol et —
    // AI bir önceki step'te "kapanış hazır" dediyse bu step'i transition say.
    const lastProgress = recentProgressDocs[0]; // en son progress (reverse öncesi)
    const lastSuggested = (lastProgress as any)?.effects?.suggestChapterTransition === true;
    if (!isStartCall && !isLastChapter && lastSuggested && nextStepCount >= MIN_STEPS_PER_CHAPTER) {
      willTransition = true;
    }

    // Transition target chapter data
    const nextChapterIdx = willTransition ? session.currentChapter : -1;
    const nextChapterData: any =
      willTransition && clone?.chapters && nextChapterIdx < clone.chapters.length
        ? clone.chapters[nextChapterIdx]
        : null;

    // Hangi chapter'ın directive'ini kullanacağız? Transition varsa sonraki, yoksa mevcut.
    const directiveChapter = willTransition ? nextChapterData : currentChapterData;
    const transitionDirective = directiveChapter
      ? directiveChapter.transitionDirectiveTranslations?.[locale] ||
        directiveChapter.transitionDirectiveTranslations?.['en'] ||
        directiveChapter.transitionDirective ||
        undefined
      : undefined;

    // Transition mode — entering: chapter boundary'yi geçiyoruz VE directive dolu
    const hasDirective =
      !!transitionDirective &&
      (transitionDirective.timeDelta ||
        transitionDirective.location ||
        transitionDirective.mood ||
        transitionDirective.carryOver);
    // transitionMode: 'entering' ise chapter boundary'sindeyiz. Directive varsa
    // prompt'ta explicit director talimatı olur; yoksa sadece bridge summary + yeni chapter metadata.
    const transitionMode: 'none' | 'entering' =
      willTransition ? 'entering' : 'none';

    // === BRIDGE SUMMARY (her chapter transition'da üretilir, directive opsiyonel) ===
    // Directive olmasa bile bridge oluşturmalıyız ki yeni chapter AI'ı önceki chapter'ı
    // özetli biçimde görsün. Chapter 1'i bitirdik, key=currentChapter (ör: 1).
    let previousChapterBridge: string | undefined;
    if (willTransition) {
      const chapterKey = String(session.currentChapter);
      const cached = (session as any).bridgeSummaries?.[chapterKey];
      if (cached) {
        previousChapterBridge = cached;
      } else if (recentHistory.length > 0) {
        this.logger.log(
          `[chapter-transition] Generating bridge summary for chapter ${chapterKey} of session ${session._id}`,
        );
        const summary = await this.aiService.summarizeForTransition(
          recentHistory.join('\n'),
        );
        if (summary) {
          previousChapterBridge = summary;
          // Cache'le (async, await etme — yanıtı bloklama)
          this.sessionModel
            .updateOne(
              { _id: session._id },
              { $set: { [`bridgeSummaries.${chapterKey}`]: summary } },
            )
            .catch((err) =>
              this.logger.warn(
                `bridge summary cache write failed: ${err?.message || err}`,
              ),
            );
        }
      }
    }

    // Hangi chapter'ın metadata'sı system prompt'a gitsin?
    // Transition modda yeni chapter (girişini yapıyoruz), değilse mevcut chapter.
    const promptChapterData = transitionMode === 'entering' ? nextChapterData : currentChapterData;
    const promptChapterNumber =
      transitionMode === 'entering' ? session.currentChapter + 1 : session.currentChapter;

    // === MEMORY TIERS (Tier 1 raw + Tier 2 rolling + Tier 3 bridges) ===
    // Transition modda devre dışı — previousChapterBridge o path'i zaten kapatıyor.
    let effectiveRecentHistory = recentHistory;
    let tierRollingSummary: string | undefined;
    let tierChapterBridges: string[] | undefined;

    if (transitionMode === 'none' && isRollingEnabled()) {
      const rollingText = (session as any).rollingSummary?.text?.trim();
      const allBridges = Object.entries(
        (session as any).bridgeSummaries || {},
      ) as [string, string][];

      // Tier 3 — geçmiş chapter özetleri (current chapter'dan öncekiler, sıralı)
      if (allBridges.length > 0) {
        tierChapterBridges = allBridges
          .filter(([chKey]) => parseInt(chKey, 10) < session.currentChapter)
          .sort(([a], [b]) => parseInt(a, 10) - parseInt(b, 10))
          .map(([chKey, summary]) => `Chapter ${chKey}: ${summary}`);
        if (tierChapterBridges.length === 0) tierChapterBridges = undefined;
      }

      // Tier 2 — rolling summary
      if (rollingText) {
        tierRollingSummary = rollingText;
      }

      // Tier 1 — son 2 sahne raw (tier'lardan herhangi biri doluysa)
      if (tierRollingSummary || tierChapterBridges) {
        effectiveRecentHistory = recentHistory.slice(-IMMEDIATE_SCENES_COUNT);
      }
    }

    // Prompt params
    const promptParams: PromptParams = {
      storyTitle: clone?.title || 'Untitled',
      storySummary: clone?.summary || '',
      characters: (clone?.characters || []) as any[],
      currentChapter: promptChapterNumber,
      chapterTitle: promptChapterData?.title,
      chapterSummary: promptChapterData?.summary,
      playerName: params.playerName,
      playerGender: params.playerGender,
      languageCode: params.languageCode,
      emotionalStates: session.emotionalStates as any,
      censorship: true,
      recentHistory: effectiveRecentHistory,
      rollingSummary: tierRollingSummary,
      chapterBridges: tierChapterBridges,
      transitionMode,
      transitionDirective,
      previousChapterBridge,
      pacingHint,
      isLastChapter,
      totalChapters,
    };

    // === Grok çağrısı (gerekirse retry) ===
    const systemPrompt = buildSystemPrompt(promptParams);
    const userMessage = buildUserMessage({
      type,
      userChoice,
      recentHistory: effectiveRecentHistory,
      rollingSummary: tierRollingSummary,
      chapterBridges: tierChapterBridges,
      transitionMode,
      previousChapterBridge,
      currentChapter: promptChapterNumber,
      transitionDirective,
    });

    let grokResponse = await this.aiService.callGrokAPI({
      systemPrompt,
      userMessage,
    });

    // === CHOICE VALIDATION + RETRY (max 3 deneme) ===
    // Grok bazen text'siz choice döndürüyor ({id:"4"} gibi) veya eksik sayıda.
    // Her iki dil modunda da her choice'ın text'i dolu olmalı.
    // Fallback yok — AI düzeltene kadar (en fazla 3 ek deneme) tekrarlatırız.
    // Sonunda hala eksikse: geçerli olanlar alınır (en az 3 olmalı), değilse hata.
    const CHOICE_MAX_RETRIES = 3;
    let choiceRetry = 0;
    while (choiceRetry < CHOICE_MAX_RETRIES) {
      const check = this.validateChoicesStrict(grokResponse);
      if (check.valid) break;

      this.logger.warn(
        `[choice-validate] session=${session._id} step=${session.currentStep + 1} retry=${choiceRetry + 1}/${CHOICE_MAX_RETRIES} — ${check.reason}. Payload: ${JSON.stringify(check.payloadPreview)}`,
      );

      const retryUserMessage =
        userMessage +
        `\n\n[RESPONSE FORMAT ERROR — ATTEMPT ${choiceRetry + 1}/${CHOICE_MAX_RETRIES}]\n` +
        `Your previous response had invalid choices: ${check.reason}\n` +
        `CRITICAL: You MUST return EXACTLY 4 choices. Each choice MUST have:\n` +
        `  - "id": "1" | "2" | "3" | "4" (string)\n` +
        `  - "text": a non-empty sentence in the player's perspective\n` +
        `  - "type": "action" | "dialogue" | "exploration" | "decision"\n` +
        `Example valid choice: { "id": "1", "text": "Evin kapısını aç ve içeri gir", "type": "action" }\n` +
        `Do NOT omit the text field. Do NOT return empty strings. Regenerate the full JSON now with 4 valid choices.`;

      try {
        grokResponse = await this.aiService.callGrokAPI({
          systemPrompt,
          userMessage: retryUserMessage,
        });
        choiceRetry++;
      } catch (err) {
        this.logger.warn(
          `[choice-validate] retry error: ${(err as Error).message}`,
        );
        break;
      }
    }

    // Son kontrol: hala bozuksa — geçerli olanları al (en az 3 varsa kabul).
    const finalCheck = this.validateChoicesStrict(grokResponse);
    if (!finalCheck.valid) {
      const validOnly = this.keepOnlyValidChoices(grokResponse);
      if (validOnly.count >= 3) {
        this.logger.warn(
          `[choice-validate] 3 retry sonrası hala 4 tam değil — ${validOnly.count} geçerli choice ile devam ediliyor`,
        );
        if (Array.isArray(grokResponse.choices)) {
          grokResponse.choices = validOnly.choices;
        } else if (grokResponse.localizedChoices) {
          grokResponse.localizedChoices = validOnly.localizedChoices || grokResponse.localizedChoices;
        }
      } else {
        throw new BadRequestException(
          `AI 3 deneme sonrası geçerli choice üretemedi (${validOnly.count}/4). Lütfen tekrar deneyin.`,
        );
      }
    }

    // === TRANSITION VALIDATION + RETRY ===
    if (transitionMode === 'entering' && transitionDirective) {
      const validation = this.validateTransitionResponse(
        grokResponse,
        transitionDirective,
      );
      this.logger.log(
        `[chapter-transition] session=${session._id} ch=${promptChapterNumber} ack="${(grokResponse.acknowledged_directive || '').substring(0, 80)}" keywordPass=${validation.pass}`,
      );

      if (!validation.pass) {
        this.logger.warn(
          `[chapter-transition] validation FAILED (${validation.reason}), retrying with stricter prompt`,
        );
        // Retry: user message sonuna daha sert reminder
        const retryUserMessage =
          userMessage +
          `\n\n[RETRY — PREVIOUS ATTEMPT FAILED TO HONOR DIRECTIVE]\n` +
          `The currentScene MUST reference: ${validation.missingKeywords.join(', ')}. ` +
          `Open with explicit time-skip phrasing. Do NOT continue the previous chapter's physical scene.`;
        try {
          const retryResponse = await this.aiService.callGrokAPI({
            systemPrompt,
            userMessage: retryUserMessage,
          });
          const retryValidation = this.validateTransitionResponse(
            retryResponse,
            transitionDirective,
          );
          if (retryValidation.pass) {
            this.logger.log('[chapter-transition] retry succeeded');
            grokResponse = retryResponse;
          } else {
            this.logger.warn(
              '[chapter-transition] retry still failed — using original response',
            );
          }
        } catch (err) {
          this.logger.warn(
            `[chapter-transition] retry error: ${(err as Error).message}`,
          );
        }
      }
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

    // Transition zaten yukarıda (willTransition) kararlaştırıldı — burası sadece uygular
    if (willTransition && !grokResponse.isEnding && !isLastChapter) {
      newChapter += 1;
      isChapterTransition = true;
    }

    // (Eski skippedGrok logu kaldırıldı — artık tüm path'ler AI üretiyor.)

    // Effects alanını normalize et — AI 'suggestChapterTransition' field'ini atlayabilir,
    // biz her zaman boolean tutalım ki test script ve monitoring 'dash' yerine false/true görsün.
    const normalizedEffects: any = { ...(grokResponse.effects || {}) };
    if (typeof normalizedEffects.suggestChapterTransition !== 'boolean') {
      normalizedEffects.suggestChapterTransition = false;
    }

    // AI suggest vs force log'u
    if (pacingHint === 'soft' || pacingHint === 'pressure') {
      this.logger.log(
        `[pacing] hint=${pacingHint} AI.suggest=${normalizedEffects.suggestChapterTransition} ch.step=${newChapterStep}`,
      );
    }

    // Progress kaydet — choice'lar zaten yukarıda validate + retry'dan geçti
    const progress = await this.progressModel.create({
      sessionId: session._id,
      userId: session.userId,
      stepNumber: newStep,
      currentScene: grokResponse.currentScene,
      choices: grokResponse.choices,
      currentChapter: newChapter,
      chapterStepCount: isChapterTransition ? 0 : newChapterStep,
      effects: normalizedEffects,
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

    // Chapter transition: rollingSummary sıfırla (yeni chapter yeni özet)
    if (isChapterTransition) {
      sessionUpdate.rollingSummary = { text: '', updatedAtStep: newStep };
    }

    if (grokResponse.isEnding) {
      sessionUpdate.status = 'completed';
      sessionUpdate.completedAt = new Date();
    }

    await this.sessionModel.findByIdAndUpdate(session._id, sessionUpdate);

    this.logger.log(
      `Progress created: session=${session._id}, step=${newStep}, chapter=${newChapter}${grokResponse.isEnding ? ' [ENDING]' : ''}`,
    );

    // === ASYNC: Rolling summary update (fire-and-forget) ===
    // Trigger: her ROLLING_SUMMARY_INTERVAL step'te bir, transition değilse,
    // en az MIN_STEPS_FOR_ROLLING step oynanmış olmalı, feature flag açık.
    if (
      isRollingEnabled() &&
      !isChapterTransition &&
      !grokResponse.isEnding &&
      newStep >= MIN_STEPS_FOR_ROLLING &&
      newStep % ROLLING_SUMMARY_INTERVAL === 0
    ) {
      this.scheduleRollingSummaryUpdate(
        session._id.toString(),
        newStep,
        (session as any).rollingSummary?.text || '',
      );
    }

    return progress;
  }

  /**
   * Async rolling summary update — fire-and-forget. User response'u beklemez.
   * Son N sahne (ROLLING_SOURCE_WINDOW, Tier 1 olan son 2 sahne hariç) + mevcut
   * rollingSummary ile merge edilir. Yazarken optimistic lock
   * (`$lt: newStep`) ile eski bir step için yazım geçmesini engeller.
   */
  private async scheduleRollingSummaryUpdate(
    sessionId: string,
    atStep: number,
    existingSummary: string,
  ): Promise<void> {
    try {
      // Son N+Tier1 sahne çek (Tier 1 hariç olacak — en yeni 2 sahne özete girmez)
      const fetchLimit = ROLLING_SOURCE_WINDOW + IMMEDIATE_SCENES_COUNT;
      const docs = await this.progressModel
        .find({ sessionId: new Types.ObjectId(sessionId) })
        .sort({ stepNumber: -1 })
        .limit(fetchLimit)
        .exec();

      if (docs.length <= IMMEDIATE_SCENES_COUNT) return; // özetlenecek yeterince sahne yok

      // Eskiden yeniye sırala, Tier 1 (son 2) hariç al
      const orderedAsc = [...docs].reverse();
      const scenesToSummarize = orderedAsc
        .slice(0, orderedAsc.length - IMMEDIATE_SCENES_COUNT)
        .map((p) => p.currentScene)
        .filter(Boolean);

      if (scenesToSummarize.length === 0) return;

      const newSummary = await this.aiService.summarizeRecentScenes(
        scenesToSummarize,
        existingSummary || undefined,
      );

      if (!newSummary) return;

      // Optimistic lock: yalnız updatedAtStep bizim step'ten küçük olan dokümanı güncelle
      const res = await this.sessionModel.updateOne(
        {
          _id: new Types.ObjectId(sessionId),
          $or: [
            { 'rollingSummary.updatedAtStep': { $lt: atStep } },
            { rollingSummary: { $exists: false } },
            { 'rollingSummary.updatedAtStep': { $exists: false } },
          ],
        },
        {
          $set: {
            rollingSummary: { text: newSummary, updatedAtStep: atStep },
          },
        },
      );

      if (res.modifiedCount > 0) {
        this.logger.log(
          `[rolling-summary] session=${sessionId} step=${atStep} len=${newSummary.length}`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `[rolling-summary] update failed for session=${sessionId}: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Chapter transition response validation — acknowledged_directive alanı dolu mu,
   * scene text admin'in directive'indeki anahtar kelimeleri (location, timeDelta)
   * içeriyor mu kontrol eder. Basit substring check; case-insensitive.
   */
  /**
   * Choice'ların strict validation'ı — 4 adet olmalı, her birinde id + text + type
   * dolu olmalı. Fallback YOK: invalid olursa retry tetiklenir.
   * Bilingual response'ta her dil için aynı kontrol.
   */
  private validateChoicesStrict(response: any): {
    valid: boolean;
    reason: string;
    payloadPreview: any;
  } {
    const extractText = (c: any): string => {
      if (!c) return '';
      if (typeof c.text === 'string') return c.text.trim();
      if (typeof c.text === 'object' && c.text) {
        const vals = Object.values(c.text).filter(
          (v) => typeof v === 'string',
        ) as string[];
        return vals.find((v) => v.trim().length > 0)?.trim() || '';
      }
      return '';
    };

    const checkArray = (arr: any[]): { valid: boolean; reason: string } => {
      if (!Array.isArray(arr)) return { valid: false, reason: 'choices not array' };
      if (arr.length !== 4)
        return { valid: false, reason: `choice count=${arr.length}, must be 4` };
      for (let i = 0; i < arr.length; i++) {
        const c = arr[i];
        if (!c || typeof c !== 'object')
          return { valid: false, reason: `choice[${i}] not an object` };
        const text = extractText(c);
        if (!text || text.length < 2)
          return { valid: false, reason: `choice[${i}] has no text` };
      }
      return { valid: true, reason: 'ok' };
    };

    // Bilingual mode
    if (response.scenes && response.localizedChoices) {
      for (const lang of Object.keys(response.localizedChoices)) {
        const r = checkArray(response.localizedChoices[lang]);
        if (!r.valid) {
          return {
            valid: false,
            reason: `[${lang}] ${r.reason}`,
            payloadPreview: response.localizedChoices[lang],
          };
        }
      }
      return { valid: true, reason: 'ok', payloadPreview: null };
    }

    // Single lang
    const r = checkArray(response.choices);
    return {
      valid: r.valid,
      reason: r.reason,
      payloadPreview: response.choices,
    };
  }

  /**
   * Invalid choice'ları atıp geçerli olanları tutar. 3+ geçerli varsa kabul edilir,
   * azsa exception atılır (retry tükendi fallback de yok).
   */
  private keepOnlyValidChoices(response: any): {
    count: number;
    choices?: any[];
    localizedChoices?: Record<string, any[]>;
  } {
    const isValid = (c: any): boolean => {
      if (!c) return false;
      if (typeof c.text === 'string') return c.text.trim().length >= 2;
      if (typeof c.text === 'object' && c.text) {
        return Object.values(c.text).some(
          (v) => typeof v === 'string' && (v as string).trim().length >= 2,
        );
      }
      return false;
    };

    if (response.localizedChoices) {
      const out: Record<string, any[]> = {};
      let minCount = Infinity;
      for (const lang of Object.keys(response.localizedChoices)) {
        const filtered = (response.localizedChoices[lang] || []).filter(isValid);
        out[lang] = filtered;
        minCount = Math.min(minCount, filtered.length);
      }
      return { count: minCount === Infinity ? 0 : minCount, localizedChoices: out };
    }

    const filtered = (response.choices || []).filter(isValid);
    return { count: filtered.length, choices: filtered };
  }

  private validateTransitionResponse(
    response: any,
    directive: {
      timeDelta?: string;
      location?: string;
      mood?: string;
      carryOver?: string;
    },
  ): { pass: boolean; reason: string; missingKeywords: string[] } {
    const sceneText: string = (
      response.currentScene ||
      (response.scenes && Object.values(response.scenes)[0]) ||
      ''
    ).toLowerCase();
    const ack: string = (response.acknowledged_directive || '').toLowerCase();

    // 1) acknowledged_directive boş olmamalı
    if (!ack || ack.trim().length < 10) {
      return {
        pass: false,
        reason: 'acknowledged_directive missing or too short',
        missingKeywords: [
          directive.location,
          directive.timeDelta,
        ].filter((x): x is string => !!x),
      };
    }

    // 2) Scene text anahtar kelimeleri içersin (en az birini)
    const extractKeywords = (value?: string): string[] => {
      if (!value) return [];
      return value
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .filter((w) => w.length >= 4)
        .slice(0, 3); // ilk 3 meaningful word
    };

    const locationKws = extractKeywords(directive.location);
    const timeKws = extractKeywords(directive.timeDelta);

    const locationMatch =
      locationKws.length === 0 || locationKws.some((kw) => sceneText.includes(kw) || ack.includes(kw));
    const timeMatch =
      timeKws.length === 0 || timeKws.some((kw) => sceneText.includes(kw) || ack.includes(kw));

    if (!locationMatch || !timeMatch) {
      const missing: string[] = [];
      if (!locationMatch) missing.push(`location "${directive.location}"`);
      if (!timeMatch) missing.push(`time "${directive.timeDelta}"`);
      return {
        pass: false,
        reason: `scene missing directive keywords: ${missing.join(', ')}`,
        missingKeywords: [directive.location, directive.timeDelta].filter(
          (x): x is string => !!x,
        ),
      };
    }

    return { pass: true, reason: 'ok', missingKeywords: [] };
  }
}
