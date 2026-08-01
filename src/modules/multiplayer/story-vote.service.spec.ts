import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { StoryVoteService } from './story-vote.service';
import { MultiplayerService } from './multiplayer.service';
import { MultiplayerSession } from './schemas/multiplayer-session.schema';
import { StoriesService } from '../stories/stories.service';
import { UsersService } from '../users/users.service';
import { AppGateway } from '../socket/app.gateway';
import { FakeMoveService } from '../fake-users/fake-move.service';

/**
 * Oylamanın yarış ve kilitlenme davranışı.
 *
 * Gerçek Mongo yerine, kullanılan tek iki atomik ilkeyi taklit eden bir sahte
 * model var: koşullu `findOneAndUpdate` (oy claim'i ve sonuç claim'i). Test
 * edilen şey tam olarak bu iki claim'in doğru koşullarla çağrılması —
 * bozulursa ya oy iki kez sayılır ya da tek eşleşme için iki AI pipeline'ı
 * tetiklenir.
 */

const HOST = new Types.ObjectId().toString();
const GUEST = new Types.ObjectId().toString();
const SESSION_ID = new Types.ObjectId().toString();

function makeSessionDoc(overrides: Record<string, any> = {}) {
  return {
    _id: SESSION_ID,
    hostId: { toString: () => HOST },
    guestId: { toString: () => GUEST },
    hostLanguageCode: 'tr',
    guestLanguageCode: 'tr',
    phase: 'story-voting',
    storyVote: {
      candidateStoryIds: ['s1', 's2', 's3'],
      startedAt: new Date(),
      deadlineAt: new Date(Date.now() + 25_000),
      hostVote: null,
      guestVote: null,
      hostVotedAt: null,
      guestVotedAt: null,
      hostVoteAuto: false,
      guestVoteAuto: false,
      resolution: null,
      resolvedStoryId: null,
      resolvedAt: null,
    },
    ...overrides,
  };
}

/** `{ 'a.b': v }` biçimindeki filtre/güncellemeleri iç içe nesneye uygular. */
function getPath(obj: any, path: string) {
  return path.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
}
function setPath(obj: any, path: string, value: any) {
  const keys = path.split('.');
  const last = keys.pop()!;
  const target = keys.reduce((acc, key) => (acc[key] ??= {}), obj);
  target[last] = value;
}

class FakeSessionModel {
  doc: any = makeSessionDoc();

  async findById(_id: string) {
    return this.doc;
  }

  /** Koşullu atomik güncelleme — `null` filtresi "null veya eksik" demektir. */
  async findOneAndUpdate(filter: any, update: any, _opts?: any) {
    const matches = Object.entries(filter).every(([key, expected]) => {
      if (key === '_id') return true;
      const actual = getPath(this.doc, key);
      if (expected === null) return actual === null || actual === undefined;
      return String(actual) === String(expected);
    });
    if (!matches) return null;
    for (const [path, value] of Object.entries(update.$set ?? {})) {
      setPath(this.doc, path, value);
    }
    return this.doc;
  }

  async updateOne(_filter: any, update: any) {
    for (const [path, value] of Object.entries(update.$set ?? {})) {
      setPath(this.doc, path, value);
    }
    return { modifiedCount: 1 };
  }

  find() {
    return { limit: () => ({ exec: async () => [] }) };
  }
}

describe('StoryVoteService — yarış ve kilitlenme', () => {
  let service: StoryVoteService;
  let model: FakeSessionModel;
  let applyVotedStory: jest.Mock;
  let emitToUser: jest.Mock;
  let scheduleFakeVote: jest.Mock;
  let findByIds: jest.Mock;
  let users: any[];

  const storyDoc = (id: string) => ({
    _id: id,
    title: `Story ${id}`,
    genre: 'romance',
    tags: [],
    coverImage: [{ url: `https://cdn/${id}.jpg`, order: 0 }],
    translations: {},
  });

  beforeEach(async () => {
    model = new FakeSessionModel();
    applyVotedStory = jest.fn().mockResolvedValue(undefined);
    emitToUser = jest.fn();
    scheduleFakeVote = jest.fn();
    users = [
      { _id: HOST, isFake: false },
      { _id: GUEST, isFake: false },
    ];
    findByIds = jest
      .fn()
      .mockImplementation(async (ids: string[]) => ids.map((id) => storyDoc(id)));

    const moduleRef = await Test.createTestingModule({
      providers: [
        StoryVoteService,
        { provide: getModelToken(MultiplayerSession.name), useValue: model },
        { provide: MultiplayerService, useValue: { applyVotedStory } },
        {
          provide: StoriesService,
          useValue: {
            findByIds: (ids: string[]) => findByIds(ids),
            findById: async (id: string) => storyDoc(id),
          },
        },
        { provide: UsersService, useValue: { findByIds: async () => users } },
        { provide: AppGateway, useValue: { emitToUser } },
        { provide: FakeMoveService, useValue: { scheduleFakeVote } },
      ],
    }).compile();

    service = moduleRef.get(StoryVoteService);
  });

  afterEach(() => service.onModuleDestroy());

  describe('castVote', () => {
    it('ilk oy geçerlidir, ikinci gönderim mevcut oyu döner (idempotent)', async () => {
      const first = await service.castVote(SESSION_ID, HOST, 's2');
      expect(first).toEqual({ ok: true, storyId: 's2', alreadyVoted: false });

      // Aynı oyuncu fikir değiştirse bile ilk oyu geçerli kalır.
      const second = await service.castVote(SESSION_ID, HOST, 's3');
      expect(second).toEqual({ ok: true, storyId: 's2', alreadyVoted: true });
      expect(model.doc.storyVote.hostVote).toBe('s2');
    });

    it('aday olmayan storyId reddedilir', async () => {
      const res = await service.castVote(SESSION_ID, HOST, 'not-a-candidate');
      expect(res).toEqual({ ok: false, reason: 'INVALID_CANDIDATE' });
      expect(model.doc.storyVote.hostVote).toBeNull();
    });

    it('oturuma ait olmayan kullanıcı oy veremez', async () => {
      const res = await service.castVote(SESSION_ID, new Types.ObjectId().toString(), 's1');
      expect(res).toEqual({ ok: false, reason: 'NOT_PARTICIPANT' });
    });

    it('oylama bittikten sonra gelen oy kabul edilmez', async () => {
      model.doc.storyVote.resolvedAt = new Date();
      const res = await service.castVote(SESSION_ID, GUEST, 's1');
      expect(res).toEqual({ ok: false, reason: 'NOT_VOTING' });
    });

    it('partnere yalnızca "oy verdi" bilgisi gider, hangi hikaye olduğu GİTMEZ', async () => {
      await service.castVote(SESSION_ID, HOST, 's2');
      const update = emitToUser.mock.calls.find((c) => c[1] === 'matchmaking:story-vote-update');
      expect(update).toBeDefined();
      expect(update![0]).toBe(GUEST);
      expect(update![2]).toEqual({ sessionId: SESSION_ID, partnerVoted: true });
      expect(JSON.stringify(update![2])).not.toContain('s2');
    });
  });

  describe('sonuçlandırma', () => {
    it('iki oy da gelince oyun anında başlar — süre beklenmez', async () => {
      await service.castVote(SESSION_ID, HOST, 's2');
      expect(applyVotedStory).not.toHaveBeenCalled();

      await service.castVote(SESSION_ID, GUEST, 's2');
      expect(applyVotedStory).toHaveBeenCalledTimes(1);
      expect(applyVotedStory).toHaveBeenCalledWith(SESSION_ID, 's2');
      expect(model.doc.storyVote.resolution).toBe('agreement');
    });

    it('süre dolması ile son oy YARIŞIRSA pipeline yalnızca bir kez çalışır', async () => {
      await service.castVote(SESSION_ID, HOST, 's1');
      await Promise.all([
        service.castVote(SESSION_ID, GUEST, 's1'),
        service.resolve(SESSION_ID, 'deadline'),
        service.resolve(SESSION_ID, 'sweep'),
      ]);
      expect(applyVotedStory).toHaveBeenCalledTimes(1);
    });

    it('hiç oy gelmezse yine de oyun başlar ve sonuç dürüstçe timeout denir', async () => {
      await service.resolve(SESSION_ID, 'deadline');
      expect(applyVotedStory).toHaveBeenCalledTimes(1);
      expect(model.doc.storyVote.resolution).toBe('timeout');
      expect(model.doc.storyVote.hostVoteAuto).toBe(true);
      expect(model.doc.storyVote.guestVoteAuto).toBe(true);
    });

    it('sonuç `completed`den ÖNCE gönderilir — bekleyen ekran donmasın', async () => {
      await service.resolve(SESSION_ID, 'deadline');
      const events = emitToUser.mock.calls.map((c) => c[1]);
      expect(events.indexOf('matchmaking:story-vote-result')).toBeLessThan(
        events.indexOf('matchmaking:completed'),
      );
      // İki oyuncu da hem sonucu hem completed'ı alır.
      expect(events.filter((e) => e === 'matchmaking:completed')).toHaveLength(2);
    });

    it('oyuna geçiş başarısız olursa completed DEĞİL hata gönderilir', async () => {
      applyVotedStory.mockRejectedValueOnce(new Error('story deleted'));
      await service.resolve(SESSION_ID, 'deadline');
      const events = emitToUser.mock.calls.map((c) => c[1]);
      expect(events).toContain('matchmaking:error');
      expect(events).not.toContain('matchmaking:completed');
    });

    it('oturum artık oylamada değilse sonuçlandırma no-op olur', async () => {
      model.doc.phase = 'cancelled';
      await service.resolve(SESSION_ID, 'deadline');
      expect(applyVotedStory).not.toHaveBeenCalled();
    });
  });

  describe('begin', () => {
    it('bot katılımcı varsa botun oyunu planlar', async () => {
      users = [
        { _id: HOST, isFake: false },
        { _id: GUEST, isFake: true },
      ];
      await service.begin(model.doc as any);
      expect(scheduleFakeVote).toHaveBeenCalledWith(SESSION_ID, GUEST, ['s1', 's2', 's3']);
    });

    it('iki taraf da gerçekse bot oyu planlanmaz', async () => {
      await service.begin(model.doc as any);
      expect(scheduleFakeVote).not.toHaveBeenCalled();
    });

    it('iki oyuncuya da aday listesi gönderilir', async () => {
      await service.begin(model.doc as any);
      const started = emitToUser.mock.calls.filter(
        (c) => c[1] === 'matchmaking:story-vote-started',
      );
      expect(started.map((c) => c[0]).sort()).toEqual([HOST, GUEST].sort());
      expect(started[0][2]).toMatchObject({ sessionId: SESSION_ID, myVote: null, partnerVoted: false });
      expect(started[0][2].deadlineAt).toEqual(expect.any(String));
      expect(started[0][2].candidates.map((c: any) => c.storyId)).toEqual(['s1', 's2', 's3']);
    });

    it('aday sırası iki istemcide de aynıdır', async () => {
      // findByIds sırayı korumaz; kartların iki ekranda farklı dizilmesi
      // "sen soldakini seç" gibi sesli koordinasyonu bozar.
      findByIds.mockImplementationOnce(async (ids: string[]) =>
        [...ids].reverse().map((id) => storyDoc(id)),
      );
      await service.begin(model.doc as any);
      const started = emitToUser.mock.calls.filter(
        (c) => c[1] === 'matchmaking:story-vote-started',
      );
      expect(started[0][2].candidates.map((c: any) => c.storyId)).toEqual(['s1', 's2', 's3']);
      expect(started[1][2].candidates.map((c: any) => c.storyId)).toEqual(['s1', 's2', 's3']);
    });

    it('adaylar yüklenemezse oylama iptal edilir ve İKİ tarafa da hata gider', async () => {
      // "oy gelmedi" (timeout) ile "sunucu patladı" ayrı sinyaller olmalı.
      findByIds.mockResolvedValueOnce([]);
      await service.begin(model.doc as any);

      const errors = emitToUser.mock.calls.filter((c) => c[1] === 'matchmaking:error');
      expect(errors.map((c) => c[0]).sort()).toEqual([HOST, GUEST].sort());
      expect(errors[0][2]).toMatchObject({ sessionId: SESSION_ID, code: 'STORY_VOTE_FAILED' });
      // Oturum kapatılır — süpürge sonradan gelip kimsenin izlemediği oyunu başlatmasın.
      expect(model.doc.phase).toBe('aborted');
      expect(emitToUser.mock.calls.map((c) => c[1])).not.toContain('matchmaking:completed');
    });

    it('tek aday varsa oylama yapılmaz, sonuç only-option olur', async () => {
      model.doc.storyVote.candidateStoryIds = ['solo'];
      await service.begin(model.doc as any);
      expect(emitToUser.mock.calls.map((c) => c[1])).not.toContain(
        'matchmaking:story-vote-started',
      );
      expect(model.doc.storyVote.resolution).toBe('only-option');
      expect(applyVotedStory).toHaveBeenCalledWith(SESSION_ID, 'solo');
    });
  });

  describe('yeniden bağlanma', () => {
    it('oylama sürerken durum, kendi oyu ve partner durumu ile geri gönderilir', async () => {
      await service.castVote(SESSION_ID, HOST, 's3');
      emitToUser.mockClear();

      await service.emitStateTo(SESSION_ID, GUEST);
      const [target, event, payload] = emitToUser.mock.calls[0];
      expect(target).toBe(GUEST);
      expect(event).toBe('matchmaking:story-vote-started');
      expect(payload).toMatchObject({ myVote: null, partnerVoted: true });
      expect(payload.remainingMs).toBeGreaterThan(0);
      // Partnerin OY VERDİĞİ bilinir, hangi hikayeye verdiği bilinmez —
      // aksi hâlde ikinci oyuncu kopyalar ve oylama anlamını yitirir.
      expect(Object.keys(payload)).not.toContain('partnerVote');
    });

    it('süre geçmişse durum sorgusu oylamayı kapatır (timer kaybolmuş olabilir)', async () => {
      model.doc.storyVote.deadlineAt = new Date(Date.now() - 1_000);
      await service.emitStateTo(SESSION_ID, HOST);
      expect(applyVotedStory).toHaveBeenCalledTimes(1);
      const events = emitToUser.mock.calls.map((c) => c[1]);
      expect(events).toContain('matchmaking:story-vote-result');
    });

    it('oylama bitmişse sonuç + completed geri gönderilir', async () => {
      await service.resolve(SESSION_ID, 'deadline');
      model.doc.phase = 'playing';
      emitToUser.mockClear();

      await service.emitStateTo(SESSION_ID, HOST);
      const events = emitToUser.mock.calls.map((c) => c[1]);
      expect(events).toEqual(['matchmaking:story-vote-result', 'matchmaking:completed']);
    });

    it('oturuma ait olmayan kullanıcıya hiçbir şey sızmaz', async () => {
      await service.emitStateTo(SESSION_ID, new Types.ObjectId().toString());
      expect(emitToUser).not.toHaveBeenCalled();
    });
  });
});
