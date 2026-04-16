import { Injectable, Logger } from '@nestjs/common';
import { UsersService } from '../users/users.service';

@Injectable()
export class FakeUsersService {
  private readonly logger = new Logger(FakeUsersService.name);

  constructor(private usersService: UsersService) {}

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
        // Basit filtre — fake user'ın gender'ı yoksa skip
        // İleride user_settings'ten gender alınabilir
      }

      return {
        userId: fake._id.toString(),
        gender: undefined, // user_settings'ten alınacak
      };
    }

    return null;
  }
}
