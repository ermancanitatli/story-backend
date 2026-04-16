import { Injectable, BadRequestException } from '@nestjs/common';
import { UsersService } from '../users/users.service';

@Injectable()
export class CreditsService {
  constructor(private usersService: UsersService) {}

  async getBalance(userId: string): Promise<{ credits: number }> {
    const user = await this.usersService.findByIdOrFail(userId);
    return { credits: user.credits };
  }

  async spendCredits(userId: string, amount: number, reason: string): Promise<{ credits: number }> {
    if (amount <= 0) throw new BadRequestException('Amount must be positive');
    const credits = await this.usersService.modifyCredits(userId, -amount);
    return { credits };
  }

  async grantCredits(userId: string, amount: number, reason: string): Promise<{ credits: number }> {
    if (amount <= 0) throw new BadRequestException('Amount must be positive');
    const credits = await this.usersService.modifyCredits(userId, amount);
    return { credits };
  }
}
