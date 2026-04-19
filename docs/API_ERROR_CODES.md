# API Error Codes

Backend ve iOS istemci arasında paylaşılan hata kodları. Bu doküman sözleşme kaynağıdır — ikisi de buradan beslenir.

## Response Body Şeması

Tüm hata yanıtları şu JSON zarfını kullanır:

```json
{
  "statusCode": 403,
  "code": "USER_BANNED",
  "message": "Hesabınız askıya alındı.",
  "requestId": "uuid-v4",
  "bannedUntil": "2026-05-01T00:00:00Z"
}
```

- `statusCode` HTTP durumu (integer).
- `code` stable string kimlik (aşağıdaki tabloda).
- `message` son kullanıcıya gösterilebilecek açıklama (locale backend tarafından belirlenir).
- `requestId` CC-01 tarafından eklenen korelasyon kimliği (opsiyonel ama best-effort).
- Diğer alanlar code'a özgü meta (ör. `bannedUntil`).

## Hata Kodları Tablosu

| Code | HTTP | Anlam | Ek Alanlar | Kullanıldığı Yer |
|------|------|-------|------------|------------------|
| `USER_BANNED` | 403 | Kullanıcı admin tarafından banlı | `bannedUntil?: ISO8601` | JwtAuthGuard, AnonymousLogin, Socket handshake |
| `USER_DELETED` | 410 | Kullanıcı hesabı silinmiş | — | JwtAuthGuard, AnonymousLogin, Socket handshake |
| `AUTH_INVALID_CREDENTIALS` | 401 | Login başarısız | — | POST /panel/login |
| `PANEL_FORBIDDEN` | 403 | Panel kaynağına erişim yok | — | SessionAuthGuard, SuperadminGuard |
| `PANEL_SESSION_EXPIRED` | 401 | Panel oturumu bitti | — | SessionAuthGuard |
| `RATE_LIMITED` | 429 | İstek hızı sınırı aşıldı | `retryAfter: seconds` | Login, broadcast notification |

## iOS Tarafı Sözleşmesi

iOS istemci (`APIClient.swift`) response body'deki `code` alanını parse eder ve şu `APIError` case'lerine map'ler:

- `USER_BANNED` → `APIError.accountTerminated(.banned, bannedUntil: Date?)`
- `USER_DELETED` → `APIError.accountTerminated(.deleted, nil)`
- Diğer 4xx/5xx → `APIError.requestFailed(statusCode, code?, message?)`

## Socket Event Sözleşmesi

Gateway `handleConnection` sırasında veya admin action sonrası:

```json
{
  "event": "auth:rejected",
  "payload": { "code": "USER_BANNED", "reason": "admin_action" }
}
```

Client `auth:rejected` aldığında `AuthManager.forceTerminate` çağırır.

## Yeni Kod Ekleme

Yeni bir hata kodu eklemeden önce:
1. Bu tabloya satır ekle (code, HTTP, anlam, alanlar).
2. Backend'de `src/common/filters/error-codes.ts` (CC-02) enum'ına ekle.
3. iOS'ta `APIError` switch'ine case ekle.
4. `USER_BANNED` gibi mevcut kodlar ile çakışma olmadığından emin ol.
