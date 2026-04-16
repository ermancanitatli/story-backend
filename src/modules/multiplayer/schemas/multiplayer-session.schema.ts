import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true, collection: 'multiplayer_sessions' })
export class MultiplayerSession extends Document {
  @Prop({ required: true, type: Types.ObjectId, ref: 'User', index: true })
  hostId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User', index: true })
  guestId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Story' })
  storyId: Types.ObjectId;

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
  @Prop({ default: false }) hostAccepted: boolean;
  @Prop({ default: false }) guestAccepted: boolean;

  @Prop({ default: 1 }) currentChapter: number;
  @Prop({ default: 0 }) currentStep: number;
  @Prop({ default: 0 }) turnOrder: number;

  @Prop({ type: Object }) emotionalStates?: Record<string, number>;
  @Prop({ type: Object }) storyClone?: Record<string, any>;

  @Prop() lastProgressId?: string;
  @Prop() completedAt?: Date;
}

export const MultiplayerSessionSchema = SchemaFactory.createForClass(MultiplayerSession);

MultiplayerSessionSchema.index({ hostId: 1, phase: 1 });
MultiplayerSessionSchema.index({ guestId: 1, phase: 1 });
