import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { Story } from '../stories/schemas/story.schema';
import { User } from '../users/schemas/user.schema';
import { UsersService } from '../users/users.service';
import { ErrorCodes } from '../../common/filters/error-codes';
import {
  StoryUnlock,
  UnlockSource,
  isEntitlementPermanent,
} from './schemas/story-unlock.schema';

/** `POST /api/stories/:id/unlock` yanıt sözleşmesi. iOS bu alanlara göre yazılır. */
export interface UnlockResult {
  storyId: string;
  unlocked: true;
  /** true → bu istek ücretlendirme YAPMADI (zaten açıktı / ücretsiz / premium). */
  alreadyUnlocked: boolean;
  /** Erişimin dayanağı. `free` kalıcı bir kayıt üretmez. */
  source: 'free' | UnlockSource;
  /** Bu istekte gerçekten harcanan kredi. Idempotent tekrar → 0. */
  creditsSpent: number;
  /** İşlem sonrası güncel bakiye — istemci bunu doğrudan yazabilir. */
  credits: number;
  /** Hikayenin sunucu tarafı fiyatı (istemci fiyat belirlemez). */
  creditCost: number;
}

/** Transaction içinden fırlatılan sentinel'ler — dışarı sızmaz, HTTP'ye çevrilir. */
class InsufficientCreditsSignal extends Error {}
class AlreadyEntitledSignal extends Error {}

const DUPLICATE_KEY = 11000;

function isDuplicateKeyError(err: unknown): boolean {
  const code = (err as { code?: unknown; cause?: { code?: unknown } })?.code;
  const causeCode = (err as { cause?: { code?: unknown } })?.cause?.code;
  return code === DUPLICATE_KEY || causeCode === DUPLICATE_KEY;
}

@Injectable()
export class UnlocksService {
  private readonly logger = new Logger(UnlocksService.name);

  constructor(
    @InjectModel(StoryUnlock.name) private unlockModel: Model<StoryUnlock>,
    @InjectModel(Story.name) private storyModel: Model<Story>,
    @InjectConnection() private readonly connection: Connection,
    private usersService: UsersService,
  ) {}

  // ---------------------------------------------------------------------------
  // Fiyat ve premium kuralları — TEK karar noktası
  // ---------------------------------------------------------------------------

  /**
   * Hikayenin kredi fiyatı. 0 → ücretsiz, kilit yok.
   * `isPaid` false ise `creditCost` dolu olsa bile ücretsizdir (panel tutarsızlığına karşı).
   */
  static priceOf(story: Pick<Story, 'isPaid' | 'creditCost'>): number {
    if (!story?.isPaid) return 0;
    const cost = Number(story.creditCost ?? 0);
    if (!Number.isFinite(cost) || cost <= 0) return 0;
    return Math.floor(cost);
  }

  /**
   * Premium AKTİF mi?
   *
   * `expiresAt` geçmişse `isPremium` flag'i true olsa bile premium sayılmaz.
   * Aboneliği süresi dolunca kapatan bir arka plan işi YOK — bu kontrol o işin yerine geçer.
   */
  static isPremiumActive(user: Pick<User, 'premium'>): boolean {
    const premium = user?.premium;
    if (!premium?.isPremium) return false;
    if (premium.expiresAt && new Date(premium.expiresAt).getTime() <= Date.now()) {
      return false;
    }
    return true;
  }

  /** Kaydın ŞU AN erişim veriyor olup olmadığı (premium kaydı üyelik bitince düşer). */
  private static grantsAccess(source: UnlockSource, premiumActive: boolean): boolean {
    return isEntitlementPermanent(source) || premiumActive;
  }

  // ---------------------------------------------------------------------------
  // Okuma / erişim doğrulama
  // ---------------------------------------------------------------------------

  private async loadStoryOrFail(storyId: string): Promise<Story> {
    if (!Types.ObjectId.isValid(storyId)) throw new NotFoundException('Story not found');
    const story = await this.storyModel.findById(storyId).lean().exec();
    const deleted = (story as unknown as { deletedAt?: Date })?.deletedAt;
    if (!story || deleted || story.ownerDeleted) {
      throw new NotFoundException('Story not found');
    }
    return story as unknown as Story;
  }

  /** Hikaye zaten yüklüyken erişim kararı — çift DB okumasını önler. */
  private async hasAccessToLoadedStory(userId: string, story: Story): Promise<boolean> {
    if (UnlocksService.priceOf(story) <= 0) return true;

    const [user, unlock] = await Promise.all([
      this.usersService.findById(userId),
      this.unlockModel
        .findOne({
          userId: new Types.ObjectId(userId),
          storyId: new Types.ObjectId(String(story._id)),
        })
        .lean()
        .exec(),
    ]);
    if (!user) return false;
    if (UnlocksService.isPremiumActive(user)) return true;
    if (!unlock) return false;
    return UnlocksService.grantsAccess(unlock.source, false);
  }

  /**
   * Kullanıcının hikayeye erişimi var mı? Sunucu tarafı tek doğruluk kaynağı.
   * Ücretsiz hikayeler için entitlement sorgusu yapılmaz.
   */
  async hasAccess(userId: string, storyId: string): Promise<boolean> {
    const story = await this.loadStoryOrFail(storyId);
    return this.hasAccessToLoadedStory(userId, story);
  }

  /**
   * Erişim yoksa 403 `STORY_LOCKED` fırlatır.
   * Oturum başlatan her yol (davet, matchmaking) bunu geçmek zorunda.
   */
  async assertAccess(userId: string, storyId: string): Promise<void> {
    const story = await this.loadStoryOrFail(storyId);
    const creditCost = UnlocksService.priceOf(story);
    if (creditCost <= 0) return;

    if (await this.hasAccessToLoadedStory(userId, story)) return;

    throw new ForbiddenException({
      code: ErrorCodes.STORY_LOCKED,
      message: 'This story is locked. Unlock it before starting a session.',
      storyId,
      creditCost,
    });
  }

  /** Kullanıcının ŞU AN erişebildiği ücretli hikayelerin id'leri. */
  async getUnlockedStoryIds(userId: string): Promise<string[]> {
    const user = await this.usersService.findById(userId);
    if (!user) return [];
    const premiumActive = UnlocksService.isPremiumActive(user);

    const filter: Record<string, unknown> = { userId: new Types.ObjectId(userId) };
    if (!premiumActive) filter.source = { $in: ['credit', 'admin'] };

    const rows = await this.unlockModel.find(filter).select('storyId').lean().exec();
    return rows.map((r) => r.storyId.toString());
  }

  /**
   * `GET /api/unlocks/stories` gövdesi.
   * `isPremium: true` iken istemci TÜM ücretli hikayeleri açık göstermeli —
   * premium kullanıcının her hikaye için kayıt üretmesi beklenmez.
   */
  async listUnlocks(userId: string): Promise<{
    isPremium: boolean;
    storyIds: string[];
    unlocks: Array<{
      storyId: string;
      source: UnlockSource;
      creditsSpent: number;
      unlockedAt: string;
    }>;
  }> {
    const user = await this.usersService.findByIdOrFail(userId);
    const premiumActive = UnlocksService.isPremiumActive(user);

    const rows = await this.unlockModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    const active = rows.filter((r) => UnlocksService.grantsAccess(r.source, premiumActive));

    return {
      isPremium: premiumActive,
      storyIds: active.map((r) => r.storyId.toString()),
      unlocks: active.map((r) => ({
        storyId: r.storyId.toString(),
        source: r.source,
        creditsSpent: r.creditsSpent ?? 0,
        unlockedAt: (r.unlockedAt ?? (r as unknown as { createdAt: Date }).createdAt).toISOString(),
      })),
    };
  }

  /**
   * Verilen hikaye listesinden, TÜM gerçek oyuncuların erişebildiklerini süz.
   *
   * Matchmaking havuzu için: ücretsiz olanlar + herkesin açtıkları.
   * Ürün kararı — "eşleş, sonra ödeyememe" ölü ucu hiç oluşmasın.
   *
   * ⚠️ Fake kullanıcılar (`isFake: true`) kısıttan MUAFTIR. Bot'un cüzdanı yoktur,
   * ölü uca da düşemez; kısıta dahil edilseydi satın alınan hikaye fake eşleşmelerde
   * ASLA çıkmazdı — çünkü bot hiçbir hikayeyi açmış olmaz. Bu, ücretli içeriği
   * matchmaking tarafında fiilen kullanılamaz hale getirirdi.
   */
  async filterStoriesAccessibleToAll(stories: Story[], userIds: string[]): Promise<Story[]> {
    const paid = stories.filter((s) => UnlocksService.priceOf(s) > 0);
    // Ücretli hiç yoksa erken çık — DB'ye gitme.
    if (paid.length === 0) return stories;

    const fetched = await this.usersService.findByIds(userIds);
    // Kullanıcılardan biri bulunamadıysa onun adına varsayım yapma: sadece ücretsizler.
    if (fetched.length !== new Set(userIds).size) {
      return stories.filter((s) => UnlocksService.priceOf(s) <= 0);
    }

    const users = fetched.filter((u) => !u.isFake);
    // Yalnızca bot(lar) kaldıysa kısıt uygulanmaz.
    if (users.length === 0) return stories;
    // Kalan herkes premium ise tüm katalog ortak erişilebilir.
    if (users.every((u) => UnlocksService.isPremiumActive(u))) return stories;

    const nonPremium = users.filter((u) => !UnlocksService.isPremiumActive(u));
    const paidIds = paid.map((s) => new Types.ObjectId(String(s._id)));

    const rows = await this.unlockModel
      .find({
        userId: { $in: nonPremium.map((u) => new Types.ObjectId(String(u._id))) },
        storyId: { $in: paidIds },
        source: { $in: ['credit', 'admin'] },
      })
      .select('userId storyId')
      .lean()
      .exec();

    // storyId → kaç farklı non-premium kullanıcı açmış
    const owners = new Map<string, Set<string>>();
    for (const row of rows) {
      const key = row.storyId.toString();
      if (!owners.has(key)) owners.set(key, new Set());
      owners.get(key)!.add(row.userId.toString());
    }

    return stories.filter((s) => {
      if (UnlocksService.priceOf(s) <= 0) return true;
      return (owners.get(String(s._id))?.size ?? 0) === nonPremium.length;
    });
  }

  // ---------------------------------------------------------------------------
  // Satın alma — atomik
  // ---------------------------------------------------------------------------

  /**
   * Hikayeyi aç. Fiyat SUNUCUDA belirlenir (`story.creditCost`); istemci `amount` göndermez.
   *
   * Idempotent: zaten açıksa, ücretsizse veya kullanıcı premium ise kredi düşmez.
   * Atomiklik: kredi düşümü + entitlement yazımı tek Mongo transaction'ında
   * (replica set `rs0` — hem docker-compose hem prod). Biri başarısızsa ikisi de geri alınır.
   */
  async unlockStory(userId: string, storyId: string): Promise<UnlockResult> {
    const story = await this.loadStoryOrFail(storyId);
    const creditCost = UnlocksService.priceOf(story);
    const user = await this.usersService.findByIdOrFail(userId);

    // Ücretsiz hikaye → kayıt üretme, boş yere doküman yaratma.
    if (creditCost <= 0) {
      return {
        storyId,
        unlocked: true,
        alreadyUnlocked: true,
        source: 'free',
        creditsSpent: 0,
        credits: user.credits,
        creditCost: 0,
      };
    }

    const premiumActive = UnlocksService.isPremiumActive(user);
    const existing = await this.unlockModel
      .findOne({ userId: new Types.ObjectId(userId), storyId: new Types.ObjectId(storyId) })
      .lean()
      .exec();

    // Zaten hak sahibi → ücretlendirme YOK.
    if (existing && UnlocksService.grantsAccess(existing.source, premiumActive)) {
      return {
        storyId,
        unlocked: true,
        alreadyUnlocked: true,
        source: existing.source,
        creditsSpent: 0,
        credits: user.credits,
        creditCost,
      };
    }

    // Premium → bedava aç, audit kaydı bırak. Üyelik biterse bu kayıt erişim vermez.
    if (premiumActive) {
      await this.unlockModel
        .updateOne(
          { userId: new Types.ObjectId(userId), storyId: new Types.ObjectId(storyId) },
          {
            $setOnInsert: {
              userId: new Types.ObjectId(userId),
              storyId: new Types.ObjectId(storyId),
              source: 'premium',
              creditsSpent: 0,
              unlockedAt: new Date(),
            },
          },
          { upsert: true },
        )
        .exec();
      return {
        storyId,
        unlocked: true,
        alreadyUnlocked: false,
        source: 'premium',
        creditsSpent: 0,
        credits: user.credits,
        creditCost,
      };
    }

    // Hızlı yol: transaction açmadan net 402. Asıl güvence yine transaction guard'ı.
    if (user.credits < creditCost) {
      throw this.insufficientCredits(creditCost, user.credits);
    }

    return this.chargeAndUnlock(userId, storyId, creditCost, Boolean(existing));
  }

  /**
   * Kredi düş + entitlement yaz, tek transaction.
   *
   * @param upgradeFromPremium premium'la açılmış bir kayıt var ve üyelik bitmiş →
   *        yeni doküman insert edilemez (unique index), mevcut kayıt `credit`'e yükseltilir.
   */
  private async chargeAndUnlock(
    userId: string,
    storyId: string,
    creditCost: number,
    upgradeFromPremium: boolean,
  ): Promise<UnlockResult> {
    const session = await this.connection.startSession();
    let newBalance = 0;

    try {
      await session.withTransaction(async () => {
        const balance = await this.usersService.tryModifyCredits(userId, -creditCost, {
          session,
        });
        if (balance === null) throw new InsufficientCreditsSignal();
        newBalance = balance;

        if (upgradeFromPremium) {
          // `source: 'premium'` filtresi yarışı çözer: ilk yükselten kazanır,
          // ikinci istek matchedCount 0 alır → abort → kredi geri gelir.
          const res = await this.unlockModel
            .updateOne(
              {
                userId: new Types.ObjectId(userId),
                storyId: new Types.ObjectId(storyId),
                source: 'premium',
              },
              {
                $set: {
                  source: 'credit',
                  creditsSpent: creditCost,
                  unlockedAt: new Date(),
                },
              },
              { session },
            )
            .exec();
          if (res.matchedCount === 0) throw new AlreadyEntitledSignal();
        } else {
          // Unique index `{userId, storyId}` yarışan ikinci isteği burada patlatır →
          // transaction abort → kredi düşümü geri alınır. Çift ücretlendirme imkânsız.
          await this.unlockModel.create(
            [
              {
                userId: new Types.ObjectId(userId),
                storyId: new Types.ObjectId(storyId),
                source: 'credit',
                creditsSpent: creditCost,
                unlockedAt: new Date(),
              },
            ],
            { session },
          );
        }
      });
    } catch (err) {
      if (err instanceof InsufficientCreditsSignal) {
        const fresh = await this.usersService.findById(userId);
        throw this.insufficientCredits(creditCost, fresh?.credits ?? 0);
      }
      // Yarışan ikinci istek: entitlement zaten var, kredi geri alındı → idempotent başarı.
      if (err instanceof AlreadyEntitledSignal || isDuplicateKeyError(err)) {
        this.logger.warn(
          `Concurrent unlock for user=${userId} story=${storyId} — charge rolled back, returning idempotent success`,
        );
        const [fresh, unlock] = await Promise.all([
          this.usersService.findById(userId),
          this.unlockModel
            .findOne({
              userId: new Types.ObjectId(userId),
              storyId: new Types.ObjectId(storyId),
            })
            .lean()
            .exec(),
        ]);
        return {
          storyId,
          unlocked: true,
          alreadyUnlocked: true,
          source: unlock?.source ?? 'credit',
          creditsSpent: 0,
          credits: fresh?.credits ?? 0,
          creditCost,
        };
      }
      throw err;
    } finally {
      await session.endSession();
    }

    this.logger.log(
      `Story unlocked: user=${userId} story=${storyId} cost=${creditCost} balance=${newBalance}`,
    );

    return {
      storyId,
      unlocked: true,
      alreadyUnlocked: false,
      source: 'credit',
      creditsSpent: creditCost,
      credits: newBalance,
      creditCost,
    };
  }

  private insufficientCredits(required: number, balance: number): HttpException {
    return new HttpException(
      {
        code: ErrorCodes.INSUFFICIENT_CREDITS,
        message: 'Not enough credits.',
        required,
        balance,
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}
