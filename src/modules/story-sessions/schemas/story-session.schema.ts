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
}

export const StorySessionSchema = SchemaFactory.createForClass(StorySession);

StorySessionSchema.index({ userId: 1, status: 1 });
StorySessionSchema.index({ userId: 1, storyId: 1 });
