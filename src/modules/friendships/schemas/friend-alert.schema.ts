import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true, collection: 'friend_alerts' })
export class FriendAlert extends Document {
  @Prop({ required: true, type: Types.ObjectId, ref: 'User', unique: true })
  userId: Types.ObjectId;

  @Prop({ default: 0 }) incomingPending: number;
  @Prop({ default: 0 }) acceptedPending: number;
}

export const FriendAlertSchema = SchemaFactory.createForClass(FriendAlert);
