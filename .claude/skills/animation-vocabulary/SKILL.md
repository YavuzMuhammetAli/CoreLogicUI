---
name: animation-vocabulary
description: >
  Belirsiz bir animasyon açıklamasını kesin terminolojiye çevirir. Kullanıcı teknik adı
  bilmeden gördüğünü veya hissettiğini tanımlar; skill doğru terimi gloserin'den eşleştirir.
---

# Animasyon Sözlüğü

Belirsiz bir motion veya efekt açıklamasını kesin terime çevir; kullanıcı ne isteyeceğini
bilsin.

## Hızlı Başlangıç

Kullanıcı efekti kabaca tanımlar. Bu formatla eşleşen terimi döndür:

```
**Stagger** — Her biri arasında küçük bir gecikmeyle birçok öğeyi art arda animasyona sokma, basamaklı bir etki yaratır.
```

Birden fazla terim uyuyorsa en iyi eşleşmeyi önce listele, ardından farkı açıklayan 1–2
alternatif ekle.

## Talimatlar

1. **Niyet için oku, anahtar kelime için değil.** Kullanıcılar teknik adı değil ne *gördüklerini*
   veya *hissettiklerini* anlatır ("yaylı", "kayarak gidiyor", "kendini çiziyor"). Hissi
   aşağıdaki glosere eşleştir.
2. **Gloseri kelimesi kelimesine aktar.** Açıklamalar otoritatif — oldukları gibi kullan, parafraz etme.
3. **Yakın terimleri ayırt et.** İkisi rekabet ettiğinde (*Clip-path* - *Mask*, *Pop in* - *Bounce*,
   *Shared element transition* - *Layout animation*), kullanıcı seçebilsin diye karşılaştır.
4. **Tam eşleşme yoksa** en yakın terimi söyle ve yaklaşık olduğunu belirt — ya da etkiyi
   gloserin kelimesiyle açıkla (örn. "bu *scale-in* girişlerinin *stagger*'ı").
5. **Bu gloserde kal.** Gerçekten yoksa icat etmek yerine söyle — ama bu kelimelerle
   açıklayabilirsin.
6. **Kısa tut.** İsim sorusu isim ister, deneme değil. Terimi öne koy; genişlet ancak istenirse.

## Örnekler

**Örnek 1 — his bazlı**
Kullanıcı: "Bir popover'ın tıkladığın butondan büyüyormuş gibi göründüğü şey nasıl adlandırılır, kendi merkezinden değil?"
Çıktı:
```
**Origin-aware animation** — Bir eleman tetikleyicisinden animasyona girer; örneğin bir popover CSS'deki varsayılan gibi kendi merkezinden değil, onu açan butondan büyür.
```

**Örnek 2 — ayırt etme**
Kullanıcı: "Bir resmin diğerine dönüştüğü şey."
Çıktı:
```
**Morph** — Bir şekil pürüzsüzce başka bir şekle dönüşür, örn. Dynamic Island.

Yakın alternatifler:
- **Crossfade** — sadece aynı noktada birbirleri üzerine fade ediyorlarsa.
- **Shared element transition** — eleman bir konumdan diğerine seyahat edip dönüşüyorsa.
```

**Örnek 3 — fizik hissi**
Kullanıcı: "Çok fazla çektiğinde direnen ve geri yaylanan o iOS scroll'u."
Çıktı:
```
**Rubber-banding** — Bir sınırın ötesine sürüklediğinde direnç ve geri yaylanma (iOS overscroll hissi).
```

---

## Gloseri

### Girişler ve Çıkışlar — elemanların nasıl belirdiği ve kaybolduğu
- **Fade in / Fade out** — Eleman opacity değişimi ile belirir veya kaybolur.
- **Slide in** — Eleman ekran dışından (sol, sağ, üst veya alt) kayarak girer.
- **Scale in** — Eleman belirirken küçükten tam boyuta büyür, genellikle fade ile birleştirilir.
- **Pop in** — Eleman yerine oturan küçük bir aşımla belirir.
- **Reveal** — İçerik kademeli olarak ortaya çıkar; genellikle clip-path veya mask animasyonu ile.
- **Enter / Exit** — Bir elemanın ekrana eklenirken veya kaldırılırken oynadığı animasyon.

### Sıralama ve Zamanlama — birden fazla elemanı veya anı koordine etme
- **Keyframes** — Bir animasyondaki tanımlı noktalar (%0, %50, %100); browser aradakileri doldurur.
- **Interpolation / Tween** — Başlangıç ve bitiş değeri arasındaki tüm ara kareleri üretme; hareket sürekli olur.
- **Stagger** — Her biri arasında küçük bir gecikmeyle birçok öğeyi art arda animasyona sokma, basamaklı etki yaratır.
- **Orchestration** — Birden fazla animasyonu tek koordineli hareket gibi hissettirmek için kasıtlı olarak zamanlama.
- **Delay** — Bir animasyonun başlamadan önceki bekleme süresi.
- **Duration** — Bir animasyonun ne kadar sürdüğü.
- **Fill mode** — Animasyon başlamadan önce veya bittikten sonra elemanın ilk ya da son karedeki stillerini tutup tutmadığı (örn. `forwards`).
- **Stepped animation** — Geri sayım sayacı gibi ayrık adımlara bölünmüş animasyon.

### Hareket ve Dönüşümler — elemanın konumunu, boyutunu veya açısını değiştirme
- **Translate** — Bir elemanı X veya Y ekseninde taşıma.
- **Scale** — Bir elemanı büyütme veya küçültme.
- **Rotate** — Bir elemanı bir nokta etrafında döndürme.
- **Skew** — Bir elemanı X veya Y ekseninde eğme, dikdörtgen şeklinden çıkarma.
- **3D tilt / Flip** — Derinlik katmak için 3D uzayda döndürme (rotateX / rotateY).
- **Perspective** — 3D efektin ne kadar güçlü göründüğü — düşük değer derinliği abartır, izleyici daha yakın gibi.
- **Transform origin** — Scale veya rotation'ın büyüdüğü veya döndüğü çıpa noktası.
- **Origin-aware animation** — Eleman tetikleyicisinden animasyona girer; CSS'deki varsayılan kendi merkezinden değil, onu açan butondan büyüyen popover gibi.

### Durumlar Arasındaki Geçişler — bir durum, görünüm veya elemanı diğerine bağlama
- **Crossfade** — Bir eleman aynı noktada diğeri fade in yaparken fade out yapar.
- **Continuity transition** — Kullanıcıyı yönlendirilmiş tutan değişim; öncesi ve sonrasını görsel olarak birleştirir. Örneğin aynı dikdörtgeni büyütüp küçültmek.
- **Morph** — Bir şekil pürüzsüzce başka bir şekle dönüşür, örn. Dynamic Island.
- **Shared element transition** — Eleman bir konumdan diğerine seyahat edip dönüşür; küçük resmin karta genişlemesi gibi.
- **Layout animation** — Bir elemanın boyutu veya konumu değiştiğinde ani geçiş yerine yeni noktaya animasyonla gider.
- **Accordion / Collapse** — Bir bölüm içeriği göstermek veya gizlemek için yüksekliğini pürüzsüzce genişletir ve daraltır.
- **Direction-aware transition** — İleri giderken bir yöne, geri giderken tersine kayar; navigasyonda yön hissi verir.

### Kaydırma — kaydırma veya görünümler arasında gezinmeyle bağlantılı hareket
- **Scroll reveal** — Elemanlar görünüm alanına girerken fade veya slide ile belirir.
- **Scroll-driven animation** — İlerlemesi doğrudan kaydırma konumuna bağlı animasyon.
- **Parallax** — Kaydırma sırasında arka plan ve ön plan farklı hızlarda hareket eder, derinlik yaratır.
- **Page transition** — Bir sayfadan veya route'tan diğerine geçerken oynayan animasyon.
- **View transition** — Browser iki durum veya sayfa arasında morph yapar, paylaşılan elemanları birbirine bağlar.

### Geribildirim ve Etkileşim — kullanıcının eylemlerine yanıt verme
- **Hover effect** — Cursor bir elemanın üzerine geldiğinde görsel değişim.
- **Press / Tap feedback** — Tıklandığında fiziksel hissettirmek için elemanın ince ölçekte küçülmesi.
- **Hold to confirm** — Kullanıcı butonu basılı tutarken doldurulan ilerleme efekti.
- **Drag** — Bırakıldığında momentum ile bir elemanı tutup hareket ettirme.
- **Drag to reorder** — Listedeki öğeleri yeniden düzenlemek için sürükleme; diğerleri yer açmak için kayar.
- **Swipe to dismiss** — Bir elemanı kapatmak için ekran dışına sürükleme; drawer veya toast gibi.
- **Rubber-banding** — Bir sınırın ötesine sürüklediğinde direnç ve geri yaylanma (iOS overscroll hissi).
- **Shake / Wiggle** — Hata veya reddedilen girişi bildiren hızlı yanlara sallama.
- **Ripple** — Basışın noktasından genişleyen çember, basışı onaylar.

### Easing — animasyon boyunca hızın nasıl değiştiği
- **Easing** — Bir animasyonun hızlanıp yavaşladığı oran.
- **Ease-out** — Hızlı başlar, yavaş biter. Kullanıcıya yanıt veren ve UI'daki çoğu şey için varsayılan.
- **Ease-in** — Yavaş başlar, hızlı biter. Genellikle kaçınılır; ağır hissettirilebilir.
- **Ease-in-out** — Yavaş, hızlı, yavaş. Ekranda A'dan B'ye giden elemanlar için iyi.
- **Linear** — Sabit hız. UI için kaçın; spinner veya marquee için kullan.
- **Cubic-bezier** — Kesin kontrol için tanımladığın custom easing curve.
- **Asymmetric easing** — Farklı oranlarda ivmelenen ve yavaşlayan curve. Simetrik olandan daha canlı hissettirir.

### Yay Animasyonları — sabit süre easing'e alternatif olarak fizik tabanlı hareket
- **Spring** — Sabit süre yerine fizik (gerilim, kütle, sönümleme) ile yönlendirilen hareket.
- **Stiffness / Tension** — Yayın hedefe ne kadar güçlü çektiği. Yüksek değer daha keskin hissettirir.
- **Damping** — Yayın ne kadar hızlı yatıştığı. Düşük sönümleme daha fazla sıçrama ve salınım demek.
- **Mass** — Animasyonlu elemanın ne kadar ağır hissettiği. Daha fazla kütle, daha yavaş ve hantal.
- **Bounce** — Hedefi aşan ve yatışan yay, oyunculuk katar.
- **Perceptual duration** — Altında mikro-yatışmaya devam etse bile yayın bitmiş hissettirdiği süre.
- **Momentum** — Özellikle sürükleme veya kesinti sonrasında hız taşıyan hareket.
- **Velocity** — Bir elemanın ne kadar hızlı ve hangi yönde hareket ettiği. Yay kesildiğinde hızı bir sonraki animasyona taşır; fırlanan eleman hızını korur.
- **Interruptible animation** — Önce bitmek yerine uçuş ortasında pürüzsüzce yönlendirilebilen animasyon.

### Döngü ve Ortam Hareketi — kendi başına çalışan animasyonlar
- **Marquee** — Sürekli döngüde kaydıran metin veya içerik.
- **Loop** — Belirli sayıda veya sonsuz tekrarlayan animasyon.
- **Alternate (yoyo)** — Başa atlamak yerine her iterasyonda ileri sonra geri oynayan döngü.
- **Orbit** — Sürekli yolda başka bir elemanın etrafında dönen eleman.
- **Pulse** — Dikkat çekmek için hafif tekrarlayan scale veya opacity değişimi.
- **Float** — Statik elemanı canlı ve ağırlıksız hissettiren hafif, sürekli yukarı-aşağı kayma.
- **Idle animation** — Bir eleman orada beklerken, etkileşim beklentisinde oynadığı ince hareket.

### Cilalama ve Efektler — iyiyi mükemmelden ayıran küçük dokunuşlar
- **Blur** — Bir elemanı yumuşatmak veya küçük kusurları maskelemek için kullanılan bulanıklık filtresi.
- **Clip-path** — Bir elemanı şekle kırpma; açılış, maske ve önce/sonra slider'lar için kullanılır.
- **Mask** — Bir şekil veya gradient kullanarak elemanın parçalarını gizleme veya gösterme — clip-path gibi ama yumuşak, soluklaşabilir kenarlı.
- **Before / after slider** — İki katmanlı görüntü arasında silerek karşılaştırma yapan sürüklenebilir bölücü.
- **Line drawing** — Görünmez bir kalemin izini çiziyormuş gibi kendini çizen SVG yolu.
- **Text morph** — Değiştiğinde karakter karakter animasyona giren metin, yeni değere dikkat çeker.
- **Skeleton / Shimmer** — İçerik yüklenirken gösterilen hareketli parlaklıklı yer tutucu.
- **Number ticker** — Bir değere kadar yuvarlanan veya sayan rakamlar.
- **Tabular numbers** — Sayılar değişirken etrafını kaydırmayan sabit genişlikli rakamlar. Sayaçlar, zamanlayıcılar ve göstergeler için şart.
- **Typewriter** — Yazılıyormuş gibi karakter karakter beliren metin.

### Performans — hareketi takılmak yerine akıcı tutan şey
- **Frame rate (FPS)** — Saniyede çizilen kare sayısı. 60fps pürüzsüz hareket için taban; yeni ekranlarda 120fps.
- **Jank** — Browser animasyona yetişemeyip kare düşürdüğünde görünen takılma.
- **Dropped frame** — Browser'ın çizme son tarihini kaçırdığı kare, harekette küçük bir sarsıntıya neden olur.
- **Compositing** — GPU'nun layout veya paint'i yeniden yapmadan kendi katmanında bir elemanı hareket ettirmesi veya soluklaştırması.
- **will-change** — Bir elemanın animasyona gireceğini browser'a önceden bildiren CSS ipucu; önceden kendi katmanına yükseltebilir.
- **Layout thrashing** — Her karede browser'ı layout'u yeniden hesaplamaya zorlayan `width`, `height`, `top`, `left` gibi property'leri animasyona sokma.

### Bilinmesi Gereken İlkeler — ne zaman ve nasıl animasyona sokacağını yönlendiren kavramlar
- **Purposeful animation** — Hareket bir işlev görmelidir: yönlendirme, geribildirim verme, ilişki gösterme — sadece süsleme değil.
- **Anticipation** — Bir hareketten önce ters yönde küçük bir hazırlık, ne olacağına ipucu verir.
- **Follow-through** — Elemanın parçaları ana hareket durduktan sonra biraz daha hareket eder ve yatışır, ağırlık katar.
- **Squash & stretch** — Hareketi, hızı ve esnekliği aktarmak için elemanı deforme etme.
- **Perceived performance** — Doğru animasyon arayüzü gerçekte olmasa bile daha hızlı hissettiriyor.
- **Frequency of use** — Kullanıcı bir animasyonu ne sıklıkla görürse, o kadar kısa ve ince olmalı.
- **Spatial consistency** — Elemanı durumlar arasında kimliğini ve konumunu koruyan şekilde animasyona sokma; kullanıcı şeylerin nereye gittiğini asla kaybetmemeli.
- **Hardware acceleration** — `transform` ve `opacity` animasyonu GPU'nun hareketi pürüzsüz tutmasını sağlar.
- **Reduced motion** — Hareketi azaltarak veya kaldırarak kullanıcının `prefers-reduced-motion` ayarına saygı gösterme.
