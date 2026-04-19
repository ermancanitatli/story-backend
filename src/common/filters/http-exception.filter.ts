import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let code: string | undefined;
    let extra: Record<string, any> = {};

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exResponse = exception.getResponse();
      if (typeof exResponse === 'string') {
        message = exResponse;
      } else if (exResponse && typeof exResponse === 'object') {
        const body = exResponse as Record<string, any>;
        message = body.message || exception.message;
        if (typeof body.code === 'string') {
          code = body.code;
        }
        // Preserve all additional meta fields (e.g. bannedUntil, retryAfter).
        const { statusCode: _sc, message: _m, code: _c, error: _e, ...rest } = body;
        extra = rest;
      } else {
        message = exception.message;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      console.error('Unhandled exception:', exception.stack);
    }

    const payload: Record<string, any> = {
      statusCode: status,
      ...(code ? { code } : {}),
      message,
      timestamp: new Date().toISOString(),
      ...extra,
    };

    response.status(status).json(payload);
  }
}
