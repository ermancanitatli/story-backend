import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import { UsersService } from '../users/users.service';

@Injectable()
export class UserHandlesService {
  constructor(private usersService: UsersService) {}

  async checkAvailability(handle: string): Promise<{ available: boolean }> {
    const sanitized = this.sanitize(handle);
    if (!this.isValid(sanitized)) return { available: false };
    const existing = await this.usersService.findByHandle(sanitized);
    return { available: !existing };
  }

  async requestHandle(userId: string, handle: string): Promise<{ success: boolean; handle: string }> {
    const sanitized = this.sanitize(handle);
    if (!this.isValid(sanitized)) throw new BadRequestException('Invalid handle format');

    const existing = await this.usersService.findByHandle(sanitized);
    if (existing && existing._id.toString() !== userId) {
      throw new ConflictException('Handle already taken');
    }

    await this.usersService.update(userId, { userHandle: sanitized } as any);
    return { success: true, handle: sanitized };
  }

  private sanitize(handle: string): string {
    return handle.toLowerCase().trim().replace(/[^a-z0-9._]/g, '');
  }

  private isValid(handle: string): boolean {
    return handle.length >= 3 && handle.length <= 20 && /^[a-z0-9._]+$/.test(handle);
  }
}
