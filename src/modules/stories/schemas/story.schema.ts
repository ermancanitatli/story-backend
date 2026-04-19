import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// -- Sub-schemas --

@Schema({ _id: false })
export class StoryCharacter {
  @Prop({ required: true })
  name: string;

  @Prop()
  description?: string;

  @Prop()
  gender?: string;

  @Prop()
  role?: string; // 'protagonist', 'antagonist', 'supporter', etc.

  @Prop()
  avatarUrl?: string;
}

@Schema({ _id: false })
export class MediaItem {
  @Prop()
  _id?: string;

  @Prop({ default: 0 })
  order: number;

  @Prop()
  title?: string;

  @Prop()
  alt?: string;

  @Prop({ required: true })
  url: string;

  @Prop()
  thumbnail?: string;
}

@Schema({ _id: false })
export class StoryScene {
  @Prop()
  title?: string;

  @Prop()
  description?: string;

  @Prop({ type: [MediaItem] })
  mediaItems?: MediaItem[];
}

@Schema({ _id: false })
export class StoryChapter {
  @Prop({ required: true })
  title: string;

  @Prop()
  summary?: string;

  @Prop({ type: [StoryScene] })
  scenes?: StoryScene[];

  @Prop({ type: [MediaItem] })
  mediaItems?: MediaItem[];
}

@Schema({ _id: false })
export class StoryTranslation {
  @Prop()
  title?: string;

  @Prop()
  summary?: string;

  @Prop()
  summarySafe?: string;
}

// Supported locales (runtime validation yok, sadece referans/type hint):
// 'en' | 'tr' | 'ar' | 'de' | 'es' | 'fr' | 'it' | 'ja' | 'ko' | 'pt' | 'ru' | 'zh'
export type SupportedLocale =
  | 'en'
  | 'tr'
  | 'ar'
  | 'de'
  | 'es'
  | 'fr'
  | 'it'
  | 'ja'
  | 'ko'
  | 'pt'
  | 'ru'
  | 'zh';

export type StoryTranslations = Partial<Record<SupportedLocale, StoryTranslation>>;

// -- Main Story Schema --

@Schema({ timestamps: true, collection: 'stories' })
export class Story extends Document {
  @Prop({ required: true })
  title: string;

  @Prop()
  genre?: string;

  @Prop()
  summary?: string;

  @Prop()
  summarySafe?: string; // Censored version

  // Multi-locale çeviriler. Key = locale code (en, tr, ar, ...), value = StoryTranslation.
  // Default EN değerleri legacy flat alanlarda (title/summary/summarySafe) kalır; getTranslation() helper'ı fallback zincirini yönetir.
  @Prop({ type: Object, default: {} })
  translations: StoryTranslations;

  @Prop({ type: [StoryCharacter], default: [] })
  characters: StoryCharacter[];

  @Prop({ type: [StoryChapter], default: [] })
  chapters: StoryChapter[];

  @Prop({ type: [MediaItem], default: [] })
  coverImage: MediaItem[];

  @Prop({ type: [MediaItem], default: [] })
  galleryImages: MediaItem[];

  @Prop()
  filename?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  userId?: Types.ObjectId;

  @Prop({ default: false })
  isPaid: boolean;

  @Prop()
  creditCost?: number;

  @Prop({ default: false })
  ownerDeleted: boolean;

  @Prop({ default: false })
  isPublished: boolean;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop()
  difficulty?: string; // 'easy' | 'medium' | 'hard' vb.

  @Prop()
  ageRating?: string; // '7+', '13+', '18+' vb.

  @Prop({ default: 0 })
  readCount: number;

  @Prop()
  legacyFirestoreId?: string; // Geçiş dönemi — eski Firestore doc ID
}

export const StorySchema = SchemaFactory.createForClass(Story);

// Indexes
StorySchema.index({ genre: 1 });
StorySchema.index({ isPaid: 1 });
StorySchema.index({ createdAt: -1 });
StorySchema.index({ userId: 1 });
StorySchema.index({ legacyFirestoreId: 1 }, { sparse: true });
// CC-11 — publish listesi için compound index ve tag araması için multikey index
StorySchema.index({ isPublished: 1, genre: 1, createdAt: -1 });
StorySchema.index({ tags: 1 });
