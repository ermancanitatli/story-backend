import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Story } from './schemas/story.schema';
import { StorySession } from '../story-sessions/schemas/story-session.schema';
import { PaginationDto, PaginatedResult } from '../../common/dto/pagination.dto';
import { CreateStoryDto } from './dto/create-story.dto';
import { UpdateStoryDto } from './dto/update-story.dto';
import { ListStoryQueryDto } from './dto/list-story-query.dto';

@Injectable()
export class StoriesService {
  constructor(
    @InjectModel(Story.name) private storyModel: Model<Story>,
    @Optional()
    @InjectModel(StorySession.name)
    private storySessionModel?: Model<StorySession>,
  ) {}

  /**
   * Get all public stories (paginated, newest first).
   */
  async findAll(pagination: PaginationDto): Promise<PaginatedResult<Story>> {
    const { page = 1, limit = 20 } = pagination;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.storyModel
        .find({ ownerDeleted: { $ne: true } })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.storyModel.countDocuments({ ownerDeleted: { $ne: true } }).exec(),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get story by ID.
   */
  async findById(id: string): Promise<Story> {
    const story = await this.storyModel.findById(id).exec();
    if (!story) throw new NotFoundException('Story not found');
    return story;
  }

  /**
   * Get stories by genre.
   */
  async findByGenre(genre: string, pagination: PaginationDto): Promise<PaginatedResult<Story>> {
    const { page = 1, limit = 20 } = pagination;
    const skip = (page - 1) * limit;
    const filter = { genre, ownerDeleted: { $ne: true } };

    const [data, total] = await Promise.all([
      this.storyModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      this.storyModel.countDocuments(filter).exec(),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Create story (admin).
   */
  async create(data: Partial<Story>): Promise<Story> {
    return this.storyModel.create(data);
  }

  /**
   * Update story (admin).
   */
  async update(id: string, data: Partial<Story>): Promise<Story> {
    const story = await this.storyModel
      .findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true })
      .exec();
    if (!story) throw new NotFoundException('Story not found');
    return story;
  }

  /**
   * Delete story (soft delete).
   */
  async softDelete(id: string): Promise<void> {
    const result = await this.storyModel.findByIdAndUpdate(id, { ownerDeleted: true });
    if (!result) throw new NotFoundException('Story not found');
  }

  // -------------------------------------------------------------------------
  // Admin methods (STORY-04) — admin panel CRUD + yardımcı sorgular.
  // -------------------------------------------------------------------------

  /**
   * Admin list with filters, search, sorting ve pagination.
   */
  async adminList(query: ListStoryQueryDto): Promise<{
    stories: Story[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = Math.max(query.page || 1, 1);
    const limit = Math.min(Math.max(query.limit || 20, 1), 100);
    const sortBy = query.sortBy || 'updatedAt';
    const sortDir = query.sortDir === 'asc' ? 1 : -1;

    const filter: any = {};
    if (query.genre) filter.genre = query.genre;
    if (typeof query.isPaid === 'boolean') filter.isPaid = query.isPaid;
    if (typeof query.isPublished === 'boolean') filter.isPublished = query.isPublished;
    if (query.search) {
      const rx = new RegExp(
        query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        'i',
      );
      filter.$or = [{ title: rx }, { tags: rx }];
    }
    // Silinmişleri varsayılan olarak gizle
    filter.deletedAt = { $exists: false };

    const [stories, total] = await Promise.all([
      this.storyModel
        .find(filter)
        .sort({ [sortBy]: sortDir })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      this.storyModel.countDocuments(filter).exec(),
    ]);

    return { stories: stories as unknown as Story[], total, page, limit };
  }

  /**
   * Admin create — DTO validated.
   */
  async adminCreate(dto: CreateStoryDto): Promise<Story> {
    return this.storyModel.create({ ...(dto as any), readCount: 0 });
  }

  /**
   * Admin update — basit $set, nested translations merge edilmez (replace).
   */
  async adminUpdate(id: string, dto: UpdateStoryDto): Promise<Story> {
    const updated = await this.storyModel
      .findByIdAndUpdate(id, { $set: dto as any }, { new: true })
      .lean()
      .exec();
    if (!updated) throw new NotFoundException('Story not found');
    return updated as unknown as Story;
  }

  /**
   * Admin soft delete — `deletedAt` timestamp set eder.
   */
  async adminSoftDelete(id: string): Promise<void> {
    const result = await this.storyModel
      .findByIdAndUpdate(id, { $set: { deletedAt: new Date() } })
      .exec();
    if (!result) throw new NotFoundException('Story not found');
  }

  /**
   * Admin duplicate — yeni `(copy)` suffixli draft oluşturur.
   */
  async adminDuplicate(id: string): Promise<Story> {
    const original = await this.storyModel.findById(id).lean().exec();
    if (!original) throw new NotFoundException('Story not found');
    const { _id, createdAt, updatedAt, ...rest } = original as any;
    const copy: any = {
      ...rest,
      title: (rest.title || '') + ' (copy)',
      translations: rest.translations
        ? JSON.parse(JSON.stringify(rest.translations))
        : undefined,
      isPublished: false,
      readCount: 0,
    };
    if (copy.translations?.en?.title) {
      copy.translations.en.title += ' (copy)';
    }
    return this.storyModel.create(copy);
  }

  // -------------------------------------------------------------------------
  // Image management (STORY-07)
  // -------------------------------------------------------------------------

  async addImage(
    storyId: string,
    image: {
      url: string;
      thumbnail?: string;
      title?: string;
      alt?: string;
      type: 'cover' | 'gallery';
    },
  ): Promise<Story> {
    const field = image.type === 'cover' ? 'coverImage' : 'galleryImages';
    const { randomUUID } = await import('crypto');
    const newItem = {
      _id: randomUUID(),
      url: image.url,
      thumbnail: image.thumbnail,
      title: image.title,
      alt: image.alt,
      order: 0,
    };
    const updated = await this.storyModel
      .findByIdAndUpdate(storyId, { $push: { [field]: newItem } }, { new: true })
      .lean()
      .exec();
    if (!updated) throw new NotFoundException('Story not found');
    return updated as unknown as Story;
  }

  async deleteImage(
    storyId: string,
    imageIndex: number,
    type: 'cover' | 'gallery',
  ): Promise<void> {
    const field = type === 'cover' ? 'coverImage' : 'galleryImages';
    const story = await this.storyModel.findById(storyId).exec();
    if (!story) throw new NotFoundException('Story not found');
    const arr = ((story as any)[field] || []).slice();
    arr.splice(imageIndex, 1);
    await this.storyModel
      .findByIdAndUpdate(storyId, { $set: { [field]: arr } })
      .exec();
  }

  async reorderImages(
    storyId: string,
    type: 'cover' | 'gallery',
    orderedIndexes: number[],
  ): Promise<void> {
    const field = type === 'cover' ? 'coverImage' : 'galleryImages';
    const story = await this.storyModel.findById(storyId).lean().exec();
    if (!story) throw new NotFoundException('Story not found');
    const arr = (story as any)[field] || [];
    const reordered = orderedIndexes.map((i) => arr[i]).filter(Boolean);
    await this.storyModel
      .findByIdAndUpdate(storyId, { $set: { [field]: reordered } })
      .exec();
  }

  /**
   * Aktif oturum sayısı — admin arayüzünde silme uyarısı için kullanılır.
   */
  async activeSessionCount(storyId: string): Promise<number> {
    if (!this.storySessionModel) return 0;
    try {
      return await this.storySessionModel
        .countDocuments({ storyId, status: 'active' })
        .exec();
    } catch {
      return 0;
    }
  }
}
