import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User } from '../users/schemas/user.schema';
import { UsersService } from '../users/users.service';
import { UserHandlesService } from '../user-handles/user-handles.service';

@Injectable()
export class FakeUsersService {
  private readonly logger = new Logger(FakeUsersService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    private usersService: UsersService,
    private userHandlesService: UserHandlesService,
  ) {}

  /**
   * Uyumlu fake user seç (index.ts 560-603'den port)
   */
  async pickCompatibleFakeUser(params: {
    preference?: string;
    playerGender?: string;
    languageCode?: string;
    excludeUserId?: string;
  }): Promise<{ userId: string; gender?: string } | null> {
    // Fake user'ları bul
    const fakeUsers = await this.usersService.searchFakeUsers(50);
    if (fakeUsers.length === 0) return null;

    // Shuffle
    const shuffled = fakeUsers.sort(() => Math.random() - 0.5);

    for (const fake of shuffled) {
      if (fake._id.toString() === params.excludeUserId) continue;

      // Gender preference kontrolü
      if (params.preference && params.preference !== 'any') {
        const fakeGender = fake.appSettings?.extra?.multiplayerGender;
        if (!fakeGender || fakeGender !== params.preference) continue;
      }

      return {
        userId: fake._id.toString(),
        gender: fake.appSettings?.extra?.multiplayerGender || undefined,
      };
    }

    return null;
  }

  /**
   * Toplu fake user import et (insertMany ile).
   */
  async bulkImport(
    users: any[],
  ): Promise<{ inserted: number; errors: string[] }> {
    const errors: string[] = [];
    const docs = users.map((u) => ({
      ...u,
      isFake: true,
      isAnonymous: true,
      online: true,
      deviceId: u.deviceId || `fake-${new Types.ObjectId().toString()}`,
    }));

    try {
      const result = await this.userModel.insertMany(docs, { ordered: false });
      return { inserted: result.length, errors };
    } catch (err: any) {
      // insertMany with ordered:false throws on duplicates but still inserts valid ones
      const insertedCount = err.insertedDocs?.length ?? 0;
      if (err.writeErrors) {
        for (const we of err.writeErrors) {
          errors.push(
            `Index ${we.index}: ${we.errmsg || we.message || 'Unknown error'}`,
          );
        }
      } else {
        errors.push(err.message);
      }
      return { inserted: insertedCount, errors };
    }
  }

  /**
   * Fake user'ları listele (pagination + filtreler).
   */
  async listFakeUsers(query: {
    q?: string;
    page?: number;
    pageSize?: number;
    country?: string;
    gender?: string;
  }): Promise<{ data: User[]; total: number; page: number; pageSize: number }> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const skip = (page - 1) * pageSize;

    const filter: any = { isFake: true };

    if (query.q) {
      const regex = new RegExp(query.q, 'i');
      filter.$or = [
        { displayName: regex },
        { userHandle: regex },
      ];
      // ID ile arama desteği
      if (Types.ObjectId.isValid(query.q)) {
        filter.$or.push({ _id: new Types.ObjectId(query.q) });
      }
    }

    if (query.country) {
      filter['appSettings.extra.countryCode'] = query.country;
    }

    if (query.gender) {
      filter['appSettings.extra.multiplayerGender'] = query.gender;
    }

    const [data, total] = await Promise.all([
      this.userModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .exec(),
      this.userModel.countDocuments(filter).exec(),
    ]);

    return { data, total, page, pageSize };
  }

  /**
   * Tek bir fake user getir (ID ile).
   */
  async getFakeUser(id: string): Promise<User> {
    const user = await this.userModel
      .findOne({ _id: id, isFake: true })
      .exec();
    if (!user) throw new NotFoundException('Fake user not found');
    return user;
  }

  /**
   * Tek bir fake user oluştur.
   */
  async createFakeUser(dto: {
    displayName?: string;
    languageCode?: string;
    countryCode?: string;
    gender?: string;
    photoUrl?: string;
  }): Promise<User> {
    const fakeId = new Types.ObjectId().toString();
    const deviceId = `fake-${fakeId}`;
    const random6 = Math.floor(100000 + Math.random() * 900000);
    const handle = `xtinguser_${random6}`;

    // User'ı önce oluştur (handle claim için ID gerekiyor)
    const user = await this.userModel.create({
      deviceId,
      displayName: dto.displayName || `User_${random6}`,
      isFake: true,
      isAnonymous: true,
      online: true,
      photoURL: dto.photoUrl,
      appSettings: {
        language: dto.languageCode,
        extra: {
          countryCode: dto.countryCode,
          multiplayerGender: dto.gender,
        },
      },
    });

    // Handle claim et
    try {
      await this.userHandlesService.requestHandle(
        user._id.toString(),
        handle,
      );
    } catch (err) {
      this.logger.warn(
        `Handle claim failed for fake user ${user._id}: ${err.message}`,
      );
      // Handle claim başarısız olsa bile user oluşturulmuş olarak dönüyoruz
    }

    // Güncel user'ı dön (handle ile birlikte)
    const updated = await this.userModel.findById(user._id).exec();
    return updated!;
  }

  /**
   * Toplu fake user oluştur.
   * count verilirse otomatik, items verilirse veri ile oluşturur.
   */
  async bulkCreate(params: {
    count?: number;
    items?: any[];
  }): Promise<{ created: number; errors: string[] }> {
    const errors: string[] = [];
    let created = 0;

    const list: any[] = params.items
      ? params.items
      : Array.from({ length: params.count || 1 }, () => ({}));

    for (const item of list) {
      try {
        await this.createFakeUser(item);
        created++;
      } catch (err: any) {
        errors.push(err.message);
      }
    }

    return { created, errors };
  }

  /**
   * Tek bir fake user güncelle.
   */
  async updateFakeUser(id: string, dto: any): Promise<User> {
    const $set: any = {};

    if (dto.displayName !== undefined) $set.displayName = dto.displayName;
    if (dto.photoURL !== undefined) $set.photoURL = dto.photoURL;
    if (dto.photoThumbnailURL !== undefined)
      $set.photoThumbnailURL = dto.photoThumbnailURL;
    if (dto.userHandle !== undefined) $set.userHandle = dto.userHandle;
    if (dto.online !== undefined) $set.online = dto.online;

    // Nested appSettings alanları
    if (dto.languageCode !== undefined)
      $set['appSettings.language'] = dto.languageCode;
    if (dto.countryCode !== undefined)
      $set['appSettings.extra.countryCode'] = dto.countryCode;
    if (dto.gender !== undefined)
      $set['appSettings.extra.multiplayerGender'] = dto.gender;

    const user = await this.userModel
      .findOneAndUpdate({ _id: id, isFake: true }, { $set }, { new: true })
      .exec();

    if (!user) throw new NotFoundException('Fake user not found');
    return user;
  }

  /**
   * Toplu güncelleme (birden fazla fake user, aynı değişiklikler).
   */
  async bulkUpdate(
    ids: string[],
    changes: { languageCode?: string; countryCode?: string; gender?: string },
  ): Promise<{ modified: number }> {
    const $set: any = {};

    if (changes.languageCode !== undefined)
      $set['appSettings.language'] = changes.languageCode;
    if (changes.countryCode !== undefined)
      $set['appSettings.extra.countryCode'] = changes.countryCode;
    if (changes.gender !== undefined)
      $set['appSettings.extra.multiplayerGender'] = changes.gender;

    if (Object.keys($set).length === 0) {
      return { modified: 0 };
    }

    const result = await this.userModel
      .updateMany(
        { _id: { $in: ids.map((id) => new Types.ObjectId(id)) }, isFake: true },
        { $set },
      )
      .exec();

    return { modified: result.modifiedCount };
  }

  /**
   * Toplu silme.
   */
  async bulkDelete(ids: string[]): Promise<{ deleted: number }> {
    const result = await this.userModel
      .deleteMany({
        _id: { $in: ids.map((id) => new Types.ObjectId(id)) },
        isFake: true,
      })
      .exec();

    return { deleted: result.deletedCount };
  }

  /**
   * Fake user'a ülke ata.
   * TODO: names.json'dan gender + country bazlı isim seç.
   */
  async setCountry(id: string, countryCode: string): Promise<User> {
    const user = await this.userModel
      .findOneAndUpdate(
        { _id: id, isFake: true },
        {
          $set: {
            'appSettings.extra.countryCode': countryCode,
          },
        },
        { new: true },
      )
      .exec();

    if (!user) throw new NotFoundException('Fake user not found');
    return user;
  }
}
