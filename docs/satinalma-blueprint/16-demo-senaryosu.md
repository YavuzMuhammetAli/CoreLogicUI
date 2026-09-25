# 16 · Uçtan Uca Demo Senaryosu

**Senaryo:** Bilgi Teknolojileri departmanı 20 adet dizüstü bilgisayar satın alıyor.

Her adımda **hangi kayıtların oluştuğu**, **kimin ne yaptığı** ve **platformun nerede elle müdahale
gerektirdiği** gösteriliyor. `MANUEL` işareti, otomatik olması gereken ama elle yapılan adımları
gösterir.

> Bu senaryo Faz 2'de canlı tenant'ta gerçekten koşturulacak; oluşan gerçek ID'ler
> [20-canli-dogrulama-sonuclari.md](20-canli-dogrulama-sonuclari.md)'ye yazılacak.

---

## Başlangıç verisi

| Model | Kayıt |
|---|---|
| `Company` | Örnek Teknoloji A.Ş. (`ORNEK`) |
| `Department` | Bilgi Teknolojileri (`IT`), müdür: Mehmet Kaya |
| `CostCenter` | `CC-IT-001` · BT Donanım |
| `Employee` | Ahmet Yılmaz (uzman), Mehmet Kaya (IT müdürü), Zeynep Demir (satın alma uzmanı), Can Öztürk (satın alma müdürü), Elif Şahin (finans müdürü), Burak Aydın (depo) |
| `Product` | `LPT-DELL-5540` · Dell Latitude 5540 · Kategori: Bilgisayar · Birim: EA · KDV %20 |
| `Supplier` | Alfa Bilişim (`SUP-00001`), Beta Teknoloji (`SUP-00002`), Gama Sistem (`SUP-00003`) — üçü de `Active` |
| `BudgetPeriod` | `2026-Q4` · 01.10.2026 – 31.12.2026 · `Open` |
| `Budget` | `BUD-IT-2026Q4` · Planlanan 500.000 ₺ · Kullanılabilir 500.000 ₺ |

---

## Adım 1 — Talep oluşturma

**Aktör:** Ahmet Yılmaz (Employee) · **Ekran:** `/models/PurchaseRequest/new`

### Oluşan kayıtlar

`PurchaseRequest` **#1001**

| Alan | Değer | Not |
|---|---|---|
| `RequestNumber` | `PR-2026-0001` | 🔴 `MANUEL` — otomatik üretilmeli (G-01) |
| `RequesterEmployeeId` / `RequesterName` | Ahmet Yılmaz | |
| `DepartmentId` / `DepartmentName` | IT / `Bilgi Teknolojileri` | denormalize (G-07) |
| `CostCenterId` / `CostCenterCode` | `CC-IT-001` | |
| `Priority` | `Normal` | |
| `RequestDate` | 22.09.2026 | 🔴 `MANUEL` — varsayılan "bugün" yok (G-01) |
| `RequiredDate` | 15.10.2026 | |
| `Description` | "Yazılım ekibi için dizüstü bilgisayar yenilemesi" | |
| `Status` | `Draft` | 🔴 `MANUEL` — varsayılan yok |
| `Currency` | `TRY` | |
| `TotalAmount` / `TotalAmountTry` | `50.000,00` | 🔴 `MANUEL` — rollup yok (G-05) |
| `BudgetId` | `BUD-IT-2026Q4` | |
| `BudgetCheckResult` | `NotChecked` | 🔴 kontrol yapılmadı (G-02) |

`PurchaseRequestItem` **#2001** (alt kayıt)

| Alan | Değer |
|---|---|
| `LineNumber` | 1 |
| `ProductId` / `ProductName` / `ProductSku` | Dell Latitude 5540 / `LPT-DELL-5540` |
| `Quantity` | 20 |
| `UnitId` / `UnitCode` | EA |
| `EstimatedUnitPrice` | 2.500,00 |
| `EstimatedLineTotal` | 50.000,00 🔴 `MANUEL` (G-05) |

### Platform davranışı

- ✅ Başlık + kalem **tek `addTree` çağrısıyla, tek transaction'da** yazıldı
- ✅ 2 `AuditLog` satırı (`Added` × 2), `CreatedBy` otomatik dolu
- 🔴 Ahmet, talep numarasını, tarihi, durumu ve **toplam tutarı elle yazdı** — dördü de sistemin işi

> ❌ **Bütçe kontrolü yapılmadı** (BR-33). 50.000 ₺ bütçeye sığıyor ama sistem bunu bilmiyor.

---

## Adım 2 — Onaya gönderme ve onay

**Aktör:** Ahmet Yılmaz → Mehmet Kaya

Ahmet `Status`'u `Submitted` yapıp kaydediyor. 🔴 `MANUEL` — "Onaya Gönder" butonu yok
([13](13-ui-ux-tasarimi.md)).

### Tetiklenen zincir

```
PublishedModel/update  →  EF SaveChangesInterceptor
                       →  WorkflowOutbox #1 (Modified, PurchaseRequest, 1001)
                       →  WorkflowWorker (≤10 sn)
                       →  PR-ONAY-K2 eşleşti:
                             Status eq Submitted        ✓
                             TotalAmountTry ge 10000    ✓ (50000)
                             TotalAmountTry lt 50000    ✗  ← EŞLEŞMEDİ
                       →  PR-ONAY-K3 eşleşti:
                             Status eq Submitted        ✓
                             TotalAmountTry ge 50000    ✓
                             TotalAmountTry lt 250000   ✓
                       →  StartFromTrigger(PR-ONAY-K3)
```

> ⚠️ **Dikkat: 50.000 ₺ tam sınırda.** `K2` `lt 50000` olduğu için eşleşmiyor, `K3` `ge 50000`
> olduğu için eşleşiyor. Aralıklar doğru kurulmuş — kesişme yok, boşluk yok. Bu, K2 kararının
> canlı doğrulaması (test T-29).

### Oluşan kayıtlar

| Kayıt | Değer |
|---|---|
| `WorkflowOutbox` #1 | `Processed` |
| `WorkflowInstance` #501 | `DefinitionId` = PR-ONAY-K3, `EntityType` = `PurchaseRequest`, `EntityId` = 1001, `Status` = `Running`, `CurrentStepKey` = `purchasing` |
| `WorkflowTask` #701 | `StepKey` = `purchasing`, `AssignedRoleId` = 2 (Satın Alma Müdürü), `DueAt` = +48 sa, `EscalateAt` = +96 sa |
| `WorkflowEvent` #901-903 | `InstanceStarted`, `StepEntered`, `TaskCreated` — hash zincirli |
| `PurchaseRequest.WorkflowStatus` | `"Satın Alma Müdürü Onayında"` — ham SQL `UPDATE` ile |
| `PlatformJob` | `workflow.notify` · `TaskAssigned` · görev #701 |

### Bildirim

Can Öztürk'e e-posta gider:

```
Konu: [Onayınız bekleniyor] Satın Alma Müdürü Onayı
Gövde: PurchaseRequest #1001 için onayınız bekleniyor.
```

> ❌ **İçerik neredeyse bilgisiz.** Talep numarası, tutar, talep eden, departman — hiçbiri yok.
> Şablon sistemi olmadığı için (G-08) konu ve gövde C# `switch`'inde sabit.

### Onay

Can Öztürk `/tasks` → görev #701 → form (`Comment`) → **Onayla**.

| Kayıt | Değişim |
|---|---|
| `WorkflowTask` #701 | `Status` = `Completed`, `Decision` = `approve`, `CompletedBy` = Can, `CompletedAt` |
| `WorkflowTask` #702 | **yeni** — `StepKey` = `finance`, `AssignedRoleId` = 4, `DueAt` = +72 sa |
| `WorkflowInstance` #501 | `CurrentStepKey` = `finance` |
| `PurchaseRequest.WorkflowStatus` | `"Finans Müdürü Onayında"` |
| `WorkflowEvent` #904-907 | `TaskCompleted`, `StepExited`, `StepEntered`, `TaskCreated` |

Elif Şahin (Finans Müdürü) görev #702'yi onaylıyor (`Comment` + `BudgetAvailable = true` zorunlu).

| Kayıt | Değişim |
|---|---|
| `WorkflowTask` #702 | `Completed` / `approve` |
| `WorkflowInstance` #501 | `Status` = `Completed`, `CompletedAt` dolu |
| `PurchaseRequest.WorkflowStatus` | **`null`** 🔴 |
| `PurchaseRequest.Status` | **hâlâ `Submitted`** 🔴 |

> ❌ **Sürecin çıktısı kayda yazılmadı.** `WorkflowStatus` boşaldı (terminal adıma etiket
> map'lenemiyor) ve `Status` hâlâ `Submitted`. Birinin elle `Approved` yapması gerekiyor — **G-03'ün
> en somut hali.**
>
> ❌ Ahmet'e "talebiniz onaylandı" bildirimi **gitmedi** — `WorkflowCompleted` hiçbir yerde enqueue
> edilmiyor ([10](10-bildirim-tasarimi.md)).

`MANUEL`: Zeynep Demir `Status` = `Approved` yapıyor + `PurchaseRequestApproval` #2101, #2102
kayıtlarını **elle** açıyor (onay geçmişi raporlanabilsin diye).

---

## Adım 3 — RFQ ve teklif toplama

**Aktör:** Zeynep Demir (Purchasing Specialist)

### Oluşan kayıtlar

`Rfq` **#3001** — `RFQ-2026-0042` 🔴 `MANUEL` numara

| Alan | Değer |
|---|---|
| `PurchaseRequestId` / `PurchaseRequestNumber` | #1001 / `PR-2026-0001` |
| `Title` | "20 Adet Dizüstü Bilgisayar" |
| `IssueDate` / `DueDate` | 23.09.2026 / 30.09.2026 |
| `Status` | `Draft` → `Sent` |
| `BuyerEmployeeId` | Zeynep Demir |

`RfqItem` **#3101** — talep kaleminden **elle kopyalandı** 🔴 (türetme ucu yok)

`RfqSupplier` **#3201, #3202, #3203** — Alfa, Beta, Gama · `Status` = `Sent`, `SentOn` damgalı

> ❌ Tedarikçilere bildirim **gitmedi** — dış alıcıya bildirim yolu yok. Zeynep RFQ'yu kendi
> e-postasından gönderdi.

### Gelen teklifler (elle girildi)

| | Alfa Bilişim | **Beta Teknoloji** | Gama Sistem |
|---|---|---|---|
| Kayıt | `SupplierQuotation` #4001 | **#4002** | #4003 |
| Birim fiyat | 2.500,00 ₺ | **2.350,00 ₺** | 2.650,00 ₺ |
| Ara toplam | 50.000,00 ₺ | **47.000,00 ₺** | 53.000,00 ₺ |
| İskonto | %0 | %2 | %5 |
| KDV (%20) | 10.000,00 ₺ | 9.212,00 ₺ | 10.070,00 ₺ |
| **Genel toplam** | 60.000,00 ₺ | **56.402,00 ₺** | 60.420,00 ₺ |
| Teslimat | 14 gün | 21 gün | **7 gün** |
| Ödeme vadesi | 30 gün | **60 gün** | 15 gün |
| Garanti | 24 ay | 24 ay | **36 ay** |
| Geçerlilik | 15.10.2026 | 15.10.2026 | 10.10.2026 |
| Tedarikçi puanı | 4,2 | 3,8 | **4,6** |

Her teklif için bir `SupplierQuotationItem` (#4101-4103). Tüm tutarlar 🔴 `MANUEL` (G-05).

---

## Adım 4 — Karşılaştırma ve seçim

**Aktör:** Zeynep Demir · **Ekran:** `/rfqs/3001/compare` — 🔧 **özel ekran**

Ağırlıklar: Fiyat %40 · Teslimat %20 · Ödeme %15 · Garanti %10 · Puan %15

| Kriter | Alfa | **Beta** | Gama |
|---|---|---|---|
| Fiyat puanı (en düşük = 100) | 94,0 | **100,0** | 93,3 |
| Teslimat puanı (en hızlı = 100) | 50,0 | 33,3 | **100,0** |
| Ödeme puanı (en uzun = 100) | 50,0 | **100,0** | 25,0 |
| Garanti puanı | 66,7 | 66,7 | **100,0** |
| Tedarikçi puanı | 91,3 | 82,6 | **100,0** |
| **AĞIRLIKLI TOPLAM** | 78,4 | **81,2** 🏆 | 74,9 |
| **Sıra** | 2 | **1** | 3 |

### Oluşan kayıtlar

`QuotationComparison` **#5001**

| Alan | Değer |
|---|---|
| `RfqId` / `RfqNumber` | #3001 / `RFQ-2026-0042` |
| `Method` | `BestValue` |
| Ağırlıklar | 40 / 20 / 15 / 10 / 15 |
| `SelectedQuotationId` / `SelectedSupplierName` | #4002 / Beta Teknoloji |
| `SelectionReason` | "En yüksek ağırlıklı puan ve en uygun ödeme vadesi (60 gün)." |
| `TotalSavings` | 3.000,00 ₺ 🔴 `MANUEL` |
| `Status` | `PendingApproval` → `Approved` |

`QuotationComparisonLine` **#5101, #5102, #5103** — üç teklifin puanları

> 🔧 **Puanların tamamı özel ekranın backend ucunda hesaplandı ve yazıldı.** Platform bunu
> yapamıyor: çapraz-model okuma yok (tedarikçi puanı, geçmiş fiyat), hesaplanan kolon yok,
> pivot görünüm yok. Bu adım [12](12-api-tasarimi.md)'deki özel uç #1'in varlık sebebi.

Can Öztürk karşılaştırmayı onaylıyor. 🔴 `MANUEL`: diğer tekliflerin `Status`'ü `Rejected`,
Beta'nınki `Selected` yapılıyor (3 ayrı güncelleme).

---

## Adım 5 — Sipariş

**Aktör:** Zeynep Demir

`PurchaseOrder` **#6001** — `PO-2026-0018` 🔴 `MANUEL`

| Alan | Değer |
|---|---|
| `SupplierId` / `SupplierName` | Beta Teknoloji |
| `QuotationId` / `QuotationNumber` | #4002 |
| `PurchaseRequestId` / `PurchaseRequestNumber` | #1001 / `PR-2026-0001` |
| `OrderDate` / `ExpectedDeliveryDate` | 01.10.2026 / 22.10.2026 |
| `Currency` / `ExchangeRateUsed` | `TRY` / 1,00 |
| `PaymentTermDays` | 60 |
| `Subtotal` / `DiscountAmount` / `VatAmount` / `GrandTotal` | 47.000 / 940 / 9.212 / **56.402,00 ₺** 🔴 hepsi `MANUEL` |
| `Status` | `Draft` → `PendingApproval` |
| `DepartmentName` / `CostCenterCode` | Bilgi Teknolojileri / `CC-IT-001` |

`PurchaseOrderItem` **#6101**

| Alan | Değer |
|---|---|
| `OrderedQuantity` | 20 |
| `UnitPrice` / `DiscountRate` / `VatRate` | 2.350,00 / %2 / %20 |
| `LineTotal` | 46.060,00 🔴 |
| `ReceivedQuantity` / `RemainingQuantity` / `InvoicedQuantity` | 0 / 20 / 0 🔴 **elle takip edilecek** |

### Onay

`Status` = `PendingApproval` → `PO-ONAY` tetiklenir.

| Kayıt | Değer |
|---|---|
| `WorkflowInstance` #502 | `PurchaseOrder` #6001 |
| `WorkflowTask` #703 | `purchasing` → Can Öztürk **onaylar** |
| `WorkflowTask` #704 | `finance` → Elif Şahin **onaylar** |

🔴 `MANUEL`: `Status` = `Approved` → `SentToSupplier`, `SentToSupplierOn` damgalanıyor.

> ❌ `BudgetTransaction` (`Commitment`, 56.402 ₺) **oluşmadı** (BR-34, G-02). Bütçe hâlâ
> 500.000 ₺ kullanılabilir görünüyor — gerçekte 56.402 ₺ taahhüt edildi.

---

## Adım 6 — Kısmi teslimat

**Aktör:** Burak Aydın (Warehouse Manager)

### İlk sevkiyat — 12.10.2026, 8 adet

> **Not:** Kullanıcının örneğindeki "100 ürün yerine 20 ürün" durumunu göstermek için sipariş 20
> adet, ilk sevkiyat **8 adet** olarak kurgulandı — eksik teslimat ve ardından gelen fatura
> uyuşmazlığı bu sayede gerçekçi biçimde ortaya çıkıyor.

`GoodsReceipt` **#7001** — `GR-2026-0031` 🔴 `MANUEL`

| Alan | Değer |
|---|---|
| `PurchaseOrderId` / `OrderNumber` | #6001 / `PO-2026-0018` |
| `ReceiptDate` / `DeliveryNoteNumber` | 12.10.2026 / `BTK-884412` |
| `ReceivedByEmployeeId` | Burak Aydın |
| `Status` / `InspectionResult` | `Confirmed` / `Passed` |
| `IsPartial` | `true` 🔴 |

`GoodsReceiptItem` **#7101** — `ReceivedQuantity` 8 · `AcceptedQuantity` 8 · `RejectedQuantity` 0

🔴 `MANUEL`: Burak `PurchaseOrderItem` #6101'i açıp `ReceivedQuantity` = 8, `RemainingQuantity` = 12
yazıyor; `PurchaseOrder.Status` = `PartiallyDelivered` yapıyor.

> ❌ **Üç güncellemenin üçü de sistemin işi olmalıydı** (BR-26, G-02 + G-05). Burak bunu unutursa
> 3-way matching **yanlış çalışır** — ve unutması muhtemeldir, çünkü hiçbir şey hatırlatmıyor.

### İkinci sevkiyat — 20.10.2026, 12 adet

`GoodsReceipt` **#7002** (`GR-2026-0037`) + `GoodsReceiptItem` **#7102** (12 adet, kabul 12).

🔴 `MANUEL`: `ReceivedQuantity` = 20, `RemainingQuantity` = 0, `PurchaseOrder.Status` = `Delivered`.

| Olay | Bu irsaliye | Toplam alınan | Kalan | Sipariş durumu |
|---|---|---|---|---|
| GR-2026-0031 | 8 | 8 | 12 | `PartiallyDelivered` |
| GR-2026-0037 | 12 | 20 | 0 | `Delivered` |

✅ Platform **kısmi teslimatı veri olarak destekliyor** — bir siparişe N mal kabul bağlanabiliyor.
❌ Hesaplamayı yapmıyor.

---

## Adım 7 — Fatura ve 3-way matching

**Aktör:** Elif Şahin / Finans uzmanı

Beta Teknoloji **ilk sevkiyattan sonra** 20 adetlik fatura kesiyor (yalnız 8 adet teslim edilmişken).

`SupplierInvoice` **#8001**

| Alan | Değer |
|---|---|
| `InvoiceNumber` (tedarikçinin) | `BTK2026000771` |
| `InternalNumber` | `INV-2026-0091` 🔴 |
| `PurchaseOrderId` / `OrderNumber` | #6001 / `PO-2026-0018` |
| `InvoiceDate` / `DueDate` | 13.10.2026 / **12.12.2026** (60 gün vade) |
| `Subtotal` / `VatAmount` / `GrandTotal` | 46.060 / 9.212 / **55.272,00 ₺** 🔴 |
| `Status` | `PendingMatch` |
| `MatchStatus` | `NotMatched` |

`SupplierInvoiceItem` **#8101** — `InvoicedQuantity` **20**, `UnitPrice` 2.350,00

### 3-way matching — 🔧 özel uç

`POST /api/procurement/v1/three-way-match/8001`

| Kaynak | Miktar | Birim fiyat |
|---|---|---|
| Sipariş (`PurchaseOrderItem` #6101) | **20** | 2.350,00 |
| İrsaliye (o tarihte toplam) | **8** | — |
| Fatura (`SupplierInvoiceItem` #8101) | **20** | 2.350,00 |

**Sonuç:** Fatura miktarı (20) teslim alınan miktarı (8) **aşıyor** → `QuantityOver` · **Blocking**

### Oluşan kayıtlar

`InvoiceException` **#8201**

| Alan | Değer |
|---|---|
| `ExceptionType` | `QuantityOver` |
| `Severity` | `Blocking` |
| `Description` | "Fatura miktarı (20) teslim alınan miktarı (8) aşıyor." |
| `OrderedQuantity` / `ReceivedQuantity` / `InvoicedQuantity` | 20 / 8 / 20 |
| `DifferenceAmount` | 28.200,00 ₺ (12 adet × 2.350) |
| `Resolution` | `Open` |

`SupplierInvoice` #8001 → `MatchStatus` = `QuantityOver`, `Status` = `Exception`

→ `INVOICE-EXCEPTION` workflow tetiklenir (`WorkflowInstance` #503, `WorkflowTask` #705 → Elif Şahin)

Elif, ikinci sevkiyatı (20.10.2026) bekleyip uyuşmazlığı `Accepted` olarak kapatıyor:
`ResolutionNote` = "İkinci sevkiyat 20.10.2026'da tamamlandı; fatura miktarı doğrulandı."

🔴 `MANUEL`: `MatchStatus` = `ThreeWayOk`, `Status` = `Approved`.

> ❌ **Bu adımın tamamı özel uç olmadan çalışmaz.** Platform üç modeli karşılaştıramıyor (G-02).
> Özel uç olmadan Elif, üç ekranı yan yana açıp sayıları gözle karşılaştırmak zorunda kalırdı —
> ve 20 kalemlik bir faturada bunu yapmazdı.

---

## Adım 8 — Ödeme

`Payment` **#9001** — `PAY-2026-0033` 🔴

| Alan | Değer |
|---|---|
| `SupplierId` / `SupplierName` | Beta Teknoloji |
| `BankAccountId` | Beta — `TR33 0006 ...` |
| `PlannedDate` | 12.12.2026 |
| `Amount` | 55.272,00 ₺ |
| `PaymentMethod` | `BankTransfer` |
| `Status` | `Planned` → `PendingApproval` → `Approved` |

`PaymentAllocation` **#9101** — fatura #8001'e 55.272,00 ₺

### Vade takvimi — ❌ hiçbiri çalışmıyor

| Tarih | Olması gereken | Bugün |
|---|---|---|
| 05.12.2026 | `INV_DUE_7` → Finans uzmanı | ❌ G-04 |
| 09.12.2026 | `INV_DUE_3` → uzman + müdür | ❌ G-04 |
| 12.12.2026 | `INV_DUE_TODAY` → Finans müdürü | ❌ G-04 |
| 13.12.2026+ | `INV_OVERDUE` → her gün | ❌ G-04 |

🔴 `MANUEL`: Ödeme yapıldıktan sonra `Status` = `Executed`, `PaymentDate` = 12.12.2026;
`SupplierInvoice.PaidAmount` = 55.272, `RemainingAmount` = 0, `Status` = `Paid`;
`BudgetTransaction` (`Actual`) elle açılıyor.

---

## Özet: oluşan kayıtlar

| Model | Adet | ID'ler |
|---|---|---|
| `PurchaseRequest` | 1 | #1001 |
| `PurchaseRequestItem` | 1 | #2001 |
| `PurchaseRequestApproval` | 2 | #2101, #2102 🔴 elle |
| `Rfq` | 1 | #3001 |
| `RfqItem` | 1 | #3101 |
| `RfqSupplier` | 3 | #3201-3203 |
| `SupplierQuotation` | 3 | #4001-4003 |
| `SupplierQuotationItem` | 3 | #4101-4103 |
| `QuotationComparison` | 1 | #5001 |
| `QuotationComparisonLine` | 3 | #5101-5103 |
| `PurchaseOrder` | 1 | #6001 |
| `PurchaseOrderItem` | 1 | #6101 |
| `GoodsReceipt` | 2 | #7001, #7002 |
| `GoodsReceiptItem` | 2 | #7101, #7102 |
| `SupplierInvoice` | 1 | #8001 |
| `SupplierInvoiceItem` | 1 | #8101 |
| `InvoiceException` | 1 | #8201 |
| `Payment` | 1 | #9001 |
| `PaymentAllocation` | 1 | #9101 |
| **Toplam iş kaydı** | **30** | |
| `WorkflowInstance` | 3 | #501-503 |
| `WorkflowTask` | 5 | #701-705 |
| `WorkflowEvent` | ~24 | hash zincirli |
| `WorkflowOutbox` | ~12 | |
| `AuditLog` | **~85** | her yazma + her elle düzeltme |
| `BudgetTransaction` | **0** ❌ | 2 olmalıydı |

---

## Skor

| Boyut | Sonuç |
|---|---|
| **Uçtan uca tamamlandı mı** | ✅ Evet — 8 adımın 8'i |
| **Veri modeli yeterli miydi** | ✅ Evet — 30 kaydın hepsi doğru yapıda |
| **Onay akışları çalıştı mı** | ✅ Evet — 3 instance, 5 görev, hepsi doğru yönlendirildi |
| **Tutar kademesi doğru seçildi mi** | ✅ Evet — 50.000 ₺ → K3 (sınır davranışı doğru) |
| **Kısmi teslimat desteklendi mi** | ✅ Veri olarak evet, hesap olarak hayır |
| **Uyuşmazlık yakalandı mı** | 🔧 Özel uçla evet, platformla hayır |
| **Elle müdahale sayısı** | 🔴 **23** |
| **Yazılan özel kod** | 🔧 2 backend ucu + 1 Angular ekranı |

### 23 manuel müdahale nereden geliyor

| Kaynak | Adet |
|---|---|
| Belge numarası üretimi (G-01) | 7 |
| Tutar / toplam hesabı (G-05) | 6 |
| Durum geçişi (G-03) | 6 |
| Rollup güncellemesi (G-05) | 3 |
| Bütçe hareketi (G-02) | 1 |

> **Okuma:** Süreç uçtan uca **çalışıyor** — ama her belgede ortalama **3 elle müdahale** var ve
> bunların hiçbiri iş kararı değil, sistemin yapması gereken hesap. Gerçek bir kurulumda bu, ya
> kullanıcı direncine ya da veri kalitesi bozulmasına yol açar.
>
> G-01, G-03 ve G-05 kapatılırsa manuel müdahale **23 → 1**'e düşer (kalan: bütçe hareketi, G-02'nin
> işi).
