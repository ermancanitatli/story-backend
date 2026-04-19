# Panel Landing Components (Markup Reference)

> Kaynak: `ornek-template-metronic/metronic-948/metronic-948/metronic-tailwind-nextjs-landings/saas/components/`
>
> Bu dokümanda Metronic SaaS Landing template'inde bulunan reusable section'lar ve UI primitive'leri **HTML** ve Tailwind class'ları olarak aktarılmıştır. Next.js / React bileşenleri olmadan, panel'deki herhangi bir view'a (EJS/HTML) yapıştırılabilir hale getirildi. Next.js'e özgü öğeler (framer-motion, useState, Link, Image) düz HTML'e indirgenmiştir — animasyon istenirse `data-*` attribute'ları ile vanilla JS'den bağlanabilir.
>
> Gerekli CSS: `/panel-assets/css/landing-extras.css` (token'lar + keyframe'ler). Asset'ler: `/panel-assets/media/landing/...`.

---

## İçindekiler

1. [Custom Primitives](#custom-primitives) — Badge, Title, Subtitle, Star
2. [Header / Nav](#header)
3. [Hero](#hero)
4. [Trusted Brands (Marquee)](#trusted-brands)
5. [Features Grid](#features-grid)
6. [How It Works](#how-it-works)
7. [Pricing Cards](#pricing-cards)
8. [Testimonials](#testimonials)
9. [FAQ](#faq)
10. [Call To Action](#call-to-action)
11. [Contact Form](#contact-form)
12. [Footer](#footer)

---

## Custom Primitives

### CustomBadge (section badge)
```html
<div class="py-1 text-indigo-600 font-semibold border-b-2 border-indigo-600 mb-1.5">
  Key Features
</div>
```

### CustomTitle (section heading)
```html
<h2 class="leading-6 text-3xl md:text-5xl font-bold text-foreground">
  Simple &amp; Transparent Pricing
</h2>
```

### CustomSubtitle
```html
<p class="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
  Choose the perfect plan for your business.
</p>
```

### Star icon (5-star rating)
Lucide `Star` SVG inline (yellow):
```html
<svg class="h-5 w-5 text-yellow-500 opacity-60" viewBox="0 0 24 24" fill="currentColor">
  <path d="M12 .587l3.668 7.568L24 9.75l-6 5.853L19.336 24 12 19.771 4.664 24 6 15.603 0 9.75l8.332-1.595z"/>
</svg>
```

---

## Header

```html
<header class="fixed top-0 inset-x-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/60">
  <div class="container mx-auto px-6 h-16 flex items-center justify-between">
    <a href="/" class="flex items-center gap-2 font-bold text-xl">Metronic</a>
    <nav class="hidden lg:flex items-center gap-8 text-sm font-medium">
      <a href="#features" class="text-muted-foreground hover:text-foreground">Features</a>
      <a href="#pricing" class="text-muted-foreground hover:text-foreground">Pricing</a>
      <a href="#faq" class="text-muted-foreground hover:text-foreground">FAQ</a>
      <a href="#contact" class="text-muted-foreground hover:text-foreground">Contact</a>
    </nav>
    <div class="flex items-center gap-3">
      <a href="/login" class="text-sm font-medium hover:text-indigo-600">Sign in</a>
      <a href="/signup" class="inline-flex items-center rounded-md bg-indigo-600 text-white px-4 h-9 text-sm font-medium hover:bg-indigo-700">Get started</a>
    </div>
  </div>
</header>
```

---

## Hero

Çok katmanlı bir section: animasyonlu orb'lar (framer-motion) + rotating word + avatar grubu + video play button. Orb'ları sade div'ler olarak bırakıp, animasyonu CSS'ten verebiliriz.

```html
<section class="relative lg:min-h-screen bg-gradient-to-br from-gray-50 dark:from-zinc-950 via-indigo-50 dark:via-black to-indigo-50 dark:to-zinc-950 pt-25 pb-20 lg:pt-40 lg:pb-20 overflow-hidden group">

  <!-- Background orbs (CSS keyframe: aurora) -->
  <div class="hidden lg:block absolute inset-0 pointer-events-none">
    <div class="absolute left-[10%] top-[15%] w-[320px] h-[320px] dark:w-[160px] dark:h-[160px] rounded-full bg-indigo-200 dark:bg-indigo-900 opacity-90 blur-[60px] landing-aurora" style="--duration:8s"></div>
    <div class="absolute right-[12%] top-[30%] w-[220px] h-[220px] rounded-full bg-indigo-300 dark:bg-indigo-950 opacity-80 blur-[40px] landing-aurora" style="--duration:10s"></div>
    <div class="absolute left-[35%] bottom-[18%] w-[180px] h-[180px] rounded-full bg-blue-200 dark:bg-blue-600 opacity-80 blur-[30px] landing-aurora" style="--duration:11s"></div>
    <div class="absolute right-[22%] bottom-[8%] w-[150px] h-[150px] rounded-full bg-indigo-100 opacity-90 blur-[20px] landing-aurora" style="--duration:13s"></div>
  </div>

  <!-- Dot pattern overlay -->
  <div class="absolute inset-0 opacity-40" style="background-image: url(&quot;data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23e5e7eb' fill-opacity='0.3'%3E%3Ccircle cx='7' cy='7' r='1'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E&quot;);"></div>

  <div class="container mx-auto px-6 relative z-10">
    <div class="text-center max-w-5xl mx-auto">
      <h1 class="font-black flex flex-col md:flex-row items-center gap-0.5 md:gap-1.25 justify-center text-3xl lg:text-7xl font-bold mb-4 lg:mb-8 leading-[1.2]">
        <span class="bg-gradient-to-r from-indigo-900 via-blue-900 to-indigo-900 dark:from-gray-50 dark:via-blue-300 dark:to-indigo-900 bg-clip-text text-transparent">Ship Amazing</span>
        <span class="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent w-[365px]">Web Apps</span>
      </h1>
      <p class="text-base md:text-xl text-muted-foreground mb-6 md:mb-10 max-w-[600px] mx-auto leading-relaxed">
        Create amazing apps effortlessly with our powerful platform. From idea to launch in just minutes.
      </p>

      <div class="inline-flex items-center gap-3 mb-10">
        <a href="/signup" class="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground h-11 px-6 text-sm font-medium hover:bg-primary/90">
          Get started for free
          <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
        </a>
        <a href="#features" class="inline-flex items-center gap-2 rounded-md border border-input h-11 px-6 text-sm font-medium hover:bg-accent">
          Explore Metronic
        </a>
      </div>

      <!-- Trust row -->
      <div class="flex flex-col items-center gap-2.5 mb-10">
        <div class="flex gap-2.5 items-center">
          <div class="flex -space-x-2">
            <img src="/panel-assets/media/landing/avatars/300-1.png" class="w-9 h-9 rounded-full ring-2 ring-background" alt="">
            <img src="/panel-assets/media/landing/avatars/300-2.png" class="w-9 h-9 rounded-full ring-2 ring-background" alt="">
            <img src="/panel-assets/media/landing/avatars/300-3.png" class="w-9 h-9 rounded-full ring-2 ring-background" alt="">
            <img src="/panel-assets/media/landing/avatars/300-4.png" class="w-9 h-9 rounded-full ring-2 ring-background" alt="">
          </div>
          <!-- Use Star primitive above -->
        </div>
        <div class="text-center text-muted-foreground text-sm font-medium">Trusted by thousands of enterprises</div>
      </div>

      <!-- Video thumbnail (click → open modal) -->
      <div class="relative max-w-5xl mx-auto">
        <img src="/panel-assets/media/landing/screens/5.png" class="w-full rounded-xl shadow-2xl" alt="Product Demo">
        <button class="absolute inset-0 flex items-center justify-center" data-video-src="https://www.youtube.com/embed/VIbMn0QHBlw">
          <span class="bg-indigo-600/10 dark:bg-indigo-300/10 backdrop-blur-md rounded-full p-4 shadow-lg">
            <span class="bg-background rounded-full p-3 shadow-lg inline-flex">
              <svg class="size-6 text-indigo-600 fill-indigo-600 ml-0.5" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            </span>
          </span>
        </button>
      </div>
    </div>
  </div>
</section>
```

---

## Trusted Brands

Marquee (sonsuz kayan logo şeridi). `animate-marquee` ile:

```html
<section class="py-14 border-y border-border/50 bg-background overflow-hidden">
  <div class="container mx-auto px-6">
    <p class="text-center text-sm font-semibold text-muted-foreground tracking-widest uppercase mb-8">Trusted by fast-growing teams</p>
    <div class="relative flex overflow-hidden" style="--gap:3rem; --duration:40s;">
      <div class="flex shrink-0 gap-12 pr-12 landing-marquee">
        <img src="/panel-assets/media/landing/brands/airbnb.svg"    class="h-8 opacity-70 hover:opacity-100 transition" alt="Airbnb">
        <img src="/panel-assets/media/landing/brands/amazon.svg"    class="h-8 opacity-70" alt="Amazon">
        <img src="/panel-assets/media/landing/brands/apple.svg"     class="h-8 opacity-70" alt="Apple">
        <img src="/panel-assets/media/landing/brands/google.svg"    class="h-8 opacity-70" alt="Google">
        <img src="/panel-assets/media/landing/brands/microsoft.svg" class="h-8 opacity-70" alt="Microsoft">
        <img src="/panel-assets/media/landing/brands/netflix.svg"   class="h-8 opacity-70" alt="Netflix">
        <img src="/panel-assets/media/landing/brands/openai.svg"    class="h-8 opacity-70" alt="OpenAI">
        <img src="/panel-assets/media/landing/brands/spacex.svg"    class="h-8 opacity-70" alt="SpaceX">
        <img src="/panel-assets/media/landing/brands/spotify.svg"   class="h-8 opacity-70" alt="Spotify">
        <img src="/panel-assets/media/landing/brands/tesla.svg"     class="h-8 opacity-70" alt="Tesla">
        <img src="/panel-assets/media/landing/brands/uber.svg"      class="h-8 opacity-70" alt="Uber">
        <img src="/panel-assets/media/landing/brands/youtube.svg"   class="h-8 opacity-70" alt="YouTube">
      </div>
      <!-- İkinci kopyası aria-hidden ile duplicate edilir -->
      <div class="flex shrink-0 gap-12 pr-12 landing-marquee" aria-hidden="true">
        <!-- Aynı logolar tekrar -->
      </div>
    </div>
  </div>
</section>
```

`inverse/` klasöründeki SVG'ler **dark mode** için (beyaz versiyonlar): `.dark` altında swap için iki `<picture>` veya ayrı `<div>` ile göster/gizle.

---

## Features Grid

```html
<section id="features" class="py-24 bg-background border-b border-border/50">
  <div class="container mx-auto px-6">
    <div class="flex items-center justify-center flex-col text-center gap-5 mb-16">
      <div class="py-1 text-indigo-600 font-semibold border-b-2 border-indigo-600 mb-1.5">Key Features</div>
      <h2 class="leading-6 text-3xl md:text-5xl font-bold">Everything you need</h2>
      <p class="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">Our platform provides all the tools and features you need.</p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-6xl mx-auto">
      <!-- Feature card -->
      <div class="group h-full bg-background border border-border transition-all duration-500 p-8 relative overflow-hidden hover:shadow-lg hover:border-blue-500 rounded-xl">
        <div class="flex items-start justify-between mb-8">
          <div class="size-12 rounded-full flex items-center justify-center group-hover:scale-110 transition-all duration-500 bg-blue-100/40 dark:bg-blue-950/40">
            <!-- Lucide Zap icon -->
            <svg class="size-5 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          </div>
          <div class="text-right">
            <div class="text-2xl font-semibold mb-1">10x faster</div>
            <div class="text-sm text-muted-foreground font-medium uppercase tracking-wide">Speed Increase</div>
          </div>
        </div>
        <h3 class="text-2xl font-bold mb-6 leading-tight">Lightning Workflows</h3>
        <p class="text-muted-foreground leading-relaxed font-medium">Supercharge your daily operations with automation that adapts to your business.</p>
        <div class="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-blue-600 to-blue-700 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-500 origin-left"></div>
      </div>
      <!-- Diğer renkler: red, emerald, amber (template'de 4 kart) -->
    </div>
  </div>
</section>
```

---

## How It Works

3 adımlı icon row:

```html
<section class="py-24 bg-accent/30">
  <div class="container mx-auto px-6">
    <div class="text-center max-w-3xl mx-auto mb-16">
      <div class="py-1 text-indigo-600 font-semibold border-b-2 border-indigo-600 mb-1.5 inline-block">How it works</div>
      <h2 class="text-3xl md:text-5xl font-bold mt-4">Three simple steps</h2>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
      <div class="text-center">
        <div class="mx-auto mb-6 size-14 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xl font-bold">1</div>
        <h3 class="text-xl font-bold mb-2">Sign up</h3>
        <p class="text-muted-foreground">Create your free account in under a minute.</p>
      </div>
      <!-- 2 & 3 same pattern -->
    </div>
  </div>
</section>
```

---

## Pricing Cards

```html
<section id="pricing" class="py-24 bg-background border-b border-border/50">
  <div class="container mx-auto px-6">
    <div class="flex flex-col items-center text-center gap-5">
      <div class="py-1 text-indigo-600 font-semibold border-b-2 border-indigo-600 mb-1.5">Pricing</div>
      <h2 class="text-3xl md:text-5xl font-bold">Simple &amp; Transparent Pricing</h2>
      <p class="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10">
        Choose the perfect plan for your business. All plans include a 14-day free trial.
      </p>

      <!-- Toggle Monthly / Yearly -->
      <div class="flex items-center justify-center mb-18">
        <div class="bg-accent rounded-xl gap-1 p-1.5 inline-flex">
          <button class="cursor-pointer rounded-lg text-sm font-medium px-6 py-2 bg-background shadow-sm">Monthly</button>
          <button class="cursor-pointer rounded-lg text-sm font-medium px-6 py-2 flex items-center gap-2">
            Yearly
            <span class="leading-none rounded-sm px-1 py-0.5 text-[11px] bg-indigo-100 border border-indigo-100 text-indigo-700 dark:text-indigo-200 dark:bg-indigo-950/50 dark:border-indigo-950/50 font-semibold">-20%</span>
          </button>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
      <!-- Starter -->
      <div class="h-full relative border border-border rounded-xl transition-all hover:border-indigo-500 p-0">
        <div class="text-center py-6">
          <div class="text-2xl font-bold">Starter</div>
          <div class="text-muted-foreground mb-5">Perfect for small teams getting started</div>
          <div class="flex items-end justify-center">
            <span class="text-5xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">$29</span>
            <span class="text-muted-foreground ml-1 mb-1">/month</span>
          </div>
        </div>
        <div class="space-y-4 p-6">
          <ul class="space-y-3">
            <li class="flex items-center"><svg class="h-5 w-5 text-green-500 mr-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>Up to 5 team members</li>
            <!-- ... -->
          </ul>
          <div class="pt-6">
            <button class="w-full inline-flex items-center justify-center rounded-md border border-input h-11 text-sm font-medium hover:bg-accent">Get Started</button>
          </div>
        </div>
      </div>
      <!-- Professional (popular) -->
      <div class="h-full relative border border-indigo-500 shadow-2xl scale-105 rounded-xl p-0">
        <div class="absolute -top-4 left-1/2 -translate-x-1/2">
          <span class="inline-flex items-center gap-1 bg-gradient-to-r from-blue-500 to-indigo-600 text-white px-2.5 py-1 rounded-md text-xs font-semibold">
            <svg class="h-3 w-3" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .587l3.668 7.568L24 9.75l-6 5.853L19.336 24 12 19.771 4.664 24 6 15.603 0 9.75l8.332-1.595z"/></svg>
            Most Popular
          </span>
        </div>
        <!-- same body -->
      </div>
      <!-- Enterprise -->
    </div>
  </div>
</section>
```

---

## Testimonials

Vertical marquee grid (3 sütun, her sütun farklı hızda dikey kayar):

```html
<section class="py-24 bg-background border-b border-border/50 overflow-hidden">
  <div class="container mx-auto px-6">
    <div class="text-center mb-14">
      <div class="py-1 text-indigo-600 font-semibold border-b-2 border-indigo-600 mb-1.5 inline-block">Testimonials</div>
      <h2 class="text-3xl md:text-5xl font-bold mt-4">What our customers say</h2>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 h-[500px]">
      <!-- Col 1 -->
      <div class="flex flex-col gap-4 landing-marquee-vertical" style="--duration:35s; --gap:1rem;">
        <div class="rounded-xl border border-border p-6 bg-card">
          <p class="text-muted-foreground mb-4">"Game-changer. Cut our onboarding time by 80%."</p>
          <div class="flex items-center gap-3">
            <img src="/panel-assets/media/landing/avatars/300-7.png" class="w-10 h-10 rounded-full" alt="">
            <div><div class="font-semibold">Sarah Lee</div><div class="text-xs text-muted-foreground">CTO, Acme</div></div>
          </div>
        </div>
        <!-- more cards + duplicate for seamless loop -->
      </div>
      <!-- Col 2, Col 3 -->
    </div>
  </div>
</section>
```

---

## FAQ

Radix Accordion → native `<details>` olarak:

```html
<section id="faq" class="py-24 bg-accent/30 border-b border-border/50">
  <div class="container mx-auto px-6 max-w-3xl">
    <div class="text-center mb-12">
      <div class="py-1 text-indigo-600 font-semibold border-b-2 border-indigo-600 mb-1.5 inline-block">FAQ</div>
      <h2 class="text-3xl md:text-5xl font-bold mt-4">Frequently asked questions</h2>
    </div>
    <div class="space-y-3">
      <details class="group rounded-lg border border-border bg-background px-5 py-4 [&_summary::-webkit-details-marker]:hidden">
        <summary class="flex cursor-pointer items-center justify-between font-medium">
          How does the 14-day trial work?
          <svg class="size-5 transition-transform group-open:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
        </summary>
        <p class="mt-3 text-muted-foreground">Full access to all features. No credit card required to start.</p>
      </details>
      <!-- more -->
    </div>
  </div>
</section>
```

---

## Call To Action

```html
<section class="py-24 bg-gradient-to-br from-indigo-600 via-blue-600 to-indigo-700 text-white">
  <div class="container mx-auto px-6 text-center max-w-3xl">
    <h2 class="text-3xl md:text-5xl font-bold mb-4">Ready to get started?</h2>
    <p class="text-lg opacity-90 mb-8">Join thousands of teams already using our platform.</p>
    <a href="/signup" class="inline-flex items-center gap-2 rounded-md bg-white text-indigo-700 h-12 px-8 text-base font-semibold hover:bg-gray-100">
      Start free trial
      <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
    </a>
  </div>
</section>
```

---

## Contact Form

```html
<section id="contact" class="py-24 bg-background">
  <div class="container mx-auto px-6 max-w-xl">
    <div class="text-center mb-10">
      <div class="py-1 text-indigo-600 font-semibold border-b-2 border-indigo-600 mb-1.5 inline-block">Contact</div>
      <h2 class="text-3xl md:text-5xl font-bold mt-4">Get in touch</h2>
    </div>
    <form class="space-y-4">
      <div>
        <label class="block text-sm font-medium mb-1.5">Name</label>
        <input type="text" class="w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
      </div>
      <div>
        <label class="block text-sm font-medium mb-1.5">Email</label>
        <input type="email" class="w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
      </div>
      <div>
        <label class="block text-sm font-medium mb-1.5">Message</label>
        <textarea rows="4" class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"></textarea>
      </div>
      <button type="submit" class="w-full inline-flex items-center justify-center rounded-md bg-indigo-600 text-white h-11 text-sm font-medium hover:bg-indigo-700">Send message</button>
    </form>
  </div>
</section>
```

---

## Footer

```html
<footer class="bg-background relative overflow-hidden">
  <div class="container px-6 mx-auto pt-14 pb-6 border-b border-border/50">
    <div class="flex flex-col lg:flex-row justify-between items-start">
      <div class="lg:w-1/3 mb-12 lg:mb-0">
        <div class="flex items-center mb-3 font-bold text-xl">Story</div>
        <p class="text-muted-foreground mb-6 max-w-sm">Transform your business with our powerful SaaS platform.</p>
        <div class="flex space-x-4">
          <a href="#" class="size-9 border border-border/60 text-muted-foreground rounded-md flex items-center justify-center hover:text-foreground" aria-label="X">
            <svg class="size-4" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2H21.5l-7.5 8.57L23 22h-6.83l-5.36-6.993L4.6 22H1.34l8.03-9.174L1 2h6.98l4.85 6.4L18.244 2Zm-2.39 18h1.89L7.24 4H5.23l10.624 16Z"/></svg>
          </a>
          <!-- Github, LinkedIn, Mail icons... -->
        </div>
      </div>

      <div class="w-full lg:w-2/3 flex justify-end">
        <div class="w-full lg:w-auto flex flex-wrap lg:grid lg:grid-cols-3 gap-8 lg:gap-16">
          <div>
            <h3 class="font-medium text-base mb-4 capitalize text-muted-foreground/80">product</h3>
            <ul class="text-base space-y-2">
              <li><a href="#" class="text-accent-foreground hover:text-indigo-600 hover:underline">Features</a></li>
              <li><a href="#" class="text-accent-foreground hover:text-indigo-600 hover:underline">Pricing</a></li>
              <li><a href="#" class="text-accent-foreground hover:text-indigo-600 hover:underline">API</a></li>
              <li><a href="#" class="text-accent-foreground hover:text-indigo-600 hover:underline">Documentation</a></li>
            </ul>
          </div>
          <!-- company, support -->
        </div>
      </div>
    </div>

    <div class="my-6 border-t border-border/50"></div>

    <div class="flex flex-col md:flex-row justify-between items-center">
      <p class="text-muted-foreground text-sm">© 2025 Story. All rights reserved.</p>
      <p class="text-muted-foreground text-sm mt-4 md:mt-0">Product by <a href="https://keenthemes.com" target="_blank" rel="noopener noreferrer" class="text-foreground hover:text-indigo-600 hover:underline">KeenThemes</a></p>
    </div>
  </div>
</footer>
```

---

## Kullanım notları

- **Icons:** Tüm Lucide ikonları inline SVG olarak kopyalanmalı veya `lucide.dev` CDN'i kullanılabilir. KTUI kendi `ki-*` icon set'ini kullanır; landing için Lucide daha yerinde.
- **Framer-motion animasyonları:** `whileInView` ile opacity/y animasyonları. Panel'de vanilla alternatif için `IntersectionObserver + class toggle` yeterli.
- **Avatars/brands/screens klasörü:** `/panel-assets/media/landing/` altına kopyalandı. Dark mode için `brands/inverse/` (beyaz logolar) hazır.
- **CSS bağımlılığı:** `landing-extras.css` mutlaka `<head>`'e eklensin (yoksa aurora/marquee animasyonları çalışmaz).
- Bu doküman bir **snapshot**; template'te büyük değişiklik olursa güncellenmesi gerekebilir.
