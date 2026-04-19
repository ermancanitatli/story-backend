# S3 CORS Setup — Admin Panel Uploads

Admin panel, hikaye görsellerini doğrudan tarayıcıdan AWS S3'e yükler (presigned PUT URL). Bucket CORS policy'si bu origin'leri kabul etmelidir.

## Bucket
- **Name:** `xting-story-assets`
- **Region:** `eu-central-1`

## CORS JSON

Dosya: `s3-cors-admin.json`

## Uygulama

### AWS Console
1. S3 > `xting-story-assets` bucket > Permissions > Cross-origin resource sharing (CORS).
2. `s3-cors-admin.json` içeriğini yapıştır.
3. Kaydet.

### AWS CLI
```bash
aws s3api put-bucket-cors \
  --bucket xting-story-assets \
  --cors-configuration file://story-backend/docs/s3-cors-admin.json
```

## Doğrulama
```bash
curl -X OPTIONS https://xting-story-assets.s3.eu-central-1.amazonaws.com/test.jpg \
  -H "Origin: https://api.xtingmobile.com" \
  -H "Access-Control-Request-Method: PUT" \
  -H "Access-Control-Request-Headers: Content-Type" \
  -I
```

Yanıtta `Access-Control-Allow-Origin: https://api.xtingmobile.com` header'ı olmalı.

## İleride
- Prod domain değişirse `AllowedOrigins`'a ekle.
- Origin wildcard (`*`) kullanılmamalı — sadece trusted origins.
