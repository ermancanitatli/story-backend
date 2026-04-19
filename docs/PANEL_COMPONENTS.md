# Panel UI Components (Metronic demo1)

Tüm component'lerin birebir markup pattern'leri. Yeni sayfa eklerken buradan kopyala-yapıştır.

**Kaynak:** `ornek-template-metronic/metronic-948/metronic-948/metronic-tailwind-html-demos/dist/html/demo1/`
**Stil bundle:** KTUI (`assets/vendors/ktui/ktui.min.js` + `assets/css/styles.css`)
**Icon font:** Keenicons (`<i class="ki-filled ki-<name>"></i>` veya `ki-outline`)
**Class konvansiyonu:** `kt-*` prefix + Tailwind utility'ler. RTL için `rtl:` varyantı, dark mode için `dark:` varyantı kullanılır.

> Hızlı arama: Ctrl+F ile başlık (ör. "## Modal") bul, altındaki HTML'yi olduğu gibi kopyala. Her örnek gerçek demo1 markup'ından bire bir alındı.

---

## İçindekiler

1. [Button](#button)
2. [Input](#input)
3. [Select](#select)
4. [Textarea](#textarea)
5. [Checkbox](#checkbox)
6. [Radio](#radio)
7. [Switch](#switch)
8. [Form Label / Form Group](#form-label--form-group)
9. [Card](#card)
10. [Table / DataTable](#table--datatable)
11. [Pagination (datatable footer)](#pagination-datatable-footer)
12. [Modal](#modal)
13. [Dropdown / Menu](#dropdown--menu)
14. [Tabs](#tabs)
15. [Badge](#badge)
16. [Alert / Notice](#alert--notice)
17. [Progress Bar](#progress-bar)
18. [Avatar](#avatar)
19. [Tooltip](#tooltip)
20. [Accordion](#accordion)
21. [Link](#link)
22. [Sidebar](#sidebar)
23. [Sidebar Menu Item (single / accordion / child)](#sidebar-menu-item-single--accordion--child)
24. [Header / Topbar](#header--topbar)
25. [Page Header (toolbar)](#page-header-toolbar)
26. [Mega Menu](#mega-menu)
27. [Breadcrumb (ad-hoc)](#breadcrumb-ad-hoc)
28. [Stepper (ad-hoc)](#stepper-ad-hoc)
29. [Layout Wrapper / Container](#layout-wrapper--container)
30. [Toggle Password Input](#toggle-password-input)
31. [Theme Mode Bootstrap Script](#theme-mode-bootstrap-script)
32. [Auth Card (sign-in / sign-up)](#auth-card-sign-in--sign-up)

---

## Button

### Primary
```html
<button class="kt-btn kt-btn-primary">Kaydet</button>
```

### Primary — submit (full width, form sonu)
```html
<button class="kt-btn kt-btn-primary flex justify-center grow">
  Sign In
</button>
```

### Outline (secondary/white)
```html
<a class="kt-btn kt-btn-outline" href="#">Public Profile</a>
```

### Outline primary (filter, ikon solda)
```html
<button class="kt-btn kt-btn-outline kt-btn-primary">
  <i class="ki-filled ki-setting-4"></i>
  Filters
</button>
```

### Ghost (arkaplansız, hover'da belirir)
```html
<button class="kt-btn kt-btn-ghost">Ghost</button>
```

### Icon only (ghost + küçük + dairesel)
```html
<button class="group kt-btn kt-btn-ghost kt-btn-icon size-9 rounded-full hover:bg-primary/10 hover:[&_i]:text-primary" data-kt-modal-toggle="#search_modal">
  <i class="ki-filled ki-magnifier"></i>
</button>
```

### Icon only — dim (modal header close)
```html
<button class="kt-btn kt-btn-sm kt-btn-icon kt-btn-dim shrink-0" data-kt-modal-dismiss="true">
  <i class="ki-filled ki-cross"></i>
</button>
```

### Sosyal provider buton (Google/Apple)
```html
<a class="kt-btn kt-btn-outline justify-center" href="#">
  <img alt="" class="size-3.5 shrink-0" src="assets/media/brand-logos/google.svg"/>
  Use Google
</a>
```

### Küçük boyut
```html
<button class="kt-btn kt-btn-sm kt-btn-primary">Small</button>
```

### Varyant modifier'ları
- `kt-btn-primary` · `kt-btn-outline` · `kt-btn-ghost` · `kt-btn-dim`
- Boyut: `kt-btn-sm`
- Form faktörü: `kt-btn-icon`
- Ek Tailwind ile compose: `justify-center`, `w-full`, `shrink-0`, `grow`

---

## Input

### Düz text input
```html
<input class="kt-input" placeholder="email@email.com" type="text" value=""/>
```

### Input group (label wrapper + trailing icon button)
`kt-input` hem `<input>` hem `<label>`/`<div>` üzerinde kullanılabilir: wrapper olunca içindeki bare `<input>` ve action button'u sarar.

```html
<label class="kt-input">
  <input type="text" value="https://metronic.com/profiles/x7g2vA3kZ5">
  <button class="kt-btn kt-btn-icon kt-btn-sm kt-btn-ghost -me-2">
    <i class="ki-filled ki-copy"></i>
  </button>
</label>
```

### Ghost input (modal search)
```html
<input class="kt-input kt-input-ghost" name="query" placeholder="Tap to start search" type="text" value=""/>
```

---

## Select

Native `<select>` üstüne `kt-select` + `data-kt-select="true"` bindiriliyor. KTUI JS bunu custom dropdown'a çeviriyor.

### Basic select
```html
<select class="kt-select w-36" data-kt-select="true" data-kt-select-placeholder="Select a status">
  <option value="1">Active</option>
  <option value="2">Disabled</option>
  <option value="2">Pending</option>
</select>
```

### Compact (tablo içi)
```html
<select class="kt-select max-w-24" data-kt-select="true">
  <option selected>Owner</option>
  <option>Editor</option>
  <option>Viewer</option>
</select>
```

---

## Textarea

Textarea için ayrı class yok; `kt-input` uygulanır + min-height veya rows.

```html
<textarea class="kt-input min-h-[200px]" id="settings-bio-editor" placeholder="Write a short bio..." rows="6"></textarea>
```

---

## Checkbox

### Inline label + checkbox
```html
<label class="kt-label">
  <input class="kt-checkbox kt-checkbox-sm" name="check" type="checkbox" value="1"/>
  <span class="kt-checkbox-label">Remember me</span>
</label>
```

### Checkbox group (ToS)
```html
<label class="kt-checkbox-group">
  <input class="kt-checkbox kt-checkbox-sm" name="check" type="checkbox" value="1"/>
  <span class="kt-checkbox-label">
    I accept <a class="text-sm link" href="#">Terms & Conditions</a>
  </span>
</label>
```

### Table row / header checkbox (standalone)
```html
<input class="kt-checkbox kt-checkbox-sm" data-kt-datatable-check="true" type="checkbox"/>
<!-- satır için: -->
<input class="kt-checkbox kt-checkbox-sm" data-kt-datatable-row-check="true" type="checkbox" value="1"/>
```

---

## Radio

### Standard radio (option seçimi)
```html
<label class="kt-form-label flex items-center gap-2.5">
  <input checked class="kt-radio radio-sm" name="report-option" type="radio" value="1"/>
  <div class="flex flex-col gap-0.5">
    <div class="text-sm font-semibold text-mono">Impersonation</div>
    <div class="text-sm font-medium text-secondary-foreground">
      It looks like this profile might be impersonating someone else
    </div>
  </div>
</label>
```

---

## Switch

### Standard
```html
<input class="kt-switch" type="checkbox" value="1"/>
```

### Küçük (tablo içi)
```html
<input checked class="kt-switch kt-switch-sm" name="check" type="checkbox" value="1"/>
```

### Theme toggle (dark mode switch)
```html
<input class="kt-switch" data-kt-theme-switch-state="dark" data-kt-theme-switch-toggle="true" name="check" type="checkbox" value="1"/>
```

---

## Form Label / Form Group

Form grup bir `flex flex-col gap-1` div'dir, içinde `kt-form-label` ve input yer alır.

```html
<div class="flex flex-col gap-1">
  <label class="kt-form-label font-normal text-mono">Email</label>
  <input class="kt-input" placeholder="email@email.com" type="text" value=""/>
</div>
```

### Label + yan aksiyon (ör. "Forgot password")
```html
<div class="flex flex-col gap-1">
  <div class="flex items-center justify-between gap-1">
    <label class="kt-form-label font-normal text-mono">Password</label>
    <a class="text-sm kt-link shrink-0" href="#">Forgot Password?</a>
  </div>
  <input class="kt-input" type="password"/>
</div>
```

### Yatay form (label solda, input sağda)
```html
<div class="flex items-baseline flex-wrap lg:flex-nowrap gap-2.5">
  <label class="kt-form-label max-w-56">Display name</label>
  <input class="kt-input" type="text" />
</div>
```

---

## Card

### Standart (header + content + footer)
```html
<div class="kt-card">
  <div class="kt-card-header">
    <h3 class="kt-card-title">Başlık</h3>
  </div>
  <div class="kt-card-content">
    ...
  </div>
  <div class="kt-card-footer">
    ...
  </div>
</div>
```

### Card header + sağda action
```html
<div class="kt-card-header" id="basic_settings">
  <h3 class="kt-card-title">General Settings</h3>
  <div class="flex items-center gap-2">
    <label class="kt-label">
      Public Profile
      <input checked class="kt-switch kt-switch-sm" name="check" type="checkbox" value="1"/>
    </label>
  </div>
</div>
```

### Card header + filter bar (select + buton)
```html
<div class="kt-card-header">
  <h3 class="kt-card-title">Users</h3>
  <div class="flex items-center gap-2.5">
    <select class="kt-select w-36" data-kt-select="true" data-kt-select-placeholder="Select a status">
      <option value="1">Active</option>
      <option value="2">Disabled</option>
    </select>
    <button class="kt-btn kt-btn-outline kt-btn-primary">
      <i class="ki-filled ki-setting-4"></i>
      Filters
    </button>
  </div>
</div>
```

### Card footer (datatable)
```html
<div class="kt-card-footer justify-center md:justify-between flex-col md:flex-row gap-5 text-secondary-foreground text-sm font-medium">
  ...
</div>
```

### "Padded content" variant
```html
<div class="kt-card-content py-3">...</div>
```

---

## Table / DataTable

KTUI datatable `data-kt-datatable` attribute'u + `kt-table` class'ıyla aktive edilir. Sayfalama, sıralama, satır seçimi hepsi JS ile yönetilir.

### Tam iskelet
```html
<div class="kt-card">
  <div class="kt-card-header">
    <h3 class="kt-card-title">Subscribers</h3>
  </div>
  <div class="kt-card-content">
    <div class="grid" data-kt-datatable="true" data-kt-datatable-page-size="10">
      <div class="kt-scrollable-x-auto">
        <table class="kt-table table-auto kt-table-border" data-kt-datatable-table="true">
          <thead>
            <tr>
              <th class="w-[60px] text-center">
                <input class="kt-checkbox kt-checkbox-sm" data-kt-datatable-check="true" type="checkbox"/>
              </th>
              <th class="min-w-[300px]">
                <span class="kt-table-col">
                  <span class="kt-table-col-label">Subscriber</span>
                  <span class="kt-table-col-sort"></span>
                </span>
              </th>
              <th class="min-w-[200px]">
                <span class="kt-table-col">
                  <span class="kt-table-col-label">Products</span>
                  <span class="kt-table-col-sort"></span>
                </span>
              </th>
              <th class="w-28 text-center">
                <span class="kt-table-col">
                  <span class="kt-table-col-label">Invoices</span>
                  <span class="kt-table-col-sort"></span>
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="text-center">
                <input class="kt-checkbox kt-checkbox-sm" data-kt-datatable-row-check="true" type="checkbox" value="1"/>
              </td>
              <td>
                <div class="flex items-center gap-2.5">
                  <img alt="" class="rounded-full size-7 shrink-0" src="assets/media/avatars/300-3.png"/>
                  <div class="flex flex-col">
                    <a class="text-sm font-medium text-mono hover:text-primary mb-px" href="#">Tyler Hero</a>
                    <a class="text-sm text-secondary-foreground font-normal hover:text-primary" href="#">tyler.hero@gmail.com</a>
                  </div>
                </div>
              </td>
              <td>
                <div class="flex flex-wrap gap-1.5">
                  <span class="kt-badge kt-badge-outline">NFT</span>
                  <span class="kt-badge kt-badge-outline">Artwork</span>
                </div>
              </td>
              <td>
                <div class="flex justify-center">
                  <a class="kt-link kt-link-underlined kt-link-dashed" href="">Download</a>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <!-- footer/pagination: aşağıdaki Pagination bölümüne bak -->
    </div>
  </div>
</div>
```

### Önemli data-attribute'lar
| Attribute | Yer |
|-----------|-----|
| `data-kt-datatable="true"` | root wrapper |
| `data-kt-datatable-page-size="10"` | root wrapper (başlangıç sayfa boyu) |
| `data-kt-datatable-table="true"` | `<table>` |
| `data-kt-datatable-check="true"` | header checkbox (tümünü seç) |
| `data-kt-datatable-row-check="true"` | satır checkbox |
| `data-kt-datatable-size="true"` | "per page" select |
| `data-kt-datatable-info="true"` | "X of Y" info span |
| `data-kt-datatable-pagination="true"` | pagination container |

### İç hücre pattern'leri (yaygın)
```html
<!-- badges grubu -->
<td>
  <div class="flex flex-wrap gap-1.5">
    <span class="kt-badge kt-badge-outline">Design</span>
    <span class="kt-badge kt-badge-outline">Template</span>
  </div>
</td>

<!-- iki satırlı metin -->
<td>
  <div class="flex flex-col">
    <span class="text-sm text-foreground font-medium">Premium</span>
    <span class="text-xs text-secondary-foreground">4 months left</span>
  </div>
</td>

<!-- avatar + isim + email -->
<td>
  <div class="flex items-center gap-2.5">
    <img alt="" class="rounded-full size-7 shrink-0" src="..."/>
    <div class="flex flex-col">
      <a class="text-sm font-medium text-mono hover:text-primary" href="#">Tyler Hero</a>
      <a class="text-sm text-secondary-foreground font-normal hover:text-primary" href="#">tyler.hero@gmail.com</a>
    </div>
  </div>
</td>

<!-- inline switch -->
<td>
  <input checked class="kt-switch kt-switch-sm" name="check" type="checkbox" value="1"/>
</td>

<!-- dashed underline link -->
<td>
  <div class="flex justify-center">
    <a class="kt-link kt-link-underlined kt-link-dashed" href="">Download</a>
  </div>
</td>
```

---

## Pagination (datatable footer)

```html
<div class="kt-card-footer justify-center md:justify-between flex-col md:flex-row gap-5 text-secondary-foreground text-sm font-medium">
  <div class="flex items-center gap-2 order-2 md:order-1">
    Show
    <select class="kt-select w-16" data-kt-datatable-size="true" data-kt-select="" name="perpage"></select>
    per page
  </div>
  <div class="flex items-center gap-4 order-1 md:order-2">
    <span data-kt-datatable-info="true"></span>
    <div class="kt-datatable-pagination" data-kt-datatable-pagination="true"></div>
  </div>
</div>
```

KTUI JS, `<select>` ve pagination div'ini otomatik dolduruyor.

---

## Modal

### Basit confirm modal (header + body + footer aksiyonlar)
```html
<div class="kt-modal" data-kt-modal="true" id="report_user_modal">
  <div class="kt-modal-content max-w-[500px] top-[15%]">
    <div class="kt-modal-header">
      <h3 class="kt-modal-title">Report User</h3>
      <button class="kt-btn kt-btn-sm kt-btn-icon kt-btn-ghost shrink-0" data-kt-modal-dismiss="true">
        <i class="ki-filled ki-cross"></i>
      </button>
    </div>
    <div class="kt-modal-body p-0">
      <div class="p-5">
        <!-- içerik -->
      </div>
      <div class="border-b border-b-border"></div>
      <div class="flex items-center gap-2.5 justify-end p-5">
        <button class="kt-btn kt-btn-primary">Report this person</button>
        <button class="kt-btn kt-btn-outline" data-kt-modal-dismiss="true">Cancel</button>
      </div>
    </div>
  </div>
</div>
```

### Trigger (modal'ı açan buton)
```html
<button class="kt-btn kt-btn-primary" data-kt-modal-toggle="#report_user_modal">Report</button>
```

### Search modal (özel: top offset + küçük header + ghost input)
```html
<div class="kt-modal" data-kt-modal="true" id="search_modal">
  <div class="kt-modal-content max-w-[600px] top-[15%]">
    <div class="kt-modal-header py-4 px-5">
      <i class="ki-filled ki-magnifier text-muted-foreground text-xl"></i>
      <input class="kt-input kt-input-ghost" name="query" placeholder="Tap to start search" type="text"/>
      <button class="kt-btn kt-btn-sm kt-btn-icon kt-btn-dim shrink-0" data-kt-modal-dismiss="true">
        <i class="ki-filled ki-cross"></i>
      </button>
    </div>
    <div class="kt-modal-body p-0 pb-5">
      <!-- tabs + list -->
    </div>
  </div>
</div>
```

### Önemli attribute'lar
- `data-kt-modal="true"` — root
- `id="<modal_id>"` — target
- `data-kt-modal-toggle="#<modal_id>"` — açma trigger'ı
- `data-kt-modal-dismiss="true"` — kapatma butonu

---

## Dropdown / Menu

KTUI'de dropdown'lar `kt-menu` sistemiyle birlikte yaşar. Hem sidebar hem topbar hem ad-hoc action menüleri için aynı pattern.

### Ad-hoc action dropdown (üç-nokta / setting ikonu)
```html
<div class="kt-menu -mt-px" data-kt-menu="true">
  <div class="kt-menu-item"
       data-kt-menu-item-offset="0, 10px"
       data-kt-menu-item-placement="bottom-end"
       data-kt-menu-item-placement-rtl="bottom-start"
       data-kt-menu-item-toggle="dropdown"
       data-kt-menu-item-trigger="click">
    <button class="kt-menu-toggle kt-btn kt-btn-icon kt-btn-ghost">
      <i class="ki-filled ki-setting-2"></i>
    </button>
    <div class="kt-menu-dropdown kt-menu-default w-full max-w-[175px]" data-kt-menu-dismiss="true">
      <div class="kt-menu-item">
        <a class="kt-menu-link" href="#">
          <span class="kt-menu-icon"><i class="ki-filled ki-document"></i></span>
          <span class="kt-menu-title">View</span>
        </a>
      </div>
      <!-- nested submenu -->
      <div class="kt-menu-item"
           data-kt-menu-item-offset="-15px, 0"
           data-kt-menu-item-placement="right-start"
           data-kt-menu-item-toggle="dropdown"
           data-kt-menu-item-trigger="click|lg:hover">
        <div class="kt-menu-link">
          <span class="kt-menu-icon"><i class="ki-filled ki-notification-status"></i></span>
          <span class="kt-menu-title">Export</span>
          <span class="kt-menu-arrow"><i class="ki-filled ki-right text-xs rtl:rotate-180"></i></span>
        </div>
        <div class="kt-menu-dropdown kt-menu-default w-full max-w-[175px]">
          <div class="kt-menu-item">
            <a class="kt-menu-link" href="#">
              <span class="kt-menu-icon"><i class="ki-filled ki-sms"></i></span>
              <span class="kt-menu-title">Email</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
```

### `data-kt-menu-item-toggle` değerleri
- `dropdown` — açılır menü
- `accordion` — genişle/daralt (sidebar)
- `accordion|lg:dropdown` — responsive karışım (mobilde accordion, desktop'ta dropdown)

### `data-kt-menu-item-trigger` değerleri
- `click` · `hover` · `click|lg:hover`

---

## Tabs

```html
<div class="kt-tabs kt-tabs-line justify-between px-5 mb-2.5" data-kt-tabs="true" id="notifications_tabs">
  <div class="flex items-center gap-5">
    <button class="kt-tab-toggle py-3 active" data-kt-tab-toggle="#notifications_tab_all">All</button>
    <button class="kt-tab-toggle py-3 relative" data-kt-tab-toggle="#notifications_tab_inbox">Inbox</button>
    <button class="kt-tab-toggle py-3" data-kt-tab-toggle="#notifications_tab_team">Team</button>
    <button class="kt-tab-toggle py-3" data-kt-tab-toggle="#notifications_tab_following">Following</button>
  </div>
</div>

<div id="notifications_tab_all">...content all...</div>
<div id="notifications_tab_inbox" class="hidden">...content inbox...</div>
```

### Tab variantları
- `kt-tabs-line` — alt çizgili sekmeler (demo1 default)
- İlk aktif sekme için `<button>`'a `active` class'ı eklenir.

---

## Badge

### Outline (datatable tag'leri için yaygın)
```html
<span class="kt-badge kt-badge-outline">NFT</span>
```

### Semantic renk variantları
```html
<span class="kt-badge kt-badge-sm kt-badge-info kt-badge-outline">Info</span>
<span class="kt-badge kt-badge-sm kt-badge-warning kt-badge-outline">Warning</span>
<span class="kt-badge kt-badge-sm kt-badge-secondary kt-badge-outline">Secondary</span>
<span class="kt-badge kt-badge-sm kt-badge-success kt-badge-outline">Success</span>
<span class="kt-badge kt-badge-sm kt-badge-danger kt-badge-outline">Danger</span>
```

### Muted text badge (tarih/sayaç)
```html
<span class="kt-badge kt-badge-sm text-accent-foreground/60">24</span>
```

### Sidebar menu badge (sayaç)
```html
<span class="kt-menu-badge" data-kt-tooltip="#menu_tooltip_3">5</span>
```

---

## Alert / Notice

Metronic demo1'de ayrı bir `kt-alert` component'i **yok** — uyarı/bilgi satırları ya `kt-card` içinde satır, ya da aşağıdaki ad-hoc pattern ile yazılır.

### Inline info satırı (ikon + metin)
```html
<div class="flex flex-center gap-1.5">
  <i class="ki-filled ki-information-2 text-muted-foreground"></i>
  <div class="text-secondary-foreground font-medium text-xs">
    Anyone with link can edit
  </div>
</div>
```

### Banner card (success/warning için kt-card + renkli border)
```html
<div class="kt-card border-l-4 border-l-success bg-success/5">
  <div class="kt-card-content flex items-center gap-3">
    <i class="ki-filled ki-check-circle text-success text-xl"></i>
    <div class="text-sm">İşlem başarılı.</div>
  </div>
</div>
```

> Renk token'ları: `primary`, `success`, `warning`, `danger`, `info`, `secondary`, `muted-foreground`, `accent-foreground`.

---

## Progress Bar

```html
<div class="kt-progress kt-progress-primary max-w-2xl w-full">
  <div class="kt-progress-indicator" style="width: 47%"></div>
</div>
```

### İnce (h-1.5)
```html
<div class="kt-progress h-1.5 kt-progress-success mb-4 lg:mb-8">
  <div class="kt-progress-indicator" style="width: 100%"></div>
</div>
```

### Color variantları
- `kt-progress-primary` · `kt-progress-success` · `kt-progress-input` (nötr)
- Custom: inline `style="width: 55%"`

---

## Avatar

### Basit image
```html
<img alt="" class="rounded-full size-7 shrink-0" src="assets/media/avatars/300-3.png"/>
```

### Status indicator'lı
```html
<div class="kt-avatar size-8">
  <div class="kt-avatar-image">
    <img alt="" src="assets/media/avatars/300-3.png"/>
  </div>
  <div class="kt-avatar-indicator -end-2 -bottom-2">
    <div class="kt-avatar-status kt-avatar-status-online size-2.5"></div>
  </div>
</div>
```

### Status türleri
- `kt-avatar-status-online` · `kt-avatar-status-offline` · (muhtemelen) `kt-avatar-status-away`

---

## Tooltip

### Trigger'a bağlı
```html
<span class="ms-auto inline-flex items-center" data-kt-tooltip="true" data-kt-tooltip-placement="top">
  <i class="ki-filled ki-information-2 text-base text-muted-foreground"></i>
  <span class="kt-tooltip" data-kt-tooltip-content="true">
    Payment and subscription info
  </span>
</span>
```

### Id referanslı tooltip (sidebar badge için)
```html
<span class="kt-menu-badge" data-kt-tooltip="#menu_tooltip_3">5</span>
<div class="kt-tooltip" id="menu_tooltip_3">Unread messages</div>
```

### `data-kt-tooltip-placement` değerleri
`top` · `bottom` · `left` · `right` · `top-start` · `bottom-end` vb.

---

## Accordion

```html
<div data-kt-accordion="true" data-kt-accordion-expand-all="true">
  <div class="kt-accordion-item not-last:border-b border-b-border" data-kt-accordion-item="true">
    <button aria-controls="faq_1_content" class="kt-accordion-toggle py-4" data-kt-accordion-toggle="#faq_1_content">
      <span class="text-base text-mono">How is pricing determined for each plan?</span>
      <span class="kt-accordion-active:hidden inline-flex">
        <i class="ki-filled ki-plus text-muted-foreground text-sm"></i>
      </span>
      <span class="kt-accordion-active:inline-flex hidden">
        <i class="ki-filled ki-minus text-muted-foreground text-sm"></i>
      </span>
    </button>
    <div class="kt-accordion-content hidden" id="faq_1_content">
      <div class="text-secondary-foreground text-base pb-4">
        Answer metni…
      </div>
    </div>
  </div>
  <!-- daha fazla item… -->
</div>
```

### Flag'ler
- `data-kt-accordion-expand-all="true"` — birden fazla item aynı anda açık kalabilir
- Kaldırılırsa: yalnızca bir item açık kalır (exclusive)

---

## Link

```html
<a class="text-sm link" href="#">Sign up</a>
<a class="text-sm kt-link shrink-0" href="#">Forgot Password?</a>
<a class="kt-link kt-link-underlined kt-link-dashed" href="">Download</a>
<button class="kt-link kt-link-sm kt-link-underlined kt-link-dashed">Change Access</button>
```

---

## Sidebar

Ana sidebar root iskeleti. Body class'ları layout davranışı için kritik.

```html
<body class="antialiased flex h-full text-base text-foreground bg-background demo1 kt-sidebar-fixed kt-header-fixed">

  <div class="kt-sidebar bg-background border-e border-e-border fixed top-0 bottom-0 z-20 hidden lg:flex flex-col items-stretch shrink-0 [--kt-drawer-enable:true] lg:[--kt-drawer-enable:false]"
       data-kt-drawer="true"
       data-kt-drawer-class="kt-drawer kt-drawer-start top-0 bottom-0"
       id="sidebar">

    <div class="kt-sidebar-header hidden lg:flex items-center relative justify-between px-3 lg:px-6 shrink-0" id="sidebar_header">
      <a class="dark:hidden" href="/">
        <img class="default-logo min-h-[22px] max-w-none" src="assets/media/app/default-logo.svg"/>
        <img class="small-logo min-h-[22px] max-w-none" src="assets/media/app/mini-logo.svg"/>
      </a>
      <a class="hidden dark:block" href="/">
        <img class="default-logo min-h-[22px] max-w-none" src="assets/media/app/default-logo-dark.svg"/>
        <img class="small-logo min-h-[22px] max-w-none" src="assets/media/app/mini-logo.svg"/>
      </a>
      <button class="kt-btn kt-btn-outline kt-btn-icon size-[30px] absolute start-full top-2/4 -translate-x-2/4 -translate-y-2/4 rtl:translate-x-2/4"
              data-kt-toggle="body"
              data-kt-toggle-class="kt-sidebar-collapse"
              id="sidebar_toggle">
        <i class="ki-filled ki-black-left-line kt-toggle-active:rotate-180 transition-all duration-300 rtl:rotate-180 rtl:kt-toggle-active:rotate-0"></i>
      </button>
    </div>

    <div class="kt-sidebar-content flex grow shrink-0 py-5 pe-2" id="sidebar_content">
      <div class="kt-scrollable-y-hover grow shrink-0 flex ps-2 lg:ps-5 pe-1 lg:pe-3"
           data-kt-scrollable="true"
           data-kt-scrollable-dependencies="#sidebar_header"
           data-kt-scrollable-height="auto"
           data-kt-scrollable-offset="0px"
           data-kt-scrollable-wrappers="#sidebar_content"
           id="sidebar_scrollable">
        <div class="kt-menu flex flex-col grow gap-1"
             data-kt-menu="true"
             data-kt-menu-accordion-expand-all="false"
             id="sidebar_menu">
          <!-- menu items (aşağıdaki Sidebar Menu Item bölümüne bak) -->
        </div>
      </div>
    </div>
  </div>

  <div class="kt-wrapper flex grow flex-col">
    <!-- header + content -->
  </div>
</body>
```

---

## Sidebar Menu Item (single / accordion / child)

### Single link
```html
<div class="kt-menu-item">
  <a class="kt-menu-link border border-transparent items-center grow kt-menu-item-active:bg-accent/60 dark:menu-item-active:border-border kt-menu-item-active:rounded-lg hover:bg-accent/60 hover:rounded-lg gap-[14px] ps-[10px] pe-[10px] py-[8px]"
     href="/path" tabindex="0">
    <span class="kt-menu-icon items-start text-muted-foreground w-[20px]">
      <i class="ki-filled ki-element-11 text-lg"></i>
    </span>
    <span class="kt-menu-title text-sm font-medium text-foreground kt-menu-item-active:text-primary kt-menu-link-hover:!text-primary">
      Dashboard
    </span>
  </a>
</div>
```

### Accordion group (parent + children)
```html
<div class="kt-menu-item" data-kt-menu-item-toggle="accordion" data-kt-menu-item-trigger="click">
  <div class="kt-menu-link flex items-center grow cursor-pointer border border-transparent gap-[10px] ps-[10px] pe-[10px] py-[6px]" tabindex="0">
    <span class="kt-menu-icon items-start text-muted-foreground w-[20px]">
      <i class="ki-filled ki-profile-circle text-lg"></i>
    </span>
    <span class="kt-menu-title text-sm font-medium text-foreground kt-menu-item-active:text-primary kt-menu-link-hover:!text-primary">
      Public Profile
    </span>
    <span class="kt-menu-arrow text-muted-foreground w-[20px] shrink-0 justify-end ms-1 me-[-10px]">
      <span class="inline-flex kt-menu-item-show:hidden"><i class="ki-filled ki-plus text-[11px]"></i></span>
      <span class="hidden kt-menu-item-show:inline-flex"><i class="ki-filled ki-minus text-[11px]"></i></span>
    </span>
  </div>
  <div class="kt-menu-accordion gap-1 ps-[10px] relative before:absolute before:start-[20px] before:top-0 before:bottom-0 before:border-s before:border-border">
    <!-- child item (bullet + title) -->
    <div class="kt-menu-item">
      <a class="kt-menu-link border border-transparent items-center grow kt-menu-item-active:bg-accent/60 kt-menu-item-active:rounded-lg hover:bg-accent/60 hover:rounded-lg gap-[14px] ps-[10px] pe-[10px] py-[8px]"
         href="/child" tabindex="0">
        <span class="kt-menu-bullet flex w-[6px] -start-[3px] rtl:start-0 relative before:absolute before:top-0 before:size-[6px] before:rounded-full rtl:before:translate-x-1/2 before:-translate-y-1/2 kt-menu-item-active:before:bg-primary kt-menu-item-hover:before:bg-primary"></span>
        <span class="kt-menu-title text-2sm font-normal text-foreground kt-menu-item-active:text-primary kt-menu-item-active:font-semibold kt-menu-link-hover:!text-primary">
          Default
        </span>
      </a>
    </div>
  </div>
</div>
```

### Grup başlığı (heading)
```html
<div class="kt-menu-item pt-2.25 pb-px">
  <span class="kt-menu-heading uppercase text-xs font-medium text-muted-foreground ps-[10px] pe-[10px]">
    User
  </span>
</div>
```

### Active/Hover state class'ları (state variants)
- `kt-menu-item-active:*` — aktif sayfa item'ına uygulanır
- `kt-menu-item-here:*` — "here" (breadcrumb-y) path'teyken
- `kt-menu-item-show:*` — accordion/dropdown açıkken
- `kt-menu-link-hover:*` — hover'da
- `kt-menu-item-hover:*` — bullet renklenme vs.

### "Show N more" collapsible child
```html
<div class="kt-menu-item flex-col-reverse" data-kt-menu-item-toggle="accordion" data-kt-menu-item-trigger="click">
  <div class="kt-menu-link border border-transparent grow cursor-pointer gap-[5px] ps-[10px] pe-[10px] py-[8px]" tabindex="0">
    <span class="kt-menu-bullet flex w-[6px] ..."></span>
    <span class="kt-menu-title text-2sm font-normal text-secondary-foreground">
      <span class="hidden kt-menu-item-show:!flex">Show less</span>
      <span class="flex kt-menu-item-show:hidden">Show 4 more</span>
    </span>
    <span class="kt-menu-arrow ...">
      <span class="inline-flex kt-menu-item-show:hidden"><i class="ki-filled ki-plus text-[11px]"></i></span>
      <span class="hidden kt-menu-item-show:inline-flex"><i class="ki-filled ki-minus text-[11px]"></i></span>
    </span>
  </div>
  <div class="kt-menu-accordion gap-1">
    <!-- ekstra child'lar -->
  </div>
</div>
```

---

## Header / Topbar

```html
<header class="kt-header fixed top-0 z-10 start-0 end-0 flex items-stretch shrink-0 bg-background"
        data-kt-sticky="true"
        data-kt-sticky-class="border-b border-border"
        data-kt-sticky-name="header"
        id="header">
  <div class="kt-container-fixed flex justify-between items-stretch lg:gap-4" id="headerContainer">

    <!-- Mobile Logo + Sidebar drawer toggle -->
    <div class="flex gap-2.5 lg:hidden items-center -ms-1">
      <a class="shrink-0" href="/">
        <img class="max-h-[25px] w-full" src="assets/media/app/mini-logo.svg"/>
      </a>
      <div class="flex items-center">
        <button class="kt-btn kt-btn-icon kt-btn-ghost" data-kt-drawer-toggle="#sidebar">
          <i class="ki-filled ki-menu"></i>
        </button>
      </div>
    </div>

    <!-- Megamenu container (aşağı bakın) -->
    <div class="flex items-stretch" id="megaMenuContainer">...</div>

    <!-- Topbar (sağ taraf: search, notifications, user menu) -->
    <div class="flex items-center gap-2">
      <button class="group kt-btn kt-btn-ghost kt-btn-icon size-9 rounded-full" data-kt-modal-toggle="#search_modal">
        <i class="ki-filled ki-magnifier"></i>
      </button>
      <!-- user avatar dropdown -->
    </div>
  </div>
</header>
```

---

## Page Header (toolbar)

```html
<div class="kt-container-fixed">
  <div class="flex flex-wrap items-center lg:items-end justify-between gap-5 pb-7.5">
    <div class="flex flex-col justify-center gap-2">
      <h1 class="text-xl font-medium leading-none text-mono">Settings - Plain</h1>
      <div class="flex items-center gap-2 text-sm font-normal text-secondary-foreground">
        Clean, Efficient User Experience
      </div>
    </div>
    <div class="flex items-center gap-2.5">
      <a class="kt-btn kt-btn-outline" href="#">Public Profile</a>
      <a class="kt-btn kt-btn-primary" href="#">Get Started</a>
    </div>
  </div>
</div>
```

---

## Mega Menu

Üst navigasyon için dropdown'lı menu. Mobilde drawer, desktop'ta dropdown.

```html
<div class="flex items-stretch [--kt-reparent-mode:prepend] [--kt-reparent-target:body] lg:[--kt-reparent-target:#megaMenuContainer] lg:[--kt-reparent-mode:prepend]" data-kt-reparent="true">
  <div class="hidden lg:flex lg:items-stretch [--kt-drawer-enable:true] lg:[--kt-drawer-enable:false]"
       data-kt-drawer="true"
       data-kt-drawer-class="kt-drawer kt-drawer-start fixed z-10 top-0 bottom-0 w-full me-5 max-w-[250px] p-5 lg:p-0 overflow-auto"
       id="mega_menu_wrapper">
    <div class="kt-menu flex-col lg:flex-row gap-5 lg:gap-7.5" data-kt-menu="true" id="mega_menu">

      <!-- Simple link item -->
      <div class="kt-menu-item active">
        <a class="kt-menu-link text-nowrap text-sm text-foreground font-medium kt-menu-item-hover:text-primary kt-menu-item-active:text-mono kt-menu-item-active:font-medium" href="/">
          <span class="kt-menu-title text-nowrap">Home</span>
        </a>
      </div>

      <!-- Dropdown item -->
      <div class="kt-menu-item"
           data-kt-menu-item-placement="bottom-start"
           data-kt-menu-item-placement-rtl="bottom-end"
           data-kt-menu-item-toggle="accordion|lg:dropdown"
           data-kt-menu-item-trigger="click|lg:hover">
        <div class="kt-menu-link text-sm text-foreground kt-menu-link-hover:text-primary kt-menu-item-show:text-primary">
          <span class="kt-menu-title text-nowrap">Profiles</span>
          <span class="kt-menu-arrow flex lg:hidden">
            <span class="kt-menu-item-show:hidden text-muted-foreground"><i class="ki-filled ki-plus text-xs"></i></span>
            <span class="hidden kt-menu-item-show:inline-flex"><i class="ki-filled ki-minus text-xs"></i></span>
          </span>
        </div>
        <div class="kt-menu-dropdown w-full gap-0 lg:max-w-[900px]">
          <div class="pt-4 pb-2 lg:p-7.5">
            <div class="grid lg:grid-cols-2 gap-5 lg:gap-10">
              <!-- column 1 -->
              <div class="kt-menu kt-menu-default kt-menu-fit flex-col">
                <h3 class="text-sm text-foreground font-semibold leading-none ps-2.5 mb-2 lg:mb-5">Profiles</h3>
                <div class="grid lg:grid-cols-2 lg:gap-5">
                  <div class="flex flex-col gap-0.5">
                    <div class="kt-menu-item">
                      <a class="kt-menu-link" href="/">
                        <span class="kt-menu-icon"><i class="ki-filled ki-badge"></i></span>
                        <span class="kt-menu-title grow-0">Default</span>
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  </div>
</div>
```

---

## Breadcrumb (ad-hoc)

Metronic demo1'de yerleşik `kt-breadcrumb` class'ı **yok**. Breadcrumb genelde page-header'da metin olarak veya ayrı bir nav olarak eklenir:

```html
<nav class="flex items-center gap-1.5 text-sm text-secondary-foreground">
  <a class="hover:text-primary" href="/">Home</a>
  <i class="ki-filled ki-right text-xs text-muted-foreground"></i>
  <a class="hover:text-primary" href="/account">Account</a>
  <i class="ki-filled ki-right text-xs text-muted-foreground"></i>
  <span class="text-foreground font-medium">Settings</span>
</nav>
```

---

## Stepper (ad-hoc)

Demo1'de yerleşik stepper component'i yok. Checkout flow'unda bile sayfa bazlı ilerleme kullanılıyor. Pattern önerisi:

```html
<div class="flex items-center gap-3">
  <!-- step: done -->
  <div class="flex items-center gap-2">
    <div class="size-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">
      <i class="ki-filled ki-check"></i>
    </div>
    <span class="text-sm text-foreground font-medium">Info</span>
  </div>
  <span class="flex-1 h-px bg-border"></span>
  <!-- step: active -->
  <div class="flex items-center gap-2">
    <div class="size-8 rounded-full bg-primary/15 text-primary flex items-center justify-center text-sm font-semibold">2</div>
    <span class="text-sm text-foreground font-medium">Payment</span>
  </div>
  <span class="flex-1 h-px bg-border"></span>
  <!-- step: pending -->
  <div class="flex items-center gap-2">
    <div class="size-8 rounded-full bg-accent text-muted-foreground flex items-center justify-center text-sm">3</div>
    <span class="text-sm text-secondary-foreground">Confirm</span>
  </div>
</div>
```

---

## Layout Wrapper / Container

```html
<body class="antialiased flex h-full text-base text-foreground bg-background demo1 kt-sidebar-fixed kt-header-fixed">
  <!-- Sidebar -->
  <div class="kt-sidebar ..."> ... </div>

  <!-- Wrapper -->
  <div class="kt-wrapper flex grow flex-col">
    <header class="kt-header ..."> ... </header>
    <main class="grow pt-5" id="content" role="content">
      <div class="kt-container-fixed" id="contentContainer">
        <!-- sayfa içeriği -->
      </div>
    </main>
    <footer class="kt-footer"> ... </footer>
  </div>
</body>
```

### Body flag'leri
- `kt-sidebar-fixed` — sidebar sticky/scrollable
- `kt-header-fixed` — header sticky
- `kt-sidebar-collapse` — sidebar collapsed mode (toggle eklenir/çıkarılır)

### Container width
- `kt-container-fixed` — max-width'li merkezi container

---

## Toggle Password Input

Şifre alanlarında göz ikonu ile görünür/gizli toggle.

```html
<div class="kt-input" data-kt-toggle-password="true">
  <input name="user_password" placeholder="Enter Password" type="password" value=""/>
  <button class="kt-btn kt-btn-sm kt-btn-ghost kt-btn-icon bg-transparent! -me-1.5"
          data-kt-toggle-password-trigger="true" type="button">
    <span class="kt-toggle-password-active:hidden">
      <i class="ki-filled ki-eye text-muted-foreground"></i>
    </span>
    <span class="hidden kt-toggle-password-active:block">
      <i class="ki-filled ki-eye-slash text-muted-foreground"></i>
    </span>
  </button>
</div>
```

---

## Theme Mode Bootstrap Script

`<html>` üzerinde `data-kt-theme-mode="light|dark|system"`. Sayfa yüklenirken `localStorage` ile sync.

```html
<html class="h-full" data-kt-theme="true" data-kt-theme-mode="light" dir="ltr" lang="en">
```

```html
<script>
  const defaultThemeMode = 'light'; // light|dark|system
  let themeMode;
  if (document.documentElement) {
    if (localStorage.getItem('kt-theme')) {
      themeMode = localStorage.getItem('kt-theme');
    } else if (document.documentElement.hasAttribute('data-kt-theme-mode')) {
      themeMode = document.documentElement.getAttribute('data-kt-theme-mode');
    } else {
      themeMode = defaultThemeMode;
    }
    if (themeMode === 'system') {
      themeMode = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.classList.add(themeMode);
  }
</script>
```

---

## Auth Card (sign-in / sign-up)

Tam sign-in sayfasının ortadaki card iskeleti (sign-up aynı pattern, ekstra "Confirm Password" alanıyla).

```html
<div class="flex items-center justify-center grow bg-center bg-no-repeat page-bg">
  <div class="kt-card max-w-[370px] w-full">
    <form action="#" class="kt-card-content flex flex-col gap-5 p-10" id="sign_in_form" method="get">

      <div class="text-center mb-2.5">
        <h3 class="text-lg font-medium text-mono leading-none mb-2.5">Sign in</h3>
        <div class="flex items-center justify-center font-medium">
          <span class="text-sm text-secondary-foreground me-1.5">Need an account?</span>
          <a class="text-sm link" href="/sign-up">Sign up</a>
        </div>
      </div>

      <!-- Social providers -->
      <div class="grid grid-cols-2 gap-2.5">
        <a class="kt-btn kt-btn-outline justify-center" href="#">
          <img alt="" class="size-3.5 shrink-0" src="assets/media/brand-logos/google.svg"/>
          Use Google
        </a>
        <a class="kt-btn kt-btn-outline justify-center" href="#">
          <img alt="" class="size-3.5 shrink-0 dark:hidden" src="assets/media/brand-logos/apple-black.svg"/>
          <img alt="" class="size-3.5 shrink-0 light:hidden" src="assets/media/brand-logos/apple-white.svg"/>
          Use Apple
        </a>
      </div>

      <!-- OR separator -->
      <div class="flex items-center gap-2">
        <span class="border-t border-border w-full"></span>
        <span class="text-xs text-muted-foreground font-medium uppercase">Or</span>
        <span class="border-t border-border w-full"></span>
      </div>

      <!-- Email -->
      <div class="flex flex-col gap-1">
        <label class="kt-form-label font-normal text-mono">Email</label>
        <input class="kt-input" placeholder="email@email.com" type="text" value=""/>
      </div>

      <!-- Password + forgot -->
      <div class="flex flex-col gap-1">
        <div class="flex items-center justify-between gap-1">
          <label class="kt-form-label font-normal text-mono">Password</label>
          <a class="text-sm kt-link shrink-0" href="/reset-password">Forgot Password?</a>
        </div>
        <div class="kt-input" data-kt-toggle-password="true">
          <input name="user_password" placeholder="Enter Password" type="password" value=""/>
          <button class="kt-btn kt-btn-sm kt-btn-ghost kt-btn-icon bg-transparent! -me-1.5"
                  data-kt-toggle-password-trigger="true" type="button">
            <span class="kt-toggle-password-active:hidden"><i class="ki-filled ki-eye text-muted-foreground"></i></span>
            <span class="hidden kt-toggle-password-active:block"><i class="ki-filled ki-eye-slash text-muted-foreground"></i></span>
          </button>
        </div>
      </div>

      <!-- Remember -->
      <label class="kt-label">
        <input class="kt-checkbox kt-checkbox-sm" name="check" type="checkbox" value="1"/>
        <span class="kt-checkbox-label">Remember me</span>
      </label>

      <!-- Submit -->
      <button class="kt-btn kt-btn-primary flex justify-center grow">Sign In</button>
    </form>
  </div>
</div>
```

### Auth sayfa arkaplanı
```html
<style>
  .page-bg {
    background-image: url('assets/media/images/2600x1200/bg-10.png');
  }
  .dark .page-bg {
    background-image: url('assets/media/images/2600x1200/bg-10-dark.png');
  }
</style>
```

---

## Ortak Utility / State Class'ları Özeti

| Prefix | Ne zaman |
|--------|----------|
| `kt-*-active:*` | Element aktif state'teyken tetiklenir (ör. `kt-menu-item-active:text-primary`) |
| `kt-*-hover:*` | KTUI-yönetimli hover state (Tailwind `hover:` değil) |
| `kt-*-show:*` | Dropdown/accordion açıkken |
| `kt-*-here:*` | Current path üzerindeyken |
| `kt-toggle-active:*` | `data-kt-toggle` açıkken |
| `kt-accordion-active:*` | Accordion item açıkken |
| `kt-toggle-password-active:*` | Password görünür moddayken |

## JS/CSS bağımlılıkları

```html
<link href="assets/vendors/keenicons/styles.bundle.css" rel="stylesheet"/>
<link href="assets/css/styles.css" rel="stylesheet"/>
<script src="assets/js/core.bundle.js"></script>
<script src="assets/vendors/ktui/ktui.min.js"></script>
<!-- charts lazım olursa -->
<link href="assets/vendors/apexcharts/apexcharts.css" rel="stylesheet"/>
<script src="assets/vendors/apexcharts/apexcharts.min.js"></script>
```
