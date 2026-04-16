import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppSettingsDoc } from './schemas/app-settings.schema';

@Injectable()
export class AppSettingsService {
  private readonly logger = new Logger(AppSettingsService.name);
  private cache: AppSettingsDoc | null = null;
  private cacheExpiry = 0;
  private readonly cacheTTL = 5 * 60 * 1000; // 5 minutes

  constructor(
    @InjectModel(AppSettingsDoc.name) private settingsModel: Model<AppSettingsDoc>,
  ) {}

  async getSettings(): Promise<AppSettingsDoc> {
    if (this.cache && Date.now() < this.cacheExpiry) {
      return this.cache;
    }

    let settings = await this.settingsModel.findOne({ key: 'global' }).exec();

    if (!settings) {
      // Create default settings
      settings = await this.settingsModel.create({ key: 'global' });
      this.logger.log('Created default app settings');
    }

    this.cache = settings;
    this.cacheExpiry = Date.now() + this.cacheTTL;
    return settings;
  }

  async updateSettings(updates: Partial<AppSettingsDoc>): Promise<AppSettingsDoc> {
    const settings = await this.settingsModel
      .findOneAndUpdate({ key: 'global' }, { $set: updates }, { new: true, upsert: true })
      .exec();
    this.cache = settings;
    this.cacheExpiry = Date.now() + this.cacheTTL;
    return settings!;
  }

  invalidateCache() {
    this.cache = null;
    this.cacheExpiry = 0;
  }
}
