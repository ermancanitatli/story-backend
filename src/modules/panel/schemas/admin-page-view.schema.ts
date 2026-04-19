import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({
  timestamps: { createdAt: 'createdAt', updatedAt: false },
  collection: 'admin_page_views',
})
export class AdminPageView extends Document {
  @Prop({ required: true }) adminId: string;
  @Prop({ required: true }) path: string;
}

export const AdminPageViewSchema = SchemaFactory.createForClass(AdminPageView);
// 90 day TTL
AdminPageViewSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 60 * 60 * 24 * 90 },
);
AdminPageViewSchema.index({ path: 1, createdAt: -1 });
