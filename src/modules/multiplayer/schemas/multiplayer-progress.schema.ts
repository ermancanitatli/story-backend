import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true, collection: 'multiplayer_progress' })
export class MultiplayerProgress extends Document {
  @Prop({ required: true, type: Types.ObjectId, ref: 'MultiplayerSession', index: true })
  sessionId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  activePlayerId: Types.ObjectId;

  @Prop({ required: true })
  turnOrder: number;

  @Prop({ required: true })
  currentScene: string;

  @Prop({ type: [{ id: { type: String }, text: { type: String }, type: { type: String } }], default: [] })
  choices: { id: string; text: string; type: string }[];

  @Prop({ type: { id: { type: String }, text: { type: String }, type: { type: String } } })
  userChoice?: { id: string; text: string; type: string };

  @Prop({ type: Object })
  scenes?: Record<string, string>;  // { "tr": "...", "en": "..." }

  @Prop({ type: Object })
  localizedChoices?: Record<string, any>;  // { "tr": [...], "en": [...] }

  @Prop() characterRole?: string;
  @Prop({ default: 1 }) currentChapter: number;
  @Prop({ type: Object }) effects?: Record<string, any>;
  @Prop({ type: Object }) emotionalChanges?: Record<string, number>;
  @Prop({ default: false }) isChapterTransition: boolean;
  @Prop({ default: false }) isEnding: boolean;
  @Prop() endingType?: string;
}

export const MultiplayerProgressSchema = SchemaFactory.createForClass(MultiplayerProgress);

MultiplayerProgressSchema.index({ sessionId: 1, turnOrder: -1 });
