import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { MultiplayerSession } from './schemas/multiplayer-session.schema';
import { MultiplayerProgress } from './schemas/multiplayer-progress.schema';
import { StoriesService } from '../stories/stories.service';
import { AiService } from '../ai/ai.service';
import { buildSystemPrompt } from '../ai/prompts/system-prompt.builder';
import { UsersService } from '../users/users.service';

// === Chapter pacing constants (singleplayer ile aynı değerler) ===
const MIN_STEPS_PER_CHAPTER = 5;
const SOFT_STEPS_PER_CHAPTER = 7;
const MAX_STEPS_PER_CHAPTER = 10;

@Injectable()
export class MultiplayerService {
  private readonly logger = new Logger(MultiplayerService.name);

  // Idempotency cache: aynı (sessionId, turnOrder, choiceId) kombinasyonunun
  // TTL içinde 2. kez gelmesini engeller. Değer = Promise<MultiplayerProgress>,
  // böylece aynı anda gelen iki istek tek pipeline çalıştırır.
  private readonly idempotencyCache = new Map<
    string,
    { value: Promise<MultiplayerProgress>; expiresAt: number }
  >();
  private readonly IDEMPOTENCY_TTL_MS = 60_000;

  private cleanupIdempotencyCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.idempotencyCache) {
      if (entry.expiresAt <= now) this.idempotencyCache.delete(key);
    }
  }

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
  async createSessionFromMatchmaking(
    hostId: string,
    guestId: string,
    hostLanguage?: string,
    guestLanguage?: string,
  ): Promise<MultiplayerSession> {
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
      hostLanguageCode: hostLanguage || 'en',
      guestLanguageCode: guestLanguage || 'en',
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

    const hostLang = session.hostLanguageCode || 'en';
    const guestLang = session.guestLanguageCode || 'en';
    const isBilingual = hostLang !== guestLang;
    const primaryLang = hostLang;

    // Call 1 — Event Orchestrator (initial scene = story opening), POV-free context
    const charactersBlock = ((clone.characters || []) as any[])
      .map((c: any) => {
        const name = c.name || 'Unknown';
        const role = c.role || '';
        const desc = c.description || '';
        return `- ${name}${role ? ` (${role})` : ''}${desc ? `: ${desc}` : ''}`;
      })
      .join('\n');
    const orchestratorContext = [
      `STORY: ${clone.title || 'Interactive Story'}`,
      clone.summary ? `SUMMARY: ${clone.summary}` : '',
      `CURRENT CHAPTER: 1 (opening)`,
      charactersBlock ? `CHARACTERS:\n${charactersBlock}` : '',
      `PLAYERS:\n- ${session.hostName || 'Host'} (HOST)\n- ${session.guestName || 'Guest'} (GUEST)`,
    ]
      .filter(Boolean)
      .join('\n\n');

    const hostName = session.hostName || 'Host';
    const guestName = session.guestName || 'Guest';

    const chapters = ((clone as any).chapters || []) as any[];
    const totalChapters = chapters.length;
    const firstChapter = chapters[0];

    const grokResponse = await this.aiService.generateEventOrchestrator({
      storyContext: orchestratorContext,
      choiceText: '[STORY OPENING — introduce characters, set the scene]',
      activePlayerName: hostName,
      nextPlayerName: hostName, // İlk turn'de host aktif; choices host için
      hostName,
      guestName,
      languageCode: primaryLang,
      chapterNumber: 1,
      totalChapters,
      chapterTitle: firstChapter?.title,
      chapterSummary: firstChapter?.summary,
      isLastChapter: totalChapters === 1,
    });

    const eventChronicle = grokResponse.currentScene || '';
    const validChoices = (Array.isArray(grokResponse.choices) ? grokResponse.choices : []).filter(
      (c: any) => c && typeof c.text === 'string' && c.text.trim().length > 0,
    );
    if (validChoices.length < 2) {
      throw new Error(`Initial scene orchestrator returned ${validChoices.length} valid choices`);
    }

    // Call 2 & 3 — paralel POV rewrites
    const [hostResult, guestResult] = await Promise.allSettled([
      this.aiService.generatePovPerspective({
        eventChronicle,
        povName: hostName,
        otherName: guestName,
        languageCode: hostLang,
      }),
      this.aiService.generatePovPerspective({
        eventChronicle,
        povName: guestName,
        otherName: hostName,
        languageCode: guestLang,
      }),
    ]);

    const hostScene =
      hostResult.status === 'fulfilled' && hostResult.value && hostResult.value.trim().length >= 30
        ? hostResult.value.trim()
        : eventChronicle;
    const guestScene =
      guestResult.status === 'fulfilled' && guestResult.value && guestResult.value.trim().length >= 30
        ? guestResult.value.trim()
        : eventChronicle;

    let scenes: Record<string, string>;
    let localizedChoices: Record<string, any> | undefined;
    let sceneText: string;

    if (isBilingual) {
      scenes = { [hostLang]: hostScene, [guestLang]: guestScene };
      sceneText = hostScene;
      localizedChoices = { [hostLang]: validChoices, [guestLang]: validChoices };
    } else {
      scenes = { host: hostScene, guest: guestScene };
      sceneText = hostScene;
    }

    const progress = await this.progressModel.create({
      sessionId: session._id,
      activePlayerId: session.activePlayerId,
      turnOrder: 1,
      currentScene: sceneText,
      choices: this.normalizeChoices(validChoices),
      scenes,
      localizedChoices,
      currentChapter: 1,
      effects: grokResponse.effects,
      isEnding: false,
      eventSummary: eventChronicle,
      suggestChapterTransition: !!grokResponse.effects?.suggestChapterTransition,
    });

    await this.sessionModel.findByIdAndUpdate(session._id, {
      lastProgressId: progress._id.toString(),
      turnOrder: 1,
      currentStep: 1,
      currentChapter: 1,
      chapterStepCount: 1,
    });

    this.logger.log(
      `[3call] initial scene generated for session ${session._id} (bilingual=${isBilingual})`,
    );
  }

  /**
   * Kullanıcının tüm multiplayer session'larını listele (host veya guest olarak).
   */
  async getUserSessions(userId: string): Promise<MultiplayerSession[]> {
    const oid = new Types.ObjectId(userId);
    return this.sessionModel
      .find({ $or: [{ hostId: oid }, { guestId: oid }] })
      .sort({ createdAt: -1 })
      .limit(50)
      .exec();
  }

  /**
   * Multiplayer session'ları sil (kullanıcı yetki kontrolüyle).
   */
  async deleteSessions(userId: string, sessionIds: string[]): Promise<number> {
    const oid = new Types.ObjectId(userId);
    const objectIds = sessionIds.map((id) => new Types.ObjectId(id));

    // Sadece kullanıcının katıldığı session'ları sil
    const result = await this.sessionModel.deleteMany({
      _id: { $in: objectIds },
      $or: [{ hostId: oid }, { guestId: oid }],
    });

    // İlgili progress kayıtlarını da temizle
    if (result.deletedCount > 0) {
      await this.progressModel.deleteMany({
        sessionId: { $in: objectIds },
      });
    }

    return result.deletedCount;
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

      // İlk AI sahnesini üret — manuel invite flow'unda da matchmaking'dekiyle aynı davranış
      if (updated && !updated.lastProgressId) {
        try {
          await this.generateInitialScene(updated);
          this.logger.log(`[mp] initial scene generated for session ${sessionId}`);
        } catch (err) {
          this.logger.error(
            `[mp] Initial scene generation failed for ${sessionId}: ${(err as Error).message}`,
          );
        }
      }
    }

    return updated!;
  }

  async submitChoice(sessionId: string, userId: string, choice: { id: string; text: string; type?: string }): Promise<MultiplayerProgress> {
    const session = await this.getSession(sessionId);
    if (session.phase !== 'playing') throw new BadRequestException('Session not in playing phase');
    if (session.activePlayerId?.toString() !== userId) throw new BadRequestException('Not your turn');

    // Idempotency — aynı (sessionId, turnOrder, choiceId) için tek pipeline çalıştır.
    this.cleanupIdempotencyCache();
    const idempotencyKey = `${sessionId}:${session.turnOrder}:${choice.id}`;
    const cached = this.idempotencyCache.get(idempotencyKey);
    if (cached && cached.expiresAt > Date.now()) {
      this.logger.log(`[idempotency] cache hit for ${idempotencyKey}`);
      return cached.value;
    }

    const pipelinePromise = this.runSubmitChoicePipeline(session, userId, choice);
    this.idempotencyCache.set(idempotencyKey, {
      value: pipelinePromise,
      expiresAt: Date.now() + this.IDEMPOTENCY_TTL_MS,
    });
    return pipelinePromise;
  }

  private async runSubmitChoicePipeline(
    session: MultiplayerSession,
    userId: string,
    choice: { id: string; text: string; type?: string },
  ): Promise<MultiplayerProgress> {
    const sessionId = (session._id as any).toString();

    const pipelineEnabled =
      (process.env.ENABLE_MULTIPLAYER_3CALL_PIPELINE ?? 'true')
        .toLowerCase() !== 'false';
    if (!pipelineEnabled) {
      this.logger.warn(
        `[3call] pipeline disabled via ENABLE_MULTIPLAYER_3CALL_PIPELINE=false — aborting`,
      );
      throw new BadRequestException(
        'Multiplayer pipeline şu an devre dışı (admin kapattı).',
      );
    }

    // Save choice to current progress
    if (session.lastProgressId) {
      await this.progressModel.findByIdAndUpdate(session.lastProgressId, {
        userChoice: { id: choice.id, text: choice.text, type: choice.type || 'action' },
      });
    }

    // Generate next scene
    const recentDocs = await this.progressModel.find({ sessionId: session._id }).sort({ turnOrder: -1 }).limit(10);
    // ⚠️ reverse() in-place — orijinali koru
    // Dual POV handling: progress doc'unda scenes.host + scenes.guest varsa
    // AI'a giden history'de her iki perspective'i etiketli bas. Bu sayede AI
    // "bu hikayede format hep tek POV" gibi pattern mimicry'e kapılmıyor.
    const hostLabel = session.hostName || 'Host';
    const guestLabel = session.guestName || 'Guest';
    const allRecentScenes = [...recentDocs]
      .reverse()
      .map((p: any) => {
        // 3-call pipeline: eventSummary neutral chronicle — en temiz kaynak, öncelikli
        if (p.eventSummary && typeof p.eventSummary === 'string') {
          return p.eventSummary;
        }
        const sc = p.scenes;
        // Legacy: same-language dual perspective
        if (sc?.host && sc?.guest) {
          return `[${hostLabel} POV]\n${sc.host}\n\n[${guestLabel} POV]\n${sc.guest}`;
        }
        // Legacy: bilingual tagged
        if (sc && typeof sc === 'object') {
          const langs = Object.keys(sc).filter((k) => k !== 'host' && k !== 'guest');
          if (langs.length >= 2) {
            return langs
              .map((l) => `[${l.toUpperCase()}]\n${sc[l]}`)
              .join('\n\n');
          }
        }
        return p.currentScene || '';
      })
      .filter(Boolean);

    const clone = session.storyClone || {};

    // === Memory tiers (rolling summary + chapter bridges) ===
    const rollingEnabled = (process.env.ENABLE_ROLLING_SUMMARY ?? 'true').toLowerCase() !== 'false';
    const IMMEDIATE_SCENES_COUNT = 2;
    let recentHistory = allRecentScenes;
    let tierRollingSummary: string | undefined;
    let tierChapterBridges: string[] | undefined;

    if (rollingEnabled) {
      const rollingText = (session as any).rollingSummary?.text?.trim();
      const allBridges = Object.entries(
        (session as any).bridgeSummaries || {},
      ) as [string, string][];

      if (allBridges.length > 0) {
        tierChapterBridges = allBridges
          .filter(([chKey]) => parseInt(chKey, 10) < session.currentChapter)
          .sort(([a], [b]) => parseInt(a, 10) - parseInt(b, 10))
          .map(([chKey, summary]) => `Chapter ${chKey}: ${summary}`);
        if (tierChapterBridges.length === 0) tierChapterBridges = undefined;
      }
      if (rollingText) tierRollingSummary = rollingText;

      // Tier'lardan biri doluysa Tier 1 (son 2 sahne) ile sınırla
      if (tierRollingSummary || tierChapterBridges) {
        recentHistory = allRecentScenes.slice(-IMMEDIATE_SCENES_COUNT);
      }
    }

    const isBilingual = session.hostLanguageCode !== session.guestLanguageCode;
    const languages = isBilingual
      ? [session.hostLanguageCode || 'en', session.guestLanguageCode || 'en']
      : [session.hostLanguageCode || 'en'];

    const activeNameForPrompt =
      userId === session.hostId?.toString()
        ? session.hostName || 'Host'
        : session.guestName || 'Guest';

    // ==========================================================================
    // 3-CALL PIPELINE — Call 1: Event Orchestrator (neutral chronicle + choices)
    // ==========================================================================
    // NOT: buildSystemPrompt çağırmıyoruz — içindeki 2. şahıs "sen" ve dual POV
    // talimatları orchestrator'ı kirletiyor. Minimal POV-FREE context kuruyoruz.
    const charactersBlock = ((clone.characters || []) as any[])
      .map((c: any) => {
        const name = c.name || 'Unknown';
        const role = c.role || '';
        const desc = c.description || '';
        return `- ${name}${role ? ` (${role})` : ''}${desc ? `: ${desc}` : ''}`;
      })
      .join('\n');

    const playerBlock =
      `PLAYERS:\n` +
      `- ${session.hostName || 'Host'} (HOST, ${session.hostGender || 'unknown'}) — main protagonist\n` +
      `- ${session.guestName || 'Guest'} (GUEST, ${session.guestGender || 'unknown'}) — co-protagonist`;

    const emoBlock = session.emotionalStates
      ? `EMOTIONAL STATE (current): ${JSON.stringify(session.emotionalStates)}`
      : '';

    const historyBlock =
      recentHistory && recentHistory.length > 0
        ? `RECENT SCENES (neutral summaries, most recent last):\n` +
          recentHistory.map((s, i) => `[${i + 1}] ${s}`).join('\n\n')
        : 'RECENT SCENES: (none — opening)';

    const summaryBlock = tierRollingSummary
      ? `ROLLING SUMMARY (earlier scenes):\n${tierRollingSummary}`
      : '';

    const bridgesBlock =
      tierChapterBridges && tierChapterBridges.length > 0
        ? `CHAPTER BRIDGES (prior chapters):\n${tierChapterBridges.join('\n')}`
        : '';

    const orchestratorContext = [
      `STORY: ${clone.title || 'Interactive Story'}`,
      clone.summary ? `SUMMARY: ${clone.summary}` : '',
      `CURRENT CHAPTER: ${session.currentChapter}`,
      charactersBlock ? `CHARACTERS:\n${charactersBlock}` : '',
      playerBlock,
      emoBlock,
      bridgesBlock,
      summaryBlock,
      historyBlock,
    ]
      .filter(Boolean)
      .join('\n\n');

    const primaryLang = session.hostLanguageCode || session.guestLanguageCode || 'en';

    // Sıradaki oyuncu = şu an aktif olmayan. Orchestrator choice'ları o kişiye üretecek.
    const nextPlayerName =
      userId === session.hostId?.toString()
        ? session.guestName || 'Guest'
        : session.hostName || 'Host';

    // ==========================================================================
    // CHAPTER TRANSITION DECISION (singleplayer pattern birebir port)
    // ==========================================================================
    const chaptersArr = ((clone as any).chapters || []) as any[];
    const totalChapters = chaptersArr.length;
    const currentChapterIdx = session.currentChapter - 1;
    const currentChapterData: any =
      currentChapterIdx >= 0 && currentChapterIdx < totalChapters
        ? chaptersArr[currentChapterIdx]
        : null;
    const isLastChapter = totalChapters > 0 && session.currentChapter >= totalChapters;
    const nextChapterStep = (session.chapterStepCount || 0) + 1;

    // Pacing windows
    const inSoftWindow =
      !isLastChapter &&
      nextChapterStep >= MIN_STEPS_PER_CHAPTER &&
      nextChapterStep <= SOFT_STEPS_PER_CHAPTER;
    const inPressureWindow =
      !isLastChapter &&
      nextChapterStep > SOFT_STEPS_PER_CHAPTER &&
      nextChapterStep < MAX_STEPS_PER_CHAPTER;
    const mustForceTransition =
      !isLastChapter && nextChapterStep >= MAX_STEPS_PER_CHAPTER;

    let pacingHint: 'none' | 'soft' | 'pressure' = 'none';
    if (inSoftWindow) pacingHint = 'soft';
    else if (inPressureWindow) pacingHint = 'pressure';

    // Önceki progress'in suggestChapterTransition flag'i — AI bir önceki turn'de
    // "kapanış hazır" dediyse bu turn transition say (min-step koşulunu karşılıyorsa).
    const lastProgressDoc: any = recentDocs[0]; // zaten desc sort (en son ilk)
    const lastSuggested =
      lastProgressDoc?.suggestChapterTransition === true ||
      lastProgressDoc?.effects?.suggestChapterTransition === true;

    let willTransition = mustForceTransition;
    if (
      !isLastChapter &&
      lastSuggested &&
      nextChapterStep >= MIN_STEPS_PER_CHAPTER
    ) {
      willTransition = true;
    }

    // Hedef chapter data (transition varsa sonraki, yoksa mevcut)
    const nextChapterData: any =
      willTransition && session.currentChapter < totalChapters
        ? chaptersArr[session.currentChapter] // 0-based → session.currentChapter = next idx
        : null;
    const directiveChapter = willTransition ? nextChapterData : currentChapterData;
    const transitionDirective = directiveChapter
      ? directiveChapter.transitionDirectiveTranslations?.[primaryLang] ||
        directiveChapter.transitionDirectiveTranslations?.['en'] ||
        directiveChapter.transitionDirective ||
        undefined
      : undefined;
    const transitionMode: 'none' | 'entering' = willTransition ? 'entering' : 'none';

    // Bridge summary (chapter geçişi oluyorsa; cache varsa kullan, yoksa üret)
    let previousChapterBridge: string | undefined;
    if (willTransition) {
      const chapterKey = String(session.currentChapter);
      const cached = (session as any).bridgeSummaries?.[chapterKey];
      if (cached) {
        previousChapterBridge = cached;
      } else if (allRecentScenes.length > 0) {
        this.logger.log(
          `[mp-transition] generating bridge summary for chapter ${chapterKey} session=${sessionId}`,
        );
        try {
          const summary = await this.aiService.summarizeForTransition(
            allRecentScenes.join('\n'),
            primaryLang,
          );
          if (summary) {
            previousChapterBridge = summary;
            this.sessionModel
              .updateOne(
                { _id: session._id },
                { $set: { [`bridgeSummaries.${chapterKey}`]: summary } },
              )
              .catch((err) =>
                this.logger.warn(
                  `[mp-transition] bridge cache write fail: ${err?.message || err}`,
                ),
              );
          }
        } catch (err) {
          this.logger.warn(
            `[mp-transition] bridge summary err: ${(err as Error).message}`,
          );
        }
      }
    }

    // Orchestrator prompt'ına geçecek chapter numarası + metadata
    const promptChapterData =
      transitionMode === 'entering' ? nextChapterData : currentChapterData;
    const promptChapterNumber =
      transitionMode === 'entering' ? session.currentChapter + 1 : session.currentChapter;

    // User trajectory — son 5 userChoice (mevcut çağrı dahil), en eski → en yeni.
    // recentDocs desc sort (en yeni ilk). Önceki user seçimlerinin text'ini
    // al, bu turn'ün choice.text'ini de sona ekle.
    const recentUserChoices: string[] = [...recentDocs]
      .slice(0, 4)
      .reverse()
      .map((d: any) => d?.userChoice?.text || '')
      .filter((t: string) => t && t.trim().length > 0);
    recentUserChoices.push(choice.text);

    let grokResponse: any;
    try {
      grokResponse = await this.aiService.generateEventOrchestrator({
        storyContext: orchestratorContext,
        choiceText: choice.text,
        activePlayerName: activeNameForPrompt,
        nextPlayerName,
        hostName: session.hostName || 'Host',
        guestName: session.guestName || 'Guest',
        languageCode: primaryLang,
        pacingHint,
        isLastChapter,
        transitionMode,
        transitionDirective,
        previousChapterBridge,
        chapterTitle: promptChapterData?.title,
        chapterSummary: promptChapterData?.summary,
        chapterNumber: promptChapterNumber,
        totalChapters,
        recentUserChoices,
      });
    } catch (err) {
      this.logger.error(
        `[3call] orchestrator failed for session ${sessionId}: ${(err as Error).message}`,
      );
      throw new BadRequestException(
        'AI olay özeti üretilemedi, lütfen tekrar deneyin.',
      );
    }


    // === CHOICE VALIDATION (orchestrator tek dilde, array format) ===
    // Orchestrator'ın choices'ı array olarak döndüğü varsayılıyor. Eksik/boş ise
    // keepValidMultiplayerChoices ile filtrele — threshold altındaysa retry yok,
    // orchestrator bir kere retry zaten kendi içinde yapıyor.
    const choicesArrRaw = Array.isArray(grokResponse.choices)
      ? grokResponse.choices
      : [];
    const validChoices = choicesArrRaw.filter(
      (c: any) => c && typeof c.text === 'string' && c.text.trim().length > 0,
    );
    if (validChoices.length < 2) {
      this.logger.warn(
        `[3call] orchestrator returned <2 valid choices (${validChoices.length}), aborting`,
      );
      throw new BadRequestException(
        'AI geçerli seçenek üretemedi, lütfen tekrar deneyin.',
      );
    }
    grokResponse.choices = validChoices;

    this.logger.log(
      `[3call] orchestrator OK — chronicle_len=${(grokResponse.currentScene || '').length} ` +
        `choices=${validChoices.length} isEnding=${!!grokResponse.isEnding} ` +
        `suggestTransition=${!!grokResponse.effects?.suggestChapterTransition}`,
    );

    const eventChronicle = grokResponse.currentScene || '';
    const hostName = session.hostName || 'Host';
    const guestName = session.guestName || 'Guest';
    const hostLangOut = session.hostLanguageCode || 'en';
    const guestLangOut = session.guestLanguageCode || 'en';

    // ==========================================================================
    // 3-CALL PIPELINE — Call 2 & 3: Parallel POV Rewrites (Promise.allSettled)
    // ==========================================================================
    // Attention entanglement'ı engellemek için her POV ayrı fetch'te üretilir.
    // Biri fail ederse neutral chronicle fallback olarak kullanılır.
    const [hostResult, guestResult] = await Promise.allSettled([
      this.aiService.generatePovPerspective({
        eventChronicle,
        povName: hostName,
        otherName: guestName,
        languageCode: hostLangOut,
      }),
      this.aiService.generatePovPerspective({
        eventChronicle,
        povName: guestName,
        otherName: hostName,
        languageCode: guestLangOut,
      }),
    ]);

    const hostScene =
      hostResult.status === 'fulfilled' && hostResult.value && hostResult.value.trim().length >= 30
        ? hostResult.value.trim()
        : eventChronicle;
    const guestScene =
      guestResult.status === 'fulfilled' && guestResult.value && guestResult.value.trim().length >= 30
        ? guestResult.value.trim()
        : eventChronicle;

    const hostFallback = hostResult.status !== 'fulfilled' || hostScene === eventChronicle;
    const guestFallback = guestResult.status !== 'fulfilled' || guestScene === eventChronicle;
    if (hostFallback || guestFallback) {
      this.logger.warn(
        `[3call] pov fallback — host=${hostFallback} guest=${guestFallback}`,
      );
    }

    // ==========================================================================
    // Response normalization — eventSummary canonical, scenes.host/guest populated
    // ==========================================================================
    const isDualPerspective = !isBilingual;
    let sceneText: string;
    let choicesArr: any = validChoices;
    let scenes: Record<string, string> | undefined;
    let localizedChoices: Record<string, any> | undefined;

    if (isDualPerspective) {
      // Same-language dual perspective: scenes.host + scenes.guest
      scenes = { host: hostScene, guest: guestScene };
      sceneText = hostScene;
    } else {
      // Bilingual: scenes[hostLang] + scenes[guestLang] (POV rewriter zaten dile göre üretti)
      scenes = {
        [hostLangOut]: hostScene,
        [guestLangOut]: guestScene,
      };
      sceneText = scenes[hostLangOut] || hostScene;
      // Bilingual'da choices tek dilde orchestrator'dan geldi — diğer dile translate
      // gerekiyorsa ayrı helper (şimdilik her iki dile de aynı choices'ı verelim;
      // gerçek çeviri gelecek iterasyonda)
      localizedChoices = {
        [hostLangOut]: validChoices,
        [guestLangOut]: validChoices,
      };
    }

    // Chapter progresyonu
    const newTurn = session.turnOrder + 1;
    const newChapterStepCount = (session.chapterStepCount || 0) + 1;
    let newChapter = session.currentChapter;
    const isChapterTransition = willTransition && !grokResponse.isEnding && !isLastChapter;
    if (isChapterTransition) {
      newChapter = session.currentChapter + 1;
    }

    if (pacingHint !== 'none' || willTransition) {
      this.logger.log(
        `[mp-pacing] session=${sessionId} pacing=${pacingHint} chapterStep=${newChapterStepCount} ` +
          `willTransition=${willTransition} aiSuggested=${!!grokResponse.effects?.suggestChapterTransition} ` +
          `ch=${session.currentChapter}→${newChapter} isLast=${isLastChapter}`,
      );
    }

    // Create progress
    const progress = await this.progressModel.create({
      sessionId: session._id,
      activePlayerId: session.nextPlayerId,
      turnOrder: newTurn,
      currentScene: sceneText,
      choices: this.normalizeChoices(choicesArr),
      scenes,
      localizedChoices,
      currentChapter: newChapter,
      effects: grokResponse.effects,
      isEnding: grokResponse.isEnding || false,
      endingType: grokResponse.endingType,
      eventSummary: eventChronicle,
      isChapterTransition,
      suggestChapterTransition: !!grokResponse.effects?.suggestChapterTransition,
    });

    // Swap turns + chapter/step güncellemeleri
    const sessionUpdate: any = {
      activePlayerId: session.nextPlayerId,
      nextPlayerId: session.activePlayerId,
      turnOrder: newTurn,
      lastProgressId: progress._id.toString(),
      currentStep: session.currentStep + 1,
      currentChapter: newChapter,
      chapterStepCount: isChapterTransition ? 0 : newChapterStepCount,
    };
    // Chapter transition'da rolling summary'yi sıfırla (yeni chapter yeni özet)
    if (isChapterTransition) {
      sessionUpdate.rollingSummary = { text: '', updatedAtStep: newTurn };
    }
    if (grokResponse.isEnding) {
      sessionUpdate.phase = 'ended';
      sessionUpdate.completed = true;
      sessionUpdate.completedAt = new Date();
    }
    await this.sessionModel.findByIdAndUpdate(sessionId, sessionUpdate);

    // === ASYNC: Rolling summary update (fire-and-forget) ===
    const ROLLING_SUMMARY_INTERVAL = 5;
    const MIN_STEPS_FOR_ROLLING = 3;
    const ROLLING_SOURCE_WINDOW = 5;
    if (
      rollingEnabled &&
      !grokResponse.isEnding &&
      !isChapterTransition &&
      newTurn >= MIN_STEPS_FOR_ROLLING &&
      newTurn % ROLLING_SUMMARY_INTERVAL === 0
    ) {
      // Summary'nin dili — host dili öncelikli (bilingual'da kullanıcıların birisi)
      const summaryLang = session.hostLanguageCode || session.guestLanguageCode || 'en';
      this.scheduleMultiplayerRollingSummary(
        sessionId,
        newTurn,
        (session as any).rollingSummary?.text || '',
        summaryLang,
      );
    }

    return progress;
  }

  /**
   * Multiplayer rolling summary — fire-and-forget.
   * Aynı pattern: son ROLLING_SOURCE_WINDOW + 2 turn çek, Tier 1 (son 2) hariç kalanları özetle.
   */
  private async scheduleMultiplayerRollingSummary(
    sessionId: string,
    atTurn: number,
    existingSummary: string,
    languageCode?: string,
  ): Promise<void> {
    try {
      const fetchLimit = 5 + 2; // window + tier1
      const docs = await this.progressModel
        .find({ sessionId: new Types.ObjectId(sessionId) })
        .sort({ turnOrder: -1 })
        .limit(fetchLimit)
        .exec();
      if (docs.length <= 2) return;

      const orderedAsc = [...docs].reverse();
      // Summary için scenes.host + scenes.guest varsa etiketli birleştir,
      // yoksa fallback currentScene. Objective narrator prompt bunları
      // 3. şahısta nötr özete çevirir.
      const scenesToSummarize = orderedAsc
        .slice(0, orderedAsc.length - 2)
        .map((p: any) => {
          // 3-call pipeline: eventSummary neutral chronicle öncelikli
          if (p.eventSummary && typeof p.eventSummary === 'string') {
            return p.eventSummary;
          }
          const sc = p.scenes;
          if (sc?.host && sc?.guest) {
            return `[HOST POV] ${sc.host}\n[GUEST POV] ${sc.guest}`;
          }
          if (sc && typeof sc === 'object') {
            const langs = Object.keys(sc).filter((k) => k !== 'host' && k !== 'guest');
            if (langs.length >= 2) {
              return langs.map((l) => `[${l}] ${sc[l]}`).join('\n');
            }
          }
          return p.currentScene || '';
        })
        .filter(Boolean);
      if (scenesToSummarize.length === 0) return;

      const newSummary = await this.aiService.summarizeRecentScenes(
        scenesToSummarize,
        existingSummary || undefined,
        languageCode,
        true, // isMultiplayer — perspective-free objective narrator
      );
      if (!newSummary) return;

      const res = await this.sessionModel.updateOne(
        {
          _id: new Types.ObjectId(sessionId),
          $or: [
            { 'rollingSummary.updatedAtStep': { $lt: atTurn } },
            { rollingSummary: { $exists: false } },
            { 'rollingSummary.updatedAtStep': { $exists: false } },
          ],
        },
        {
          $set: {
            rollingSummary: { text: newSummary, updatedAtStep: atTurn },
          },
        },
      );
      if (res.modifiedCount > 0) {
        this.logger.log(
          `[rolling-summary][multi] session=${sessionId} turn=${atTurn} len=${newSummary.length}`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `[rolling-summary][multi] fail session=${sessionId}: ${(err as Error).message}`,
      );
    }
  }

  async cancelSession(sessionId: string, userId: string, reason?: string): Promise<MultiplayerSession> {
    const session = await this.getSession(sessionId);
    const isHost = session.hostId.toString() === userId;
    const isGuest = session.guestId.toString() === userId;
    if (!isHost && !isGuest) throw new BadRequestException('Not a participant');
    if (session.phase === 'ended' || session.phase === 'cancelled') throw new BadRequestException('Session already finished');

    const updated = await this.sessionModel.findByIdAndUpdate(
      sessionId,
      { phase: 'cancelled', completedAt: new Date(), cancelledBy: userId, cancelReason: reason || 'user_cancelled' },
      { new: true },
    );
    return updated!;
  }

  async getLatestProgress(sessionId: string): Promise<MultiplayerProgress | null> {
    return this.progressModel.findOne({ sessionId: new Types.ObjectId(sessionId) }).sort({ turnOrder: -1 });
  }

  /**
   * Grok API'den dönen choices'ı normalize et.
   * Grok bazen farklı formatlar dönebiliyor (string, obje, eksik alanlar).
   */
  private normalizeChoices(choices: any): { id: string; text: string; type: string }[] {
    const defaults = [
      { id: '1', text: 'Continue the conversation', type: 'dialogue' },
      { id: '2', text: 'Explore the surroundings', type: 'exploration' },
      { id: '3', text: 'Take a bold action', type: 'action' },
      { id: '4', text: 'Make a careful decision', type: 'decision' },
    ];

    // String ise JSON parse dene (Grok bazen choices'ı string olarak dönüyor)
    if (typeof choices === 'string') {
      try {
        choices = JSON.parse(choices);
      } catch {
        this.logger.warn('Choices is a non-JSON string, using defaults');
        return defaults;
      }
    }

    if (!Array.isArray(choices) || choices.length === 0) {
      this.logger.warn('Choices is not a valid array, using defaults');
      return defaults;
    }

    // Eğer array'in ilk elemanı bir string ve "[" ile başlıyorsa, iç içe string array
    if (choices.length === 1 && typeof choices[0] === 'string') {
      try {
        // JS object literal'ı JSON'a çevir (key'leri tırnakla)
        const fixed = choices[0].replace(/'/g, '"').replace(/(\w+):/g, '"$1":');
        const parsed = JSON.parse(fixed);
        if (Array.isArray(parsed)) {
          choices = parsed;
        }
      } catch {
        // Parse başarısız — tek string'i choice olarak kullan
        this.logger.warn('Could not parse nested choices string');
      }
    }

    return choices.map((c: any, i: number) => {
      if (typeof c === 'string') {
        return { id: String(i + 1), text: c, type: 'action' };
      }
      if (typeof c === 'object' && c !== null) {
        // Choice text bilingual response'ta object olabilir; ilk string değeri al.
        let textVal = '';
        if (typeof c.text === 'string') textVal = c.text;
        else if (typeof c.text === 'object' && c.text) {
          const found = Object.values(c.text).find(
            (v) => typeof v === 'string' && (v as string).trim().length > 0,
          );
          textVal = (found as string) || '';
        }
        return {
          id: String(c.id ?? c._id ?? i + 1),
          text: String(textVal || c.label || c.description || '').trim(),
          type: String(c.type ?? 'action'),
        };
      }
      return { id: String(i + 1), text: '', type: 'action' };
    });
  }

  /**
   * Bilingual response'ta bir dildeki eksik choice'ı diğer dildekinin
   * aynı index'lisinden doldur. Grok çoğu zaman bir dili tamamlar, diğer
   * dili atlar — retry'a gitmeden bu basit mapping ile %90 vakayı çözer.
   * Üç dil farkı yok çünkü choices her iki dilde aynı anlam — aynı sıradaki
   * choice index'li zaten aynı aksiyon.
   */
  private patchBilingualChoicesFromOtherLang(response: any): void {
    if (!response.localizedChoices || typeof response.localizedChoices !== 'object') return;
    const langs = Object.keys(response.localizedChoices);
    if (langs.length < 2) return;
    const isValid = (c: any): boolean => {
      if (!c) return false;
      if (typeof c.text === 'string') return c.text.trim().length >= 2;
      return false;
    };
    for (let i = 0; i < 4; i++) {
      let goodIdx: number | null = null;
      for (let l = 0; l < langs.length; l++) {
        const arr = response.localizedChoices[langs[l]];
        if (Array.isArray(arr) && isValid(arr[i])) {
          goodIdx = l;
          break;
        }
      }
      if (goodIdx === null) continue;
      const goodLang = langs[goodIdx];
      const goodChoice = response.localizedChoices[goodLang][i];
      for (let l = 0; l < langs.length; l++) {
        if (l === goodIdx) continue;
        const arr = response.localizedChoices[langs[l]];
        if (!Array.isArray(arr)) continue;
        if (!isValid(arr[i])) {
          // Patch: id + type source'dan, text de source'tan (aynı dilde kalır
          // ama hiç choice olmamasından iyidir — AI çoğu zaman bir dilde tamamlar)
          arr[i] = {
            id: String(goodChoice.id ?? i + 1),
            text: goodChoice.text,
            type: goodChoice.type || 'action',
          };
          this.logger.warn(
            `[choice-patch] ${langs[l]}.choices[${i}] eksikti, ${goodLang}'den kopyalandı (text aynı dil ama fallback)`,
          );
        }
      }
    }
  }

  /**
   * Strict validation — multiplayer için. 4 choice, her birinde text dolu.
   */
  private validateMultiplayerChoices(response: any): { valid: boolean; reason: string } {
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
    const checkArr = (arr: any): { valid: boolean; reason: string } => {
      if (!Array.isArray(arr)) return { valid: false, reason: 'not array' };
      if (arr.length !== 4)
        return { valid: false, reason: `count=${arr.length}, must be 4` };
      for (let i = 0; i < arr.length; i++) {
        const t = extractText(arr[i]);
        if (!t || t.length < 2) return { valid: false, reason: `choice[${i}] empty text` };
      }
      return { valid: true, reason: 'ok' };
    };

    if (response.localizedChoices) {
      for (const lang of Object.keys(response.localizedChoices)) {
        const r = checkArr(response.localizedChoices[lang]);
        if (!r.valid) return { valid: false, reason: `[${lang}] ${r.reason}` };
      }
      return { valid: true, reason: 'ok' };
    }
    return checkArr(response.choices);
  }

  private keepValidMultiplayerChoices(response: any): {
    minCount: number;
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
      let minC = Infinity;
      for (const lang of Object.keys(response.localizedChoices)) {
        const f = (response.localizedChoices[lang] || []).filter(isValid);
        out[lang] = f;
        minC = Math.min(minC, f.length);
      }
      return { minCount: minC === Infinity ? 0 : minC, localizedChoices: out };
    }
    const f = (response.choices || []).filter(isValid);
    return { minCount: f.length, choices: f };
  }
}
