# 07 · İş Süreçleri

9 uçtan uca süreç. Her biri için: akış, durum makinesi, sorumluluk devirleri ve platformun nerede
yetmediği.

Gösterim: `[Rol]` sorumlu · `⟨WF⟩` workflow gerektirir · `⟨SCH⟩` zamanlanmış iş gerektirir ·
`⟨RULE⟩` iş kuralı gerektirir

---

## S1 · Tedarikçi Kaydı ve Onayı

### Akış

```
[Purchasing Specialist]
  Supplier kaydi olusturur (Status = Draft)
  + SupplierContact, SupplierAddress, SupplierBankAccount, SupplierDocument
        │
        ▼ "Onaya Gonder"  →  Status = PendingApproval
        │
   ⟨WF⟩ SUPPLIER-ONAY akisi baslar
        │
        ├─► [Purchasing Manager]   ticari inceleme
        │       └─ Red → Status = Draft, gerekce yazilir
        ▼
        ├─► [Finance Manager]      vergi no, IBAN, mali durum kontrolu
        │       └─ Red → Status = Draft
        ▼
        └─► [Management]           nihai onay  (yalnizca stratejik kategoriler)
                │
                ▼
        Status = Active, ApprovedOn ve ApprovedByEmployeeId doldurulur
```

### Durum makinesi

```
Draft ──────────► PendingApproval ──────► Active ──────► Suspended ──────► Active
  ▲                     │                    │               │
  └─────── red ─────────┘                    │               └──────► Blacklisted
                                              │                              │
                                              └──────► Blacklisted           │
                                                                             ▼
                                        Active/Suspended/Blacklisted ───► Archived
```

| Geçiş | Kim | Koşul |
|---|---|---|
| `Draft → PendingApproval` | Purchasing Specialist | Zorunlu belgeler yüklü ⟨RULE⟩ BR-12 |
| `PendingApproval → Active` | ⟨WF⟩ zincir tamamlanır | — |
| `PendingApproval → Draft` | Herhangi bir onaycı reddeder | Gerekçe zorunlu |
| `Active → Suspended` | Purchasing Manager | Geçici — belge süresi doldu, performans düştü |
| `Active/Suspended → Blacklisted` | Management | `BlacklistReason` zorunlu ⟨RULE⟩ BR-15 |
| `→ Archived` | System Admin | 3 yıl hareketsiz ⟨SCH⟩ |

### Platform durumu

| Adım | Durum | Not |
|---|---|---|
| Kayıt + alt kayıtlar tek transaction | ✅ | `addTree` |
| Onaya gönderme tetikleyicisi | ✅ | `onUpdate` + koşul `Status eq PendingApproval` |
| Üç kademeli onay zinciri | ✅ | Üç ardışık `approval` adımı |
| `Status = Active` otomatik yazılsın | ❌ | **G-03** — motor yalnız `WorkflowStatus` yazar |
| `ApprovedOn` otomatik dolsun | ❌ | G-03 |
| Zorunlu belge kontrolü | ❌ | **G-02** — alt kayıt sayımı yapılamaz |
| Belge süresi dolunca `Suspended` | ❌ | **G-04** |
| 3 yıl hareketsizse `Archived` | ❌ | G-04 |

> ❌ **Sürecin çıktısı yazılamıyor.** Onay zinciri tamamlandığında `Status` hâlâ `PendingApproval`
> kalır; birinin elle `Active` yapması gerekir. Bu, onayın **anlamını** boşaltır — sistem "onaylandı"
> bilgisini taşıyor ama kimse üzerine kural kuramıyor.

---

## S2 · Ürün ve Fiyat Listesi Yönetimi

```
[Purchasing Specialist]
  Product olusturur → ProductSupplier ile tedarikçi baglar
        │
        ▼
  PriceList olusturur (Status = Draft) + PriceListItem
        │
        ▼ "Aktiflestir" → Status = Active
        │
   ⟨SCH⟩ ValidTo gecince → Status = Expired          ❌ G-04
   ⟨RULE⟩ Ayni tedarikçinin cakisan tarihli iki aktif listesi olamaz   ❌ G-02
```

**Platform durumu:** ⚠️ Veri yapısı ✅, otomasyon ❌. Fiyat listesi süresi dolduğunda sistem
uyarmaz; süresi geçmiş fiyattan sipariş açılabilir.

---

## S3 · Satın Alma Talebi — ana süreç

### Akış

```
[Employee]
  PurchaseRequest olusturur (Status = Draft)
  + PurchaseRequestItem (N kalem)
  + PurchaseRequestAttachment (opsiyonel)
        │
        │  ⟨RULE⟩ TotalAmount = SUM(items.EstimatedLineTotal)     ❌ G-05
        │  ⟨RULE⟩ Butce kontrolu: Budget.AvailableAmount >= Total  ❌ G-02
        │
        ▼ "Onaya Gonder" → Status = Submitted
        │
   ⟨WF⟩ Tutara gore DORT farkli akistan biri baslar
        │
        ├─ 0 – 10.000 TL          →  [Department Manager]
        ├─ 10.000 – 50.000 TL     →  [Department Manager] → [Purchasing Manager]
        ├─ 50.000 – 250.000 TL    →  [Purchasing Manager] → [Finance Manager]
        └─ 250.000 TL +           →  [Purchasing Manager] → [Finance Manager] → [Management]
        │
        ▼ tum adimlar onay
  Status = Approved
        │
        ▼
  [Purchasing Specialist] devrali  →  S4 (RFQ) veya dogrudan S6 (PO)
```

### Durum makinesi

```
Draft ──► Submitted ──► UnderReview ──► Approved ──► Completed
  │           │              │              │
  │           │              └─► Rejected ──┘ (yeni talep acilir)
  │           │
  └───────────┴──────────────────────────────► Cancelled
```

| Geçiş | Kim | Not |
|---|---|---|
| `Draft → Submitted` | Employee (sahip) | ⟨WF⟩ tetikler |
| `Submitted → UnderReview` | ⟨WF⟩ ilk görev açılınca | ❌ G-03 |
| `UnderReview → Approved` | ⟨WF⟩ zincir tamamlanınca | ❌ G-03 |
| `UnderReview → Rejected` | Herhangi bir onaycı | Gerekçe zorunlu |
| `Approved → Completed` | Sipariş teslim alınınca | ❌ G-02 — çapraz-belge |
| `* → Cancelled` | Sahip veya Purchasing Manager | `Approved` sonrası yasak ⟨RULE⟩ BR-03 |

### Platform durumu

| Adım | Durum |
|---|---|
| Talep + kalemler tek transaction | ✅ |
| Talep numarası otomatik | ❌ **G-01** |
| Toplam tutar hesabı | ❌ **G-05** |
| Bütçe kontrolü | ❌ **G-02** |
| Tutar bazlı dört kademe | ✅ dört ayrı workflow tanımı ([08](08-workflow-tasarimi.md)) |
| Departman müdürü = **talebin** departman müdürü | ❌ **organizasyonel atama yok** |
| Durum otomatik güncellensin | ❌ **G-03** |
| Onaylanmış talep kilitlensin | ❌ **G-02** |

> ❌ **İki kritik açık bir arada:** tutar istemci tarafından yazılıyor (G-05) ve onay kademesi o
> tutara bakıyor. API'yi doğrudan çağıran bir kullanıcı `TotalAmountTry = 1` yazarak 500.000 TL'lik
> talebi departman müdürü onayına düşürebilir. Test T-31.

---

## S4 · Teklif Toplama (RFQ)

```
[Purchasing Specialist]
  Onayli PurchaseRequest'ten Rfq turetir          ⟨RULE⟩ BR-08: yalniz Approved talepten
  + RfqItem (talep kalemlerinden kopyalanir)
  + RfqSupplier (N tedarikçi secilir)             ⟨RULE⟩ BR-14: yalniz Active tedarikçi  ❌ G-02
        │
        ▼ "Gonder" → Rfq.Status = Sent, RfqSupplier.Status = Sent, SentOn damgalanir
        │
        │  ⟨SCH⟩ DueDate'e 2 gun kala yanit vermeyene hatirlatma   ❌ G-04
        │  ⟨SCH⟩ DueDate gecince Rfq.Status = Expired             ❌ G-04
        │
        ▼ Tedarikçi teklif gonderir (e-posta/PDF)
  [Purchasing Specialist] SupplierQuotation olarak SISTEME GIRER
  + SupplierQuotationItem
  + QuotationFile (PDF eki)
        │
        ▼ En az 3 teklif toplandi  → Rfq.Status = Evaluating
        ▼
  S5 (Karsilastirma)
```

> ⚠️ **Tedarikçi teklifi kendisi girmiyor.** Tedarikçi portalı platformda mümkün değil
> ([03](03-roller-ve-yetki.md) R10) — teklifler satın alma uzmanı tarafından elle girilir. Bu,
> sürecin en çok emek isteyen adımı ve gerçek bir ürün eksiği.

**Platform durumu:** ⚠️ Veri yapısı ✅; süre takibi ❌ (G-04), tedarikçi durum kontrolü ❌ (G-02),
"en az 3 teklif" kuralı ❌ (G-02).

---

## S5 · Teklif Karşılaştırma ve Tedarikçi Seçimi

```
[Purchasing Specialist]
  QuotationComparison olusturur
  Agirliklari belirler: Fiyat %40 · Teslimat %20 · Odeme %15 · Garanti %10 · Puan %15
        │
        │  ⟨RULE⟩ Agirliklar toplami = 100                   ❌ G-02
        │  Sistem her teklif icin QuotationComparisonLine uretir:
        │    - GrandTotalTry (kur cevrimi)                    ❌ G-05
        │    - PriceScore = (enDusuk / bu) × 100              ❌ G-05
        │    - DeliveryScore, PaymentScore, WarrantyScore     ❌ G-05
        │    - RatingScore ← Supplier.RatingAverage           ❌ capraz-model  G-02
        │    - PreviousPurchasePrice ← ProductSupplier        ❌ capraz-model  G-02
        │    - TotalScore = agirlikli toplam                  ❌ G-05
        │    - Rank                                            ❌ G-05
        ▼
  KULLANICI karar verir (sistem onerir, kullanici secer)
  SelectedQuotationId + SelectionReason
        │
        ▼ Status = PendingApproval
   ⟨WF⟩ [Purchasing Manager] onayi
        ▼
  Status = Approved → SupplierQuotation.Status = Selected, digerleri Rejected  ❌ G-03
        ▼
  S6 (Siparis)
```

### Karşılaştırma kriterleri

| Kriter | Kaynak | Platform |
|---|---|---|
| Unit Price / Total Price | `SupplierQuotationItem` | ✅ veri var |
| VAT | `SupplierQuotationItem.VatRate` | ✅ |
| Discount | `SupplierQuotationItem.DiscountRate` | ✅ |
| Delivery Time | `SupplierQuotation.DeliveryDays` | ✅ |
| Payment Terms | `SupplierQuotation.PaymentTermDays` | ✅ |
| Warranty | `SupplierQuotation.WarrantyMonths` | ✅ |
| Supplier Rating | `Supplier.RatingAverage` | ❌ çapraz-model (G-02) |
| Previous Purchase Price | `ProductSupplier.LastPurchasePrice` | ❌ çapraz-model (G-02) |

> ❌ **Bu süreç, sistemin dinamik UI ile karşılanamayan tek büyük ekranıdır.** Gerekçe
> [13](13-ui-ux-tasarimi.md)'te: rapor tek modelden çalışıyor (JOIN yok), pivot/matris görünümü yok,
> hesaplanan kolon yok, koşullu hücre biçimlendirme yok, "seçilenleri karşılaştır" aksiyonu yok.
>
> **Karar:** özel bir Angular ekranı yazılacak (`quotation-comparison` component + çapraz-model
> okuma için yeni bir backend ucu). Bu, blueprint'in "kod yazmak zorunda kaldığımız" ilk yeridir.

---

## S6 · Satın Alma Siparişi

```
[Purchasing Specialist]
  Secilen tekliften PurchaseOrder turetir         ⟨RULE⟩ BR-06: yalniz onayli talep/teklif uzerinden
  + PurchaseOrderItem (teklif kalemlerinden)
        │  ⟨RULE⟩ Siparis miktari teklif miktarini asamaz    ❌ G-02
        │  ⟨RULE⟩ Butce taahhudu yazilir (BudgetTransaction: Commitment)  ❌ G-02
        ▼ Status = PendingApproval
        │
   ⟨WF⟩ PO-ONAY akisi (tutara gore 2 kademe)
        ▼
  Status = Approved
        ▼ "Tedarikçiye Gonder" → Status = SentToSupplier, SentToSupplierOn damgalanir
        │
        │  ⟨SCH⟩ ExpectedDeliveryDate gecince gecikme bildirimi   ❌ G-04
        ▼
  S7 (Teslimat)
```

### Durum makinesi

```
Draft ──► PendingApproval ──► Approved ──► SentToSupplier ──► PartiallyDelivered ──► Delivered ──► Closed
  │              │                │              │                    │                  │
  └──────────────┴────────────────┴──────────────┴────────────────────┴──────────────────┘
                                   └──► Cancelled  (yalniz teslimat baslamadan ⟨RULE⟩ BR-19)
```

| Geçiş | Tetikleyici | Platform |
|---|---|---|
| `SentToSupplier → PartiallyDelivered` | İlk `GoodsReceipt` onaylanınca | ❌ G-02 |
| `PartiallyDelivered → Delivered` | `SUM(ReceivedQuantity) >= SUM(OrderedQuantity)` | ❌ **G-02 + G-05** |
| `Delivered → Closed` | Tüm faturalar ödendi | ❌ G-02 |

> ❌ **Bu sürecin durum geçişlerinin hiçbiri otomatik değil.** Üçü de alt kayıt toplamına bakıyor;
> platform ne rollup yapabiliyor (G-05) ne çapraz-belge kural kurabiliyor (G-02). Depo sorumlusu mal
> kabul girdikten sonra **birinin elle** siparişi `PartiallyDelivered` yapması gerekiyor.

---

## S7 · Mal Kabul (kısmi teslimat)

```
[Warehouse Manager]
  Sevkiyat gelir → GoodsReceipt olusturur
  PurchaseOrderId secer → sistem acik kalemleri getirmeli  ❌ capraz-model  G-02
  + GoodsReceiptItem: ReceivedQuantity, AcceptedQuantity, RejectedQuantity
        │
        │  ⟨RULE⟩ AcceptedQuantity <= ReceivedQuantity              ❌ G-02
        │  ⟨RULE⟩ ReceivedQuantity <= PO.RemainingQuantity          ❌ G-02
        │  ⟨RULE⟩ PurchaseOrderItem.ReceivedQuantity += bu miktar   ❌ G-05
        ▼ Status = Confirmed
        │
        ▼ Kalite kontrolu: InspectionResult
        │     Passed     → kabul
        │     Failed     → RejectedQuantity, iade sureci
        │     Conditional→ sartli kabul, not zorunlu
        ▼
  S8 (Fatura)
```

### Kısmi teslimat örneği

Sipariş: **100 adet**

| Olay | `ReceivedQuantity` (bu irsaliye) | PO satırı toplam | `RemainingQuantity` | PO durumu |
|---|---|---|---|---|
| GR-001 | 40 | 40 | 60 | `PartiallyDelivered` |
| GR-002 | 60 | 100 | 0 | `Delivered` |

> ❌ **Sağdaki üç kolon platformda hesaplanamıyor.** Depo sorumlusu her mal kabulünden sonra
> `PurchaseOrderItem.ReceivedQuantity` ve `RemainingQuantity` alanlarını **elle** güncellemeli. Bir
> kez unutulursa 3-way matching de yanlış çalışır. Bu, G-05'in en somut ve en tehlikeli sonucu.

---

## S8 · Fatura ve 3-Way Matching

```
[Finance Specialist]
  Tedarikçi faturasi gelir → SupplierInvoice olusturur
  PurchaseOrderId secer + SupplierInvoiceItem girer
        ▼ Status = PendingMatch
        │
   ⟨RULE⟩ 3-WAY MATCHING                                        ❌ G-02 (tamami)
        │
        │  Her satir icin karsilastir:
        │    PurchaseOrderItem.OrderedQuantity   (siparis)
        │    PurchaseOrderItem.ReceivedQuantity  (irsaliye toplami)
        │    SupplierInvoiceItem.InvoicedQuantity(fatura)
        │    PurchaseOrderItem.UnitPrice         vs  SupplierInvoiceItem.UnitPrice
        │
        ├─ Hepsi uyumlu       → MatchStatus = ThreeWayOk,    Status = Matched
        └─ Uyusmazlik var     → MatchStatus = <tip>,         Status = Exception
                                 + InvoiceException kaydi acilir
        ▼
  [Finance Specialist] uyusmazligi cozer (Accepted / Rejected / CreditNoteRequested)
        ▼
   ⟨WF⟩ [Finance Manager] onayi  (yalniz Exception varsa)
        ▼
  Status = Approved  →  S9 (Odeme)
```

### Uyuşmazlık kuralları

| Durum | Sipariş | İrsaliye | Fatura | Sonuç |
|---|---|---|---|---|
| Normal | 100 | 100 | 100 | `ThreeWayOk` |
| **Kısmi teslim, tam fatura** | 100 | 80 | 100 | `QuantityOver` · **Blocking** |
| Kısmi teslim, kısmi fatura | 100 | 80 | 80 | `ThreeWayOk` |
| Fazla teslim | 100 | 110 | 110 | `QuantityOver` · Warning (tolerans %5) |
| Fiyat farkı | 10 TL | — | 12 TL | `PriceOver` · **Blocking** |
| İrsaliyesiz fatura | 100 | 0 | 100 | `NoReceipt` · **Blocking** |
| Mükerrer fatura | — | — | aynı no | `DuplicateInvoice` · **Blocking** |
| KDV farkı | %20 | — | %18 | `VatMismatch` · Warning |

> ❌ **Bu tablonun tamamı platformda ifade edilemez.** Üç ayrı model (`PurchaseOrderItem`,
> `GoodsReceiptItem`, `SupplierInvoiceItem`) arasında satır bazlı karşılaştırma gerekiyor; platformda
> ne çapraz-model kural (G-02) ne çapraz-model sorgu (G-07) var.
>
> **Bu, M8 modülünün varlık sebebidir ve karşılanamıyor.** Fatura modülü bugün, uyuşmazlıkları
> **elle tespit edip elle kaydeden** bir veri giriş ekranından ibaret.

---

## S9 · Ödeme

```
[Finance Specialist]
  Onayli faturalardan Payment planlar
  + PaymentAllocation (bir odeme N faturaya dagitilir)
        │  ⟨RULE⟩ SUM(AllocatedAmount) = Payment.Amount           ❌ G-02
        │  ⟨RULE⟩ AllocatedAmount <= Invoice.RemainingAmount      ❌ G-02
        ▼ Status = PendingApproval
   ⟨WF⟩ [Finance Manager] onayi
        ▼ Status = Approved
        │
        │  ⟨SCH⟩ VADE TAKVIMI                                     ❌ G-04 (tamami)
        │    DueDate − 7 gun  → [Finance Specialist] bildirim
        │    DueDate − 3 gun  → [Finance Specialist] + [Finance Manager]
        │    DueDate          → [Finance Manager] bildirim
        │    DueDate + 1 gun  → gecikme bildirimi, her gun tekrar
        ▼
  Odeme yapilir → Status = Executed, PaymentDate damgalanir
        │  ⟨RULE⟩ Invoice.PaidAmount += AllocatedAmount            ❌ G-05
        │  ⟨RULE⟩ PaidAmount >= GrandTotal → Invoice.Status = Paid ❌ G-02
        │  ⟨RULE⟩ BudgetTransaction: Actual yazilir                ❌ G-02
```

> ❌ **Ödeme modülünün otomasyon değeri sıfır.** Vade hatırlatmaları modülün ana faydasıydı ve
> hiçbiri kurulamıyor (G-04). Geriye sadece "ödeme kaydı tutan bir tablo" kalıyor — Excel'e kıyasla
> tek üstünlüğü denetim kaydı.

---

## Süreç–platform özeti

| Süreç | Veri modeli | Workflow | Otomasyon | Genel |
|---|---|---|---|---|
| S1 Tedarikçi onayı | ✅ | ✅ | ❌ G-03, G-04 | ⚠️ yarı çalışır |
| S2 Ürün/fiyat | ✅ | — | ❌ G-04 | ⚠️ |
| S3 Satın alma talebi | ✅ | ✅ | ❌ G-01, G-02, G-03, G-05 | ⚠️ onay çalışır, gerisi elle |
| S4 RFQ | ✅ | — | ❌ G-02, G-04 | ⚠️ |
| S5 Karşılaştırma | ✅ | ✅ | ❌ G-02, G-05 + özel ekran | ❌ **kod gerekir** |
| S6 Sipariş | ✅ | ✅ | ❌ G-02, G-05 | ⚠️ |
| S7 Mal kabul | ✅ | — | ❌ G-02, G-05 | ⚠️ **riskli** — elle rollup |
| S8 Fatura / 3-way | ✅ | ✅ | ❌ **G-02 (tamamı)** | ❌ **karşılanmıyor** |
| S9 Ödeme | ✅ | ✅ | ❌ **G-04 (tamamı)** | ❌ **karşılanmıyor** |

**Okuma:** Dokuz sürecin **veri modeli 9/9 kurulabiliyor**, **onay akışları 6/6 kurulabiliyor**, ama
**otomasyon 0/9**. Platform bir satın alma sisteminin iskeletini taşıyor, kaslarını taşımıyor.
