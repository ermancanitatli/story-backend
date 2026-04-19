import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, isValidObjectId, Types } from 'mongoose';
import { User } from '../users/schemas/user.schema';
import { Friendship } from '../friendships/schemas/friendship.schema';
import { StorySession } from '../story-sessions/schemas/story-session.schema';

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
}
