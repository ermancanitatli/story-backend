import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { requestContext } from '../context/request-context';

declare module 'express-serve-static-core' {
  interface Request {
    id?: string;
  }
}

/**
 * Functional middleware that:
 *  - assigns a unique request id (honoring incoming `X-Request-Id` header if present),
 *  - exposes it back on the response as `X-Request-Id`,
 *  - runs the remainder of the request pipeline inside an AsyncLocalStorage scope
 *    so logs/services can read `reqId` without explicit plumbing.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers['x-request-id'];
  const reqId =
    (Array.isArray(incoming) ? incoming[0] : incoming) && String(incoming).trim().length > 0
      ? String(incoming).trim()
      : uuidv4();

  req.id = reqId;
  res.setHeader('X-Request-Id', reqId);

  requestContext.run({ reqId }, () => next());
}
