import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Story } from './schemas/story.schema';
import { PaginationDto, PaginatedResult } from '../../common/dto/pagination.dto';

@Injectable()
export class StoriesService {
  constructor(@InjectModel(Story.name) private storyModel: Model<Story>) {}

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
}
