# Runbook: SESSION_SECRET Rotasyonu

`SESSION_SECRET` değiştirince tüm aktif session'lar invalide olur — admin'ler tekrar login olmak zorunda kalır.

## Öncesi
- [ ] Tüm admin'lere haber ver (Slack/email): "T+X'te panel'e yeniden login gerekecek".
- [ ] Bakım penceresi seç (trafik düşük saat).

## Adımlar

### 1. Yeni secret üret
```bash
openssl rand -hex 64
# Örnek: a3f9b2c1...
```

### 2. Coolify env güncelle
```bash
curl -s -X PATCH \
  -H "Authorization: Bearer $COOLIFY_TOKEN" \
  -H "Content-Type: application/json" \
  "http://91.98.177.117:8000/api/v1/applications/dcg0g8wos80kcoos84c808sc/envs/SESSION_SECRET" \
  -d '{"value":"YENI_SECRET","is_preview":false}'
```

### 3. Redeploy tetikle
```bash
curl -s -X POST \
  -H "Authorization: Bearer $COOLIFY_TOKEN" \
  "http://91.98.177.117:8000/api/v1/deploy?uuid=dcg0g8wos80kcoos84c808sc"
```

### 4. Doğrulama
- [ ] `/api/health` 200 dönüyor.
- [ ] Yeni login başarılı.
- [ ] Mevcut cookie ile `/panel` erişmek 401 veya login redirect.

## Dual-Secret Pattern (İleride)
Şu anda tek secret var. Rollout sırasında hiç session drop'u istemezsen `express-session`'ın `secret: [newSecret, oldSecret]` array desteğini kullan:
- Fase 1: `[new, old]` — yeni session'lar `new` ile imzalanır, eski cookie'ler `old` ile valide edilir.
- Fase 2 (24h sonra): `[new]` — old secret tamamen çıkar.

## Acil Durum
Eğer yeni secret'e geçtikten sonra bir şey kırılırsa:
- Coolify'da eski değere geri dön + redeploy.
- Session kayıpları geri gelmez — admin'ler tekrar login olacak.
