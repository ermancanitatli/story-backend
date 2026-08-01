import { Injectable, Logger, Inject, forwardRef, OnModuleDestroy } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MultiplayerSession } from './schemas/multiplayer-session.schema';
import { MultiplayerService } from './multiplayer.service';
import { StoriesService } from '../stories/stories.service';
import { UsersService } from '../users/users.service';
import { AppGateway } from '../socket/app.gateway';
import { FakeMoveService } from '../fake-users/fake-move.service';
import { Story } from '../stories/schemas/story.schema';
import { getTranslation } from '../stories/helpers/translation.helper';
import {
  resolveStoryVote,
  StoryVoteOutcome,
  StoryVoteResolution,
  STORY_VOTE_WINDOW_MS,
} from './helpers/story-vote.helpers';

/**
 * Süresi geçmiş oylamayı cron'un devralması için beklenen ek süre.
 * Bellekteki timer normalde önce ateşler; cron yalnızca süreç yeniden
 * başladığında (timer kaybolduğunda) devreye girer.
 */
const SWEEP_GRACE_MS = 15_000;

/**
 * Oy sonucu yazıldı ama oyuna geçirilemedi (ör. AI çağrısı sırasında süreç öldü).
 * Bu kadar süre sonra süpürge oturumu zorla oyuna geçirir.
 */
const SWEEP_STUCK_MS = 120_000;

const SWEEP_BATCH_LIMIT = 100;

/** Bir oylama adayının istemciye giden hâli — alan adları iOS ile sözleşmedir. */
export interface StoryVoteCandidatePayload {
  storyId: string;
  title: string;
  summary: string;
  coverImage: string | null;
  genre: string | null;
  tags: string[];
}

/**
 * Eşleşme sonrası hikaye oylaması.
 *
 * Doğruluk kaynağı `session.storyVote` dokümanıdır; bellekteki timer sadece
 * hızlandırıcıdır. Bu ayrım bilinçli: socket kopması, süreç restart'ı veya
 * çift istek oylamayı öldürmemeli.
 *
 * Kilitlenme garantileri:
 *   1. Oy kaydı `storyVote.<field>: null` koşuluyla atomik → ilk oy geçerli.
 *   2. Sonuçlandırma `storyVote.resolvedAt: null` koşuluyla atomik → "iki oy
 *      da geldi" ile "süre doldu" yarışırsa yalnızca biri kazanır.
 *   3. `resolveStoryVote` her girdi kombinasyonu için bir hikaye döndürür;
 *      hiç oy gelmese bile oyun başlar.
 *   4. Cron süpürgesi, timer'ı kaybolmuş oturumları tamamlar.
 */
@Injectable()
export class StoryVoteService implements OnModuleDestroy {
  private readonly logger = new Logger(StoryVoteService.name);
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private sweeping = false;

  constructor(
    @InjectModel(MultiplayerSession.name)
    private readonly sessionModel: Model<MultiplayerSession>,
    private readonly multiplayerService: MultiplayerService,
    private readonly storiesService: StoriesService,
    private readonly usersService: UsersService,
    @Inject(forwardRef(() => AppGateway)) private readonly appGateway: AppGateway,
    @Inject(forwardRef(() => FakeMoveService)) private readonly fakeMoveService: FakeMoveService,
  ) {}

  onModuleDestroy(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }

  // ─── Public API ───────────────────────────────────────────────

  /**
   * Oylamayı başlat: adayları iki oyuncuya gönder, zaman aşımını kur,
   * bot varsa onun oyunu planla.
   *
   * Tek aday varsa oylama yapılmaz — sonuç doğrudan 'only-option' olur.
   */
  async begin(session: MultiplayerSession): Promise<void> {
    const sessionId = String(session._id);
    const hostId = session.hostId.toString();
    const guestId = session.guestId.toString();
    const vote = session.storyVote;

    try {
      if (!vote || !vote.candidateStoryIds?.length) {
        throw new Error('story vote started without candidates');
      }

      if (vote.candidateStoryIds.length === 1) {
        this.logger.log(`[vote] ${sessionId} has a single accessible story — skipping the vote`);
        await this.resolve(sessionId, 'only-option');
        return;
      }

      const candidates = await this.loadCandidates(vote.candidateStoryIds);
      if (candidates.length === 0) {
        throw new Error('none of the candidate stories could be loaded');
      }

      this.emitStarted(session, candidates, hostId, true);
      this.emitStarted(session, candidates, guestId, false);

      this.armTimer(sessionId, vote.deadlineAt);
      await this.scheduleBotVotes(sessionId, hostId, guestId, vote.candidateStoryIds);
    } catch (err) {
      // Oylama hiç başlayamadıysa iki istemci de bekleme ekranında kalırdı.
      // Oturumu iptal et (süpürge de uğramasın) ve iki tarafa da hata bildir —
      // "oy gelmedi" (timeout sonucu) ile "sunucu patladı" ayrı sinyaller.
      await this.abortVote(sessionId, hostId, guestId, err);
    }
  }

  /** Oylama başlatılamadı: oturumu kapat, iki oyuncuya da hatayı bildir. */
  private async abortVote(
    sessionId: string,
    hostId: string,
    guestId: string,
    err: unknown,
  ): Promise<void> {
    this.clearTimer(sessionId);
    const message = (err as Error)?.message ?? 'Story vote could not be started';
    this.logger.error(`[vote] begin failed for ${sessionId}: ${message}`);

    try {
      await this.sessionModel.updateOne(
        { _id: new Types.ObjectId(sessionId), phase: 'story-voting' },
        { $set: { phase: 'aborted', completedAt: new Date() } },
      );
    } catch (updateErr) {
      this.logger.error(
        `[vote] abort update failed for ${sessionId}: ${(updateErr as Error).message}`,
      );
    }

    const payload = { sessionId, code: 'STORY_VOTE_FAILED', message };
    this.appGateway.emitToUser(hostId, 'matchmaking:error', payload);
    this.appGateway.emitToUser(guestId, 'matchmaking:error', payload);
  }

  /**
   * Oyuncunun oyunu kaydet. İlk oy geçerlidir; ikinci çağrı mevcut oyu döner.
   * İki oy da geldiyse oylamayı hemen sonuçlandırır.
   */
  async castVote(
    sessionId: string,
    userId: string,
    storyId: string,
  ): Promise<
    | { ok: true; storyId: string; alreadyVoted: boolean }
    | { ok: false; reason: 'NOT_VOTING' | 'NOT_PARTICIPANT' | 'INVALID_CANDIDATE' }
  > {
    if (!Types.ObjectId.isValid(sessionId)) return { ok: false, reason: 'NOT_VOTING' };

    const session = await this.sessionModel.findById(sessionId);
    if (!session || !session.storyVote) return { ok: false, reason: 'NOT_VOTING' };

    const isHost = session.hostId.toString() === userId;
    const isGuest = session.guestId.toString() === userId;
    if (!isHost && !isGuest) return { ok: false, reason: 'NOT_PARTICIPANT' };

    if (session.phase !== 'story-voting' || session.storyVote.resolvedAt) {
      return { ok: false, reason: 'NOT_VOTING' };
    }
    if (!session.storyVote.candidateStoryIds.includes(storyId)) {
      return { ok: false, reason: 'INVALID_CANDIDATE' };
    }

    const voteField = isHost ? 'hostVote' : 'guestVote';
    const timeField = isHost ? 'hostVotedAt' : 'guestVotedAt';

    // Atomik ilk-oy-kazanır: alan hâlâ null ise yaz. Aynı anda gelen iki
    // istekten yalnızca biri dokümanı günceller.
    const updated = await this.sessionModel.findOneAndUpdate(
      {
        _id: session._id,
        phase: 'story-voting',
        [`storyVote.${voteField}`]: null,
        'storyVote.resolvedAt': null,
      },
      { $set: { [`storyVote.${voteField}`]: storyId, [`storyVote.${timeField}`]: new Date() } },
      { new: true },
    );

    if (!updated) {
      // Ya bu oyuncu zaten oy vermiş ya da oylama bitmiş.
      const fresh = await this.sessionModel.findById(sessionId);
      const existing = isHost ? fresh?.storyVote?.hostVote : fresh?.storyVote?.guestVote;
      if (existing) return { ok: true, storyId: existing, alreadyVoted: true };
      return { ok: false, reason: 'NOT_VOTING' };
    }

    // Partnere "oy verdi" bilgisi — HANGİ hikaye olduğu paylaşılmaz, yoksa
    // ikinci oyuncu kopyalar ve oylama anlamını yitirir.
    const partnerId = isHost ? updated.guestId.toString() : updated.hostId.toString();
    this.appGateway.emitToUser(partnerId, 'matchmaking:story-vote-update', {
      sessionId,
      partnerVoted: true,
    });

    if (updated.storyVote?.hostVote && updated.storyVote?.guestVote) {
      await this.resolve(sessionId, 'both-voted');
    }

    return { ok: true, storyId, alreadyVoted: false };
  }

  /**
   * Yeniden bağlanan istemciye mevcut oylama durumunu gönder.
   *
   * - Hâlâ oylama sürüyorsa: `story-vote-started` (kendi oyu + partner durumu dolu).
   *   Süre çoktan geçmişse oylamayı burada sonuçlandırır (timer kaybolmuş olabilir).
   * - Oylama bitmişse: `story-vote-result` + oyun hazırsa `matchmaking:completed`.
   */
  async emitStateTo(sessionId: string, userId: string): Promise<void> {
    if (!Types.ObjectId.isValid(sessionId)) return;
    const session = await this.sessionModel.findById(sessionId);
    if (!session) return;

    const isHost = session.hostId.toString() === userId;
    const isGuest = session.guestId.toString() === userId;
    if (!isHost && !isGuest) return;
    if (!session.storyVote) return;

    if (session.phase === 'story-voting' && !session.storyVote.resolvedAt) {
      if (session.storyVote.deadlineAt.getTime() <= Date.now()) {
        // Timer kaybolmuş (restart) — süreyi burada kapat.
        await this.resolve(sessionId, 'deadline');
        return this.emitStateTo(sessionId, userId);
      }
      const candidates = await this.loadCandidates(session.storyVote.candidateStoryIds);
      this.emitStarted(session, candidates, userId, isHost);
      // Timer yoksa (restart sonrası ilk temas) yeniden kur.
      this.armTimer(sessionId, session.storyVote.deadlineAt);
      return;
    }

    const vote = session.storyVote;
    if (vote.resolvedStoryId && vote.resolution) {
      const story = await this.storiesService.findById(vote.resolvedStoryId).catch(() => null);
      this.emitResultTo(userId, isHost, session, {
        storyId: vote.resolvedStoryId,
        resolution: vote.resolution,
        hostVote: vote.hostVote ?? vote.resolvedStoryId,
        guestVote: vote.guestVote ?? vote.resolvedStoryId,
        hostVoteAuto: !!vote.hostVoteAuto,
        guestVoteAuto: !!vote.guestVoteAuto,
      }, story);
    }

    if (session.phase !== 'story-voting') {
      this.appGateway.emitToUser(userId, 'matchmaking:completed', { sessionId });
    }
  }

  // ─── Resolution ───────────────────────────────────────────────

  /**
   * Oylamayı sonuçlandır ve oyunu başlat.
   * `trigger` yalnızca log içindir; sonucu oylar belirler.
   */
  async resolve(
    sessionId: string,
    trigger: 'both-voted' | 'deadline' | 'only-option' | 'sweep',
  ): Promise<void> {
    this.clearTimer(sessionId);

    // Mutual exclusion: resolvedAt'i ilk yazan sonuçlandırma hakkını kazanır.
    const claimed = await this.sessionModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(sessionId),
        phase: 'story-voting',
        'storyVote.resolvedAt': null,
      },
      { $set: { 'storyVote.resolvedAt': new Date() } },
      { new: true },
    );

    if (!claimed || !claimed.storyVote) {
      this.logger.debug(`[vote] resolve(${trigger}) skipped for ${sessionId} — already claimed`);
      return;
    }

    const outcome = resolveStoryVote({
      candidateStoryIds: claimed.storyVote.candidateStoryIds,
      hostVote: claimed.storyVote.hostVote,
      guestVote: claimed.storyVote.guestVote,
    });

    await this.sessionModel.updateOne(
      { _id: claimed._id },
      {
        $set: {
          'storyVote.resolution': outcome.resolution,
          'storyVote.resolvedStoryId': outcome.storyId,
          'storyVote.hostVote': outcome.hostVote,
          'storyVote.guestVote': outcome.guestVote,
          'storyVote.hostVoteAuto': outcome.hostVoteAuto,
          'storyVote.guestVoteAuto': outcome.guestVoteAuto,
        },
      },
    );

    this.logger.log(
      `[vote] ${sessionId} resolved as ${outcome.resolution} → ${outcome.storyId} (trigger=${trigger})`,
    );

    await this.announceAndStart(claimed, outcome);
  }

  /**
   * Sonucu duyur, hikayeyi uygula, oyun hazır olunca `completed` gönder.
   *
   * Sonuç ÖNCE gönderilir: ilk sahne üretimi saniyeler sürebiliyor, bu sırada
   * istemci "X seçildi, hazırlanıyor…" gösterebilsin — ekran donmasın.
   */
  private async announceAndStart(
    session: MultiplayerSession,
    outcome: StoryVoteOutcome,
  ): Promise<void> {
    const sessionId = String(session._id);
    const hostId = session.hostId.toString();
    const guestId = session.guestId.toString();

    const story = await this.storiesService.findById(outcome.storyId).catch(() => null);
    this.emitResultTo(hostId, true, session, outcome, story);
    this.emitResultTo(guestId, false, session, outcome, story);

    try {
      await this.multiplayerService.applyVotedStory(sessionId, outcome.storyId);
    } catch (err) {
      this.logger.error(
        `[vote] applyVotedStory failed for ${sessionId}: ${(err as Error).message}`,
      );
      const payload = {
        sessionId,
        code: 'STORY_VOTE_START_FAILED',
        message: 'Story could not be started after the vote.',
      };
      this.appGateway.emitToUser(hostId, 'matchmaking:error', payload);
      this.appGateway.emitToUser(guestId, 'matchmaking:error', payload);
      return;
    }

    this.appGateway.emitToUser(hostId, 'matchmaking:completed', { sessionId });
    this.appGateway.emitToUser(guestId, 'matchmaking:completed', { sessionId });
  }

  // ─── Sweep (restart dayanıklılığı) ────────────────────────────

  /**
   * Bellekteki timer'ı kaybetmiş oylamaları tamamla.
   *
   * Süreç yeniden başladığında setTimeout'lar kaybolur; bu süpürge olmadan
   * oturum `story-voting` fazında sonsuza kadar asılı kalır ve lobide de
   * görünmez (lobi yalnızca invite/playing listeler).
   */
  @Cron(CronExpression.EVERY_30_SECONDS)
  async sweepStaleVotes(): Promise<void> {
    if (this.sweeping) return;
    this.sweeping = true;
    try {
      const now = Date.now();
      const stale = await this.sessionModel
        .find({
          phase: 'story-voting',
          'storyVote.deadlineAt': { $lt: new Date(now - SWEEP_GRACE_MS) },
        })
        .limit(SWEEP_BATCH_LIMIT)
        .exec();

      for (const session of stale) {
        const sessionId = String(session._id);
        const resolvedAt = session.storyVote?.resolvedAt;

        if (!resolvedAt) {
          await this.resolve(sessionId, 'sweep');
          continue;
        }

        // Sonuç yazılmış ama oyuna geçilememiş — takılı kalmış oturumu kurtar.
        const stuckFor = now - new Date(resolvedAt).getTime();
        if (stuckFor < SWEEP_STUCK_MS) continue;
        const storyId = session.storyVote?.resolvedStoryId;
        if (!storyId) continue;

        this.logger.warn(`[vote] recovering stuck session ${sessionId} (${stuckFor}ms)`);
        try {
          await this.multiplayerService.applyVotedStory(sessionId, storyId);
          this.appGateway.emitToUser(session.hostId.toString(), 'matchmaking:completed', {
            sessionId,
          });
          this.appGateway.emitToUser(session.guestId.toString(), 'matchmaking:completed', {
            sessionId,
          });
        } catch (err) {
          this.logger.error(
            `[vote] stuck recovery failed for ${sessionId}: ${(err as Error).message}`,
          );
        }
      }
    } catch (err) {
      this.logger.error(`[vote] sweep failed: ${(err as Error).message}`);
    } finally {
      this.sweeping = false;
    }
  }

  // ─── Internals ────────────────────────────────────────────────

  private armTimer(sessionId: string, deadlineAt: Date): void {
    if (this.timers.has(sessionId)) return;
    const delay = Math.max(0, new Date(deadlineAt).getTime() - Date.now());
    const timer = setTimeout(() => {
      this.timers.delete(sessionId);
      void this.resolve(sessionId, 'deadline').catch((err) =>
        this.logger.error(`[vote] deadline resolve failed for ${sessionId}: ${err.message}`),
      );
    }, delay);
    this.timers.set(sessionId, timer);
  }

  private clearTimer(sessionId: string): void {
    const timer = this.timers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(sessionId);
    }
  }

  /**
   * Bot katılımcı varsa onun oyunu planla.
   *
   * Bot oy vermezse HER fake eşleşme zaman aşımına düşerdi: oyuncu 25 sn
   * boşuna bekler, sonuç "süre doldu" olur. Deneyim bozulur.
   */
  private async scheduleBotVotes(
    sessionId: string,
    hostId: string,
    guestId: string,
    candidateStoryIds: string[],
  ): Promise<void> {
    try {
      const users = await this.usersService.findByIds([hostId, guestId]);
      for (const user of users) {
        if (!user?.isFake) continue;
        this.fakeMoveService.scheduleFakeVote(sessionId, String(user._id), candidateStoryIds);
      }
    } catch (err) {
      // Bot oy veremezse oylama yine de zaman aşımıyla sonuçlanır — akış kilitlenmez.
      this.logger.error(`[vote] bot vote scheduling failed for ${sessionId}: ${(err as Error).message}`);
    }
  }

  private async loadCandidates(storyIds: string[]): Promise<Story[]> {
    const stories = await this.storiesService.findByIds(storyIds);
    // findByIds sırayı korumaz — aday sırasını sabitleyerek iki istemcide
    // aynı kart dizilimini garantiye al.
    const byId = new Map(stories.map((s) => [String(s._id), s]));
    return storyIds.map((id) => byId.get(id)).filter((s): s is Story => !!s);
  }

  private buildCandidatePayload(story: Story, locale: string): StoryVoteCandidatePayload {
    const covers = (story.coverImage || []).filter((m) => m && !m.hidden && m.url);
    const cover = [...covers].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))[0];
    return {
      storyId: String(story._id),
      title: getTranslation(story, locale, 'title'),
      summary: getTranslation(story, locale, 'summary'),
      coverImage: cover?.url ?? null,
      genre: story.genre ?? null,
      tags: story.tags ?? [],
    };
  }

  private emitStarted(
    session: MultiplayerSession,
    candidates: Story[],
    userId: string,
    isHost: boolean,
  ): void {
    const vote = session.storyVote;
    if (!vote) return;
    const locale = (isHost ? session.hostLanguageCode : session.guestLanguageCode) || 'en';
    const myVote = isHost ? vote.hostVote : vote.guestVote;
    const partnerVote = isHost ? vote.guestVote : vote.hostVote;

    this.appGateway.emitToUser(userId, 'matchmaking:story-vote-started', {
      sessionId: String(session._id),
      candidates: candidates.map((s) => this.buildCandidatePayload(s, locale)),
      deadlineAt: new Date(vote.deadlineAt).toISOString(),
      // Yeniden bağlanan istemci kalan süreyi bundan hesaplasın; deadlineAt
      // saat farkına, durationMs ise gecikmeye karşı yedek.
      durationMs: STORY_VOTE_WINDOW_MS,
      remainingMs: Math.max(0, new Date(vote.deadlineAt).getTime() - Date.now()),
      myVote: myVote ?? null,
      partnerVoted: !!partnerVote,
    });
  }

  private emitResultTo(
    userId: string,
    isHost: boolean,
    session: MultiplayerSession,
    outcome: {
      storyId: string;
      resolution: StoryVoteResolution;
      hostVote: string;
      guestVote: string;
      hostVoteAuto: boolean;
      guestVoteAuto: boolean;
    },
    story: Story | null,
  ): void {
    const locale = (isHost ? session.hostLanguageCode : session.guestLanguageCode) || 'en';
    this.appGateway.emitToUser(userId, 'matchmaking:story-vote-result', {
      sessionId: String(session._id),
      storyId: outcome.storyId,
      story: story ? this.buildCandidatePayload(story, locale) : null,
      // Dürüstlük sözleşmesi: istemci bunu "ortak karar" diye göstermemeli.
      resolution: outcome.resolution,
      myVote: isHost ? outcome.hostVote : outcome.guestVote,
      partnerVote: isHost ? outcome.guestVote : outcome.hostVote,
      myVoteAuto: isHost ? outcome.hostVoteAuto : outcome.guestVoteAuto,
      partnerVoteAuto: isHost ? outcome.guestVoteAuto : outcome.hostVoteAuto,
    });
  }
}
