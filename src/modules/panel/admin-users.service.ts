import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { AdminUser, AdminRole } from './schemas/admin-user.schema';

const BCRYPT_ROUNDS = 10;

@Injectable()
export class AdminUsersService implements OnModuleInit {
  private readonly logger = new Logger(AdminUsersService.name);

  constructor(
    @InjectModel(AdminUser.name) private adminUserModel: Model<AdminUser>,
    private configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedInitialAdmin();
  }

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

  /**
   * admin_users koleksiyonu boşsa env'deki ADMIN_PASSWORD ile ilk superadmin'i oluştur.
   * ADMIN_USERNAME (default: 'admin') ve ADMIN_PASSWORD (zorunlu) env'den okunur.
   * Seed bittiğinde env'den silebilirsin; tekrar çalışmaz.
   */
  private async seedInitialAdmin(): Promise<void> {
    const count = await this.adminUserModel.estimatedDocumentCount();
    if (count > 0) return;

    const username = (this.configService.get<string>('ADMIN_USERNAME') || 'admin')
      .toLowerCase()
      .trim();
    const password = this.configService.get<string>('ADMIN_PASSWORD');
    if (!password) {
      this.logger.warn(
        'admin_users boş; ilk admin için ADMIN_PASSWORD env değişkeni tanımlanmalı. Seed atlanıyor.',
      );
      return;
    }

    await this.createAdmin({ username, password, role: 'superadmin' });
    this.logger.log(`🔐 İlk admin oluşturuldu: ${username} (superadmin)`);
  }
}
