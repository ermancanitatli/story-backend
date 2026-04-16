import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, collection: 'revenuecat_events' })
export class RevenueCatEvent extends Document {
  @Prop({ required: true, unique: true })
  eventId: string;

  @Prop()
  type: string;

  @Prop()
  appUserId: string;

  @Prop()
  productId: string;

  @Prop()
  price: number;

  @Prop()
  currency: string;

  @Prop({ type: Object })
  rawEvent: Record<string, any>;
}

export const RevenueCatEventSchema = SchemaFactory.createForClass(RevenueCatEvent);
