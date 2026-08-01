import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * Entitlement kaynağı.
 *
 * - `credit`  → kullanıcı krediyle satın aldı. KALICI. Premium bitse de açık kalır.
 * - `premium` → premium üyelik sayesinde açıldı. Premium aktif olduğu sürece geçerli;
 *               üyelik biterse erişim düşer (kayıt audit için durur).
 * - `admin`   → destek/iade amaçlı manuel açma. `credit` gibi kalıcıdır.
 *
 * ⚠️ Bu ayrım ürün kuralıdır: "premium bitince krediyle alınanlar açık kalmalı,
 * premium'la açılanlar kilitlenmeli". `isEntitlementPermanent()` tek karar noktasıdır.
 */
export type UnlockSource = 'credit' | 'premium' | 'admin';

export const PERMANENT_UNLOCK_SOURCES: UnlockSource[] = ['credit', 'admin'];

export function isEntitlementPermanent(source: UnlockSource | string): boolean {
  return PERMANENT_UNLOCK_SOURCES.includes(source as UnlockSource);
}

/**
 * Sunucu tarafı hikaye entitlement kaydı.
 *
 * Neden ayrı collection (users içinde dizi değil):
 *  - `users` zaten 30+ alanlı; büyüyen bir dizi doküman boyutunu kullanıcı başına
 *    sınırsız şişirir ve her `users` okumasında taşınır.
 *  - `{ userId, storyId }` unique index çift satın almayı VERİTABANI seviyesinde
 *    imkânsız kılar. Dizi içinde `$addToSet` bunu yapar ama "kaç kredi ödendi,
 *    ne zaman, hangi kaynaktan" audit alanlarını taşıyamaz.
 *  - `{ storyId }` index ile "bu hikayeyi kaç kişi açtı" sorgusu O(index);
 *    dizi tasarımında tüm users collection'ını taramak gerekirdi.
 *  - Kredi harcaması ile entitlement yazımı aynı transaction'da iki AYRI dokümana
 *    yazılır; tek dokümanda olsalardı bile transaction gerekirdi (users + story_unlocks).
 */
@Schema({ timestamps: true, collection: 'story_unlocks' })
export class StoryUnlock extends Document {
  @Prop({ required: true, type: Types.ObjectId, ref: 'User', index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Story', index: true })
  storyId: Types.ObjectId;

  @Prop({ required: true, enum: ['credit', 'premium', 'admin'], default: 'credit' })
  source: UnlockSource;

  /** Fiyat SUNUCUDA belirlendi (story.creditCost). İstemci `amount` göndermez. */
  @Prop({ default: 0 })
  creditsSpent: number;

  @Prop({ type: Date, default: () => new Date() })
  unlockedAt: Date;

  /** Audit: admin/destek kaynaklı açmalarda serbest metin gerekçe. */
  @Prop()
  reason?: string;
}

export const StoryUnlockSchema = SchemaFactory.createForClass(StoryUnlock);

/**
 * 🔴 Çift satın almayı engelleyen tek gerçek savunma.
 * Unlock transaction'ı bu index'in duplicate-key hatasına GÜVENİR:
 * yarışan ikinci istek insert'te patlar → transaction abort → kredi geri gelir.
 * Bu index düşerse eşzamanlı iki istek kullanıcıyı iki kez ücretlendirir.
 */
StoryUnlockSchema.index({ userId: 1, storyId: 1 }, { unique: true });

// "Kullanıcının açtıkları" listesi (GET /api/unlocks/stories)
StoryUnlockSchema.index({ userId: 1, source: 1 });
// Panel/analitik: bir hikayeyi kaç kişi açtı
StoryUnlockSchema.index({ storyId: 1, createdAt: -1 });
