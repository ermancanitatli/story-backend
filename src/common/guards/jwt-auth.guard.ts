import {
  ExecutionContext,
  ForbiddenException,
  HttpException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { User } from '../../modules/users/schemas/user.schema';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private reflector: Reflector,
    @InjectModel(User.name) private readonly userModel: Model<User>,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    // Run passport-jwt first
    const activated = (await super.canActivate(context)) as boolean;
    if (!activated) return false;

    // Fresh lookup on User collection for ban/delete state.
    const req = context.switchToHttp().getRequest();
    const user = req.user;
    const userId = user?.userId || user?.sub || user?._id;
    if (!userId) return true;

    const fresh = await this.userModel
      .findById(userId)
      .select('isBanned isDeleted bannedUntil')
      .lean()
      .exec();

    if (!fresh) {
      throw new UnauthorizedException({
        code: 'AUTH_USER_NOT_FOUND',
        message: 'User not found',
      });
    }

    if (fresh.isDeleted) {
      throw new HttpException(
        {
          code: 'USER_DELETED',
          message: 'Hesap silindi',
        },
        410,
      );
    }

    if (fresh.isBanned) {
      throw new ForbiddenException({
        code: 'USER_BANNED',
        message: 'Hesabınız askıya alındı',
        bannedUntil: fresh.bannedUntil ?? null,
      });
    }

    return true;
  }

  handleRequest(err: any, user: any) {
    if (err || !user) {
      throw err || new UnauthorizedException('Invalid or expired token');
    }
    return user;
  }
}
