import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AuditAction =
  | 'BAN'
  | 'UNBAN'
  | 'DELETE'
  | 'UPDATE_USER'
  | 'UPDATE_CREDITS'
  | 'UPDATE_PREMIUM'
  | 'LOGIN'
  | 'LOGOUT'
  | 'PASSWORD_CHANGE'
  | 'ROLE_CHANGE';

@Schema({ timestamps: true, collection: 'admin_audit_logs' })
export class AdminAuditLog extends Document {
  @Prop({ required: true })
  adminId: string;

  @Prop({ required: true })
  adminUsername: string;

  @Prop({
    required: true,
    enum: [
      'BAN',
      'UNBAN',
      'DELETE',
      'UPDATE_USER',
      'UPDATE_CREDITS',
      'UPDATE_PREMIUM',
      'LOGIN',
      'LOGOUT',
      'PASSWORD_CHANGE',
      'ROLE_CHANGE',
    ],
  })
  action: AuditAction;

  @Prop()
  targetUserId?: string;

  @Prop()
  targetUserHandle?: string;

  @Prop()
  reason?: string;

  @Prop({ type: Object })
  metadata?: any;
}

export const AdminAuditLogSchema = SchemaFactory.createForClass(AdminAuditLog);
AdminAuditLogSchema.index({ targetUserId: 1, createdAt: -1 });
AdminAuditLogSchema.index({ action: 1, createdAt: -1 });
