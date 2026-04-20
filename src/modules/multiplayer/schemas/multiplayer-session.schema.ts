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

  @Prop({ enum: ['invite', 'character-selection', 'playing', 'ended', 'aborted'], default: 'invite' })
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

  // Son N turn'de AI'ın kullandığı beat/flavor/disruptor — recency avoidance.
  // Backend push/shift ile ring buffer (son 4 element).
  @Prop({ type: [String], default: [] }) recentBeats?: string[];
  @Prop({ type: [String], default: [] }) recentFlavors?: string[];
  @Prop({ type: [String], default: [] }) recentDisruptors?: string[];
}

export const MultiplayerSessionSchema = SchemaFactory.createForClass(MultiplayerSession);

MultiplayerSessionSchema.index({ hostId: 1, phase: 1 });
MultiplayerSessionSchema.index({ guestId: 1, phase: 1 });
