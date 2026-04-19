import { ConflictException, Inject, Injectable, NotFoundException, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, isValidObjectId, Types } from 'mongoose';
import { User } from '../users/schemas/user.schema';
import { Friendship } from '../friendships/schemas/friendship.schema';
import { StorySession } from '../story-sessions/schemas/story-session.schema';
import { AppGateway } from '../socket/app.gateway';
import { AdminAuditLogService } from './admin-audit-log.service';
import { AdminUpdateUserDto } from './dto/admin-update-user.dto';
import { BanUserDto } from './dto/ban-user.dto';

export interface ListUsersFilter {
  search?: string;
  isPremium?: boolean;
  isBanned?: boolean;
  isDeleted?: boolean;
  sortBy?: 'createdAt' | 'lastSeen' | 'displayName' | 'userHandle';
  sortDir?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface ListUsersResult {
  users: User[];
  total: number;
  limit: number;
  offset: number;
}

export interface UserDetailResult {
  user: User;
  friendCount: number;
  recentSessions: StorySession[];
  storyCount: number;
}

@Injectable()
export class AdminUsersManagementService {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Friendship.name) private friendshipModel: Model<Friendship>,
    @InjectModel(StorySession.name) private storySessionModel: Model<StorySession>,
    private auditLogService: AdminAuditLogService,
    @Inject(forwardRef(() => AppGateway)) private readonly gateway: AppGateway,
  ) {}

  async listUsers(filter: ListUsersFilter = {}): Promise<ListUsersResult> {
    const limit = Math.min(Math.max(filter.limit ?? 25, 1), 100);
    const offset = Math.max(filter.offset ?? 0, 0);
    const sortBy = filter.sortBy ?? 'createdAt';
    const sortDir = filter.sortDir === 'asc' ? 1 : -1;

    const query: any = {};
    if (typeof filter.isPremium === 'boolean') query['premium.isPremium'] = filter.isPremium;
    if (typeof filter.isBanned === 'boolean') query.isBanned = filter.isBanned;
    if (typeof filter.isDeleted === 'boolean') query.isDeleted = filter.isDeleted;

    if (filter.search && filter.search.trim()) {
      const escaped = filter.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rx = new RegExp(escaped, 'i');
      query.$or = [
        { userHandle: rx },
        { displayName: rx },
        { email: rx },
      ];
    }

    const [users, total] = await Promise.all([
      this.userModel
        .find(query)
        .sort({ [sortBy]: sortDir })
        .skip(offset)
        .limit(limit)
        .lean()
        .exec() as any,
      this.userModel.countDocuments(query).exec(),
    ]);

    return { users, total, limit, offset };
  }

  async getUserDetail(id: string): Promise<UserDetailResult> {
    if (!isValidObjectId(id)) {
      throw new NotFoundException('User not found');
    }
    const objectId = new Types.ObjectId(id);
    const [user, friendCount, recentSessions, storyCount] = await Promise.all([
      this.userModel.findById(id).lean().exec() as Promise<User | null>,
      this.friendshipModel.countDocuments({ members: objectId }).exec(),
      this.storySessionModel
        .find({ userId: objectId })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean()
        .exec() as unknown as Promise<StorySession[]>,
      this.storySessionModel.countDocuments({ userId: objectId }).exec(),
    ]);
    if (!user) throw new NotFoundException('User not found');
    return { user, friendCount, recentSessions, storyCount };
  }

  async updateUserByAdmin(
    id: string,
    dto: AdminUpdateUserDto,
    actor: { adminId: string; adminUsername: string },
  ): Promise<User> {
    if (!isValidObjectId(id)) throw new NotFoundException('User not found');

    const before = await this.userModel.findById(id).lean().exec();
    if (!before) throw new NotFoundException('User not found');

    // userHandle çakışma kontrolü
    if (dto.userHandle && dto.userHandle !== (before as any).userHandle) {
      const existing = await this.userModel
        .findOne({
          userHandle: dto.userHandle,
          _id: { $ne: id },
        })
        .lean()
        .exec();
      if (existing) throw new ConflictException('Bu kullanıcı adı zaten kullanımda');
    }

    const updatePayload: any = {};
    if (dto.displayName !== undefined) updatePayload.displayName = dto.displayName;
    if (dto.userHandle !== undefined) updatePayload.userHandle = dto.userHandle;
    if (dto.email !== undefined) updatePayload.email = dto.email;
    if (dto.credits !== undefined) updatePayload.credits = dto.credits;
    if (dto.premium) {
      if (dto.premium.isPremium !== undefined)
        updatePayload['premium.isPremium'] = dto.premium.isPremium;
      if (dto.premium.plan !== undefined)
        updatePayload['premium.plan'] = dto.premium.plan;
      if (dto.premium.expiresAt !== undefined)
        updatePayload['premium.expiresAt'] = new Date(dto.premium.expiresAt);
    }

    const updated = await this.userModel
      .findByIdAndUpdate(id, { $set: updatePayload }, { new: true })
      .lean()
      .exec();

    // Audit log
    try {
      if (dto.credits !== undefined && (before as any).credits !== dto.credits) {
        await this.auditLogService.record({
          adminId: actor.adminId,
          adminUsername: actor.adminUsername,
          action: 'UPDATE_CREDITS',
          targetUserId: id,
          targetUserHandle: (before as any).userHandle,
          metadata: { from: (before as any).credits, to: dto.credits },
        });
      }
      if (dto.premium) {
        const wasPremium = (before as any).premium?.isPremium === true;
        const willPremium = dto.premium.isPremium === true;
        if (wasPremium !== willPremium) {
          await this.auditLogService.record({
            adminId: actor.adminId,
            adminUsername: actor.adminUsername,
            action: 'UPDATE_PREMIUM',
            targetUserId: id,
            targetUserHandle: (before as any).userHandle,
            metadata: { from: wasPremium, to: willPremium, plan: dto.premium.plan },
          });
        }
      }
      await this.auditLogService.record({
        adminId: actor.adminId,
        adminUsername: actor.adminUsername,
        action: 'UPDATE_USER',
        targetUserId: id,
        targetUserHandle: (before as any).userHandle,
        metadata: { fields: Object.keys(updatePayload) },
      });
    } catch (err) {
      // Audit failure sessiz
    }

    return updated as any;
  }

  async banUser(
    id: string,
    dto: BanUserDto,
    actor: { adminId: string; adminUsername: string },
  ): Promise<User> {
    if (!isValidObjectId(id)) throw new NotFoundException('User not found');
    const before = await this.userModel.findById(id).lean().exec();
    if (!before) throw new NotFoundException('User not found');

    const until = dto.until ? new Date(dto.until) : null;
    const updated = await this.userModel
      .findByIdAndUpdate(
        id,
        {
          $set: {
            isBanned: true,
            bannedAt: new Date(),
            banReason: dto.reason || null,
            bannedUntil: until,
          },
        },
        { new: true },
      )
      .lean()
      .exec();

    // Revoke refresh tokens
    try {
      await this.userModel.db.collection('refresh_tokens').updateMany(
        { userId: new Types.ObjectId(id) },
        { $set: { revoked: true, revokedAt: new Date() } },
      );
    } catch {
      // tolerate
    }

    // Kick active sockets
    try {
      await this.gateway.kickUser(id, 'USER_BANNED', dto.reason);
    } catch {
      // tolerate
    }

    // Audit
    try {
      await this.auditLogService.record({
        adminId: actor.adminId,
        adminUsername: actor.adminUsername,
        action: 'BAN',
        targetUserId: id,
        targetUserHandle: (before as any).userHandle,
        reason: dto.reason,
        metadata: { bannedUntil: until },
      });
    } catch {
      // tolerate
    }

    return updated as any;
  }

  async unbanUser(
    id: string,
    actor: { adminId: string; adminUsername: string },
  ): Promise<User> {
    if (!isValidObjectId(id)) throw new NotFoundException('User not found');
    const before = await this.userModel.findById(id).lean().exec();
    if (!before) throw new NotFoundException('User not found');

    const updated = await this.userModel
      .findByIdAndUpdate(
        id,
        {
          $set: {
            isBanned: false,
            bannedAt: null,
            banReason: null,
            bannedUntil: null,
          },
        },
        { new: true },
      )
      .lean()
      .exec();

    try {
      await this.auditLogService.record({
        adminId: actor.adminId,
        adminUsername: actor.adminUsername,
        action: 'UNBAN',
        targetUserId: id,
        targetUserHandle: (before as any).userHandle,
      });
    } catch {
      // tolerate
    }

    return updated as any;
  }
}
