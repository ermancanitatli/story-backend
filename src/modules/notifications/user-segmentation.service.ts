import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import Redis from 'ioredis';
import * as crypto from 'crypto';
import { User } from '../users/schemas/user.schema';
import {
  SegmentName,
  SegmentOptions,
  SegmentResolveResult,
} from './types/segment.types';

@Injectable()
export class UserSegmentationService {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @Inject('REDIS_CLIENT') private redis: Redis,
  ) {}

  private cacheKey(segment: string, opts?: SegmentOptions): string {
    const idsHash = opts?.customUserIds?.length
      ? crypto
          .createHash('sha1')
          .update([...opts.customUserIds].sort().join(','))
          .digest('hex')
          .slice(0, 16)
      : 'none';
    return `notif:estimate:${segment}:${idsHash}`;
  }

  private buildQuery(segment: SegmentName, opts: SegmentOptions = {}): any {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const base: any = {
      oneSignalPlayerId: { $exists: true, $ne: null, $nin: ['', null] },
      isBanned: { $ne: true },
      isDeleted: { $ne: true },
    };
    switch (segment) {
      case 'all':
        return base;
      case 'non_premium':
        return { ...base, 'premium.isPremium': { $ne: true } };
      case 'premium':
        return { ...base, 'premium.isPremium': true };
      case 'active_7d':
        return { ...base, lastSeen: { $gte: new Date(now - 7 * day) } };
      case 'inactive_30d':
        return { ...base, lastSeen: { $lt: new Date(now - 30 * day) } };
      case 'custom_user_ids': {
        const ids = (opts.customUserIds || []).filter(Boolean);
        return { ...base, _id: { $in: ids } };
      }
      default:
        throw new Error(`Unknown segment: ${segment}`);
    }
  }

  async resolve(
    segment: SegmentName,
    opts: SegmentOptions = {},
  ): Promise<SegmentResolveResult> {
    const query = this.buildQuery(segment, opts);
    const total = await this.userModel.countDocuments(query).exec();
    // Stream with cursor, batch 5000 — tüm id'leri topla
    const externalIds: string[] = [];
    const cursor = this.userModel
      .find(query, { _id: 1 })
      .batchSize(5000)
      .lean()
      .cursor();
    for await (const doc of cursor) {
      externalIds.push(String(doc._id));
    }
    return { count: total, externalIds, sampleIds: externalIds.slice(0, 10) };
  }

  async estimate(
    segment: SegmentName,
    opts: SegmentOptions = {},
  ): Promise<{ count: number }> {
    const key = this.cacheKey(segment, opts);
    try {
      const cached = await this.redis.get(key);
      if (cached !== null) return { count: parseInt(cached, 10) };
    } catch {
      /* cache read failure - fallback to DB */
    }
    const query = this.buildQuery(segment, opts);
    const count = await this.userModel.countDocuments(query).exec();
    try {
      await this.redis.set(key, String(count), 'EX', 30);
    } catch {
      /* cache write failure - ignore */
    }
    return { count };
  }
}
