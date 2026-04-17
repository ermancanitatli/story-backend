import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true, collection: 'matchmaking_queue' })
export class MatchmakingQueue extends Document {
  @Prop({ required: true, type: Types.ObjectId, ref: 'User', index: true })
  userId: Types.ObjectId;

  @Prop({ enum: ['waiting', 'matched', 'accepted', 'completed', 'cancelled'], default: 'waiting' })
  status: string;

  @Prop()
  preference?: string; // 'female' | 'male' | 'any'

  @Prop()
  playerGender?: string;

  @Prop()
  languageCode?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  matchedWith?: Types.ObjectId;

  @Prop()
  matchedGender?: string;

  @Prop()
  accepted?: boolean;

  @Prop()
  partnerAccepted?: boolean;

  @Prop()
  sessionId?: string;

  @Prop({ default: false })
  isFake?: boolean;
}

export const MatchmakingQueueSchema = SchemaFactory.createForClass(MatchmakingQueue);

MatchmakingQueueSchema.index({ status: 1, createdAt: 1 });
