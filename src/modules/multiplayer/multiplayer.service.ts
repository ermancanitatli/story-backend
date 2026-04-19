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
    // Bilingual = 2 farklı dil (aynı dil ise tek languages list'i).
    // Dual perspective ayrı bir kavram — multiplayer'da her zaman aktif.
    const isBilingual = hostLang !== guestLang;
    const languages = isBilingual ? [hostLang, guestLang] : [hostLang];

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
      languages,
      requireDualPerspectiveSameLang: !isBilingual, // aynı dilde de dual perspective
    });
    const userMessage = buildUserMessage({ type: 'start', userChoice: '', recentHistory: [] });

    // Multiplayer dual perspective — iki sahne + 4 choice JSON'ı üretiliyor,
    // token ihtiyacı tek-sahneden ~2x. Base'i yüksek tut ki parse fail olmasın.
    const grokResponse = await this.aiService.callGrokAPI({
      systemPrompt,
      userMessage,
      baseMaxTokens: 8000,
    });

    // DUAL POV VALIDATION (initial scene) — normalize + similarity
    if (grokResponse.scenes) {
      const sc: any = grokResponse.scenes;
      if (sc.host && sc.guest) {
        const h = String(sc.host).trim();
        const g = String(sc.guest).trim();
        const nH = h.toLowerCase().replace(/[\s\n\r]+/g, ' ').replace(/[.,!?;:'"\-—()]+/g, '').trim();
        const nG = g.toLowerCase().replace(/[\s\n\r]+/g, ' ').replace(/[.,!?;:'"\-—()]+/g, '').trim();
        const sharedPrefixLen = (() => {
          const len = Math.min(nH.length, nG.length);
          let i = 0;
          while (i < len && nH[i] === nG[i]) i++;
          return i;
        })();
        const similarity = sharedPrefixLen / Math.max(nH.length, nG.length, 1);
        if (h && (nH === nG || similarity > 0.7)) {
          this.logger.warn(
            `[dual-pov][initial] similar scenes (identical=${nH === nG}, similarity=${similarity.toFixed(2)}), delta retry`,
          );
          try {
            const rewritten = await this.aiService.generatePovPerspective({
              existingScene: h,
              existingPovName: session.hostName || 'Host',
              targetPovName: session.guestName || 'Guest',
              otherName: session.hostName || 'Host',
              languageCode: session.hostLanguageCode || 'en',
            });
            if (rewritten && rewritten !== h) {
              sc.guest = rewritten;
              this.logger.log(`[dual-pov][initial] delta rewrite succeeded`);
            }
          } catch (err) {
            this.logger.warn(
              `[dual-pov][initial] delta err: ${(err as Error).message}`,
            );
          }
        }
      }
    }

    // Çift dilli response normalize et
    let sceneText: string;
    let choicesData: any;
    let scenes: Record<string, string> | undefined;
    let localizedChoices: Record<string, any> | undefined;

    if (grokResponse.scenes) {
      const sceneKeys = Object.keys(grokResponse.scenes);
      const isDualPerspective =
        sceneKeys.includes('host') && sceneKeys.includes('guest');

      if (isDualPerspective) {
        // Same-language dual perspective: scenes.host + scenes.guest
        scenes = grokResponse.scenes; // {host: "...", guest: "..."}
        // choices tek array (her iki oyuncu aynı dili kullanıyor)
        choicesData = grokResponse.choices || [];
        // Fallback currentScene — host view (ilk turn host aktif)
        sceneText = grokResponse.scenes.host || grokResponse.scenes.guest || '';
      } else {
        // Bilingual — scenes[hostLang] + scenes[guestLang]
        scenes = grokResponse.scenes;
        const rawLC = grokResponse.localizedChoices || {};
        localizedChoices = {};
        for (const lang of Object.keys(rawLC)) {
          localizedChoices[lang] = this.normalizeChoices(rawLC[lang]);
        }
        sceneText = grokResponse.scenes[languages[0]] || Object.values(grokResponse.scenes)[0] || '';
        choicesData = localizedChoices[languages[0]] || Object.values(localizedChoices)[0] || [];
      }
    } else {
      // Tek dilli, tek perspective (nadir durum)
      sceneText = grokResponse.currentScene || '';
      choicesData = grokResponse.choices || [];
    }

    const progress = await this.progressModel.create({
      sessionId: session._id,
      activePlayerId: session.activePlayerId,
      turnOrder: 1,
      currentScene: sceneText,
      choices: this.normalizeChoices(choicesData),
      scenes,
      localizedChoices,
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
        const sc = p.scenes;
        // Same-language dual perspective: scenes.host + scenes.guest
        if (sc?.host && sc?.guest) {
          return `[${hostLabel} POV]\n${sc.host}\n\n[${guestLabel} POV]\n${sc.guest}`;
        }
        // Bilingual (tr-en) — her iki dilde ve her iki POV
        if (sc && typeof sc === 'object') {
          const langs = Object.keys(sc).filter((k) => k !== 'host' && k !== 'guest');
          if (langs.length >= 2) {
            return langs
              .map((l) => `[${l.toUpperCase()}]\n${sc[l]}`)
              .join('\n\n');
          }
        }
        // Fallback — eski progress docs (sadece currentScene)
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
      // Sahne SUBMIT EDEN oyuncunun gözünden yazılmalı (onun seçimi sahneyi şekillendiriyor).
      // userId = şu an choice submit eden aktif oyuncu.
      activePlayerName:
        userId === session.hostId?.toString() ? session.hostName : session.guestName,
      languages,
      requireDualPerspectiveSameLang: !isBilingual,
      rollingSummary: tierRollingSummary,
      chapterBridges: tierChapterBridges,
      recentHistory,
    });
    // Dual POV tail reminder — her zaman aktif (bilingual veya same-lang)
    const activeNameForPrompt =
      userId === session.hostId?.toString()
        ? session.hostName || 'Host'
        : session.guestName || 'Guest';
    const userMessage = buildUserMessage({
      type: 'continue',
      userChoice: choice.text,
      recentHistory,
      rollingSummary: tierRollingSummary,
      chapterBridges: tierChapterBridges,
      multiplayerDualPov: {
        hostName: session.hostName || 'Host',
        guestName: session.guestName || 'Guest',
        activeName: activeNameForPrompt,
      },
    });

    // Multiplayer dual perspective — yüksek token ihtiyacı
    let grokResponse = await this.aiService.callGrokAPI({
      systemPrompt,
      userMessage,
      baseMaxTokens: 8000,
    });

    // Bilingual'da tek dilde eksik choice varsa diğer dildeki aynı index'li choice ile doldur
    // (AI retry'ından önce bu basit patching — çoğu zaman bir dil başarılı oluyor).
    this.patchBilingualChoicesFromOtherLang(grokResponse);

    // === CHOICE VALIDATION + RETRY (max 3 deneme) ===
    const CHOICE_MAX_RETRIES = 3;
    let choiceRetry = 0;
    while (choiceRetry < CHOICE_MAX_RETRIES) {
      const check = this.validateMultiplayerChoices(grokResponse);
      if (check.valid) break;
      this.logger.warn(
        `[choice-validate][multi] session=${sessionId} retry=${choiceRetry + 1}/${CHOICE_MAX_RETRIES} — ${check.reason}`,
      );
      // Bilingual mod için explicit örnek ekle
      const isBilingualRetry = !!grokResponse.localizedChoices || !!grokResponse.scenes;
      const bilingualExample = isBilingualRetry
        ? `\n\nFor bilingual mode, "choices" object MUST have EXACTLY 4 entries for EACH language:\n` +
          `{\n  "scenes": { "${languages[0]}": "...", "${languages[1] || 'en'}": "..." },\n` +
          `  "choices": {\n` +
          `    "${languages[0]}": [\n` +
          `      {"id":"1","text":"non-empty sentence","type":"action"},\n` +
          `      {"id":"2","text":"non-empty sentence","type":"dialogue"},\n` +
          `      {"id":"3","text":"non-empty sentence","type":"exploration"},\n` +
          `      {"id":"4","text":"non-empty sentence","type":"decision"}\n` +
          `    ],\n` +
          `    "${languages[1] || 'en'}": [ /* same 4 choices translated */ ]\n` +
          `  }\n}\n` +
          `Both languages MUST have 4 choices with non-empty text. Missing or empty = error.`
        : '';
      const retryMsg =
        userMessage +
        `\n\n[RESPONSE FORMAT ERROR — ATTEMPT ${choiceRetry + 1}/${CHOICE_MAX_RETRIES}]\n` +
        `Your previous response had invalid choices: ${check.reason}\n` +
        `CRITICAL: EXACTLY 4 choices required. Each must have non-empty "text" and valid "type".${bilingualExample}\n` +
        `Regenerate full JSON now.`;
      try {
        grokResponse = await this.aiService.callGrokAPI({
          systemPrompt,
          userMessage: retryMsg,
          baseMaxTokens: 8000,
        });
        choiceRetry++;
      } catch (err) {
        this.logger.warn(`[choice-validate][multi] retry err: ${(err as Error).message}`);
        break;
      }
    }
    const finalCheckMP = this.validateMultiplayerChoices(grokResponse);
    if (!finalCheckMP.valid) {
      const kept = this.keepValidMultiplayerChoices(grokResponse);
      // Bilingual mode: minCount her iki dilde de en az 2 olursa kabul (tek dilde eksik olabilir)
      // Single mode: en az 3 choice olmalı
      const acceptableThreshold = grokResponse.localizedChoices ? 2 : 3;
      if (kept.minCount >= acceptableThreshold) {
        this.logger.warn(
          `[choice-validate][multi] ${kept.minCount}/4 valid choice ile devam (threshold=${acceptableThreshold})`,
        );
        if (grokResponse.localizedChoices && kept.localizedChoices) {
          grokResponse.localizedChoices = kept.localizedChoices;
        }
        if (kept.choices) grokResponse.choices = kept.choices;
      } else {
        throw new BadRequestException(
          `AI 3 deneme sonrası geçerli choice üretemedi (${kept.minCount}/4, threshold=${acceptableThreshold}).`,
        );
      }
    }

    // === DEBUG: response shape'ini gör ===
    this.logger.warn(
      `[dual-pov][debug] response keys: scenes=${!!grokResponse.scenes} ` +
        `scene_keys=${grokResponse.scenes ? Object.keys(grokResponse.scenes).join(',') : 'none'} ` +
        `currentScene=${!!grokResponse.currentScene} ` +
        `choices_arr=${Array.isArray(grokResponse.choices)} ` +
        `localizedChoices=${!!(grokResponse as any).localizedChoices} ` +
        `active_player_confirmation=${(grokResponse as any).active_player_confirmation || 'none'}`,
    );

    // === DUAL POV VALIDATION — scenes.host === scenes.guest ise guest delta retry ===
    // Normalize + similarity ratio (whitespace/punctuation fark etmesin, %90+ benzerlik dahil)
    if (grokResponse.scenes) {
      const sc: any = grokResponse.scenes;
      if (sc.host && sc.guest) {
        const hostScene = String(sc.host).trim();
        const guestScene = String(sc.guest).trim();
        const activeNameForValidate =
          userId === session.hostId?.toString()
            ? session.hostName || 'Host'
            : session.guestName || 'Guest';

        // Normalize: küçük harf, tek boşluk, noktalama trim
        const normalize = (s: string): string =>
          s
            .toLowerCase()
            .replace(/[\s\n\r]+/g, ' ')
            .replace(/[.,!?;:'"\-—()]+/g, '')
            .trim();
        const nH = normalize(hostScene);
        const nG = normalize(guestScene);
        // Basit similarity: iki string'in ortak prefix uzunluğu / max uzunluk
        const sharedPrefixLen = (() => {
          const len = Math.min(nH.length, nG.length);
          let i = 0;
          while (i < len && nH[i] === nG[i]) i++;
          return i;
        })();
        const maxLen = Math.max(nH.length, nG.length, 1);
        const similarity = sharedPrefixLen / maxLen;

        // Trigger: byte-eş VEYA prefix similarity > 0.7 (uzun benzer başlangıç)
        const isIdentical = nH === nG;
        const isTooSimilar = similarity > 0.7;

        if (hostScene && (isIdentical || isTooSimilar)) {
          this.logger.warn(
            `[dual-pov] similar scenes detected (active=${activeNameForValidate}, identical=${isIdentical}, similarity=${similarity.toFixed(2)}), retrying with delta rewrite`,
          );
          try {
            // Active oyuncu kim? Onun POV'unu base al, diğerini rewrite et.
            const isHostActive = userId === session.hostId?.toString();
            const sourcePov = isHostActive
              ? { name: session.hostName || 'Host', scene: hostScene }
              : { name: session.guestName || 'Guest', scene: guestScene };
            const targetPov = isHostActive
              ? { name: session.guestName || 'Guest' }
              : { name: session.hostName || 'Host' };
            const rewritten = await this.aiService.generatePovPerspective({
              existingScene: sourcePov.scene,
              existingPovName: sourcePov.name,
              targetPovName: targetPov.name,
              otherName: sourcePov.name,
              languageCode: session.hostLanguageCode || 'en',
            });
            if (rewritten && rewritten !== sourcePov.scene) {
              if (isHostActive) {
                sc.guest = rewritten;
              } else {
                sc.host = rewritten;
              }
              this.logger.log(
                `[dual-pov] delta rewrite succeeded for ${targetPov.name}'s POV (len=${rewritten.length})`,
              );
            } else {
              this.logger.warn(
                `[dual-pov] delta rewrite returned empty/same — keeping identical scenes (degraded)`,
              );
            }
          } catch (err) {
            this.logger.warn(
              `[dual-pov] delta rewrite err: ${(err as Error).message}`,
            );
          }
        }
      }
    }

    // Response normalize — dual perspective / bilingual / single
    let sceneText: string;
    let choicesArr: any;
    let scenes: Record<string, string> | undefined;
    let localizedChoices: Record<string, any> | undefined;

    if (grokResponse.scenes) {
      const sceneKeys = Object.keys(grokResponse.scenes);
      const isDualPerspective =
        sceneKeys.includes('host') && sceneKeys.includes('guest');

      if (isDualPerspective) {
        scenes = grokResponse.scenes;
        choicesArr = grokResponse.choices || [];
        sceneText = grokResponse.scenes.host || grokResponse.scenes.guest || '';
      } else {
        scenes = grokResponse.scenes;
        const rawLC = grokResponse.localizedChoices || {};
        localizedChoices = {};
        for (const lang of Object.keys(rawLC)) {
          localizedChoices[lang] = this.normalizeChoices(rawLC[lang]);
        }
        sceneText = grokResponse.scenes[languages[0]] || Object.values(grokResponse.scenes)[0] || '';
        choicesArr = localizedChoices[languages[0]] || Object.values(localizedChoices)[0] || [];
      }
    } else {
      sceneText = grokResponse.currentScene || '';
      choicesArr = grokResponse.choices || [];
    }

    // Create progress
    const newTurn = session.turnOrder + 1;
    const progress = await this.progressModel.create({
      sessionId: session._id,
      activePlayerId: session.nextPlayerId,
      turnOrder: newTurn,
      currentScene: sceneText,
      choices: this.normalizeChoices(choicesArr),
      scenes,
      localizedChoices,
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

    // === ASYNC: Rolling summary update (fire-and-forget) ===
    const ROLLING_SUMMARY_INTERVAL = 5;
    const MIN_STEPS_FOR_ROLLING = 3;
    const ROLLING_SOURCE_WINDOW = 5;
    if (
      rollingEnabled &&
      !grokResponse.isEnding &&
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
