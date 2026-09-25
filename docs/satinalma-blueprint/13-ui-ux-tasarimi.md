# 13 · UI / UX Tasarımı

Bu bölüm istenen çıktının **(25) UI Sayfaları**, **(26) Detail Page Tasarımı**, **(20) Dashboard** ve
**(21) Raporlama** başlıklarını kapsar.

---

## Dinamik UI'ın gerçek yetenekleri

Tasarım bu tabloya göre şekillendi. Her satır kod okumasıyla doğrulandı.

### Liste ekranı (`model-data`)

| Yetenek | Durum |
|---|---|
| Sunucu taraflı sayfalama (20/50/100) | ✅ |
| Kayan sayfa butonları + ellipsis | ✅ |
| Kolon seçimi/gizleme | ✅ ama **yalnız admin, tenant genelinde global** |
| Toplu silme | ⚠️ N ayrı HTTP isteği; seçim sayfalar arası taşınmaz |
| `WorkflowStatus` kolonu (dolu satır varsa) | ✅ otomatik |
| **Arama** | ❌ **Yok** |
| **Sütun filtreleme** | ❌ **Yok** |
| **Sıralama** | ❌ **Yok** |
| **Export** | ❌ **Yok** (yalnız rapor motorunda) |
| Toplu güncelleme / toplu onay | ❌ Yok |
| Özel satır aksiyonu | ❌ Yok |

> ❌ **Bu, uygulamanın en büyük kullanılabilirlik sorunu.** 3.000 tedarikçi arasından birini bulmak
> için kullanıcı sayfa sayfa gezmek zorunda. İlginç olan: aynı projenin **alt model sekmesi**
> (`model-detail`) arama ve sıralama yapıyor (istemci tarafında) — ama ana liste ekranı yapmıyor.
> Yani yetenek projede mevcut, ana ekrana bağlanmamış.

### Detay / form ekranı (`model-detail`)

| Yetenek | Durum |
|---|---|
| Tip → kontrol eşlemesi (13 tip) | ✅ |
| `lookup` → arama kutulu combobox (sunucu araması, sonsuz kaydırma, ARIA) | ✅ **çok iyi** |
| Doğrulayıcılar backend şemasından türer | ✅ `required`, `minLength`, `maxLength`, `pattern`, `min`, `max` |
| Regex hatasında kolonun kendi mesajı | ✅ |
| Alt modeller sekme + inline grid + pop-up form | ✅ |
| Alt sekmede arama ve sıralama (istemci) | ✅ |
| Ağaç tek transaction'da kaydedilir (`addTree`) | ✅ |
| Dosya yükleme | ⚠️ base64, **tek dosya**, boyut sınırı yok, sürükle-bırak yok |
| **Çok satırlı metin (textarea)** | ❌ **Yok** — uzun açıklama tek satır input |
| **Alt sekmede sayfalama** | ❌ **Yok** — 5.000 kalem tek seferde gelir |
| **Alan gruplama / fieldset** | ❌ Yok — tüm alanlar düz akar |
| **Koşullu alan görünürlüğü** | ❌ Yok |
| **Yorum / not** | ❌ Yok |
| **Kayıt geçmişi (audit)** | ❌ Yok |
| Süreç paneli (`workflow-panel`) | ✅ açık instance'lar + elle başlatılabilir akışlar |

### Raporlama

| Yetenek | Durum |
|---|---|
| Tek modelden sorgu | ✅ |
| **JOIN / ilişkili model kolonu** | ❌ **Yok** — `ReportingManager.cs:395-396` |
| Filtre operatörleri | ⚠️ 8 tane: `eq ne gt ge lt le contains startswith` |
| Filtre gruplama | ❌ **AND-only**, OR/parantez yok |
| **Parametreli filtre** (çalışma anında değer) | ❌ **Yok** — değer kayıtlı sabit |
| Gruplama | ✅ çoklu kolon |
| Aggregate | ✅ `SUM COUNT AVG MIN MAX` |
| `HAVING` | ❌ Yok |
| Sıralama | ✅ çoklu alan |
| **Hesaplanan kolon / ifade** | ❌ Yok |
| **Göreli tarih** (son 30 gün) | ❌ Yok — sabit tarih |
| `TOP N` / limit | ❌ Yok |
| Grafik tipleri | ✅ 9: `table column bar line area pie donut radialBar kpi` |
| Export | ✅ Excel + PDF ⚠️ Excel'de **tüm hücreler metin** — sayı/tarih tipi kaybolur |
| SQL önizleme | ✅ kaydetmeden üretilecek SQL gösterilir — **nadir ve değerli bir özellik** |
| Zamanlanmış e-posta gönderimi | ❌ Yok |

⚠️ **Sessiz tuzak:** Backend `SUM`/`AVG` için yalnız `int|float|decimal` kabul ediyor
(`ReportingManager.cs:550`) ama UI aggregate alan seçicisi **tüm kolonları** listeliyor. `long` veya
`double` bir kolonda `SUM` seçilirse hata **ancak Kaydet'e basınca** görülür. UI'da `isNumericColumn()`
yardımcısı yazılmış ama şablonda hiç kullanılmamış (ölü kod).

⚠️ **Rapor kolon kümesi asimetrik:** UI `DeclaredProperties`'i gösteriyor (`CreatedOn`, `CreatedBy`
**seçilemez**), backend `GetProperties()` kabul ediyor (kalıtım dahil). Yani "kaydı kim/ne zaman
oluşturdu" raporu **UI'dan yapılamaz**, ama API doğrudan çağrılırsa çalışır.

### Dashboard

| Yetenek | Durum |
|---|---|
| 12 kolonluk grid, sürükle-taşı + yeniden boyutlandır | ✅ native Pointer Events |
| Widget = rapor tanımı + grafik tipi override | ✅ |
| Sol menüde gösterme (`showInNav`, admin) | ✅ |
| Yetkisiz rapora bakan widget sessizce atlanır | ✅ güvenli |
| Performans: rapor+tavan tekilleştirme + paralel çalıştırma | ✅ |
| **Düzenleme** | ❌ **Yok** — `update` ucu backend/servis/route/component **hiçbirinde** yok |
| **Dashboard filtresi** (tüm widget'ları etkileyen) | ❌ Yok |
| **Otomatik yenileme** | ❌ Yok |
| Bağımsız sorgu widget'ı | ❌ Yok — widget her zaman bir rapora bağlı |
| Metin/markdown/iframe widget'ı | ❌ Yok |
| Çakışma (collision) mantığı | ❌ Yok — widget'lar üst üste binebilir |
| Responsive kırılma | ❌ Yok — mobilde 12 kolon zorlanır |
| Sahiplik / paylaşım | ❌ Yok — tenant içinde **herkes tüm dashboard'ları görür** |

> ❌ **Dashboard düzenlenemiyor.** Bir widget eklemek için dashboard'u **sıfırdan kurmak** gerekiyor.
> Ayrıca `dashboard-list` ve `report-list` ekranlarında **silme butonu yok** — buna rağmen
> `/dashboard/deleted` ve `/reports/deleted` geri-yükleme ekranları var. Ulaşılamayan bir çöp kutusu.

---

## Ekran envanteri (28 ekran)

### Dinamik ekranlardan gelenler (24) — kod yazılmaz

Her yayınlanmış model otomatik olarak üç ekran kazanır: liste (`/models/:typeName`), yeni kayıt
(`/models/:typeName/new`), detay (`/models/:typeName/:id`).

| # | Ekran | Model | Erişim |
|---|---|---|---|
| 1 | Tedarikçiler | `Supplier` | Purchasing, Finance, Warehouse (R) |
| 2 | Tedarikçi Kategorileri | `SupplierCategory` | Purchasing |
| 3 | Ürünler | `Product` | Herkes (R) |
| 4 | Ürün Kategorileri | `ProductCategory` | Purchasing |
| 5 | Birimler | `Unit` | Purchasing |
| 6 | Markalar | `Brand` | Purchasing |
| 7 | Ürün-Tedarikçi | `ProductSupplier` | Purchasing |
| 8 | Fiyat Listeleri | `PriceList` | Purchasing, Finance (R) |
| 9 | Satın Alma Talepleri | `PurchaseRequest` | Herkes (kendi) |
| 10 | RFQ | `Rfq` | Purchasing |
| 11 | Tedarikçi Teklifleri | `SupplierQuotation` | Purchasing |
| 12 | Teklif Karşılaştırmaları | `QuotationComparison` | Purchasing |
| 13 | Satın Alma Siparişleri | `PurchaseOrder` | Purchasing, Finance, Warehouse (R) |
| 14 | Mal Kabuller | `GoodsReceipt` | Warehouse, Purchasing (R) |
| 15 | Tedarikçi Faturaları | `SupplierInvoice` | Finance |
| 16 | Ödemeler | `Payment` | Finance |
| 17 | Bütçeler | `Budget` | Finance, Dept.Mgr (R) |
| 18 | Bütçe Dönemleri | `BudgetPeriod` | Finance |
| 19 | Bütçe Hareketleri | `BudgetTransaction` | Finance |
| 20 | Şirketler / Şubeler | `Company`, `Branch` | Admin |
| 21 | Departmanlar | `Department` | Admin |
| 22 | Masraf Merkezleri | `CostCenter` | Admin, Finance |
| 23 | Çalışanlar / Pozisyonlar | `Employee`, `Position` | Admin |
| 24 | Şirket Araçları | `CompanyVehicle` | Admin, Dept.Mgr |

### Platform ekranları (3) — hazır gelir

| # | Ekran | Rota |
|---|---|---|
| 25 | Görevlerim (onay gelen kutusu) | `/tasks`, `/tasks/:id` |
| 26 | Raporlar | `/reports`, `/reports/new`, `/reports/:id` |
| 27 | Dashboard | `/dashboard`, `/dashboard/:id` |

Ayrıca admin ekranları: `/build`, `/workflows`, `/users`, `/roles`, `/permissions`, `/audit-logs`,
`/parameters`, `/models/deleted`, `/drafts`.

### ❌ Yazılması gereken özel ekran (1)

| # | Ekran | Neden dinamik UI yetmiyor |
|---|---|---|
| 28 | **Teklif Karşılaştırma Matrisi** | 8 ayrı engel — aşağıda |

---

## Özel ekran: Teklif Karşılaştırma Matrisi

Bu, blueprint'in **kod yazmak zorunda kaldığı tek UI ekranı**. Gerekçe tek bir eksik değil, sekiz
bağımsız engelin üst üste gelmesi:

| # | Engel | Kanıt |
|---|---|---|
| 1 | **Çapraz-model veri yok** — teklif + kalem + tedarikçi + geçmiş fiyat bir arada okunamıyor | `ReportingManager.cs:395-396` |
| 2 | **Pivot / matris görünümü yok** — rapor çıktısı düz satır listesi | `BuildProjection:445-497` |
| 3 | **Hesaplanan kolon yok** — "fark %", "en düşük teklif" türetilemez | G-05 |
| 4 | **Koşullu hücre biçimlendirme yok** — hücreler düz interpolasyon, renk/ikon/rozet kuralı yok | `report-viewer.component.html:75` |
| 5 | **Grid'de "seçilenleri karşılaştır" aksiyonu yok** — checkbox'lar yalnız toplu silmeye bağlı | `model-data.component.ts:350` |
| 6 | **Rapor parametresi yok** — "şu 3 teklifi karşılaştır" girdisi alınamaz | G-07 |
| 7 | **Özel aksiyon/buton enjeksiyonu yok** — toolbar'lar sabit | — |
| 8 | **Widget tipi genişletilemez** | — |

### Tasarım

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  RFQ-2026-0042 · Dizüstü Bilgisayar Alımı          [Ağırlıkları Düzenle]     │
│  20 adet · İhtiyaç: 15.10.2026 · 3 teklif toplandı                            │
├──────────────────────────────────────────────────────────────────────────────┤
│  Ağırlıklar:  Fiyat %40 · Teslimat %20 · Ödeme %15 · Garanti %10 · Puan %15  │
├──────────────┬───────────────┬───────────────┬───────────────────────────────┤
│  Kriter      │  Tedarikçi A  │  Tedarikçi B  │  Tedarikçi C                  │
├──────────────┼───────────────┼───────────────┼───────────────────────────────┤
│  Birim Fiyat │  2.500,00 ₺   │  2.350,00 ₺ ▼ │  2.650,00 ₺                   │
│  Toplam      │  50.000,00 ₺  │  47.000,00 ₺ ▼│  53.000,00 ₺                  │
│  İskonto     │  %0           │  %2           │  %5                           │
│  KDV         │  %20          │  %20          │  %20                          │
│  Teslimat    │  14 gün       │  21 gün       │  7 gün ▼                      │
│  Ödeme Vadesi│  30 gün       │  60 gün ▼     │  15 gün                       │
│  Garanti     │  24 ay        │  24 ay        │  36 ay ▼                      │
│  Ted. Puanı  │  4,2 / 5      │  3,8 / 5      │  4,6 / 5 ▼                    │
│  Önceki Fiyat│  2.600,00 ₺   │  —            │  2.700,00 ₺                   │
├──────────────┼───────────────┼───────────────┼───────────────────────────────┤
│  PUAN        │  78,4         │  81,2  🏆     │  74,9                         │
│  SIRA        │  2            │  1            │  3                            │
├──────────────┴───────────────┴───────────────┴───────────────────────────────┤
│  Seçim: ( ) A    (•) B    ( ) C                                               │
│  Gerekçe: [ En yüksek ağırlıklı puan ve en uygun ödeme vadesi.            ]  │
│                                          [İptal]  [Seç ve Onaya Gönder]      │
└──────────────────────────────────────────────────────────────────────────────┘
```

`▼` = o kriterde en iyi · `🏆` = sistem önerisi

> **Kritik tasarım kuralı: sistem önerir, kullanıcı karar verir.** `🏆` yalnızca bir işaret;
> seçim radio butonuyla kullanıcı tarafından yapılır ve `SelectionReason` **zorunludur**. Sistemin
> otomatik seçmesi, denetim açısından savunulamaz bir karar olurdu.

**Teknik:** yeni standalone component (`components/quotation-comparison/`) + route
(`/rfqs/:id/compare`) + servis + i18n anahtarları + backend ucu
(`POST /api/procurement/v1/quotation-comparison/{rfqId}`). Tasarım sistemi (`corelogic-design`
token'ları), `TranslatePipe` ve `ResponseModel` deseni hazır — **maliyetli ama öngörülebilir**:
~4 gün UI + ~3 gün backend.

---

## Detay sayfa anatomisi

İstenen enterprise detay sayfası yapısı ile dinamik UI'ın verdiği yapının karşılaştırması.

### Hedef: `PurchaseRequest` detayı

```
┌────────────────────────────────────────────────────────────────────────┐
│  TALEP  PR-2026-0001            [Onaylandı]  [Yüksek Öncelik]          │
│  Ahmet Yılmaz · Bilgi Teknolojileri · CC-IT-001 · 47.000,00 ₺          │
│                    [Düzenle] [Onaya Gönder] [İptal] [RFQ Oluştur]      │
├────────────────────────────────────────────────────────────────────────┤
│ ( Genel ) ( Kalemler ) ( Onaylar ) ( Ekler ) ( Yorumlar ) ( Geçmiş )   │
├────────────────────────────────────────────────────────────────────────┤
│  …sekme içeriği…                                                        │
├────────────────────────────────────────────────────────────────────────┤
│  İLİŞKİLİ KAYITLAR                                                      │
│  RFQ-2026-0042 · PO-2026-0018 · INV-2026-0091 · PAY-2026-0033          │
└────────────────────────────────────────────────────────────────────────┘
```

### Platformun verdiği ile fark

| Bölüm | Hedef | Bugün |
|---|---|---|
| **Başlık şeridi** | Numara, durum rozeti, öncelik, sahip, departman, tutar | ⚠️ `.page-header` tek satır: `eyebrow` + model adı. **Özel başlık şeridi yok** — alanlar formun içinde sıradan alanlar olarak çıkar |
| **Durum rozeti** | Renkli badge | ⚠️ `WorkflowStatus` kolonu listede var; detayda süreç panelinde. `Status` alanı düz metin |
| **Aksiyon butonları** | Düzenle / Onaya Gönder / İptal / RFQ Oluştur | ❌ **Yok.** Toolbar sabit. "Onaya Gönder" = `Status` alanını elle değiştirip Kaydet |
| **Genel sekmesi** | Ana alanlar | ⚠️ Var ama **sekme değil**, üstte düz panel; alan gruplama yok |
| **Kalemler sekmesi** | Inline grid + pop-up | ✅ **Tam karşılanıyor** — arama, sıralama, toplu silme, özyinelemeli form |
| **Onaylar sekmesi** | Onay geçmişi | ⚠️ `PurchaseRequestApproval` alt modeli olarak çıkar; ayrıca süreç paneli var |
| **Ekler sekmesi** | Çoklu dosya | ⚠️ `PurchaseRequestAttachment` alt modeli; her satır tek dosya |
| **Yorumlar sekmesi** | Not, @mention, aktivite akışı | ❌ **Yok** — platformda kayıt bazlı yorum kavramı yok |
| **Geçmiş sekmesi** | Audit izi | ❌ **Yok** ([11](11-audit.md) A2) |
| **İlişkili kayıtlar** | RFQ, PO, fatura, ödeme linkleri | ❌ **Yok** — ters yönde lookup taraması gerekir (çapraz-model, G-07) |

> **Okuma:** İstenen 12 bölümün **3'ü tam**, **5'i kısmen**, **4'ü hiç** karşılanıyor. Dinamik detay
> ekranı bir *veri formu* olarak iyi, bir *belge ekranı* olarak eksik. En çok hissedilen üç eksik:
> aksiyon butonları, geçmiş sekmesi ve ilişkili kayıtlar.

### Aksiyon butonları — en kritik eksik

Bir satın alma sisteminde kullanıcı "Onaya Gönder" butonuna basar; `Status` açılır listesini
`Submitted` yapıp Kaydet'e basmaz. İkincisi:

- Keşfedilebilir değil — kullanıcı hangi geçişin mümkün olduğunu bilmez
- Doğrulanmıyor — `Draft`'tan `Completed`'a atlanabilir
- Denetimde ayırt edilemiyor — `Modified` olarak görünür ([11](11-audit.md))

**Platform önerisi:** `PublishedTableAction` — model metadata'sına bağlı, koşullu görünür
(`WorkflowCondition` ile), bir alan yazan veya workflow başlatan buton tanımı. G-02 ve G-03 ile aynı
altyapıyı paylaşır. Backlog'a **G-12** olarak eklendi.

---

## Dashboard tasarımı

### D1 · Ana Dashboard (Yönetim)

| Widget | Rapor | Grafik | Durum |
|---|---|---|---|
| Toplam Satın Alma Tutarı (bu yıl) | `PurchaseOrder` · `SUM(GrandTotalTry)` | `kpi` | ⚠️ tarih filtresi **sabit** — her yıl elle güncellenmeli |
| Bekleyen Talepler | `PurchaseRequest` · `COUNT`, filtre `Status eq Submitted` | `kpi` | ✅ |
| Bekleyen Onaylar | `WorkflowTask` | — | ❌ **sistem tablosu, raporlanamaz** |
| Açık RFQ'lar | `Rfq` · `COUNT`, `Status eq Collecting` | `kpi` | ✅ |
| Aktif Tedarikçiler | `Supplier` · `COUNT`, `Status eq Active` | `kpi` | ✅ |
| Bekleyen Teslimatlar | `PurchaseOrder` · `COUNT`, `Status eq SentToSupplier` | `kpi` | ✅ |
| Ödenmemiş Faturalar | `SupplierInvoice` · `SUM(GrandTotalTry)`, `Status ne Paid` | `kpi` | ✅ |
| Gecikmiş Faturalar | `SupplierInvoice` · `DueDate lt <bugün>` | `kpi` | ❌ **göreli tarih yok** — sabit tarih her gün eskir |
| Bütçe Kullanımı | `Budget` · `SUM(ActualAmount)` / `SUM(PlannedAmount)` | — | ❌ **oran hesaplanamaz** (G-05) |
| Aylık Harcama Trendi | `PurchaseOrder` · grup `OrderDate`, `SUM` | `line` | ⚠️ aya göre gruplama yok — **gün bazında** gruplanır |
| Kategori Dağılımı | `PurchaseOrder` — ❌ kategori `PurchaseOrderItem`'da | — | ❌ çapraz-model |
| Departman Dağılımı | `PurchaseOrder` · grup `DepartmentName`, `SUM` | `donut` | ✅ denormalize ad sayesinde |

**9 widget'ın 5'i çalışıyor, 4'ü çalışmıyor.**

> ❌ **"Gecikmiş Faturalar" widget'ı göreli tarih olmadığı için kullanılamaz.** Filtre değeri
> `DateTime.Parse` ile **sabit bir tarihe** çevriliyor; `@today` gibi bir token yok. Rapor yarın da
> aynı tarihi gösterir. Bu, bir dashboard için öldürücü bir eksik — **G-07'nin en çok hissedilen
> parçası** ve muhtemelen en ucuz düzeltmesi (`@today`, `@monthStart`, `@yearStart` token'ları).

### D2 · Departman Dashboard'u

Aynı widget'lar, `DepartmentName eq "Bilgi Teknolojileri"` filtresiyle.

> ❌ **Her departman için ayrı dashboard + ayrı rapor seti gerekir.** Dashboard filtresi yok, rapor
> parametresi yok. 15 departman × 6 widget = **90 rapor tanımı**. Teknik olarak mümkün, operasyonel
> olarak saçma.
>
> ⚠️ Ayrıca dashboard'lar tenant içinde **herkese açık** — IT müdürü Pazarlama'nın bütçesini görür.

### D3 · Finans Dashboard'u

Ödeme takvimi, vade dağılımı, uyuşmazlık sayısı, nakit çıkış projeksiyonu.

⚠️ Vade dağılımı (0-30 / 31-60 / 61-90 gün) **kova (bucket) hesabı** gerektiriyor — hesaplanan kolon
yok (G-05). Her kova için ayrı rapor tanımı gerekir.

---

## Rapor kataloğu (12)

| # | Rapor | Model | Durum |
|---|---|---|---|
| 1 | Aylık Satın Alma | `PurchaseOrder` · grup `OrderDate`, `SUM` | ⚠️ **gün bazında** gruplanır — aya göre gruplama yok |
| 2 | Departman Harcaması | `PurchaseOrder` · grup `DepartmentName` | ✅ |
| 3 | Kategori Harcaması | `PurchaseOrderItem` — kategori orada yok | ❌ çapraz-model (G-07) |
| 4 | Tedarikçi Performansı | `SupplierRating` + `GoodsReceipt` + `PurchaseOrder` | ❌ **3 model** (G-07) |
| 5 | Bütçe vs Gerçekleşen | `Budget` · `PlannedAmount` vs `ActualAmount` | ❌ oran/fark hesaplanamaz (G-05) |
| 6 | Talep Yaşlandırma | `PurchaseRequest` · bugün − `RequestDate` | ❌ tarih aritmetiği yok |
| 7 | Fatura Yaşlandırma | `SupplierInvoice` · vade kovaları | ❌ kova hesabı yok |
| 8 | Teslimat Performansı | `GoodsReceipt` vs `PurchaseOrder.ExpectedDeliveryDate` | ❌ çapraz-model |
| 9 | Fiyat Değişim Analizi | `PurchaseOrderItem` zaman serisi | ❌ pencere fonksiyonu yok |
| 10 | En Çok Çalışılan Tedarikçiler | `PurchaseOrder` · grup `SupplierName`, `SUM`, sırala | ⚠️ **TOP N yok** — tüm liste döner |
| 11 | Açık Siparişler | `PurchaseOrder` · `Status eq SentToSupplier` | ✅ |
| 12 | Onay Süreleri | `PurchaseRequestApproval` · `DecisionDate` − `CreatedOn` | ❌ tarih farkı hesaplanamaz |

**12 raporun 2'si tam çalışıyor, 2'si bedelli, 8'i çalışmıyor.** Raporlama, kapsam oranı en düşük
alan (%40) ve G-07 backlog'un en pahalı kalemi (●●●●).

### Filtreleme tasarımı

Rapor parametresi olmadığı için filtreler **tanım anında sabitlenir**. Bunun sonucu:

| İhtiyaç | Bugünkü karşılık |
|---|---|
| "Son 30 gün" | ⚠️ Sabit tarih aralığı — her ay elle güncellenir |
| "Bu departman" | ⚠️ Departman başına ayrı rapor tanımı |
| "Şu tedarikçi" | ⚠️ Tedarikçi başına ayrı rapor — pratik değil |
| "Tutar > X" | ✅ Sabit eşik yeterli |
| "Durum = Y" | ✅ |

> **En ucuz iyileştirme:** göreli tarih token'ları (`@today`, `@monthStart`, `@yearStart`,
> `@daysAgo(30)`). `ConvertValue` (`ReportingManager.cs:523-543`) içinde bir `switch` — muhtemelen
> yarım günlük iş ve 6 raporu birden kurtarıyor.

---

## Gezinme (sidebar)

`Navigation` izin biti (`PermissionAction.Navigation = 16`) sol menü görünürlüğünü `Read`'den
**bağımsız** kontrol eder. Bu, 50 modelin hepsini menüye doldurmamak için önemli.

```
Satın Alma        Talepler · RFQ · Teklifler · Karşılaştırmalar · Siparişler
Tedarik           Tedarikçiler · Kategoriler · Değerlendirmeler
Katalog           Ürünler · Kategoriler · Fiyat Listeleri · Birimler · Markalar
Depo              Mal Kabuller
Finans            Faturalar · Ödemeler · Bütçeler · Bütçe Hareketleri
Analiz            Dashboard'lar · Raporlar
Görevlerim        (rozet: bekleyen onay sayısı)
Yönetim           Organizasyon · Kullanıcılar · Roller · İzinler · Denetim · Modeller · Süreçler
```

⚠️ **Menü grupları platformda tanımlanamaz.** Sidebar, `Navigation` izni olan modelleri düz liste
olarak gösterir. Yukarıdaki gruplama **hedeftir**, bugünkü gerçek değil — 50 model düz bir liste
olarak çıkar ve kullanılamaz hale gelir.

> Bu, listeye eklenmesi gereken küçük ama gerçek bir eksik: `PublishedTable.MenuGroup` +
> `DisplayOrder`. Backlog'da **G-13**.
