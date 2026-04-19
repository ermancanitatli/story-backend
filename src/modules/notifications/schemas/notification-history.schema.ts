import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type NotificationStatus = 'pending' | 'sent' | 'failed' | 'partial';

@Schema({ timestamps: true, collection: 'notification_history' })
export class NotificationHistory extends Document {
  @Prop({ required: true })
  senderAdminId: string;

  @Prop({ required: true })
  senderUsername: string;

  @Prop({ required: true })
  segment: string;

  @Prop({ type: [String], default: [] })
  customUserIds?: string[];

  @Prop({ type: Object, required: true })
  headings: Record<string, string>;

  @Prop({ type: Object, required: true })
  contents: Record<string, string>;

  @Prop()
  bigPicture?: string;

  @Prop()
  url?: string;

  @Prop({ type: Object })
  data?: any;

  @Prop({ default: 0 })
  estimatedRecipients: number;

  @Prop()
  oneSignalNotificationId?: string;

  @Prop({ type: Object })
  oneSignalResponseRaw?: any;

  @Prop({ enum: ['pending', 'sent', 'failed', 'partial'], default: 'pending' })
  status: NotificationStatus;

  @Prop()
  successCount?: number;

  @Prop()
  failureCount?: number;

  @Prop()
  errorMessage?: string;
}

export const NotificationHistorySchema = SchemaFactory.createForClass(NotificationHistory);
NotificationHistorySchema.index({ senderAdminId: 1, createdAt: -1 });
