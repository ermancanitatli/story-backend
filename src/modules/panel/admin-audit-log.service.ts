import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AdminAuditLog, AuditAction } from './schemas/admin-audit-log.schema';

export interface RecordAuditLogParams {
  adminId: string;
  adminUsername: string;
  action: AuditAction;
  targetUserId?: string;
  targetUserHandle?: string;
  reason?: string;
  metadata?: any;
}

export interface ListAuditLogFilter {
  action?: AuditAction;
  targetUserId?: string;
  adminId?: string;
}

@Injectable()
export class AdminAuditLogService {
  constructor(
    @InjectModel(AdminAuditLog.name) private auditLogModel: Model<AdminAuditLog>,
  ) {}

  async record(params: RecordAuditLogParams): Promise<AdminAuditLog> {
    return this.auditLogModel.create(params);
  }

  async list(filter: ListAuditLogFilter = {}, limit = 100, offset = 0): Promise<AdminAuditLog[]> {
    const query: any = {};
    if (filter.action) query.action = filter.action;
    if (filter.targetUserId) query.targetUserId = filter.targetUserId;
    if (filter.adminId) query.adminId = filter.adminId;
    return this.auditLogModel
      .find(query)
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit)
      .exec();
  }

  async count(filter: ListAuditLogFilter = {}): Promise<number> {
    const query: any = {};
    if (filter.action) query.action = filter.action;
    if (filter.targetUserId) query.targetUserId = filter.targetUserId;
    if (filter.adminId) query.adminId = filter.adminId;
    return this.auditLogModel.countDocuments(query).exec();
  }
}
