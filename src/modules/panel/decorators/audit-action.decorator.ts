import { SetMetadata } from '@nestjs/common';

export const AUDIT_ACTION_KEY = 'audit:action';
export const AUDIT_RESOURCE_KEY = 'audit:resource';

/**
 * Controller handler'ı üstüne konduğunda AuditInterceptor'ın
 * otomatik audit log yazmasını sağlar.
 *
 * Örnek:
 *   @AuditAction('BAN')
 *   @AuditResource('user')
 *   @Post(':id/ban')
 *   banUser(...) {}
 */
export const AuditAction = (action: string) => SetMetadata(AUDIT_ACTION_KEY, action);
export const AuditResource = (resource: string) => SetMetadata(AUDIT_RESOURCE_KEY, resource);
