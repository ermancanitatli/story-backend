import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from './schemas/user.schema';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<User>) {}

  /**
   * Create a new user with deviceId.
   */
  async create(data: { deviceId: string; legacyFirebaseId?: string }): Promise<User> {
    return this.userModel.create({
      deviceId: data.deviceId,
      legacyFirebaseId: data.legacyFirebaseId,
      isAnonymous: true,
      credits: 3, // Default credits for new users
    });
  }

  /**
   * Find user by deviceId.
   */
  async findByDeviceId(deviceId: string): Promise<User | null> {
    return this.userModel.findOne({ deviceId }).exec();
  }

  /**
   * Find user by ID.
   */
  async findById(id: string): Promise<User | null> {
    return this.userModel.findById(id).exec();
  }

  /**
   * Find user by ID, throw if not found.
   */
  async findByIdOrFail(id: string): Promise<User> {
    const user = await this.findById(id);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  /**
   * Find user by userHandle.
   */
  async findByHandle(handle: string): Promise<User | null> {
    return this.userModel.findOne({ userHandle: handle }).exec();
  }

  /**
   * Update user profile.
   */
  async update(id: string, dto: UpdateUserDto): Promise<User> {
    // Handle unique constraint check for userHandle
    if (dto.userHandle) {
      const existing = await this.userModel.findOne({
        userHandle: dto.userHandle,
        _id: { $ne: id },
      });
      if (existing) {
        throw new ConflictException('User handle already taken');
      }
    }

    const user = await this.userModel
      .findByIdAndUpdate(id, { $set: dto }, { new: true, runValidators: true })
      .exec();

    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  /**
   * Get user's public profile (limited fields).
   */
  async getPublicProfile(id: string) {
    const user = await this.findByIdOrFail(id);
    return {
      id: user._id,
      displayName: user.displayName,
      photoURL: user.photoURL,
      photoThumbnailURL: user.photoThumbnailURL,
      userHandle: user.userHandle,
      online: user.online,
      lastSeen: user.lastSeen,
    };
  }

  /**
   * Update presence status.
   */
  async updatePresence(id: string, online: boolean): Promise<void> {
    await this.userModel.findByIdAndUpdate(id, {
      online,
      lastSeen: new Date(),
      presenceUpdatedAt: new Date(),
    });
  }

  /**
   * Atomically modify credits (positive = grant, negative = spend).
   */
  async modifyCredits(id: string, amount: number): Promise<number> {
    const user = await this.userModel.findOneAndUpdate(
      { _id: id, credits: { $gte: amount < 0 ? Math.abs(amount) : 0 } },
      { $inc: { credits: amount } },
      { new: true },
    );
    if (!user) {
      throw new NotFoundException('User not found or insufficient credits');
    }
    return user.credits;
  }
}
