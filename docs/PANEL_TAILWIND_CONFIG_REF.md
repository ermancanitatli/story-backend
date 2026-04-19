# Panel Tailwind Config Reference (Metronic SaaS Landing)

> Kaynak: `ornek-template-metronic/metronic-948/metronic-948/metronic-tailwind-nextjs-landings/saas/`
>
> **Bu config doğrudan uygulanmaz.** Panel (`story-backend/views/panel`) base stylesheet'i `public/panel-assets/css/styles.css` — KTUI (Metronic HTML Demos) precompiled build'i üzerine kurulu. Bu nedenle Tailwind config dosyası çalışma zamanında etkisizdir. Aşağıdaki tablolar **referans**tır: panel'e yeni bir marketing/landing sayfası eklediğimizde ihtiyacımız olan token ve utility'leri tek elden görmek için saklıyoruz. Gerekirse `landing-extras.css`'e yeni custom utility olarak elle eklenir.

## Tailwind sürümü ve yaklaşım

Landing template **Tailwind v4** kullanıyor (`tailwindcss: ^4.1.17`, `@tailwindcss/postcss: ^4.1.8`). v4 ile birlikte klasik `tailwind.config.ts` dosyası artık **yok** — tema ve tokenlar `styles/globals.css` içinde `@theme inline { ... }` bloğu ile tanımlanıyor.

- Config dosyası: **yok**
- PostCSS: `@tailwindcss/postcss` eklentisi yeterli
- `postcss.config.mjs` sadece bu eklentiyi yükler

## Custom Color Tokens (oklch)

`:root` ve `.dark` altında tanımlı CSS değişkenleri (`@theme inline` bloğu bunları `--color-*` Tailwind utility'lerine bağlar):

| Token | Light (oklch) | Dark (oklch) | Tailwind utility |
|-------|---------------|--------------|------------------|
| background | `1 0 0` | `0.145 0 0` | `bg-background` |
| foreground | `0.145 0 0` | `0.985 0 0` | `text-foreground` |
| card | `1 0 0` | `0.205 0 0` | `bg-card` |
| popover | `1 0 0` | `0.205 0 0` | `bg-popover` |
| primary | `0.205 0 0` | `0.922 0 0` | `bg-primary` |
| secondary | `0.97 0 0` | `0.269 0 0` | `bg-secondary` |
| muted | `0.97 0 0` | `0.269 0 0` | `bg-muted` |
| accent | `0.97 0 0` | `0.269 0 0` | `bg-accent` |
| destructive | `0.577 0.245 27.325` | `0.704 0.191 22.216` | `bg-destructive` |
| border | `0.922 0 0` | `1 0 0 / 10%` | `border-border` |
| input | `0.922 0 0` | `1 0 0 / 15%` | `border-input` |
| ring | `92% 0.004 286.32` | `0.556 0 0` | `ring-ring` |
| chart-1..5 | 5 farklı | 5 farklı | `fill-chart-1` vb. |
| sidebar, sidebar-* | 7 token | 7 token | `bg-sidebar`, `text-sidebar-foreground`, vb. |
| color-1..5 | rainbow gradient | aynı | `rainbow-button` efekti için |

## Radius Tokens

```
--radius:    0.625rem
--radius-xl: calc(var(--radius) + 4px)
--radius-lg: var(--radius)
--radius-md: calc(var(--radius) - 2px)
--radius-sm: calc(var(--radius) - 4px)
```

Tailwind utility'leri: `rounded-sm`, `rounded-md`, `rounded-lg`, `rounded-xl`.

## Fonts

Özel font yok; `body` için `font-family: Arial, Helvetica, sans-serif;` fallback zinciri kullanılıyor. Marketing sayfası yaparken Inter / Geist eklemek gerekebilir (Next.js `next/font` ile) — KTUI zaten kendi font'unu yüklüyor (`Inter`), landing-extras dahil edilmezse panel font'u kullanılır.

## Animations / Keyframes

`@theme inline` bloğu içinde `--animate-*` tokenları tanımlı. Hepsi `landing-extras.css`'e kopyalandı:

| Utility adı | Keyframe | Süre | Açıklama |
|-------------|----------|------|----------|
| `animate-accordion-down/up` | accordion-down/up | 0.2s | Radix Accordion |
| `animate-collapsible-down/up` | collapsible-down/up | 0.2s | Radix Collapsible |
| `animate-caret-blink` | caret-blink | 1.25s | OTP/input cursor |
| `animate-marquee` | marquee | `var(--duration)` | Brands kaydırma |
| `animate-marquee-vertical` | marquee-vertical | `var(--duration)` | Testimonial kolonları |
| `animate-border-move` | border-move | 5s | Gradient border loop |
| `animate-border-beam` | border-beam | `var(--duration)` | Magic UI border beam |
| `animate-rainbow` | rainbow | `var(--duration)` | Rainbow button |
| `animate-aurora` | aurora | `var(--duration)` | Hero aurora background |

## Tailwind Plugin'leri

- `tw-animate-css` (dependency olarak) — eski `tailwindcss-animate` plugin'inin v4 adaptasyonu. Panel'e eklenecekse `@import "tw-animate-css";` satırı yeterli.
- `tailwind-merge` + `clsx` — yardımcı: `lib/utils.ts` içindeki `cn()` helper.

## Dark mode

- Varyant: `@custom-variant dark (&:is(.dark *));` — KTUI'nin kendi dark mode mantığı (`<html class="dark">`) ile **uyumludur**. Her iki tema aynı class toggle ile çalışır.

## Panel'e uygulama notları

1. **Şu an için HİÇBİR ŞEY aksiyon almaz.** Panel `styles.css` precompiled olduğu için Tailwind config çalışmaz.
2. İleride marketing sayfası yapacaksak seçenekler:
   - **(A) Standalone public/landing/ HTML:** `landing-extras.css` ile token'ları ve animasyonları include et, sonra sadece Tailwind-style class'ları Tailwind'in play CDN'i ile derle. KTUI yüklenmesin.
   - **(B) Panel altında iframe/ayrı sayfa:** Landing'i bağımsız Next.js olarak deploy et, Coolify'a yeni bir servis olarak ekle.
3. Yeni bir utility gerekirse `landing-extras.css`'e elle yaz — production'da `:where()` ile kapsülle ki KTUI override etmesin.
