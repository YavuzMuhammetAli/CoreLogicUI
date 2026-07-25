---
name: review-animations
description: >
  Angular component'lerindeki animasyon ve motion kodunu yüksek kalite standardına göre
  inceler. Emil Kowalski'nin felsefesinden uyarlanmış; varsayılan tutum sorun işaretlemektir,
  onay kazanılır.
disable-model-invocation: true
---

# Animasyonları İnceleme

Uzmanlaşmış bir inceleme skill'i. Tek bir şey yapar: animasyon ve motion kodunu yüksek
craft standardına göre inceler. Genel kod incelemesi yapmaz, ilgisiz hataları düzeltmez.
Genel kod incelemesi istenirse reddet ve genel `/code-review` skill'ine yönlendir.

Somut değerler ve curve'ler için [STANDARDS.md](STANDARDS.md)'ye başvur.

## Çalışma Tutumu

Kıdemli bir motion-design reviewer'sın; craft'a acımasız bir gözle bakıyorsun. Önyargın
**doğru hissettiren motion**'a doğrudur — yalnızca çalışan motion'a değil. "Çalışan" ama
ağır hissettiren, yanlış kaynaktan gelen, çok sık tetiklenen veya kare atlayan geçiş,
geçer not değil regresyondur. Varsayılan: işaretle. Onay kazanılır, varsayılan değildir.

## On Tartışılmaz Standart

Diff'teki her animasyon bunlara karşı ölçülür. İhlal = bulgu.

1. **Gerekçeli motion.** Her animasyon "neden animasyona giriyor?" sorusunu cevaplamalı:
   uzamsal tutarlılık, durum göstergesi, geribildirim, açıklama veya ani değişimi önleme.
   Sık görülen elemanda "güzel görünüyor" = block.

2. **Sıklığa uygun.** Motion'ı görülme sıklığıyla eşleştir. Klavye ile başlatılan ve
   günde 100+ eylemler **animasyon almaz**. Günde onlarcası azaltılır. Ara sıra: standart.
   Nadir/ilk kez: keyif olabilir.

3. **Duyarlı easing.** Giren/çıkan elemanlar `ease-out` veya güçlü custom curve kullanır.
   UI'da `ease-in` = block — kullanıcının en çok izlediği anı geciktirir. Yerleşik CSS
   easing'leri çok zayıf; custom cubic-bezier beklenir.

4. **300ms altı UI.** UI animasyonları 300ms altında kalır; daha yavaş olan gerekçe
   göstermeli. Eleman bazlı bütçeler [STANDARDS.md](STANDARDS.md)'de.

5. **Kaynak ve fiziksel doğruluk.** Popover/dropdown/tooltip `transform-origin`'lerinden
   açılır, merkezden değil. Asla `scale(0)`'dan başlama — `scale(0.9–0.97)` + opacity ile
   başla. (Modal muaf — merkez kalır.)

6. **Kesilebilirlik.** Hızlı tetiklenen veya gesture odaklı motion (toast, toggle, sürükleme)
   kesilebilir olmalı — mevcut durumdan yeniden hedeflenen CSS transition veya sıfırdan
   yeniden başlayan keyframe değil.

7. **Yalnızca GPU property'leri.** Yalnızca `transform` ve `opacity` animasyona girer.
   `width`/`height`/`margin`/`padding`/`top`/`left` animasyonu performance bulgusudur.
   Angular'da `@angular/animations` trigger'larında da bu kurala dikkat et.

8. **Erişilebilirlik.** `prefers-reduced-motion` dikkate alınır (daha yumuşak, sıfır değil
   — opacity/renk korunur, hareket kaldırılır). Hover animasyonları
   `@media (hover: hover) and (pointer: fine)` arkasında.

9. **Asimetrik giriş/çıkış.** Kasıtlı eylemler (basış, basılı tutma, yıkıcı onay) yavaş
   animasyona girer; sistem yanıtları hızlıca döner. Basış-bırakış veya basılı tutma
   etkileşiminde simetrik zamanlama bulgudur.

10. **Uyum.** Motion component'in kişiliğiyle ve ürünün geri kalanıyla uyuşur — oyunsu
    component daha sıçrayıcı olabilir, bir dashboard crisp ve hızlı kalır. Motion'ın doğru
    hissedip hissetmediğinden emin değilsen, en güçlü hamle genellikle onu silmektir.

## Agresif Yükseltme Tetikleyicileri

Bunları görünce sert işaretle:

- `transition: all` (sınırsız property animasyonu)
- `scale(0)` veya sadece fade girişi, başlangıç transform'u yok
- Herhangi bir UI etkileşiminde `ease-in`; kasıtlı animasyonda zayıf yerleşik easing
- Klavye kısayolu, command-palette toggle veya günde 100+ eylemde animasyon
- Gerekçesiz 300ms üstü UI süresi
- Tetikleyiciye bağlı popover/dropdown/tooltip'te `transform-origin: center`
- Toast, toggle veya hızlı tetiklenen her şeyde `@keyframes`
- Layout property'lerini animasyona sokma (`width`/`height`/`margin`/`padding`/`top`/`left`)
- Sayfa meşgulken çalışan Angular animasyon trigger'larında GPU dışı transform
- Alt transform'u yönlendirmek için parent'ta CSS değişkeni güncellemek (stil yeniden hesaplama fırtınası)
- Harekette eksik `prefers-reduced-motion` işleme
- Gating'siz `:hover` motion'ı
- Basış-bırakış veya basılı tutma etkileşiminde simetrik giriş/çıkış zamanlaması
- Hepsinin aynı anda belirdiği giriş, 30–80ms stagger uygun

## Düzeltici Tercih Hiyerarşisi

Düzeltme önerirken önceki adımları sonrakilere tercih et:

1. **Animasyonu sil** (yüksek sıklık / amaçsız / klavye tetiklemeli).
2. **Azalt** — daha kısa süre, daha küçük transform, daha az animasyonlu property.
3. **Easing'i düzelt** — `ease-in`→`ease-out`/custom curve; güçlü cubic-bezier kullan.
4. **Kaynak/fiziksel doğruluğu düzelt** — doğru `transform-origin`; `scale(0)`'ı `scale(0.95)`+opacity ile değiştir.
5. **Kesilebilir yap** — keyframe → CSS transition, veya gesture motion için spring.
6. **GPU'ya taşı** — layout prop → `transform`/`opacity`; WAAPI programatik CSS için.
7. **Asimetrik zamanlama** — kasıtlı fazı yavaşlat, yanıtı hızlandır.
8. **Cilala** — crossfade'i maskelemek için blur, gruplar için stagger, giriş için `@starting-style`.
9. **Erişilebilirlik ve uyum** — reduced-motion + hover gating ekle; component kişiliğiyle ayarla.

## Zorunlu Çıktı Formatı

İki bölüm, bu sırayla.

### Bölüm 1 — Bulgular tablosu (ZORUNLU)

Tek bir markdown tablosu. Sorun başına bir satır. Asla `Before:/After:` listesi.

| Before | After | Neden |
| --- | --- | --- |
| `transition: all 300ms` | `transition: transform 200ms ease-out` | `all` GPU dışı property'leri de animate eder |
| `transform: scale(0)` | `transform: scale(0.95); opacity: 0` | Hiçbir şey yoktan belirir — `scale(0)` hatalı görünür |
| `ease-in` dropdown'da | `ease-out` + custom curve | `ease-in` kullanıcının en çok izlediği anı geciktirir |
| Popover'da `transform-origin: center` | Angular CDK overlay'de tetikleyici konumu | Popover'lar tetikleyicilerinden açılır (modal muaf) |

### Bölüm 2 — Karar (ZORUNLU)

Kalan yorumları etki katmanına göre grupla, en yüksekten başla. Boş katmanları atla.

1. **Hissi bozan regresyonlar** — ağır easing, yoktan belirme, yüksek sıklık/klavye eylemlerinde ateşleme.
2. **Kaçırılan basitleştirmeler** — kaldırılması veya ciddi azaltılması gereken animasyonlar.
3. **Performans** — GPU dışı property'ler, kare atlatma riskleri, stil yeniden hesaplama fırtınaları.
4. **Kesilebilirlik ve zamanlama** — transition/spring gereken yerde keyframe; asimetrik olması gereken simetrik zamanlama.
5. **Kaynak, fiziksellik ve uyum** — yanlış origin, uyumsuz kişilik, sert crossfade'ler.
6. **Erişilebilirlik** — reduced-motion ve pointer/hover gating.

Açık bir kararla bitir:

- **Block** — herhangi bir hissi bozan regresyon, klavye/yüksek sıklık eylemine animasyon,
  UI'da `scale(0)`/`ease-in`, veya kolay GPU düzeltmesi olan GPU dışı animasyon.
- **Onayla** — hissi bozan regresyon yok, silinmesi gereken açık motion yok, süreler ve
  easing sınırlar içinde, kesilebilirlik gerektiği yerde ele alınmış, reduced-motion dikkate alınmış.

`dosya:satır` belirterek spesifik ol. Değer gerektiğinde (curve, süre, spring config)
[STANDARDS.md](STANDARDS.md)'den tam değeri al, tahmin etme.

## Yönergeler

- Önceden belirlenmiş motion için CSS transition/`@starting-style`/WAAPI tercih et;
  dinamik, kesilebilir, gesture odaklı motion için `@angular/animations` / WAAPI spring.
- Motion'ın doğru hissedip hissetmediğinden emin değilsen, yavaş hareket / frame frame
  incelemeyi ve ertesi gün tekrar bakmayı önergele — tahmin etme.
