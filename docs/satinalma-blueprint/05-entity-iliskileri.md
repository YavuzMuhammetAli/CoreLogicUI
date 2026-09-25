# 05 · Entity İlişkileri

Bu bölüm tasarımın **en kritik mimari kararını** içerir: 7 hop uzunluğundaki belge zincirinin,
derinliği 3 ve 4 ile sınırlı bir platformda nasıl kurulduğu.

---

## Problem

Satın alma zinciri doğası gereği uzundur:

```
PurchaseRequest → Rfq → SupplierQuotation → PurchaseOrder → GoodsReceipt → SupplierInvoice → Payment
       0            1            2                 3              4                5            6
```

**7 seviye.** Platformun sınırları:

| Mekanizma | Sınır | Kanıt |
|---|---|---|
| Alt-model ağacı (`ParentTableId`) | Derinlik ≤ **4** (kök = 1) | `PublishedTableManager.cs:44-45`, `PublishedTableValidator.cs:25-27` |
| İlişki grafiği (`RelationshipDefinition`) | Derinlik ≤ **3** (kök = 0) | `RelationshipGraph.cs:27` → `MaxDepthRule.cs:25-38` |

Zincir tek bir grafik olarak modellenirse **publish reddedilir**. Bu, platformun bu uygulamayı
taşıyıp taşıyamayacağını belirleyen ilk sorudur.

---

## Karar: üç mekanizmanın iş bölümü

CoreLogic'te üç bağımsız FK mekanizması eşzamanlı çalışır ve **yenisi eskileri değiştirmez**.
Tasarım her birini farklı bir iş için kullanır:

| Mekanizma | Bu tasarımdaki rolü | Sayı |
|---|---|---|
| **Alt model** (`ParentTableId`) | Yalnızca **Başlık → Kalem** sahipliği. Derinlik daima 2 | 12 ağaç, 22 alt model |
| **Lookup kolonu** | **Belgeler arası tüm bağlar** ve tüm referans veri seçimleri | ~60 kolon |
| **İlişki** (`RelationshipDefinition`) | Yalnızca EF navigation gerçekten gereken yerler | 6 tanım |

### Neden lookup, ilişki değil?

**Gerekçe 1 — derinlik sınırını aşar.** Derinlik yalnızca `RelationshipGraph` üzerinden hesaplanır
(`MaxDepthRule.cs:25-38`). Lookup kenarları bu grafiğe **girmez**; cycle kontrolü de onları açıkça
hariç tutar (`CircularDependencyRule.cs:14-15`: *"legacy kenarlar döngü hesabına girmez"*). Yani
lookup zinciri **istediği kadar uzun olabilir**.

> ⚠️ Bu, platformun bir **boşluğunun** istismarıdır, bir özelliğin kullanımı değil. Derinlik
> sınırı EF navigation'ın `Include` zincirlerini ve cascade yollarını korumak için var; lookup
> zinciri aynı riski taşımaz (navigation üretmez) ama bu, sınırın lookup'larda bilinçli olarak
> kaldırıldığı anlamına gelmiyor — **kimse düşünmemiş** olabilir. Test T-05 bunu doğrular.

**Gerekçe 2 — kullanıcı deneyimi.** `lookup` kolonu UI'da `lookup-picker` bileşenini tetikler:
sunucu taraflı arama (300 ms debounce), sonsuz kaydırma, seçili değerin etiketini ayrı istekle
çözme, ARIA/klavye desteği (`shared/lookup-picker/lookup-picker.component.ts`).

`RelationshipDefinition` ise üretilen sınıfa düz bir `int` property ekler. O property
`DeclaredProperties`'e girer ve `CoreLogicTypeMap.FromClr` tarafından `"int"` olarak etiketlenir
(`CoreLogicTypeMap.cs:104`) — yani **formda çıplak bir sayı kutusu** olarak çıkar. Kullanıcı
tedarikçi seçmek için ID ezberlemek zorunda kalır.

> ❌ **Sonuç: `RelationshipDefinition`, kullanıcının elle doldurduğu FK'lar için yanlış araçtır.**
> Bu, platformun yeni ilişki mekanizmasının UI tarafının tamamlanmamış olduğunu gösteriyor.
> Test T-06 bunu ölçer; doğrulanırsa G-11 olarak backlog'a eklenmeli.

**Gerekçe 3 — çakışma riski.** `LegacyFkConflictRule` (`Business/Concrete/Graph/Rules/`), bir ilişki
FK'sının eski mekanizmaların ürettiği kolonla çakışmasını **reddeder**. `PurchaseOrder` üzerinde hem
`SupplierId` lookup kolonu hem `Supplier` navigation ilişkisi tanımlanırsa, ilişkinin türeteceği FK
kolonu (`SupplierId`) mevcut lookup kolonuyla çakışır ve publish **hata verir**.

Yani bir bağ için **ya lookup ya ilişki** seçilir; ikisi birden olmaz.

---

## Metinsel ER diyagramı

Gösterim:
`──▶` lookup (FK, `{Kolon}` ile) · `═══` alt model (`ParentTableId`) · `~~~▶` ilişki
(`RelationshipDefinition`)

### Organizasyon çekirdeği

```
Company ◀────── Branch                [CompanyId]
   ▲               ▲
   │[CompanyId]    │[BranchId]
   └──────── Department ──────▶ Employee     [ManagerEmployeeId]  ⚠ döngü
                  ▲  ▲                 │
     [DepartmentId]  │                 ├──▶ Position    [PositionId]
                     │                 └~~~▶ Employee   [SelfReference: Manager]
              CostCenter
```

> ⚠️ `Department.ManagerEmployeeId → Employee` ve `Employee.DepartmentId → Department` bir
> **döngüdür**. İlişki olarak kurulsa `CircularDependencyRule` reddederdi; lookup olduğu için
> geçer. Bu, döngü korumasının lookup'larda hiç çalışmadığının kanıtıdır. Test T-07.

### Tedarikçi kümesi

```
SupplierCategory ──▶ SupplierCategory      [ParentCategoryId, self]
       ▲
       │[CategoryId]
   Supplier
       ║
       ╠══ SupplierContact
       ╠══ SupplierAddress
       ╠══ SupplierBankAccount     🔒 kısıtlı erişim
       ╠══ SupplierDocument
       ╚══ SupplierRating ──▶ Employee      [EvaluatedByEmployeeId]
       │
       └~~~▶ SupplierQuotation               [OneToMany: Supplier.Quotations]
```

### Katalog kümesi

```
ProductCategory ═══ ProductSubCategory
       ▲                    ▲
       │[CategoryId]        │[SubCategoryId]
   Product ──▶ Brand        [BrandId]
       │   └──▶ Unit        [UnitId]
       │
       ├──── ProductSupplier ──▶ Supplier    [SupplierId]
       │           ▲
       │           │[ProductId]
       │
       └~~~▶ Supplier   [ManyToMany: Product.AlternativeSuppliers ↔ Supplier.CatalogProducts]
                        join tablo: ProductSupplierLink

PriceList ──▶ Supplier          [SupplierId]
    ║
    ╚══ PriceListItem ──▶ Product   [ProductId]
```

### Belge zinciri — tasarımın omurgası

```
PurchaseRequest ──▶ Department, CostCenter, Employee, Budget
       ║
       ╠══ PurchaseRequestItem ──▶ Product, Unit
       ╠══ PurchaseRequestAttachment
       ╚══ PurchaseRequestApproval ──▶ Employee
       │
       └~~~▶ Rfq                    [OneToOne: PurchaseRequest.Rfq]
       ▲
       │ [PurchaseRequestId]  ◀── lookup, derinliğe SAYILMAZ
       │
     Rfq ──▶ Employee                [BuyerEmployeeId]
       ║
       ╠══ RfqItem ──▶ Product, Unit
       ╚══ RfqSupplier ──▶ Supplier
       ▲
       │ [RfqId]
       │
  SupplierQuotation ──▶ Supplier, Rfq
       ║
       ╚══ SupplierQuotationItem ──▶ Product, Unit
       ▲
       │ [QuotationId]
       │
  QuotationComparison ──▶ Rfq, SupplierQuotation (seçilen), Employee
       ║
       ╚══ QuotationComparisonLine ──▶ SupplierQuotation
       │
       ▼
  PurchaseOrder ──▶ Supplier, SupplierQuotation, PurchaseRequest,
       ║            Employee, Department, CostCenter
       ╠══ PurchaseOrderItem ──▶ Product, Unit
       ╠══ PurchaseOrderApproval ──▶ Employee
       ╚══ PurchaseOrderAttachment
       │
       ├~~~▶ GoodsReceipt            [OneToMany: PurchaseOrder.Receipts]
       └~~~▶ SupplierInvoice         [OneToMany: PurchaseOrder.Invoices]
       ▲
       │ [PurchaseOrderId]
       │
  GoodsReceipt ──▶ PurchaseOrder, Supplier, Employee
       ║
       ╚══ GoodsReceiptItem ──▶ Product, Unit
       ▲
       │ (3-way matching girdisi — ilişki DEĞİL, uygulama katmanı eşleştirmesi)
       │
  SupplierInvoice ──▶ Supplier, PurchaseOrder
       ║
       ╠══ SupplierInvoiceItem ──▶ Product, Unit
       ╠══ InvoiceException ──▶ Employee
       ╚══ InvoiceAttachment
       ▲
       │ [SupplierInvoiceId]
       │
  Payment ──▶ Supplier, SupplierBankAccount, Employee
       ║
       ╚══ PaymentAllocation ──▶ SupplierInvoice
```

### Bütçe kümesi

```
BudgetPeriod ◀── Budget ──▶ Department, CostCenter, Employee
                    ║
                    ╚══ BudgetItem ──▶ ProductCategory
                    ▲
                    │[BudgetId]
             BudgetTransaction
                    ▲
                    │[BudgetId]  (SourceDocumentNumber = zayıf referans, FK yok ⚠)
```

---

## Alt model ağaçları (12 ağaç, hepsi derinlik 2)

| Kök | Alt modeller | Derinlik |
|---|---|---|
| `Supplier` | `SupplierContact`, `SupplierAddress`, `SupplierBankAccount`, `SupplierDocument`, `SupplierRating` | 2 ✅ |
| `ProductCategory` | `ProductSubCategory` | 2 ✅ |
| `PriceList` | `PriceListItem` | 2 ✅ |
| `PurchaseRequest` | `PurchaseRequestItem`, `PurchaseRequestAttachment`, `PurchaseRequestApproval` | 2 ✅ |
| `Rfq` | `RfqItem`, `RfqSupplier` | 2 ✅ |
| `SupplierQuotation` | `SupplierQuotationItem` | 2 ✅ |
| `QuotationComparison` | `QuotationComparisonLine` | 2 ✅ |
| `PurchaseOrder` | `PurchaseOrderItem`, `PurchaseOrderApproval`, `PurchaseOrderAttachment` | 2 ✅ |
| `GoodsReceipt` | `GoodsReceiptItem` | 2 ✅ |
| `SupplierInvoice` | `SupplierInvoiceItem`, `InvoiceException`, `InvoiceAttachment` | 2 ✅ |
| `Payment` | `PaymentAllocation` | 2 ✅ |
| `Budget` | `BudgetItem` | 2 ✅ |

**Hiçbiri sınıra yaklaşmıyor** (maks 4). Bu bilinçli: derinlik 3+ alt model ağaçları, UI'da
`record-form-dialog`'un özyinelemeli açılımını zorlar ve kullanıcı için okunmaz hale gelir.

Alt model olmanın platform karşılığı:
- FK kolonu `{Parent}Id`, **NOT NULL** (`CheckingDataBase.cs:190-213`)
- `FK_{table}_{parent}` constraint + `IX_{table}_{parent}Id WHERE Active=1` filtreli index
- Kök silinince alt ağaç **uygulama katmanında** özyinelemeli soft-delete
  (`PublishedModelManager.cs:399-438`) — ⚠️ SQL cascade yok, **transaction garantisi yok**
- UI'da ana kaydın altında **sekme** olarak, inline grid + pop-up form
- `addTree` ile **tek transaction**'da kaydedilir

---

## İlişki tanımları (6 adet)

`RelationshipDefinition` **bilinçli olarak az** kullanıldı. Her biri ya gerçek bir navigation
ihtiyacını karşılıyor ya da platformun bir yeteneğini sınamak için var.

| # | Kaynak | Hedef | Tip | Property | Derinlik | Gerekçe |
|---|---|---|---|---|---|---|
| **R1** | `Employee` | `Employee` | `SelfReference` | `Manager` / `Subordinates` | 0 | Yönetici hiyerarşisi. `SelfReference` cycle beyaz listesinde (`RelationshipGraph.cs:178`) |
| **R2** | `SupplierCategory` | `SupplierCategory` | `SelfReference` | `ParentCategory` / `Children` | 0 | Kategori ağacı |
| **R3** | `Supplier` | `SupplierQuotation` | `OneToMany` | `Quotations` / `Supplier` | 1 | "Bu tedarikçinin tüm teklifleri" navigation'ı |
| **R4** | `PurchaseOrder` | `GoodsReceipt` | `OneToMany` | `Receipts` / `PurchaseOrder` | 1 | Kısmi teslimat takibi — rollup'ın *olması gereken* yeri |
| **R5** | `PurchaseRequest` | `Rfq` | `OneToOne` | `Rfq` / `PurchaseRequest` | 1 | **UNIQUE index testi** — bir talepten en fazla bir RFQ |
| **R6** | `Product` | `Supplier` | `ManyToMany` | `AlternativeSuppliers` / `CatalogProducts` | 1 | **Join tablo testi** — `ProductSupplierLink` |

**Maksimum derinlik: 1.** Sınır 3; bol payla altında.

### Önemli: R3/R4/R5 lookup ile çakışır

Bu üç ilişki, aynı bağın lookup karşılığıyla **aynı FK kolonunu** üretir. `LegacyFkConflictRule`
buna izin vermez. Bu yüzden:

| Bağ | Seçim | Bedel |
|---|---|---|
| `SupplierQuotation → Supplier` | **İlişki (R3)** | ⚠️ Formda tedarikçi seçimi ham `int` olur |
| `GoodsReceipt → PurchaseOrder` | **İlişki (R4)** | ⚠️ Formda sipariş seçimi ham `int` olur |
| `Rfq → PurchaseRequest` | **İlişki (R5)** | ⚠️ Aynı |

> ❌ **Bu, gerçek bir tasarım ikilemidir ve platform çözümsüz bırakıyor.** Navigation (rollup ve
> ilişkili kayıt gösterimi için gerekli) ile kullanıcı dostu seçim (lookup picker) **aynı anda**
> elde edilemez.
>
> **Bu tasarımın kararı:** kullanıcı deneyimi kazanır. R3/R4/R5 **canlı doğrulamada denenecek**
> (T-06), ham `int` sorunu doğrulanırsa bu üç ilişki **iptal edilip lookup'a çevrilecek** ve
> navigation'dan vazgeçilecek. Rollup zaten G-05 nedeniyle çalışmıyor, yani navigation'ın pratik
> getirisi düşük.
>
> Nihai tercih [20-canli-dogrulama-sonuclari.md](20-canli-dogrulama-sonuclari.md)'ye yazılacak.

### Cascade davranışı

Hiçbir ilişkide `CascadeDelete = true` **istenmedi**. Gerekçe: `CascadeSafety.IsCascadeSafe`
(`Core/Graph/CascadeSafety.cs:30-60`) güvenliği kanıtlayamazsa zaten `NO ACTION`'a düşürüyor —
`ManyToMany` ve `SelfReference` **her zaman** güvensiz sayılıyor, aynı tabloya birden fazla cascade
FK gelirse de öyle. Yani R1, R2, R6 için cascade zaten imkânsız; R3/R4/R5 için de istenmedi çünkü
belge zincirinde bir tedarikçiyi silmek tekliflerini silmemeli.

Silme davranışı: tüm modeller **soft-delete** (`Active = false`). Fiziksel silme yok.

---

## Lookup kolonları (~60)

Lookup, bu tasarımın ana bağ mekanizmasıdır. Platform karşılığı:

- Kolon kendi adını taşır (`SupplierId`), tipi `int`
- `CONSTRAINT FK_{table}_{column}` + `IX_{table}_{column}` (`CheckingDataBase.cs:216-251`)
- Her publish sonunda **idempotent onarım** çalışır (`EnsureLookupForeignKeyScript`, satır 279-312)
- `LookupDisplayColumn` etiket kolonunu belirler (ör. `Supplier` için `LegalName`)
- Okuma ucu: `GET /PublishedModel/lookupOptions` — arama, sayfalama (varsayılan 50, maks 200),
  `ids=` ile toplu etiket çözümü (maks 500)
- Yetki **hedef modele** göre kontrol edilir (`PublishedModelController.cs:88`)

### En çok referans verilen hedefler

| Hedef | Kaç yerden | Not |
|---|---|---|
| `Employee` | 14 | Her belgede en az bir sorumlu |
| `Supplier` | 9 | |
| `Product` | 8 | ⚠️ 50.000 SKU'da picker performansı — test T-51 |
| `Unit` | 8 | |
| `Department` | 6 | |
| `PurchaseOrder` | 4 | |
| `CostCenter` | 4 | |

### ❌ Verilemeyen lookup: `User`

`Employee.PlatformUserId` bir lookup **olamaz** — hedef kayıtlı bir `PublishedTable` olmak zorunda
(`PublishedTableManager.cs:115-120`) ve `User` sabit bir `DbSet`'tir (`CoreLogicContext.cs:120`).

Doğrulanmayan `int` olarak kalır. Ayrıntı ve ara çözüm: [04](04-entity-listesi.md) #6.

---

## İlişki bütünlüğü: neyin garanti edildiği, neyin edilmediği

| Garanti | Durum | Mekanizma |
|---|---|---|
| Lookup hedefi var olan bir kayıt | ✅ | SQL FK constraint |
| Alt model kökü var olan bir kayıt | ✅ | SQL FK, NOT NULL |
| Aynı ürün-tedarikçi iki kez girilemez | ❌ | Unique yok (G-01) |
| Bir talepten en fazla bir RFQ | ⚠️ | Yalnız R5 ilişkisi kurulursa (OneToOne UNIQUE index) |
| RFQ'ya davet edilen tedarikçi **aktif** | ❌ | FK hedef durumuna bakmaz (G-02) |
| Sipariş miktarı teklif miktarını aşamaz | ❌ | Çapraz-model kural yok (G-02) |
| Fatura miktarı teslim miktarını aşamaz | ❌ | 3-way matching yok (G-02) |
| Ödeme dağıtımı toplamı ödeme tutarına eşit | ❌ | (G-02) |
| Kök silinince alt kayıtlar da silinir | ⚠️ | Uygulama katmanında, **transaction garantisi yok** |
| Referans verilen kayıt silinemez | ⚠️ | Soft-delete olduğu için FK engellemez — silinmiş tedarikçiye referans **kalır** |

> ⚠️ **Son satır ciddi.** Tüm silmeler soft-delete olduğu için, bir tedarikçi "silindiğinde"
> SQL FK'sı hiç devreye girmez; satır tabloda `Active = 0` olarak kalır. Ona referans veren
> siparişler geçerli görünmeye devam eder, ama `lookupOptions` o tedarikçiyi artık döndürmez
> (`Active == true` predicate'i, `EfEntityRepositoryBase.cs:113-137`). Sonuç: sipariş ekranında
> tedarikçi alanı **boş görünür** ama veritabanında dolu. Edge case EC-17.

---

## Publish sırası

İlişkiler ve lookup'lar bir **bağımlılık sırası** dayatır. `seed/publish-all.ps1` bu sırayı izler;
sıra bozulursa lookup hedefi bulunamaz ve `AddMember` doğrulaması hata verir
(`PublishedTableManager.cs:115-120`).

```
Dalga 1  (bağımsız)    Company · Position · Unit · Brand · ProductCategory ·
                       SupplierCategory · BudgetPeriod · ExchangeRate
Dalga 2                Branch · ProductSubCategory
Dalga 3                Department            ← Company, Branch
Dalga 4                Employee              ← Department, Position  (+ R1 self)
Dalga 5                CostCenter · Budget   ← Department, Employee, BudgetPeriod
Dalga 6                Supplier (+5 alt)     ← SupplierCategory, Employee
Dalga 7                Product (+ R6 M2M)    ← ProductCategory, Brand, Unit
Dalga 8                ProductSupplier · PriceList (+1 alt)
Dalga 9                PurchaseRequest (+3 alt)   ← Employee, Department, CostCenter, Budget, Product
Dalga 10               Rfq (+2 alt)               ← PurchaseRequest (R5), Supplier, Product
Dalga 11               SupplierQuotation (+1 alt) ← Rfq, Supplier (R3)
Dalga 12               QuotationComparison (+1 alt)
Dalga 13               PurchaseOrder (+3 alt)     ← Supplier, Quotation, PurchaseRequest
Dalga 14               GoodsReceipt (+1 alt)      ← PurchaseOrder (R4)
Dalga 15               SupplierInvoice (+3 alt)   ← PurchaseOrder, Supplier
Dalga 16               Payment (+1 alt)           ← SupplierInvoice, Supplier, SupplierBankAccount
Dalga 17               BudgetTransaction          ← Budget
Dalga 18  (runtime)    CompanyVehicle             ← Department, Employee, PurchaseOrder
```

> ⚠️ **Her dalga bir publish çağrısıdır ve `MergePublishBatch` ilişkiyle bağlı karşı tarafları da
> yeniden derler** (`ModelDefinitionManager.cs:226-263`). Yani dalga 14'te `GoodsReceipt`
> yayınlanırken `PurchaseOrder` da yeniden derlenir. 18 dalga sonunda bazı modeller **onlarca kez**
> derlenmiş olur. Derleme süresinin birikimi test T-47'nin konusudur.
