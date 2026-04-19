import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * Panel (HTML) için scoped exception filter.
 * `PanelController`'a `@UseFilters(PanelHtmlExceptionFilter)` ile
 * attach edilir; `/panel/*` rotalarında 4xx/5xx durumunda
 * `views/panel/error.ejs` render eder.
 *
 * API JSON rotaları için global `ApiJsonExceptionFilter` devrededir.
 */
@Catch()
export class PanelHtmlExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PanelHtmlExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { id?: string }>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Beklenmeyen bir hata oluştu.';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exResponse = exception.getResponse();
      if (typeof exResponse === 'string') {
        message = exResponse;
      } else if (exResponse && typeof exResponse === 'object') {
        const body = exResponse as Record<string, unknown>;
        if (typeof body.message === 'string') {
          message = body.message;
        } else if (Array.isArray(body.message)) {
          message = (body.message as unknown[]).join(', ');
        }
      }
    } else if (exception instanceof Error) {
      message = exception.message || message;
      this.logger.error(
        `Unhandled panel exception on ${request.method} ${request.url}: ${exception.message}`,
        exception.stack,
      );
    }

    const title = `Hata ${status}`;
    const template =
      status === 404
        ? 'panel/404'
        : status >= 500
          ? 'panel/500'
          : 'panel/error';

    try {
      response.status(status).render(template, {
        title,
        statusCode: status,
        message,
        requestId: request.id,
      });
    } catch (renderErr) {
      // View render başarısız olursa düz metin fallback
      this.logger.error(
        `Panel error view render failed: ${(renderErr as Error).message}`,
      );
      response
        .status(status)
        .type('text/html')
        .send(
          `<!doctype html><html><body><h1>${title}</h1><p>${message}</p></body></html>`,
        );
    }
  }
}
