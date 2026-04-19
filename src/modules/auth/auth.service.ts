import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { RefreshToken } from './schemas/refresh-token.schema';
import { UsersService } from '../users/users.service';
import { JwtPayload } from './strategies/jwt.strategy';

@Injectable()
export class AuthService {
  private readonly refreshSecret: string;
  private readonly refreshExpires: string;

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    private usersService: UsersService,
    @InjectModel(RefreshToken.name) private refreshTokenModel: Model<RefreshToken>,
  ) {
    this.refreshSecret = this.configService.get<string>('JWT_REFRESH_SECRET', 'change-me-refresh');
    this.refreshExpires = this.configService.get<string>('JWT_REFRESH_EXPIRES', '5y');
  }

  /**
   * Anonymous login — deviceId ile giriş.
   * Eğer deviceId mevcut bir user'a aitse, o user'ın token'larını döndürür.
   * Yeni deviceId ise yeni user oluşturur.
   */
  async anonymousLogin(deviceId: string) {
    let user = await this.usersService.findByDeviceId(deviceId);

    if (user) {
      if (user.isDeleted) {
        throw new HttpException(
          { code: 'USER_DELETED', message: 'Hesap silindi' },
          HttpStatus.GONE,
        );
      }
      if (user.isBanned) {
        throw new ForbiddenException({
          code: 'USER_BANNED',
          bannedUntil: user.bannedUntil,
          message: 'Hesabınız askıya alındı',
        });
      }
    } else {
      user = await this.usersService.create({ deviceId });
    }

    const userId = (user._id as Types.ObjectId).toHexString();
    const tokens = await this.generateTokens(userId, deviceId);

    return {
      ...tokens,
      userId,
      isNewUser: !user.displayName,
    };
  }

  /**
   * Refresh token ile yeni access token al.
   */
  async refreshAccessToken(refreshToken: string) {
    // Verify refresh token
    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: this.refreshSecret,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Atomic: find + revoke in single operation (prevents race condition)
    const stored = await this.refreshTokenModel.findOneAndUpdate(
      { token: refreshToken, revoked: false },
      { $set: { revoked: true } },
    );
    if (!stored) {
      throw new UnauthorizedException('Refresh token revoked or not found');
    }

    // Generate new token pair
    const tokens = await this.generateTokens(payload.sub, payload.deviceId);

    return {
      ...tokens,
      userId: payload.sub,
    };
  }

  /**
   * Generate access + refresh token pair.
   */
  private async generateTokens(userId: string, deviceId: string) {
    const jwtPayload: JwtPayload = { sub: userId, deviceId };

    const accessToken = this.jwtService.sign(jwtPayload);

    const refreshToken = this.jwtService.sign(jwtPayload, {
      secret: this.refreshSecret,
      expiresIn: this.refreshExpires,
    });

    // Persist refresh token
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 5); // 5 years

    await this.refreshTokenModel.create({
      userId: new Types.ObjectId(userId),
      token: refreshToken,
      expiresAt,
      deviceId,
    });

    return { accessToken, refreshToken };
  }

  /**
   * Revoke all refresh tokens for a user.
   */
  async revokeAllTokens(userId: string) {
    await this.refreshTokenModel.updateMany(
      { userId: new Types.ObjectId(userId), revoked: false },
      { revoked: true },
    );
  }
}
