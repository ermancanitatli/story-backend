import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import {
  ErrorCode,
  ErrorCodes,
  defaultCodeForStatus,
} from './error-codes';

/**
 * Standart JSON error envelope:
 * {
 *   "error": {
 *     "code": "...",
 *     "message": "...",
 *     "details": ...,
 *     "requestId": "..."
 *   }
 * }
 *
 * Global olarak register edilir. `/panel/*` HTML rotaları için
 * PanelController'a `@UseFilters(PanelHtmlExceptionFilter)` ile
 * scope'lu HTML filter attach edildiğinden, bu filter oraya çalışmaz
 * (Nest scoped filter'lar global'den önce devreye girer).
 */
@Catch()
export class ApiJsonExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiJsonExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { id?: string }>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let code: ErrorCode = ErrorCodes.INTERNAL_ERROR;
    let details: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exResponse = exception.getResponse();

      if (typeof exResponse === 'string') {
        message = exResponse;
      } else if (exResponse && typeof exResponse === 'object') {
        const body = exResponse as Record<string, unknown>;
        // Mesaj alanı: string | string[]
        if (typeof body.message === 'string') {
          message = body.message;
        } else if (Array.isArray(body.message)) {
          message = body.message.join(', ');
          details = body.message;
        } else {
          message = exception.message;
        }
        // Explicit code varsa onu kullan
        if (typeof body.code === 'string') {
          code = body.code as ErrorCode;
        } else {
          code = defaultCodeForStatus(status);
        }
        // Ekstra meta (ör. bannedUntil, retryAfter)
        const { message: _m, code: _c, statusCode: _s, ...rest } = body;
        if (Object.keys(rest).length > 0) {
          details = { ...(typeof details === 'object' && details !== null ? details : {}), ...rest };
        }
      } else {
        code = defaultCodeForStatus(status);
        message = exception.message;
      }
    } else if (exception instanceof Error) {
      message = exception.message || message;
      code = ErrorCodes.INTERNAL_ERROR;
      this.logger.error(
        `Unhandled exception on ${request.method} ${request.url}: ${exception.message}`,
        exception.stack,
      );
    }

    const requestId = request.id;

    // /panel/* rotalarında HTML fallback render et (scoped PanelHtmlExceptionFilter
    // sadece PanelController'a hit eden istekleri yakalar; unknown /panel/*
    // route'ları buraya düşer).
    const path = request.path || request.url || '';
    if (path === '/panel' || path.startsWith('/panel/')) {
      const template =
        status === 404
          ? 'panel/404'
          : status >= 500
            ? 'panel/500'
            : 'panel/error';
      try {
        response.status(status).render(template, {
          layout: false,
          title: `Hata ${status}`,
          statusCode: status,
          message,
          requestId,
        });
        return;
      } catch (renderErr) {
        this.logger.error(
          `Panel HTML fallback render failed: ${(renderErr as Error).message}`,
        );
        // JSON fallback'e düş
      }
    }

    response.status(status).json({
      error: {
        code,
        message,
        ...(details !== undefined ? { details } : {}),
        ...(requestId ? { requestId } : {}),
      },
    });
  }
}
