---
name: animation-engineering
description: >
  UI animasyonu yazarken veya gözden geçirirken kullan. Emil Kowalski'nin tasarım mühendisliği
  felsefesini Angular + SCSS + CoreLogicUI token sistemine uyarlar. Easing kararları, süre
  tabloları, performans kuralları ve @angular/animations / WAAPI desenleri içerir.
---

# Animasyon Mühendisliği

Emil Kowalski'nin felsefesini ([animations.dev](https://animations.dev/)) CoreLogicUI'nin
Angular 22 + SCSS stack'ine uyarlar. Framer Motion kullanılmaz; CSS geçişleri ve WAAPI
tercih edilir. `@angular/animations` projede kurulu değildir: aşağıdaki örnek için paket önce eklenir.

## İlk Yanıt

Bu skill ilk kez çağrıldığında ve somut bir soru yoksa yalnızca şunu yaz:

> Arayüzlerin doğru hissetmesine yardımcı olmaya hazırım. Bilgim Emil Kowalski'nin
> tasarım mühendisliği felsefesine dayanıyor. Daha derine inmek istersen:
> [animations.dev](https://animations.dev/)

Kullanıcı soru sormadan başka bilgi verme.

---

## Temel Felsefe

### Zevk eğitilir, doğuştan gelmez

İyi zevk kişisel tercih değildir. Harika çalışmaları inceleyerek, neden iyi hissettirdiğini
düşünerek ve pratik yaparak kazanılır. En iyi arayüzlerin neden böyle hissettirdiğini araştır.
Animasyonları tersine mühendislikle çöz. Meraklı ol.

### Görünmeyen detaylar birikerek etkiler

Kullanıcılar çoğu detayı bilinçli olarak fark etmez — bu zaten amaçtır. Bir özellik tam
olarak beklendiği gibi çalıştığında kullanıcı onu düşünmeden geçer. Görünmez doğruluğun
birikmesi, insanların neden sevdiğini bilmeden sevdiği arayüzler yaratır.

### Güzellik kaldıraçtır

İnsanlar araçları genel deneyime göre seçer. İyi animasyonlar gerçek bir farklılaştırıcıdır.
Güzellik yazılımda az kullanılır — bunu avantaj olarak kullan.

---

## İnceleme Formatı (Zorunlu)

UI kodu incelerken **her zaman markdown tablosu** kullan. Asla `Before:/After:` listesi kullanma.

| Before | After | Neden |
| --- | --- | --- |
| `transition: all 300ms` | `transition: transform 200ms ease-out` | `all` GPU dışı property'leri de animasyona dahil eder |
| `transform: scale(0)` | `transform: scale(0.95); opacity: 0` | Gerçek dünyada hiçbir şey yoktan belirir |
| `ease-in` dropdown'da | `ease-out` + custom curve | `ease-in` kullanıcının en çok izlediği anı geciktirir |
| Button'da `:active` yok | `transform: scale(0.97)` `:active`'de | Butonlar basışa fiziksel tepki vermelidir |
| Popover'da `transform-origin: center` | `transform-origin: var(--transform-origin)` | Popover'lar tetikleyicilerinden açılır; modal'lar değil |

---

## Animasyon Karar Çerçevesi

Herhangi bir animasyon kodu yazmadan önce bu soruları sırayla cevapla:

### 1. Bu animasyon olmalı mı?

**Sor:** Kullanıcı bu animasyonu ne sıklıkla görecek?

| Sıklık | Karar |
| --- | --- |
| Günde 100+  (klavye kısayolları, command palette) | Animasyon yok. Hiçbir zaman. |
| Günde onlarca (hover efektleri, liste navigasyonu) | Kaldır veya ciddi azalt |
| Ara sıra (modal, drawer, toast) | Standart animasyon |
| Nadir / ilk kez (onboarding, kutlama) | Keyif eklenebilir |

**Klavye ile başlatılan eylemleri asla animasyona sokma.** Bu eylemler günde yüzlerce kez
tekrarlanır. Animasyon onları yavaş ve kopuk hissettirir.

### 2. Amacı nedir?

Her animasyonun "neden animasyona giriyor?" sorusuna net bir cevabı olmalı:

- **Uzamsal tutarlılık:** Toast aynı yönden girer/çıkar → swipe-to-dismiss sezgisel hisseder
- **Durum göstergesi:** Morphing feedback butonu durum değişimini gösterir
- **Açıklama:** Bir özelliğin nasıl çalıştığını gösteren marketing animasyonu
- **Geribildirim:** Buton basışta küçülür, arayüzün kullanıcıyı duyduğunu onaylar
- **Ani değişimi önleme:** Geçiş olmadan beliren/kaybolan elemanlar bozuk hissettirir

Amaç sadece "güzel görünüyor" ve kullanıcı sık görecekse — animasyona sokma.

### 3. Hangi easing kullanılmalı?

```
Eleman giriyor/çıkıyor mu?
  Evet → ease-out (hızlı başlar, duyarlı hissettirir)
  Hayır →
    Ekranda hareket/morph ediyor mu?
      Evet → ease-in-out (doğal ivmelenme/yavaşlama)
    Hover/renk değişimi mi?
      Evet → ease
    Sabit hareket mi (marquee, progress bar)?
      Evet → linear
    Varsayılan → ease-out
```

**Önemli: custom easing curve kullan.** Yerleşik CSS easing'leri çok zayıf.

```scss
// styles.scss'e ekle (zaten --ease-standard var, bunları da ekle)
--ease-out-strong:  cubic-bezier(0.23, 1, 0.32, 1);
--ease-in-out-strong: cubic-bezier(0.77, 0, 0.175, 1);
--ease-drawer:      cubic-bezier(0.32, 0.72, 0, 1);
```

Mevcut CoreLogicUI token'ları:
```scss
--motion-fast:    150ms
--motion-base:    230ms
--ease-standard:  cubic-bezier(0.2, 0, 0, 1)
```

**UI animasyonlarında asla `ease-in` kullanma.** Yavaş başlar → kullanıcının en çok izlediği
anı geciktirir. 300ms'de `ease-out`, 300ms'de `ease-in`'den *daha hızlı hissettiren* şeydir.

### 4. Ne kadar hızlı olmalı?

| Eleman | Süre |
| --- | --- |
| Buton basış geribildirimi | 100–160ms |
| Tooltip, küçük popover | 125–200ms |
| Dropdown, select | 150–250ms |
| Modal, drawer | 200–500ms |
| Marketing / açıklayıcı | Daha uzun olabilir |

**Kural: UI animasyonları 300ms altında kalmalı.** 180ms dropdown 400ms'den daha
duyarlı hissettiriyor. Daha hızlı dönen spinner, yükleme süresi aynı olsa bile uygulamayı
daha hızlı hissettiriyor.

---

## Angular Animasyon Desenleri

### `@angular/animations` ile Giriş/Çıkış

> Paket 2026-10-30'da kaldırıldı (kullanılmıyordu). Önce CSS geçişini dene.

```typescript
// component.ts
import { trigger, transition, style, animate } from '@angular/animations';

@Component({
  animations: [
    trigger('fadeScale', [
      transition(':enter', [
        style({ opacity: 0, transform: 'scale(0.95)' }),
        animate('200ms ease-out', style({ opacity: 1, transform: 'scale(1)' }))
      ]),
      transition(':leave', [
        animate('150ms ease-out', style({ opacity: 0, transform: 'scale(0.95)' }))
      ])
    ]),
    trigger('slideUp', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(8px)' }),
        animate('200ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
      ]),
      transition(':leave', [
        animate('150ms ease-out', style({ opacity: 0, transform: 'translateY(8px)' }))
      ])
    ])
  ]
})
```

```html
<!-- template'de -->
<div @fadeScale>...</div>
```

### CSS Transitions (Tercih Edilen — Kesilebilir)

Hızlı tetiklenen UI için (toast, toggle) `@angular/animations` yerine CSS transition kullan.
CSS transitions kesilebilir; Angular animasyonları (keyframe gibi) sıfırdan yeniden başlar.

```scss
// component.scss
.toast {
  transition: transform var(--motion-base) var(--ease-standard),
              opacity var(--motion-base) var(--ease-standard);

  &.entering {
    opacity: 1;
    transform: translateY(0);
  }

  &.exiting {
    opacity: 0;
    transform: translateY(8px);
  }
}
```

### `@starting-style` ile JS'siz Giriş Animasyonu

```scss
.tooltip {
  opacity: 1;
  transform: scale(1);
  transition: opacity 150ms ease-out, transform 150ms ease-out;
  transform-origin: var(--transform-origin, top center);

  @starting-style {
    opacity: 0;
    transform: scale(0.97);
  }
}
```

### WAAPI — Programatik, GPU Hızlandırmalı

```typescript
// Keyframe'siz, kesintiye uğrayabilen, doğrudan GPU'da çalışan animasyon
element.animate(
  [
    { clipPath: 'inset(0 100% 0 0)', opacity: 0 },
    { clipPath: 'inset(0 0 0 0)',    opacity: 1 }
  ],
  {
    duration: 200,
    fill: 'forwards',
    easing: 'cubic-bezier(0.23, 1, 0.32, 1)'
  }
);
```

---

## Component Yapı Kuralları

### Butonlar duyarlı hissetmeli

```scss
.btn {
  transition: transform var(--motion-fast) ease-out;

  &:active {
    transform: scale(0.97);
  }
}
// Not: global .btn sınıfı styles.scss'te zaten bu stili içermeli
```

### Asla `scale(0)`'dan başlama

Gerçek dünyada hiçbir şey yoktan belirir. `scale(0)` animasyonu havadan belirmiş gibi görünür.

```scss
// Yanlış
.entering { transform: scale(0); }

// Doğru
.entering {
  transform: scale(0.95);
  opacity: 0;
}
```

### Popover'ları kaynak noktasından aç

Popover'lar tetikleyicilerinden açılmalı, merkezden değil. **İstisna: modal'lar** — merkez kalır.

```scss
// CDK Overlay kullanırken Angular'da:
.cdk-overlay-pane {
  // Tetikleyici konumunu transform-origin olarak al:
  transform-origin: var(--transform-origin, top left);
  transition: transform 150ms ease-out, opacity 150ms ease-out;
}
```

### Tooltip'lerde ardışık hover'da animasyonu atla

İlk tooltip gecikmeyle açılır. Sonraki tooltip'ler anında, animasyonsuz açılmalı.

```scss
.tooltip {
  transition: transform 125ms ease-out, opacity 125ms ease-out;

  &[data-instant] {
    transition-duration: 0ms;
  }
}
```

### Geçişler için keyframe yerine CSS transition

CSS transitions kesilebilir ve yeniden hedeflenebilir; keyframe'ler sıfırdan yeniden başlar.
Hızlı tetiklenen her şey (toast listesi, durum toggle'ları) için transitions kullan.

### Kusurlu crossfade'leri bulanıklaştır

İki durum arasındaki geçiş easing/süre ayarına rağmen hâlâ tuhaf görünüyorsa:

```scss
.content {
  transition: filter 200ms ease, opacity 200ms ease;

  &.transitioning {
    filter: blur(2px);
    opacity: 0.7;
  }
}
// Blur'u 20px altında tut — özellikle Safari'de ağır
```

---

## CSS Transform Araçları

### Yüzde bazlı `translateY`

Yüzdeler elemanın kendi boyutuna göre hesaplanır. `translateY(100%)` elemanı kendi yüksekliği
kadar aşağı taşır — gerçek boyutundan bağımsız.

```scss
.drawer { transform: translateY(100%); } // Boyutu ne olursa olsun tam gizli
.toast  { transform: translateY(-100%); } // Toast yüksekliği ne olursa olsun
```

### `clip-path: inset()` ile Açılış Efektleri

```scss
// Soldan sağa açılış
.overlay {
  clip-path: inset(0 100% 0 0);
  transition: clip-path 200ms ease-out;

  &.active {
    clip-path: inset(0 0 0 0);
    transition: clip-path 2s linear; // Basılı tutarken yavaş, bırakınca hızlı
  }
}
```

### Sekme Renk Geçişleri (Mükemmel)

Tab listesini çoğalt. Kopyayı "aktif" olarak stillendir. Sadece aktif sekme görünmesi için
klipleyi animasyonla hareket ettir. Bu hiçbir timing trick'inin başaramayacağı pürüzsüz renk
geçişi sağlar.

---

## Gesture ve Sürükleme

### Momentum Bazlı Kapatma

Mesafe eşiği yerine hız hesapla:

```typescript
const timeTaken = Date.now() - dragStartTime;
const velocity  = Math.abs(swipeAmount) / timeTaken;

if (Math.abs(swipeAmount) >= SWIPE_THRESHOLD || velocity > 0.11) {
  dismiss();
}
```

### Sınırlarda Sönümleme

Kullanıcı doğal sınırı aşarak sürüklediğinde (örn. açık drawer'ı yukarı çekme) sönümleme
uygula. Gerçek nesneler aniden durur — yavaşlar.

### Çoklu Dokunuş Koruması

```typescript
onDragStart() {
  if (this.isDragging) return; // İkinci parmak sıçramayı önler
  // ...
}
```

---

## Performans Kuralları

### Yalnızca `transform` ve `opacity` animasyona sok

Bu property'ler layout ve paint'i atlayarak GPU'da çalışır. `padding`, `margin`, `height`,
`width` animasyonu her karede üç render adımını tetikler.

### CSS değişkenini parent'ta güncelleme — Yanlış

```typescript
// Kötü: tüm child'larda stil yeniden hesaplamasını tetikler
element.style.setProperty('--swipe-amount', `${distance}px`);

// İyi: yalnızca bu elemanı etkiler
element.style.transform = `translateY(${distance}px)`;
```

### CSS Animasyonları Yük Altında JS'den Daha İyidir

CSS animasyonları ana thread dışında çalışır. Browser sayfa yüklerken, script çalıştırırken
veya paint yaparken WAAPI/CSS animasyonları akıcı kalır; `requestAnimationFrame` tabanlı
animasyonlar kare atlar.

---

## Erişilebilirlik

### `prefers-reduced-motion`

```scss
@media (prefers-reduced-motion: reduce) {
  .animated-element {
    animation: fade 0.2s ease;
    // Hareket ve konum animasyonlarını kaldır — opacity/renk geçişlerini koru
  }
}
```

Angular'da:

```typescript
private readonly prefersReducedMotion = signal(
  window.matchMedia('(prefers-reduced-motion: reduce)').matches
);
```

### Touch Cihazlarda Hover

```scss
@media (hover: hover) and (pointer: fine) {
  .element:hover {
    transform: scale(1.05);
  }
}
// Touch cihazlarda tap hover'ı tetikler — yanlış pozitif önlenir
```

---

## Stagger Animasyonları

Grup girişlerinde elemanları sırayla animasyona sok:

```scss
.item {
  opacity: 0;
  transform: translateY(8px);
  animation: fadeIn 300ms ease-out forwards;

  @for $i from 1 through 8 {
    &:nth-child(#{$i}) { animation-delay: #{($i - 1) * 50}ms; }
  }
}

@keyframes fadeIn {
  to { opacity: 1; transform: translateY(0); }
}
```

Gecikmeleri kısa tut (30–80ms arası). Uzun gecikmeler arayüzü yavaş hissettirir. Stagger
dekoratiftir — oynarken etkileşimi asla bloke etme.

---

## Asimetrik Zamanlama

Basarken yavaş (kullanıcı karar veriyor), bırakırken hızlı (sistem yanıt veriyor):

```scss
.overlay {
  transition: clip-path 200ms ease-out; // Bırakınca: hızlı
}
.button:active .overlay {
  transition: clip-path 2s linear; // Basılıyken: yavaş, kasıtlı
}
```

---

## İnceleme Kontrol Listesi

| Sorun | Düzeltme |
| --- | --- |
| `transition: all` | Tam property belirt: `transition: transform 200ms ease-out` |
| `scale(0)` giriş animasyonu | `scale(0.95)` + `opacity: 0`'dan başla |
| UI elemanında `ease-in` | `ease-out` veya custom curve'e geç |
| Popover'da `transform-origin: center` | Tetikleyici konumuna ayarla (modal muaf) |
| Klavye eylemi üzerinde animasyon | Animasyonu tamamen kaldır |
| UI elemanında 300ms'den uzun süre | 150–250ms'ye indir |
| Media query'siz hover animasyonu | `@media (hover: hover) and (pointer: fine)` ekle |
| Hızlı tetiklenen elemanda keyframe | CSS transition'a geç (kesilebilir) |
| Eş zamanlı giriş yapan elemanlar | 30–80ms stagger gecikme ekle |
| Aynı giriş/çıkış süresi | Çıkışı girişten hızlı yap |

---

## Hata Ayıklama

### Yavaş Hareket Testi

Geliştirme sırasında süreleri 2–5× artır veya Chrome DevTools Animations panelini kullan.
Şunlara bak: renkler pürüzsüz geçiyor mu; easing doğru mu; transform-origin doğru yerde mi;
koordineli property'ler senkron mu.

### Frame Frame İnceleme

Chrome DevTools Animations paneli, tam hızda görünmeyen zamanlama sorunlarını açığa çıkarır.

### Animasyona Ertesi Gün Bak

Geliştirme sırasında kaçırdığın kusurları ertesi gün fark edersin. Yavaş harekette veya
frame frame izleyerek sorunları bul.
