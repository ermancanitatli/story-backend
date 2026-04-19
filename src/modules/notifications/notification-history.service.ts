import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { NotificationHistory } from './schemas/notification-history.schema';

@Injectable()
export class NotificationHistoryService {
  constructor(
    @InjectModel(NotificationHistory.name)
    private readonly historyModel: Model<NotificationHistory>,
  ) {}

  async create(partial: Partial<NotificationHistory>): Promise<NotificationHistory> {
    const doc = new this.historyModel(partial);
    return doc.save();
  }

  async updateStatus(
    id: string,
    patch: Partial<NotificationHistory>,
  ): Promise<NotificationHistory | null> {
    return this.historyModel.findByIdAndUpdate(id, { $set: patch }, { new: true }).exec();
  }

  async list(limit = 50): Promise<NotificationHistory[]> {
    return this.historyModel.find().sort({ createdAt: -1 }).limit(limit).exec();
  }

  async getById(id: string): Promise<NotificationHistory | null> {
    return this.historyModel.findById(id).exec();
  }
}
