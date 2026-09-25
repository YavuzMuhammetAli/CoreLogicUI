# 14 · İş Kuralları

**34 kural.** Her biri için: ne olduğu, neden gerektiği ve bugünkü CoreLogic'te uygulanabilirliği.

---

## Uygulanabilirlik sınıfları

Platformun kural uygulayabildiği **tek yer** alan içi doğrulamadır
(`DynamicEntityValidator.cs`): `IsRequired`, `MinLength`/`MaxLength`, `Min`/`Max`, `Regex`,
`EnumValues`. Bunun dışındaki her kural sınıfı için karşılık yok.

| Sınıf | Örnek | Platform |
|---|---|---|
| **A · Alan içi** | "Miktar > 0" | ✅ `Min` |
| **B · Alanlar arası (aynı kayıt)** | "`RequiredDate >= RequestDate`" | ❌ alan-alan karşılaştırma yok |
| **C · Durum geçişi** | "Onaylanmış talep değiştirilemez" | ❌ (G-02, G-03) |
| **D · Alt kayıt toplamı (rollup)** | "Toplam = kalemler toplamı" | ❌ (G-05) |
| **E · Çapraz-belge** | "Fatura ≤ irsaliye" | ❌ (G-02) |
| **F · Referansın durumu** | "Pasif tedarikçiye sipariş açılamaz" | ❌ (G-02) |
| **G · Tekillik** | "Aynı vergi no iki kez girilemez" | ❌ (G-01) |

---

# Satın Alma Talebi

### BR-01 · Onaylanmış talep değiştirilemez
`Status = Approved` olan bir `PurchaseRequest` ve kalemleri düzenlenemez. Onay, o anki içeriğe
verilmiştir; sonradan değişirse onayın anlamı kalmaz.

**Sınıf C** · ❌ **G-02 + G-03.** Platformda kayıt kilitleme yok; `PublishedModelManager.Update`
durum kontrolü yapmıyor. Üstelik `Status`'u motor yazamadığı için (G-03) alan zaten elle
yönetiliyor. Bu, listedeki **en kritik karşılanamayan kural**.

### BR-02 · Reddedilen talep yeniden onaya gönderilemez
Yeni bir talep açılmalı. Gerekçe: red kararının izi korunmalı.

**Sınıf C** · ❌ G-02. Kullanıcı `Status`'u `Rejected`'dan `Submitted`'a çevirebilir ve akış yeniden
başlar (instance terminal olduğu için `GetActiveForEntity` engellemez).

### BR-03 · İptal edilen talep tekrar aktifleştirilemez
**Sınıf C** · ❌ G-02.

### BR-04 · Talepte en az bir kalem olmalı
Kalemsiz talep anlamsızdır ve tutarı sıfırdır.

**Sınıf D** · ❌ G-02. `addTree` alt düğüm sayısını doğrulamıyor. Boş talep kaydedilir.

### BR-05 · `RequiredDate >= RequestDate`
İhtiyaç tarihi geçmişte olamaz.

**Sınıf B** · ❌ G-02. Koşul dili alanı **sabit değerle** karşılaştırıyor, başka bir alanla değil.

### BR-06 · Sipariş yalnız onaylı talep veya onaylı teklif üzerinden açılır
Kontrolsüz harcamanın ana kapısı budur.

**Sınıf F** · ❌ G-02. Lookup hedefin `Status`'una bakmaz — `Draft` bir talebe sipariş bağlanabilir.

### BR-07 · Talep tutarı kalemler toplamına eşit olmalı
**Sınıf D** · ❌ **G-05.** Üstelik bu alan onay kademesini belirlediği için (BR-31) güvenlik sonucu da var.

### BR-08 · RFQ yalnız onaylı talepten türetilir
**Sınıf F** · ❌ G-02.

---

# Tedarikçi

### BR-09 · Bir talepten en fazla bir RFQ
Aynı ihtiyaç için iki paralel teklif süreci, tedarikçilerde güven kaybı yaratır.

**Sınıf G** · ✅ **KARŞILANIYOR.** R5 ilişkisi `OneToOne` olduğu için platform `UNIQUE INDEX`
üretiyor (`RelationshipMigrationGenerator.cs:120-128`). Listedeki **tek tam karşılanan tekillik
kuralı** — ve platformun UNIQUE ürettiği tek durum.

### BR-10 · Tedarikçi vergi numarası tekil olmalı
Aynı tedarikçinin iki kez kaydı, harcama raporlarını ve ödeme takibini bozar.

**Sınıf G** · ❌ **G-01.** `IsUnique` kavramı yok.

### BR-11 · `Draft` tedarikçiye RFQ gönderilemez, sipariş açılamaz
**Sınıf F** · ❌ G-02.

### BR-12 · Onaya gönderilen tedarikçide zorunlu belgeler yüklü olmalı
En az vergi levhası ve ticaret sicil gazetesi.

**Sınıf D** · ❌ G-02. Alt kayıt varlığı/tipi doğrulanamaz.

### BR-13 · Blacklist'teki tedarikçiye sipariş açılamaz
**Sınıf F** · ❌ G-02. Bu, kuralların **iş riski en yüksek** olanı: kara listeye alınmış bir
tedarikçiyle çalışmaya devam etmek, kara listenin kendisini anlamsız kılar.

### BR-14 · Pasif/askıdaki tedarikçiye RFQ gönderilemez
**Sınıf F** · ❌ G-02.

### BR-15 · Blacklist gerekçesi zorunlu
**Sınıf B** (koşullu zorunluluk) · ⚠️ **Kısmen.** `BlacklistReason` alanı `IsRequired = true`
yapılabilir ama o zaman **her tedarikçide** zorunlu olur. "Yalnız `Status = Blacklisted` ise zorunlu"
ifade edilemez — koşullu zorunluluk yok.

**Ara çözüm:** Alan opsiyonel bırakılır, zorunluluk `SUPPLIER-BLACKLIST` workflow adımının
**form alanında** zorunlu yapılır. Workflow form şeması `isRequired` destekliyor. ✅ **Bu bir
çözüm** ve platformun workflow formlarının nasıl kural kapısı olarak kullanılabileceğini gösteriyor.

### BR-16 · Tedarikçi puanı 0-5 arası
**Sınıf A** · ✅ `Min = 0`, `Max = 5`.

---

# Teklif

### BR-17 · Geçerliliği dolmuş teklif seçilemez
**Sınıf B + C** · ❌ G-02, G-04.

### BR-18 · Karşılaştırma ağırlıkları toplamı 100 olmalı
**Sınıf B** · ❌ G-02. Beş alanın toplamı doğrulanamaz. ⚠️ Özel karşılaştırma ekranı bunu
istemcide kontrol edecek — ama API doğrudan çağrılırsa geçer.

### BR-19 · Tedarikçi seçim gerekçesi zorunlu (min 10 karakter)
Rekabet denetiminin temel gereği.

**Sınıf A** · ✅ `IsRequired` + `MinLength = 10`. Listedeki nadir ✅'lerden.

### BR-20 · En az 3 teklif toplanmadan seçim yapılamaz (istisna: tek kaynak)
**Sınıf D** · ❌ G-02. `Method = SoleSource` istisnası da koşullu kural gerektirir.

---

# Sipariş ve Teslimat

### BR-21 · Sipariş miktarı teklif miktarını aşamaz
**Sınıf E** · ❌ G-02.

### BR-22 · Teslimat başlamış sipariş iptal edilemez
En az bir `GoodsReceipt` varsa `Cancelled` yasak.

**Sınıf E + C** · ❌ G-02.

### BR-23 · Mal kabul miktarı kalan miktarı aşamaz
100 adetlik siparişe 150 adet kabul edilemez.

**Sınıf E** · ❌ G-02. ⚠️ Üstelik "kalan miktar" da hesaplanmıyor (G-05) — kural iki kat engelli.

### BR-24 · `AcceptedQuantity <= ReceivedQuantity`
**Sınıf B** · ❌ G-02. Aynı kayıttaki iki alan bile karşılaştırılamıyor.

### BR-25 · `RejectedQuantity = ReceivedQuantity − AcceptedQuantity`
**Sınıf B/D** · ❌ G-05.

### BR-26 · Sipariş tüm kalemler teslim alınmadan `Delivered` olamaz
**Sınıf D** · ❌ G-02 + G-05.

---

# Fatura ve Ödeme

### BR-27 · Fatura miktarı teslim alınan miktarı aşamaz (3-way matching)
100 sipariş · 80 teslim · 100 fatura → `Exception`.

**Sınıf E** · ❌ **G-02.** Bu, modülün varlık sebebi ve karşılanmıyor.

### BR-28 · Fatura birim fiyatı sipariş fiyatını aşamaz (tolerans %0)
**Sınıf E** · ❌ G-02.

### BR-29 · İrsaliyesiz faturaya ödeme yapılamaz
**Sınıf E** · ❌ G-02.

### BR-30 · Aynı tedarikçiden aynı fatura numarası iki kez girilemez
Çift ödemenin en yaygın sebebi.

**Sınıf G** · ❌ **G-01.** Bileşik unique (`SupplierId`, `InvoiceNumber`) gerekir; platform tekil
unique bile desteklemiyor.

### BR-31 · Ödeme yapılmış fatura silinemez
**Sınıf E + C** · ❌ G-02. Soft-delete olduğu için veri kaybolmaz ama fatura listeden düşer ve
ödeme yetim kalır.

### BR-32 · Ödeme dağıtımı toplamı ödeme tutarına eşit olmalı
**Sınıf D** · ❌ G-02.

---

# Bütçe

### BR-33 · Bütçe yetersizse onay istisnası oluşur
Talep tutarı `Budget.AvailableAmount`'ı aşarsa engellenmez ama **üst kademe onayına** çıkar ve
`BudgetCheckResult = Insufficient` yazılır.

**Sınıf E** · ❌ G-02.

> ⚠️ Kuralın **workflow tarafı kurulabilir**: `PR-ONAY-BUDGET` adında beşinci bir tanım, tetikleyici
> koşulu `BudgetCheckResult eq Insufficient`, ve genel müdür onayına giden bir zincir. Ama
> `BudgetCheckResult` alanının **doğru doldurulması** platformda sağlanamıyor. Yani akış hazır,
> tetikleyicisi güvenilmez.

### BR-34 · Onaylanan sipariş bütçeye taahhüt yazar
**Sınıf E** · ❌ G-02.

---

## Özet

| Sınıf | Kural sayısı | ✅ | ⚠️ | ❌ |
|---|---|---|---|---|
| A · Alan içi | 2 | 2 | 0 | 0 |
| B · Alanlar arası | 6 | 0 | 1 | 5 |
| C · Durum geçişi | 5 | 0 | 0 | 5 |
| D · Rollup | 7 | 0 | 0 | 7 |
| E · Çapraz-belge | 10 | 0 | 0 | 10 |
| F · Referans durumu | 5 | 0 | 0 | 5 |
| G · Tekillik | 3 | 1 | 0 | 2 |
| **Toplam** | **34** | **3** | **1** | **30** |

> **34 iş kuralının 3'ü karşılanıyor.** Bu, blueprint'in en çarpıcı sayısıdır ve G-02'nin neden
> backlog'un tepesinde olduğunu tek başına açıklıyor.
>
> Karşılanan üçü de tesadüfi değil: BR-16 ve BR-19 **alan içi** kurallar (platformun tek güçlü
> olduğu sınıf), BR-09 ise `OneToOne` ilişkisinin yan ürünü.

---

## G-02 çözülürse ne olur

`BusinessRule` motoru (kaydetme yoluna takılan `WorkflowCondition` değerlendiricisi) eklenirse:

| Sınıf | Açılır mı | Not |
|---|---|---|
| **B · Alanlar arası** | ✅ 6/6 | Değerlendiriciye **alan-alan karşılaştırma** eklenmeli (`value` yerine `fieldRef`) |
| **C · Durum geçişi** | ✅ 5/5 | "Eski değer" erişimi gerekir — `SaveChangesInterceptor` zaten `OldValues` topluyor |
| **F · Referans durumu** | ✅ 5/5 | Değerlendiriciye **lookup hedefini okuma** eklenmeli |
| **D · Rollup** | ⚠️ 7/7 ama G-05 de gerekir | "Alt kayıtların toplamı" erişimcisi |
| **E · Çapraz-belge** | ⚠️ 10/10 ama çapraz-model okuma gerekir | En zor sınıf |
| **G · Tekillik** | ❌ | G-01'in işi, G-02'nin değil |

**Kademeli plan:**

| Aşama | Kapsam | Açılan kural | Maliyet |
|---|---|---|---|
| 1 | Kaydetmede koşul + alan-alan karşılaştırma + eski değer | **11** (B + C) | ~1 hafta |
| 2 | Lookup hedefini okuma | **+5** (F) | ~3 gün |
| 3 | Alt kayıt toplamı erişimcisi (G-05 ile birlikte) | **+7** (D) | ~1 hafta |
| 4 | Çapraz-model okuma (3-way matching) | **+10** (E) | ~2 hafta |
| — | `IsUnique` (G-01) | **+2** (G) | ~3 gün |

İlk aşama tek başına **34 kuralın 11'ini** açıyor ve mevcut, test edilmiş bir bileşenin yeniden
kullanımından ibaret.

---

## Bugünkü gerçeklik

Kurallar uygulanamadığına göre, bu sistem bugün nasıl çalışır?

| Mekanizma | Kapsadığı |
|---|---|
| **Alan doğrulama** | Zorunluluk, format, aralık — 2 kural |
| **Workflow form alanları** | Onay adımında zorunlu kutular ("Bütçe kontrol edildi ✔") — ⚠️ beyan, doğrulama değil |
| **Onay zinciri** | İnsan denetimi — kuralın yerine **insan** konuyor |
| **Denetim kaydı** | İhlal önlenmiyor ama **izleniyor** |
| **Eğitim ve prosedür** | Geri kalan her şey |

> **Sonuç:** Sistem, kuralları **uygulamıyor**; ihlalleri **kaydediyor**. Bu, denetlenebilir ama
> önleyici olmayan bir kontrol ortamıdır. Küçük bir şirkette kabul edilebilir; SOX/ISO denetimine
> giren bir şirkette **bulgu üretir**.
>
> Blueprint'in ana tavsiyesi bu yüzden G-02'dir.
