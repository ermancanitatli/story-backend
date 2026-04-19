import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Inject } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Observable, tap } from 'rxjs';
import type { Logger } from 'winston';
import { getCurrentRequestId } from '../context/request-context';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(@Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const httpCtx = context.switchToHttp();
    const request = httpCtx.getRequest();
    if (!request) {
      return next.handle();
    }
    const { method, originalUrl, url, user } = request;
    const route = originalUrl || url;
    const reqId = request.id ?? getCurrentRequestId();
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const response = httpCtx.getResponse();
          const latencyMs = Date.now() - start;
          this.logger.info('http_request', {
            context: 'HTTP',
            reqId,
            method,
            route,
            statusCode: response?.statusCode,
            latencyMs,
            userId: user?.userId,
            adminId: user?.adminId,
          });
        },
        error: (err) => {
          const latencyMs = Date.now() - start;
          this.logger.error('http_request_error', {
            context: 'HTTP',
            reqId,
            method,
            route,
            latencyMs,
            userId: user?.userId,
            adminId: user?.adminId,
            error: err?.message,
          });
        },
      }),
    );
  }
}
