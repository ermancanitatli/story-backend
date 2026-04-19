import { applyDecorators, UseGuards } from '@nestjs/common';
import { SuperadminGuard } from '../guards/superadmin.guard';

/**
 * Endpoint'i sadece superadmin role'üne sahip aktif admin'lerle sınırlar.
 * SessionAuthGuard'dan sonra zincirlenecek şekilde tasarlandı.
 */
export const SuperadminOnly = () => applyDecorators(UseGuards(SuperadminGuard));
