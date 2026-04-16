import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * @CurrentUser() decorator — JWT payload'dan user bilgisini çeker.
 * Controller method parametrelerinde kullanılır:
 *   findMe(@CurrentUser() user: JwtPayload)
 */
export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    return data ? user?.[data] : user;
  },
);
