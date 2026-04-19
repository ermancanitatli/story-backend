import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AdminRole = 'superadmin' | 'admin';

@Schema({ timestamps: true, collection: 'admin_users' })
export class AdminUser extends Document {
  @Prop({ required: true, unique: true, lowercase: true, trim: true, index: true })
  username: string;

  @Prop({ required: true })
  passwordHash: string;

  @Prop({ enum: ['superadmin', 'admin'], default: 'admin' })
  role: AdminRole;

  @Prop({ default: true })
  isActive: boolean;

  @Prop()
  lastLoginAt?: Date;

  @Prop({ default: false })
  mustChangePassword: boolean;

  @Prop()
  totpSecret?: string;

  @Prop({ default: false })
  totpEnabled: boolean;

  @Prop({ type: [String], default: [] })
  recoveryCodes?: string[];
}

export const AdminUserSchema = SchemaFactory.createForClass(AdminUser);
