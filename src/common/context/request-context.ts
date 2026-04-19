import { AsyncLocalStorage } from 'async_hooks';

export interface RequestContextStore {
  reqId: string;
  userId?: string;
  adminId?: string;
}

export const requestContext = new AsyncLocalStorage<RequestContextStore>();

/**
 * Convenience helper: returns the current reqId (if any).
 */
export function getCurrentRequestId(): string | undefined {
  return requestContext.getStore()?.reqId;
}
