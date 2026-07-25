# Animasyon Standartları Referansı

İncelemelerde kullanılacak kesin değerler, curve'ler ve kurallar. Emil Kowalski'nin
tasarım mühendisliği felsefesinden ([animations.dev](https://animations.dev/)) damıtıldı
ve CoreLogicUI'nin Angular/SCSS stack'ine uyarlandı.

## Animasyona girmeli mi? (sıklık tablosu)

| Sıklık | Karar |
| --- | --- |
| Günde 100+ (klavye kısayolları, command palette toggle) | Animasyon yok. Hiçbir zaman. |
| Günde onlarca (hover efektleri, liste navigasyonu) | Kaldır veya ciddi azalt |
| Ara sıra (modal, drawer, toast) | Standart animasyon |
| Nadir / ilk kez (onboarding, geribildirim, kutlama) | Keyif eklenebilir |

**Klavye ile başlatılan eylemleri asla animasyona sokma** — günde yüzlerce kez tekrarlanır;
animasyon yavaş ve kopuk hissettirir. Raycast'in açılış/kapanış animasyonu yok — günde yüzlerce
kez kullanılan bir şey için doğru tercih bu.

Motion için geçerli amaçlar: uzamsal tutarlılık, durum göstergesi, açıklama, geribildirim,
ani değişimi önleme. Sık görülen elemanda "güzel görünüyor" geçerli değil.

## Easing

Karar sırası:
- Giriyor / çıkıyor → **`ease-out`** (hızlı başlar, duyarlı hissettirir)
- Ekranda hareket / morph → **`ease-in-out`**
- Hover / renk değişimi → **`ease`**
- Sabit hareket (marquee, progress) → **`linear`**
- Varsayılan → **`ease-out`**

**UI'da asla `ease-in` kullanma.** Yavaş başlar → kullanıcının en çok izlediği anı geciktirir.
200ms'de `ease-out`, 200ms'de `ease-in`'den *daha hızlı hissettiriyor*.

Yerleşik CSS easing'leri çok zayıf. Güçlü custom curve kullan:

```scss
// styles.scss'e ekle (--ease-standard zaten mevcut, bunları da ekle)
--ease-out-strong:    cubic-bezier(0.23, 1, 0.32, 1);      /* UI etkileşimleri için güçlü ease-out */
--ease-in-out-strong: cubic-bezier(0.77, 0, 0.175, 1);    /* Ekranda hareket için */
--ease-drawer:        cubic-bezier(0.32, 0.72, 0, 1);     /* iOS benzeri drawer curve */
```

Mevcut CoreLogicUI token'ları:
```scss
--motion-fast:   150ms
--motion-base:   230ms
--ease-standard: cubic-bezier(0.2, 0, 0, 1)
```

Curve'leri [easing.dev](https://easing.dev/) veya [easings.co](https://easings.co/)'da bul
— sıfırdan elle yazma.

## Süre

| Eleman | Süre |
| --- | --- |
| Buton basış geribildirimi | 100–160ms |
| Tooltip, küçük popover | 125–200ms |
| Dropdown, select | 150–250ms |
| Modal, drawer | 200–500ms |
| Marketing / açıklayıcı | Daha uzun olabilir |

**Kural: UI animasyonları 300ms altında.** 180ms dropdown 400ms'den daha duyarlı hissettiriyor.
Daha hızlı dönen spinner, aynı yüklenme süresinde uygulamayı daha hızlı hissettiriyor.

## Fiziksellik

- **Asla `scale(0)`.** `scale(0.9–0.97)` + `opacity: 0`'dan başla. Gerçek dünyada hiçbir şey
  yoktan belirir.
- **Kaynak farkındalıklı popover'lar.** Tetikleyiciden aç, merkezden değil.
  Modal muaf — viewport'un merkezinde belirir, `transform-origin: center` kalır.
- **Buton basış geribildirimi.** `transform: scale(0.97)` `:active`'de,
  `transition: transform 160ms ease-out`. İnce ol (0.95–0.98). Her basılabilir elemana uygulanır.

## Kesilebilirlik

CSS **transition'lar** kesilebilir ve yeniden hedeflenebilir; **keyframe'ler** sıfırdan
yeniden başlar. Hızlı tetiklenen her şey için (toast ekleme, toggle'lar) transition daha
pürüzsüz.

```scss
// Kesilebilir — dinamik UI için iyi
.toast { transition: transform 400ms ease; }

// Kesilebilir değil — dinamik UI için kaçın
@keyframes slideIn {
  from { transform: translateY(100%); }
  to   { transform: translateY(0); }
}
```

`@starting-style` ile JS'siz giriş:

```scss
.toast {
  opacity: 1;
  transform: translateY(0);
  transition: opacity 400ms ease, transform 400ms ease;

  @starting-style {
    opacity: 0;
    transform: translateY(100%);
  }
}
```

## Asimetrik Zamanlama

Kullanıcı karar verirken yavaş; sistem yanıt verirken hızlı.

```scss
.overlay { transition: clip-path 200ms ease-out; }           // bırakınca: hızlı
.button:active .overlay { transition: clip-path 2s linear; } // basılıyken: yavaş, kasıtlı
```

## Performans

- **Yalnızca `transform` ve `opacity` animasyona gir** — layout/paint'i atlar, GPU'da çalışır.
  `padding`/`margin`/`height`/`width`/`top`/`left` her karede üç render adımını tetikler.
- **Alt transform'u parent CSS değişkeniyle yönlendirme** — tüm child'larda stil yeniden
  hesaplaması tetikler. Transform'u doğrudan elemanda ayarla:
  ```typescript
  // Kötü: tüm child'larda yeniden hesaplama
  element.style.setProperty('--swipe-amount', `${d}px`);
  // İyi: yalnızca bu eleman
  element.style.transform = `translateY(${d}px)`;
  ```
- **CSS animasyonları yük altında JS'den daha iyidir** — ana thread dışında çalışır; browser
  yüklenirken/script çalıştırırken/paint ederken `requestAnimationFrame` tabanlı animasyonlar
  kare atlar. Önceden belirlenmiş motion için CSS, dinamik/kesilebilir için WAAPI/Angular kullan.
- **WAAPI** JS kontrolü ile CSS performansı sağlar (GPU hızlandırmalı, kesilebilir, kütüphane yok):
  ```typescript
  element.animate(
    [{ clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0 0)' }],
    { duration: 1000, fill: 'forwards', easing: 'cubic-bezier(0.77, 0, 0.175, 1)' }
  );
  ```

## Transform ve clip-path

- **`translate` yüzdeleri** elemanın kendi boyutuna göredir — `translateY(100%)` elemanı kendi
  yüksekliği kadar taşır (boyuttan bağımsız). Hardcoded px değerlerine tercih et.
- **`scale()` child'ları da ölçekler** (font, ikonlar, içerik) — basış geribildirimi için özellik.
- **`clip-path: inset(t r b l)`** güçlü bir animasyon aracıdır: her değer o taraftan içe doğru
  "yer". Kullanımlar: scroll'da açılış (`inset(0 0 100% 0)` → `inset(0 0 0 0)`), basılı tutarak
  silme overlay'i, pürüzsüz sekme renk geçişleri (aktif kopyayı klipleyi gizle), karşılaştırma
  slider'ı.

## Gesture ve Sürükleme

- **Momentum kapatma**: mesafe eşiği değil hız hesapla (`Math.abs(distance)/geçenMs`);
  `> ~0.11` ise kapat. Hızlı hareket yeterli olmalı.
- **Sınırlarda sönümleme**: doğal kenar ötesinde sürükleme ne kadar ilerlerse o kadar az hareket
  etmeli (gerçek nesneler aniden durmaz, yavaşlar).
- **Pointer capture** sürükleme başladığında, pointer eleman sınırını aşsa bile devam etmesi için.
- **Çoklu dokunuş koruması**: sürükleme başladıktan sonra ekstra dokunma noktalarını yoksay
  (`if (isDragging) return`) — sıçramayı önler.
- **Hard stop yerine sürtünme** — görünmez duvara çarpmak yerine artan dirençle over-drag'e izin ver.

## Kusurlu Crossfade'leri Maskeleme

Crossfade, easing/süre ayarına rağmen iki çakışan durumu gösteriyorsa geçiş sırasında
`filter: blur(2px)` ekle. Bu iki durumu tek pürüzsüz dönüşüm olarak algılatan bir köprü kurar.
Blur'u 20px altında tut (ağır blur pahalıdır, özellikle Safari'de).

## Stagger

Grup girişlerini stagger'la; elemanlar arasında 30–80ms. Uzun gecikmeler yavaş hissettirir.
Stagger dekoratiftir — oynarken etkileşimi asla bloke etme.

```scss
.item {
  opacity: 0;
  transform: translateY(8px);
  animation: fadeIn 300ms ease-out forwards;
}
.item:nth-child(2) { animation-delay: 50ms; }
.item:nth-child(3) { animation-delay: 100ms; }
@keyframes fadeIn { to { opacity: 1; transform: translateY(0); } }
```

## Erişilebilirlik

```scss
@media (prefers-reduced-motion: reduce) {
  .eleman { animation: fade 0.2s ease; } // opacity/renk koru, transform motion'ını kaldır
}
@media (hover: hover) and (pointer: fine) {
  .eleman:hover { transform: scale(1.05); } // touch yanlış hover tetikler — bu kapıyı koy
}
```

Angular'da:
```typescript
private readonly prefersReducedMotion = signal(
  window.matchMedia('(prefers-reduced-motion: reduce)').matches
);
```

Reduced motion sıfır animasyon değil; daha az ve daha yumuşak animasyon demek — anlamayı
destekleyen geçişleri koru, hareket/konum değişikliklerini kaldır.

## Hata Ayıklama (İnceleme sırasında his belirsizse öner)

- **Yavaş hareket**: süreyi 2–5× artır veya DevTools animation inspector kullan. Renklerin
  pürüzsüz geçip geçmediğini, easing'in keskin durup durmadığını, `transform-origin`'in doğru
  yerde olup olmadığını, koordineli property'lerin senkron olup olmadığını kontrol et.
- **Frame frame**: Chrome DevTools Animations paneli koordineli property'ler arasındaki
  zamanlama kaymasını ortaya çıkarır.
- **Ertesi gün taze gözle** — geliştirme sırasında görülmeyen kusurlar sonradan yüzeye çıkar.

## Uyum

Motion'ı component kişiliğiyle eşleştir: oyunsu daha sıçrayıcı olabilir; profesyonel bir
dashboard crisp ve hızlı kalır. Opacity + yükseklik kombinasyonu giren/çıkan listelerde
deneme-yanılmayla bulunur; formülü yoktur — doğru hissedene kadar ayarla.
