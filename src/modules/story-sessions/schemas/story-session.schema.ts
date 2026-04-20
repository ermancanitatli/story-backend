import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ _id: false })
export class EmotionalStates {
  @Prop({ default: 0 }) intimacy: number;
  @Prop({ default: 0 }) anger: number;
  @Prop({ default: 0 }) worry: number;
  @Prop({ default: 0 }) trust: number;
  @Prop({ default: 0 }) excitement: number;
  @Prop({ default: 0 }) sadness: number;
}

@Schema({ _id: false })
export class StoryClone {
  @Prop() title: string;
  @Prop() genre: string;
  @Prop() summary: string;
  @Prop({ type: Object }) characters: any[];
  @Prop({ type: Object }) chapters: any[];
  @Prop({ type: Object }) customization: any;
}

@Schema({ timestamps: true, collection: 'story_sessions' })
export class StorySession extends Document {
  @Prop({ required: true, type: Types.ObjectId, ref: 'User', index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Story' })
  storyId: Types.ObjectId;

  @Prop()
  sessionName?: string;

  @Prop({ enum: ['active', 'paused', 'completed', 'error'], default: 'active' })
  status: string;

  @Prop({ type: StoryClone })
  storyClone?: StoryClone;

  @Prop({ default: 1 })
  currentChapter: number;

  @Prop({ default: 0 })
  chapterStepCount: number;

  @Prop({ default: 0 })
  currentStep: number;

  @Prop({ default: 0 })
  storyProgress: number;

  @Prop({ type: EmotionalStates, default: () => ({}) })
  emotionalStates: EmotionalStates;

  @Prop()
  lastPlayedAt?: Date;

  @Prop()
  completedAt?: Date;

  @Prop()
  lastProgressId?: string;

  @Prop()
  languageCode?: string;

  // Chapter geçişlerinde AI'a "önceki chapter'ın özeti" olarak enjekte edilen bridge.
  // Key: chapter numarası (string), value: 1-2 cümlelik özet. Cache amaçlı — bir chapter
  // için tek seferlik Grok çağrısıyla üretilir, sonraki transition adımlarında tekrar kullanılır.
  @Prop({ type: Object, default: {} })
  bridgeSummaries?: Record<string, string>;

  // Rolling summary — chapter içinde biriken eski sahnelerin özeti.
  // AI'a her çağrıda son 2 sahne raw + rollingSummary (önceki sahnelerin özeti) gider.
  // Her 5 step'te async olarak regenerate edilir, chapter transition'da sıfırlanır.
  // updatedAtStep: bu step'e kadarki sahneleri kapsıyor; daha yeni sahneler henüz özetlenmedi.
  @Prop({
    type: Object,
    default: () => ({ text: '', updatedAtStep: 0 }),
  })
  rollingSummary?: {
    text: string;
    updatedAtStep: number;
  };

  // === Dramatic state vector (3 AI uzman önerisi) ===
  // AI her turn kendi günceller; backend prompt'a sonraki turn'de enjekte eder.
  // 0-1 arası normalize. Boş string/0 = henüz ölçülmedi.
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

  // Son N turn'de AI'ın kullandığı beat/flavor/disruptor — recency avoidance.
  @Prop({ type: [String], default: [] }) recentBeats?: string[];
  @Prop({ type: [String], default: [] }) recentFlavors?: string[];
  @Prop({ type: [String], default: [] }) recentDisruptors?: string[];
}

export const StorySessionSchema = SchemaFactory.createForClass(StorySession);

StorySessionSchema.index({ userId: 1, status: 1 });
StorySessionSchema.index({ userId: 1, storyId: 1 });
