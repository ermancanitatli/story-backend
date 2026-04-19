import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { AdminUser, AdminRole } from './schemas/admin-user.schema';

const BCRYPT_ROUNDS = 10;

@Injectable()
export class AdminUsersService {
  constructor(
    @InjectModel(AdminUser.name) private adminUserModel: Model<AdminUser>,
  ) {}

  /**
   * Username + password doğrulama. Başarılı ise lastLoginAt güncellenir, user döner.
   */
  async verify(username: string, password: string): Promise<AdminUser | null> {
    if (!username || !password) return null;
    const user = await this.adminUserModel
      .findOne({ username: username.toLowerCase().trim(), isActive: true })
      .exec();
    if (!user) return null;

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return null;

    user.lastLoginAt = new Date();
    await user.save();
    return user;
  }

  async findById(id: string): Promise<AdminUser | null> {
    return this.adminUserModel.findById(id).exec();
  }

  async createAdmin(params: {
    username: string;
    password: string;
    role?: AdminRole;
  }): Promise<AdminUser> {
    const passwordHash = await bcrypt.hash(params.password, BCRYPT_ROUNDS);
    return this.adminUserModel.create({
      username: params.username.toLowerCase().trim(),
      passwordHash,
      role: params.role || 'admin',
      isActive: true,
    });
  }

  async changePassword(userId: string, newPassword: string): Promise<void> {
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.adminUserModel.findByIdAndUpdate(userId, { passwordHash });
  }
}
