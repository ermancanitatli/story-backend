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

  // --- Kredi ekonomisi / entitlement (402/403/409) ---
  /**
   * Bakiye yetersiz (402). `details.required` ve `details.balance` döner.
   * İstemci paywall / kredi satın alma ekranını açmalı.
   */
  INSUFFICIENT_CREDITS: 'INSUFFICIENT_CREDITS',
  /**
   * Hikaye ücretli ve kullanıcı henüz açmamış (403).
   * `details.storyId`, `details.creditCost` döner.
   * İstemci POST /api/stories/:id/unlock akışına yönlendirmeli.
   */
  STORY_LOCKED: 'STORY_LOCKED',
  /**
   * Matchmaking havuzunda iki oyuncunun da erişebildiği hikaye yok (409).
   * Ürün kararı: ödeyemeyeceği hikayeyle eşleştirmektense eşleştirme yapılmaz.
   */
  NO_ACCESSIBLE_STORIES: 'NO_ACCESSIBLE_STORIES',
  /**
   * POST /api/credits/spend — `reason` sunucu allowlist'inde değil (400).
   * Fiyat sunucuda belirlenir; istemcinin `amount` göndermesi anlamsızdır.
   */
  INVALID_SPEND_REASON: 'INVALID_SPEND_REASON',
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
  if (status === 402) return ErrorCodes.INSUFFICIENT_CREDITS;
  // 410 → USER_DELETED de kullanır ama o yol code'u explicit veriyor;
  // explicit code yoksa kaldırılmış endpoint anlamına gelir.
  if (status === 410) return ErrorCodes.ENDPOINT_REMOVED;
  if (status === 429) return ErrorCodes.RATE_LIMITED;
  if (status >= 500) return ErrorCodes.INTERNAL_ERROR;
  return ErrorCodes.INTERNAL_ERROR;
}
