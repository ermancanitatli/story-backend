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
    mustChangePassword?: boolean;
  }): Promise<AdminUser> {
    const passwordHash = await bcrypt.hash(params.password, BCRYPT_ROUNDS);
    return this.adminUserModel.create({
      username: params.username.toLowerCase().trim(),
      passwordHash,
      role: params.role || 'admin',
      isActive: true,
      mustChangePassword: params.mustChangePassword ?? false,
    });
  }

  async changePassword(userId: string, newPassword: string): Promise<void> {
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.adminUserModel.findByIdAndUpdate(userId, {
      passwordHash,
      mustChangePassword: false,
    });
  }

  /**
   * Tüm admin kullanıcıları listeler (en son eklenen en üstte).
   */
  async listAdmins(): Promise<AdminUser[]> {
    return this.adminUserModel.find().sort({ createdAt: -1 }).exec();
  }

  /**
   * Admin'i aktif/pasif yapar.
   * Son aktif superadmin disable edilemez.
   */
  async toggleActive(userId: string, isActive: boolean): Promise<AdminUser> {
    if (!isActive) {
      const user = await this.adminUserModel.findById(userId).exec();
      if (!user) throw new NotFoundException('Admin bulunamadı');
      if (user.role === 'superadmin') {
        const activeCount = await this.adminUserModel
          .countDocuments({ role: 'superadmin', isActive: true })
          .exec();
        if (activeCount <= 1) {
          throw new ForbiddenException(
            'Son aktif superadmin disable edilemez',
          );
        }
      }
    }
    const updated = await this.adminUserModel
      .findByIdAndUpdate(userId, { isActive }, { new: true })
      .exec();
    if (!updated) throw new NotFoundException('Admin bulunamadı');
    return updated;
  }

  /**
   * Admin rolünü değiştirir.
   * Son aktif superadmin 'admin' rolüne demote edilemez.
   */
  async changeRole(userId: string, role: AdminRole): Promise<AdminUser> {
    if (role === 'admin') {
      const user = await this.adminUserModel.findById(userId).exec();
      if (!user) throw new NotFoundException('Admin bulunamadı');
      if (user.role === 'superadmin') {
        const activeCount = await this.adminUserModel
          .countDocuments({ role: 'superadmin', isActive: true })
          .exec();
        if (activeCount <= 1) {
          throw new ForbiddenException('Son superadmin demote edilemez');
        }
      }
    }
    const updated = await this.adminUserModel
      .findByIdAndUpdate(userId, { role }, { new: true })
      .exec();
    if (!updated) throw new NotFoundException('Admin bulunamadı');
    return updated;
  }

  /**
   * Rastgele geçici şifre üretir, hash'ini kaydeder ve
   * kullanıcıya 'mustChangePassword' bayrağı koyar.
   * Çağıran, dönen tempPassword'ü superadmin'e göstermelidir.
   */
  async resetPassword(userId: string): Promise<{ tempPassword: string }> {
    const user = await this.adminUserModel.findById(userId).exec();
    if (!user) throw new NotFoundException('Admin bulunamadı');
    const tempPassword =
      'temp-' +
      Math.random().toString(36).slice(2, 10) +
      '-' +
      Math.random().toString(36).slice(2, 6);
    const passwordHash = await bcrypt.hash(tempPassword, BCRYPT_ROUNDS);
    await this.adminUserModel.findByIdAndUpdate(userId, {
      passwordHash,
      mustChangePassword: true,
    });
    return { tempPassword };
  }

  async enableTotp(
    userId: string,
    secret: string,
    recoveryCodes: string[],
  ): Promise<void> {
    await this.adminUserModel.findByIdAndUpdate(userId, {
      totpSecret: secret,
      totpEnabled: true,
      recoveryCodes,
    });
  }

  async disableTotp(userId: string): Promise<void> {
    await this.adminUserModel.findByIdAndUpdate(userId, {
      totpSecret: null,
      totpEnabled: false,
      recoveryCodes: [],
    });
  }
}
