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
  | 'ROLE_CHANGE'
  | 'TOTP_ENABLE'
  | 'TOTP_DISABLE';

export type AuditResource =
  | 'admin_user'
  | 'user'
  | 'story'
  | 'notification'
  | 'session'
  | 'app_settings';

const AUDIT_TTL_DAYS = Number(process.env.AUDIT_TTL_DAYS || 365);
const AUDIT_TTL_SECONDS = AUDIT_TTL_DAYS * 24 * 60 * 60;

@Schema({ timestamps: true, collection: 'admin_audit_logs' })
export class AdminAuditLog extends Document {
  // Mevcut alanlar (USER-02 uyumlu) — silmedik.
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
      'TOTP_ENABLE',
      'TOTP_DISABLE',
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

  // CC-03 genişletme — backward compatible alanlar.
  @Prop()
  actorAdminId?: string;

  @Prop({
    enum: ['admin_user', 'user', 'story', 'notification', 'session', 'app_settings'],
  })
  resource?: AuditResource;

  @Prop()
  resourceId?: string;

  @Prop({ type: Object })
  before?: any;

  @Prop({ type: Object })
  after?: any;

  @Prop({ type: [String], default: undefined })
  diffKeys?: string[];

  @Prop()
  ip?: string;

  @Prop()
  userAgent?: string;

  @Prop()
  requestId?: string;
}

export const AdminAuditLogSchema = SchemaFactory.createForClass(AdminAuditLog);
AdminAuditLogSchema.index({ targetUserId: 1, createdAt: -1 });
AdminAuditLogSchema.index({ action: 1, createdAt: -1 });
AdminAuditLogSchema.index({ actorAdminId: 1, createdAt: -1 });
AdminAuditLogSchema.index({ resource: 1, resourceId: 1, createdAt: -1 });
// TTL — createdAt'ten AUDIT_TTL_DAYS gün sonra otomatik silinir (default 365 gün).
AdminAuditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: AUDIT_TTL_SECONDS });
