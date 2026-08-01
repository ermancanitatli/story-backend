/**
 * Backend ↔ iOS paylaşılan hata kodları.
 * Sözleşme kaynağı: docs/API_ERROR_CODES.md
 */
export const ErrorCodes = {
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  USER_BANNED: 'USER_BANNED',
  USER_DELETED: 'USER_DELETED',
  PANEL_FORBIDDEN: 'PANEL_FORBIDDEN',
  PANEL_SESSION_EXPIRED: 'PANEL_SESSION_EXPIRED',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  /**
   * Endpoint kalıcı olarak kaldırıldı (410 Gone).
   * İstemci retry etmemeli, özelliği UI'dan kaldırmalı.
   * Örn: singleplayer /api/story-sessions/* — ürün multiplayer-only'ye geçti.
   */
  ENDPOINT_REMOVED: 'ENDPOINT_REMOVED',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/**
 * HTTP status → default ErrorCode mapper.
 * Response body içinde explicit `code` verilmemişse fallback olarak kullanılır.
 */
export function defaultCodeForStatus(status: number): ErrorCode {
  if (status === 400) return ErrorCodes.VALIDATION_ERROR;
  if (status === 401) return ErrorCodes.AUTH_INVALID_CREDENTIALS;
  if (status === 403) return ErrorCodes.PANEL_FORBIDDEN;
  if (status === 404) return ErrorCodes.NOT_FOUND;
  // 410 → USER_DELETED de kullanır ama o yol code'u explicit veriyor;
  // explicit code yoksa kaldırılmış endpoint anlamına gelir.
  if (status === 410) return ErrorCodes.ENDPOINT_REMOVED;
  if (status === 429) return ErrorCodes.RATE_LIMITED;
  if (status >= 500) return ErrorCodes.INTERNAL_ERROR;
  return ErrorCodes.INTERNAL_ERROR;
}
