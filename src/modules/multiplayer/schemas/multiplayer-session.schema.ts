import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true, collection: 'multiplayer_sessions' })
export class MultiplayerSession extends Document {
  @Prop({ required: true, type: Types.ObjectId, ref: 'User', index: true })
  hostId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User', index: true })
  guestId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Story' })
  storyId?: Types.ObjectId;

  /**
   * 'story-voting' — matchmaking sonrası hikaye oylaması penceresi.
   * Davet (invite) akışında KULLANILMAZ: orada host hikayeyi bilerek seçmiştir.
   * 'character-selection' ile birleştirilmedi çünkü o değer davet akışında hâlâ
   * canlı (updateSessionField: invite → character-selection → playing); aynı
   * enum değerine iki farklı anlam yüklemek istemciyi akışa göre tahmin
   * yürütmeye zorlardı.
   */
  @Prop({
    enum: ['invite', 'character-selection', 'story-voting', 'playing', 'ended', 'aborted'],
    default: 'invite',
  })
  phase: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  activePlayerId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  nextPlayerId?: Types.ObjectId;

  @Prop() hostName?: string;
  @Prop() guestName?: string;
  @Prop() hostGender?: string;
  @Prop() guestGender?: string;
  @Prop() hostLanguageCode?: string;
  @Prop() guestLanguageCode?: string;
  @Prop({ default: false }) hostAccepted: boolean;
  @Prop({ default: false }) guestAccepted: boolean;

  @Prop({ default: 1 }) currentChapter: number;
  @Prop({ default: 0 }) currentStep: number;
  @Prop({ default: 0 }) turnOrder: number;
  // Current chapter içindeki adım sayacı — chapter transition'la sıfırlanır.
  // Pacing window (soft 5-7 / pressure 8-9 / max 10) hesabı için.
  @Prop({ default: 0 }) chapterStepCount: number;
  @Prop({ default: false }) completed: boolean;

  @Prop({ type: Object }) emotionalStates?: Record<string, number>;
  @Prop({ type: Object }) storyClone?: Record<string, any>;

  @Prop() lastProgressId?: string;
  @Prop() completedAt?: Date;

  // === Sıra bildirimi / sessizlik hatırlatması ===
  // Aktif oyuncuya sıra geçtiği an. 24 saatlik sessizlik hatırlatmasının ölçüm noktası.
  @Prop() turnStartedAt?: Date;
  // Hatırlatma gönderildiği an. null/eksik = henüz gönderilmedi.
  // Her sıra değişiminde null'a çekilir → oturum başına değil, sıra başına tek hatırlatma.
  // ⚠️ `type: Date` ZORUNLU: `Date | null` union'ında TS `design:type` olarak
  // `Object` yayar, @nestjs/mongoose de tipi çıkaramayıp @Prop dekoratöründe
  // CannotDetermineTypeError fırlatır. Bu hata derleme değil YÜKLEME zamanında
  // olur — `npm run build` temiz geçer, uygulama açılışta patlar.
  @Prop({ type: Date, default: null }) turnReminderSentAt?: Date | null;
  // "Sıra sende" push'unun gönderildiği turnOrder — cross-instance idempotency claim'i.
  @Prop({ default: 0 }) turnNotifiedForTurn?: number;

  // Chapter bridge özetleri (single-player story-session.schema ile aynı pattern).
  // Chapter transition zaten multiplayer'da aktif değil ama ileride eklendiğinde hazır.
  @Prop({ type: Object, default: {} })
  bridgeSummaries?: Record<string, string>;

  // Rolling summary — turn içinde biriken eski sahnelerin özeti.
  // Her 5 turn'de async olarak regenerate edilir.
  @Prop({
    type: Object,
    default: () => ({ text: '', updatedAtStep: 0 }),
  })
  rollingSummary?: {
    text: string;
    updatedAtStep: number;
  };

  // === Dramatic state vector (3 AI uzman önerisi) ===
  // AI her turn kendisi günceller; backend prompt'a next turn enjekte eder.
  // 0-1 arası normalize. "null" = henüz ölçülmedi.
  @Prop({
    type: Object,
    default: () => ({
      tension: 0.2,
      stakes: 0.2,
      agency: 0.7,
      mystery: 0.3,
      intimacy: 0.2,
      danger: 0.1,
      turnsSinceDisruption: 0,
      dominantEmotion: '',
    }),
  })
  dramaState?: {
    tension: number;
    stakes: number;
    agency: number;
    mystery: number;
    intimacy: number;
    danger: number;
    turnsSinceDisruption: number;
    dominantEmotion: string;
  };

  /**
   * Hikaye oylaması durumu (yalnızca matchmaking akışı).
   *
   * Tek doküman içinde tutuluyor çünkü hem oyun mantığının hem de yeniden
   * bağlanan istemcinin ihtiyacı olan her şey burada: adaylar, bitiş anı,
   * kimin ne oy verdiği ve sonucun nasıl belirlendiği. Timer bellekte ama
   * DOĞRULUK bu alanlarda — süreç yeniden başlarsa cron süpürgesi
   * `deadlineAt` + `resolvedAt` bakarak oylamayı tamamlar.
   *
   * `resolvedAt` aynı zamanda mutual-exclusion claim'idir: hem "iki oy da
   * geldi" hem "süre doldu" yolu aynı anda tetiklenirse yalnızca biri kazanır.
   */
  @Prop({ type: Object, default: null })
  storyVote?: {
    candidateStoryIds: string[];
    startedAt: Date;
    deadlineAt: Date;
    hostVote?: string | null;
    guestVote?: string | null;
    hostVotedAt?: Date | null;
    guestVotedAt?: Date | null;
    /** true = oyu oyuncu vermedi, süre dolunca sunucu rastgele attı. */
    hostVoteAuto?: boolean;
    guestVoteAuto?: boolean;
    resolution?: 'agreement' | 'tiebreak' | 'timeout' | 'only-option' | null;
    resolvedStoryId?: string | null;
    resolvedAt?: Date | null;
  } | null;

  // Son N turn'de AI'ın kullandığı beat/flavor/disruptor — recency avoidance.
  // Backend push/shift ile ring buffer (son 4 element).
  @Prop({ type: [String], default: [] }) recentBeats?: string[];
  @Prop({ type: [String], default: [] }) recentFlavors?: string[];
  @Prop({ type: [String], default: [] }) recentDisruptors?: string[];
}

export const MultiplayerSessionSchema = SchemaFactory.createForClass(MultiplayerSession);

MultiplayerSessionSchema.index({ hostId: 1, phase: 1 });
MultiplayerSessionSchema.index({ guestId: 1, phase: 1 });
// Sessizlik hatırlatması cron'u: phase='playing' + hatırlatma gönderilmemiş + turnStartedAt penceresi
MultiplayerSessionSchema.index({ phase: 1, turnReminderSentAt: 1, turnStartedAt: 1 });
// Süresi geçmiş oylama süpürgesi: phase='story-voting' + deadlineAt penceresi
MultiplayerSessionSchema.index({ phase: 1, 'storyVote.deadlineAt': 1 });
