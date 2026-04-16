import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true, collection: 'referral_rewards' })
export class ReferralReward extends Document {
  @Prop({ required: true, type: Types.ObjectId, ref: 'User', index: true })
  referrerId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User', index: true })
  newUserId: Types.ObjectId;

  @Prop({ required: true, index: true })
  deviceId: string;

  @Prop({ required: true })
  bonus: number;
}

export const ReferralRewardSchema = SchemaFactory.createForClass(ReferralReward);

// Duplicate prevention
ReferralRewardSchema.index({ referrerId: 1, newUserId: 1 }, { unique: true });
ReferralRewardSchema.index({ referrerId: 1, deviceId: 1 }, { unique: true });
ReferralRewardSchema.index({ referrerId: 1, createdAt: 1 });
