import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '../users/schemas/user.schema';

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

@Injectable()
export class AdminUsersManagementService {
  constructor(@InjectModel(User.name) private userModel: Model<User>) {}

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
}
