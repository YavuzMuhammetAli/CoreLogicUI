# 02 · Modüller

Sistem 13 modülden oluşur. Modül sınırları **veri sahipliğine** göre çizildi: bir entity tam olarak
bir modüle aittir, modüller birbirinin verisine referansla (lookup) erişir.

---

## Modül haritası

```
                    ┌──────────────────────────────────────────┐
                    │  M1 · ORGANİZASYON                       │
                    │  Company · Branch · Department           │
                    │  CostCenter · Position · Employee        │
                    └───┬──────────────┬───────────────┬───────┘
                        │              │               │
        ┌───────────────┘              │               └──────────────┐
        ▼                              ▼                              ▼
┌───────────────────┐   ┌──────────────────────────┐   ┌─────────────────────┐
│ M2 · TEDARİKÇİ    │   │ M4 · SATIN ALMA TALEBİ   │   │ M10 · BÜTÇE         │
│ Supplier + 6 alt  │◄──┤ PurchaseRequest + 3 alt  ├──►│ Budget + 3          │
└────────┬──────────┘   └───────────┬──────────────┘   └─────────────────────┘
         │                          │                             ▲
         │                          ▼                             │
         │              ┌──────────────────────────┐              │
         │              │ M5 · TEKLİF SÜRECİ       │              │
         ├─────────────►│ Rfq · SupplierQuotation  │              │
         │              │ QuotationComparison      │              │
         │              └───────────┬──────────────┘              │
         │                          ▼                             │
         │              ┌──────────────────────────┐              │
         ├─────────────►│ M6 · SİPARİŞ             ├──────────────┤
         │              │ PurchaseOrder + 3 alt    │              │
         │              └───────────┬──────────────┘              │
         │                          ▼                             │
         │              ┌──────────────────────────┐              │
         │              │ M7 · TESLİMAT            │              │
         │              │ GoodsReceipt + 1 alt     │              │
         │              └───────────┬──────────────┘              │
         │                          ▼                             │
         │              ┌──────────────────────────┐              │
         ├─────────────►│ M8 · FATURA              ├──────────────┘
         │              │ SupplierInvoice + 3 alt  │
         │              └───────────┬──────────────┘
         │                          ▼
         │              ┌──────────────────────────┐
         └─────────────►│ M9 · ÖDEME               │
                        │ Payment + 1 alt          │
                        └──────────────────────────┘

     ┌─────────────────┐
     │ M3 · KATALOG    │  M4, M5, M6, M7, M8 hepsi buradan ürün seçer
     │ Product + 7     │
     └─────────────────┘

  ─────────── Yatay modüller (tüm modülleri keser) ───────────
  M11 · WORKFLOW     M12 · BİLDİRİM + ZAMANLAMA     M13 · YÖNETİM
  (platform)         (platform, eksik)              (RBAC, audit, rapor, dashboard)
```

---

## Modül künyeleri

### M1 · Organizasyon

| | |
|---|---|
| **Entity** | `Company`, `Branch`, `Department`, `CostCenter`, `Position`, `Employee` (6) |
| **Sahip rol** | System Admin |
| **Değişim sıklığı** | Çok düşük — yılda birkaç kez |
| **Bağımlılık** | Yok. Zincirin kökü |
| **Tüketen** | M2, M4, M5, M6, M7, M8, M9, M10 — hemen hepsi |
| **Platform durumu** | ✅ Tamamen kurulabilir |

Sistemin referans omurgası. `Employee` hem kendine (`ManagerEmployeeId`, yönetici hiyerarşisi) hem
`Department` ve `Position`'a bağlanır.

> ⚠️ **Kritik kopukluk:** `Employee`, platformun `User` tablosuna **FK veremez** — lookup hedefi
> kayıtlı bir `PublishedTable` olmak zorunda (`PublishedTableManager.cs:117-119`) ve `User` dinamik
> bir model değil, `CoreLogicContext.cs:120`'de sabit `DbSet`. Bağ, doğrulanmayan bir `int`
> (`PlatformUserId`) üzerinden kurulur. Sonucu [03](03-roller-ve-yetki.md)'te.

### M2 · Tedarikçi Yönetimi

| | |
|---|---|
| **Entity** | `Supplier`, `SupplierContact`, `SupplierAddress`, `SupplierBankAccount`, `SupplierDocument`, `SupplierCategory`, `SupplierRating` (7) |
| **Sahip rol** | Purchasing Specialist (oluşturur), Purchasing Manager / Finance / Management (onaylar) |
| **Değişim sıklığı** | Orta — haftalık yeni kayıt, aylık belge güncelleme |
| **Bağımlılık** | M1 (değerlendiren çalışan) |
| **Tüketen** | M3 (ProductSupplier, PriceList), M5, M6, M8, M9 |
| **Platform durumu** | ⚠️ Yaşam döngüsü workflow'u kurulabilir ama durumu motor yazamaz (G-03); belge süresi takibi yapılamaz (G-04) |

Tedarikçi, sistemdeki **en çok referans verilen** entity'dir. Yaşam döngüsü
([03](03-roller-ve-yetki.md) ve [07](07-is-surecleri.md)) altı durumludur ve onay zinciri gerektirir.

### M3 · Ürün / Hizmet Kataloğu

| | |
|---|---|
| **Entity** | `ProductCategory`, `ProductSubCategory`, `Unit`, `Brand`, `Product`, `ProductSupplier`, `PriceList`, `PriceListItem` (8) |
| **Sahip rol** | Purchasing Specialist |
| **Değişim sıklığı** | Yüksek — fiyat listeleri sürekli güncellenir |
| **Bağımlılık** | M2 (tedarikçi fiyatları) |
| **Tüketen** | M4, M5, M6, M7, M8, M10 |
| **Platform durumu** | ⚠️ Yapı kurulabilir; SKU tekilliği garanti edilemez (G-01), fiyat listesi süre bitimi otomatik işlenemez (G-04) |

Bir ürünün **birden fazla tedarikçisi ve farklı fiyatları** olabilir — `ProductSupplier` bu
çokluğu taşır, `PriceList`/`PriceListItem` dönemsel fiyatı taşır.

### M4 · Satın Alma Talebi

| | |
|---|---|
| **Entity** | `PurchaseRequest`, `PurchaseRequestItem`, `PurchaseRequestAttachment`, `PurchaseRequestApproval` (4) |
| **Sahip rol** | Employee (oluşturur), Department Manager ve üstü (onaylar) |
| **Değişim sıklığı** | Çok yüksek — sistemin ana giriş noktası |
| **Bağımlılık** | M1, M3, M10 |
| **Tüketen** | M5, M6 |
| **Platform durumu** | ⚠️ Talep numarası elle (G-01), toplam tutar elle (G-05), bütçe kontrolü yok (G-02) |

Zincirin başlangıcı. Tutar bazlı dört kademeli onay burada devreye girer
([08-workflow-tasarimi.md](08-workflow-tasarimi.md)).

### M5 · Teklif Süreci

| | |
|---|---|
| **Entity** | `Rfq`, `RfqItem`, `RfqSupplier`, `SupplierQuotation`, `SupplierQuotationItem`, `QuotationComparison`, `QuotationComparisonLine` (7) |
| **Sahip rol** | Purchasing Specialist |
| **Değişim sıklığı** | Yüksek |
| **Bağımlılık** | M2 (davet edilen tedarikçiler), M3, M4 |
| **Tüketen** | M6 |
| **Platform durumu** | ❌ Karşılaştırma ekranı dinamik UI ile yapılamaz — özel ekran gerekir (G-07 + UI) |

Modülün özü **karşılaştırmadır** ve bu, sistemin dinamik UI ile karşılanamayan tek büyük ekranıdır.
Gerekçe [13-ui-ux-tasarimi.md](13-ui-ux-tasarimi.md)'de ayrıntılı.

### M6 · Satın Alma Siparişi

| | |
|---|---|
| **Entity** | `PurchaseOrder`, `PurchaseOrderItem`, `PurchaseOrderApproval`, `PurchaseOrderAttachment` (4) |
| **Sahip rol** | Purchasing Specialist (oluşturur), Purchasing Manager (onaylar) |
| **Bağımlılık** | M2, M3, M5 |
| **Tüketen** | M7, M8, M10 |
| **Platform durumu** | ⚠️ Teslim/faturalanan miktar rollup'ları hesaplanamaz (G-05) |

Siparişin `PartiallyDelivered` → `Delivered` geçişi, alt kalemlerdeki teslim miktarlarının
toplamına bağlıdır — yani bir **rollup**tur ve platformda karşılığı yoktur.

### M7 · Teslimat (Mal Kabul)

| | |
|---|---|
| **Entity** | `GoodsReceipt`, `GoodsReceiptItem` (2) |
| **Sahip rol** | Warehouse Manager |
| **Bağımlılık** | M6 |
| **Tüketen** | M8 |
| **Platform durumu** | ⚠️ Kısmi teslimat kaydedilebilir; "kalan miktar" otomatik hesaplanamaz (G-05) |

Bir siparişe **birden çok** mal kabul bağlanabilir (kısmi teslimat). 100 adetlik sipariş 40 + 60
olarak iki irsaliyeyle gelebilir.

### M8 · Fatura

| | |
|---|---|
| **Entity** | `SupplierInvoice`, `SupplierInvoiceItem`, `InvoiceException`, `InvoiceAttachment` (4) |
| **Sahip rol** | Finance Specialist |
| **Bağımlılık** | M2, M6, M7 |
| **Tüketen** | M9, M10 |
| **Platform durumu** | ❌ **3-way matching yapılamaz** (G-02) — modülün varlık sebebi karşılanmıyor |

Sipariş + irsaliye + fatura üçlüsünü karşılaştırıp uyuşmazlık üretmek, bu modülün tek gerçek işidir
ve platformda **hiçbir şekilde** ifade edilemez. `InvoiceException` kayıtları bugün elle açılır.

### M9 · Ödeme

| | |
|---|---|
| **Entity** | `Payment`, `PaymentAllocation` (2) |
| **Sahip rol** | Finance Specialist (planlar), Finance Manager (onaylar) |
| **Bağımlılık** | M2, M8 |
| **Tüketen** | M10 |
| **Platform durumu** | ❌ Vade hatırlatmaları yok (G-04) — modülün otomasyon değeri sıfır |

`PaymentAllocation`, bir ödemenin **birden çok faturaya** dağıtılabilmesini sağlar (toplu havale).

### M10 · Bütçe

| | |
|---|---|
| **Entity** | `BudgetPeriod`, `Budget`, `BudgetItem`, `BudgetTransaction` (4) |
| **Sahip rol** | Finance Manager |
| **Bağımlılık** | M1 |
| **Tüketen** | M4 (kontrol), M6/M8 (taahhüt-gerçekleşme) |
| **Platform durumu** | ❌ Otomatik taahhüt/gerçekleşme yok (G-02, G-05) |

Bütçe iki sayı tutar: **taahhüt** (onaylı sipariş) ve **gerçekleşme** (onaylı fatura). İkisi de
otomatik güncellenmelidir; bugün `BudgetTransaction` kayıtları elle açılır.

### M11 · Workflow (platform)

Platformun kendi modülü. Onay zincirlerini yürütür.
Ayrıntı: [08-workflow-tasarimi.md](08-workflow-tasarimi.md).

**Platform durumu:** ⚠️ Onay akışları kurulabilir; iş alanı yazma (G-03), akış ortası dallanma ve
organizasyonel atama yok.

### M12 · Bildirim ve Zamanlama (platform)

**Platform durumu:** ❌ Modülün gerektirdiğinin çoğu yok (G-04, G-08). Bu, tasarımda en çok
"platform işi" işareti alan modüldür.
Ayrıntı: [09-scheduler-tasarimi.md](09-scheduler-tasarimi.md),
[10-bildirim-tasarimi.md](10-bildirim-tasarimi.md).

### M13 · Yönetim (platform)

RBAC, denetim kaydı, raporlama, dashboard, kolon görünürlüğü, model yönetimi.

**Platform durumu:** ⚠️ Model bazlı yetki ve audit sağlam; alan seviyesi yetki (G-09) ve çapraz-model
raporlama (G-07) yok.

---

## Modüller arası veri akışı

Modüller birbirine üç tip bağla bağlanır. Hangisinin kullanılacağı
[05-entity-iliskileri.md](05-entity-iliskileri.md)'de gerekçelendirilir.

| Bağ tipi | Kullanım | Örnek |
|---|---|---|
| **Lookup kolonu** | Kullanıcının seçtiği referanslar — çoğunluk | `PurchaseOrder.SupplierId` |
| **Alt model (ParentTableId)** | Başlık → Kalem sahiplik ilişkisi | `PurchaseOrder` → `PurchaseOrderItem` |
| **İlişki (RelationshipDefinition)** | EF navigation gereken yapısal bağlar | `Supplier.Quotations` |

### Belge zinciri akışı

Zincirin her halkası bir öncekinden **veri kopyalar** — referans tutmakla yetinmez. Gerekçe:
raporlama tek modelden çalıştığı için (G-07), her belge kendi kendine yeten bir satır olmak zorunda.

```
PurchaseRequestItem                 →  RfqItem
  ProductId, Quantity, UnitId          aynen kopyalanır

RfqItem                             →  SupplierQuotationItem
  ProductId, Quantity, UnitId          kopyalanır; UnitPrice tedarikçiden gelir

SupplierQuotationItem (seçilen)     →  PurchaseOrderItem
  ProductId, Quantity, UnitPrice       kopyalanır; sipariş miktarı değiştirilebilir

PurchaseOrderItem                   →  GoodsReceiptItem
  ProductId, OrderedQuantity           kopyalanır; ReceivedQuantity girilir

PurchaseOrderItem + GoodsReceiptItem →  SupplierInvoiceItem
  fiyat siparişten, miktar faturadan   → 3-way matching burada yapılır (G-02)
```

> Bu kopyalama **elle** yapılır — platformda "şu belgeden şu belgeyi türet" diye bir mekanizma yok.
> Gerçek bir kurulumda her türetme için ya bir özel ekran ya bir entegrasyon script'i gerekir.
> Test senaryosu T-23 bunu ölçer.
