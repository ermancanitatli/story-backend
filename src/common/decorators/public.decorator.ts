import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * @Public() decorator — JWT auth guard'ı bypass eder.
 * Public endpoint'lerde kullanılır (health, anonymous login, vb.)
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
