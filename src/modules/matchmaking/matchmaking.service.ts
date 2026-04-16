import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { MatchmakingQueue } from './schemas/matchmaking-queue.schema';
import { UsersService } from '../users/users.service';

@Injectable()
export class MatchmakingService {
  private readonly logger = new Logger(MatchmakingService.name);

  constructor(
    @InjectModel(MatchmakingQueue.name) private queueModel: Model<MatchmakingQueue>,
    private usersService: UsersService,
  ) {}

  /**
   * Oyuncuyu matchmaking kuyruğuna ekle.
   */
  async joinQueue(userId: string, params: {
    preference?: string;
    playerGender?: string;
    languageCode?: string;
  }): Promise<MatchmakingQueue> {
    // Zaten kuyrukta mı?
    const existing = await this.queueModel.findOne({
      userId: new Types.ObjectId(userId),
      status: { $in: ['waiting', 'matched'] },
    });
    if (existing) return existing;

    const entry = await this.queueModel.create({
      userId: new Types.ObjectId(userId),
      status: 'waiting',
      ...params,
    });

    // Hemen eşleşme dene
    const match = await this.tryMatch(entry);
    return match || entry;
  }

  /**
   * Eşleşme kabul et.
   */
  async acceptMatch(userId: string): Promise<MatchmakingQueue | null> {
    const entry = await this.queueModel.findOneAndUpdate(
      { userId: new Types.ObjectId(userId), status: 'matched' },
      { accepted: true },
      { new: true },
    );

    if (!entry?.matchedWith) return entry;

    // Partner da kabul etti mi?
    const partner = await this.queueModel.findOne({
      userId: entry.matchedWith,
      matchedWith: new Types.ObjectId(userId),
    });

    if (partner?.accepted) {
      // İkisi de kabul etti → completed
      await this.queueModel.updateMany(
        { _id: { $in: [entry._id, partner._id] } },
        { status: 'completed' },
      );
      return await this.queueModel.findById(entry._id);
    }

    return entry;
  }

  /**
   * Eşleşme reddet.
   */
  async declineMatch(userId: string): Promise<void> {
    const entry = await this.queueModel.findOne({
      userId: new Types.ObjectId(userId),
      status: 'matched',
    });
    if (!entry) return;

    // Kendini iptal et
    entry.status = 'cancelled';
    await entry.save();

    // Partneri tekrar waiting'e al
    if (entry.matchedWith) {
      await this.queueModel.findOneAndUpdate(
        { userId: entry.matchedWith, matchedWith: new Types.ObjectId(userId) },
        { status: 'waiting', matchedWith: null, accepted: false, partnerAccepted: false },
      );
    }
  }

  /**
   * Kuyruktan çık.
   */
  async cancelQueue(userId: string): Promise<void> {
    await this.queueModel.updateMany(
      { userId: new Types.ObjectId(userId), status: { $in: ['waiting', 'matched'] } },
      { status: 'cancelled' },
    );
  }

  /**
   * Uyumlu eşleşme dene.
   */
  private async tryMatch(entry: MatchmakingQueue): Promise<MatchmakingQueue | null> {
    const filter: any = {
      _id: { $ne: entry._id },
      status: 'waiting',
      userId: { $ne: entry.userId },
    };

    // Gender preference filtresi
    if (entry.preference && entry.preference !== 'any') {
      filter.playerGender = entry.preference;
    }

    // Language filtresi
    if (entry.languageCode) {
      filter.$or = [
        { languageCode: entry.languageCode },
        { languageCode: { $exists: false } },
      ];
    }

    const candidate = await this.queueModel.findOne(filter).sort({ createdAt: 1 });
    if (!candidate) return null;

    // Eşleştir
    await this.queueModel.findByIdAndUpdate(entry._id, {
      status: 'matched',
      matchedWith: candidate.userId,
      matchedGender: candidate.playerGender,
    });
    await this.queueModel.findByIdAndUpdate(candidate._id, {
      status: 'matched',
      matchedWith: entry.userId,
      matchedGender: entry.playerGender,
    });

    this.logger.log(`Matched: ${entry.userId} <-> ${candidate.userId}`);
    return await this.queueModel.findById(entry._id);
  }
}
