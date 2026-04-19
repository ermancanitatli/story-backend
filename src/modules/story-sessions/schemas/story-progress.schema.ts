import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ _id: false })
export class GrokChoice {
  @Prop() id: string;
  @Prop() text: string;
  @Prop() type: string; // action, dialogue, exploration, decision
}

@Schema({ _id: false })
export class EmotionalChanges {
  @Prop({ default: 0 }) intimacy: number;
  @Prop({ default: 0 }) anger: number;
  @Prop({ default: 0 }) worry: number;
  @Prop({ default: 0 }) trust: number;
  @Prop({ default: 0 }) excitement: number;
  @Prop({ default: 0 }) sadness: number;
}

@Schema({ _id: false })
export class StoryEffects {
  @Prop({ type: [String], default: [] }) itemsGained: string[];
  @Prop({ type: [String], default: [] }) itemsLost: string[];
  @Prop({ type: Object }) relationshipChanges: Record<string, string>;
  @Prop({ type: EmotionalChanges }) emotionalChanges: EmotionalChanges;
  @Prop({ default: false }) suggestChapterTransition: boolean;
}

@Schema({ timestamps: true, collection: 'story_progress' })
export class StoryProgress extends Document {
  @Prop({ required: true, type: Types.ObjectId, ref: 'StorySession', index: true })
  sessionId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User', index: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  stepNumber: number;

  @Prop({ required: true })
  currentScene: string;

  @Prop({ type: [GrokChoice], default: [] })
  choices: GrokChoice[];

  @Prop({ type: GrokChoice })
  userChoice?: GrokChoice;

  @Prop({ default: 1 })
  currentChapter: number;

  @Prop({ default: 0 })
  chapterStepCount: number;

  @Prop({ type: StoryEffects })
  effects?: StoryEffects;

  @Prop({ type: EmotionalChanges })
  emotionalStates?: EmotionalChanges;

  @Prop({ default: false })
  isChapterTransition: boolean;

  @Prop({ default: false })
  isEnding: boolean;

  @Prop({ enum: ['victory', 'defeat', 'neutral', 'cliffhanger'] })
  endingType?: string;
}

export const StoryProgressSchema = SchemaFactory.createForClass(StoryProgress);

StoryProgressSchema.index({ sessionId: 1, stepNumber: -1 });
