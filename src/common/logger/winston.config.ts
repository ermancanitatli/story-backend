import * as winston from 'winston';
import { utilities as nestWinstonUtilities, WinstonModuleOptions } from 'nest-winston';
import { requestContext } from '../context/request-context';

const isProduction = process.env.NODE_ENV === 'production';

const devFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.colorize({ all: false }),
  winston.format.printf(({ timestamp, level, message, context, ...meta }) => {
    const store = requestContext.getStore();
    const reqId = (meta as any).reqId ?? store?.reqId;
    const ctx = context ? `[${context}] ` : '';
    const rid = reqId ? ` reqId=${reqId}` : '';
    // Strip already-rendered fields from meta
    const { reqId: _r, ...rest } = meta as any;
    const extra = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : '';
    return `${timestamp} ${level} ${ctx}${message}${rid}${extra}`;
  }),
);

const prodFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format((info) => {
    const store = requestContext.getStore();
    if (store?.reqId && !info.reqId) {
      info.reqId = store.reqId;
    }
    return info;
  })(),
  winston.format.errors({ stack: true }),
  winston.format.json(),
);

export const winstonConfig: WinstonModuleOptions = {
  defaultMeta: { service: 'story-backend' },
  level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
  format: isProduction ? prodFormat : devFormat,
  transports: [
    new winston.transports.Console({
      handleExceptions: true,
    }),
  ],
  exitOnError: false,
};

// Re-export nest-winston utilities in case callers want Nest-style dev output
export { nestWinstonUtilities };
