import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { AdminAuditLogService } from '../admin-audit-log.service';
import {
  AUDIT_ACTION_KEY,
  AUDIT_RESOURCE_KEY,
} from '../decorators/audit-action.decorator';

/**
 * @AuditAction / @AuditResource ile işaretli handler'larda
 * başarılı response sonrasında fire-and-forget audit log yazar.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger('AuditInterceptor');

  constructor(
    private reflector: Reflector,
    private auditService: AdminAuditLogService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const action = this.reflector.get<string>(AUDIT_ACTION_KEY, context.getHandler());
    const resource = this.reflector.get<string>(
      AUDIT_RESOURCE_KEY,
      context.getHandler(),
    );

    if (!action) {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest();
    const adminId = req.session?.adminId || 'unknown';
    const adminUsername = req.session?.username || 'unknown';

    return next.handle().pipe(
      tap({
        next: (response) => {
          // Fire-and-forget — audit yazımı request sürecini bloklamaz.
          this.auditService
            .record({
              adminId,
              adminUsername,
              action: action as any,
              targetUserId: req.params?.id || req.params?.userId,
              metadata: {
                resource,
                resourceId: req.params?.id,
                requestId: req.id,
                ip: req.ip,
                userAgent: req.headers?.['user-agent'],
                method: req.method,
                path: req.path,
                after: response,
              },
            })
            .catch((err) =>
              this.logger.warn(`Audit log write failed: ${err.message}`),
            );
        },
      }),
    );
  }
}
