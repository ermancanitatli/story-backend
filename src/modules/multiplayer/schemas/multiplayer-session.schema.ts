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
}

export const MultiplayerSessionSchema = SchemaFactory.createForClass(MultiplayerSession);

MultiplayerSessionSchema.index({ hostId: 1, phase: 1 });
MultiplayerSessionSchema.index({ guestId: 1, phase: 1 });
