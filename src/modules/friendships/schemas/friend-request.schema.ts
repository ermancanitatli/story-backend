import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true, collection: 'friend_requests' })
export class FriendRequest extends Document {
  @Prop({ required: true, type: Types.ObjectId, ref: 'User', index: true })
  fromUserId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User', index: true })
  toUserId: Types.ObjectId;

  @Prop({ enum: ['pending', 'accepted', 'declined', 'cancelled'], default: 'pending' })
  status: string;

  @Prop() respondedAt?: Date;
}

export const FriendRequestSchema = SchemaFactory.createForClass(FriendRequest);
