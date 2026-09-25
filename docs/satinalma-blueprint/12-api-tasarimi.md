# 12 · API Tasarımı

Bu bölüm iki listeyi yan yana koyar: **platformun verdiği** API yüzeyi ve **uygulamanın ihtiyaç
duyduğu** API yüzeyi. Aradaki fark, "hard-coded çözümlerden kaçınma" hedefinin nerede tutmadığını
gösterir.

---

## Platformun verdiği: generic CRUD

CoreLogic, yayınlanmış her model için **ayrı endpoint üretmez**. Tek bir generic controller vardır ve
model adı parametre olarak geçer.

### `/PublishedModel` — dinamik CRUD

| Uç | Gövde / parametre | İzin |
|---|---|---|
| `POST /PublishedModel/add` | `{ typeName, jsonData }` | `Create` |
| `POST /PublishedModel/addTree` | `DynamicTreeNode` | her düğüm ayrı |
| `POST /PublishedModel/update` | `{ typeName, jsonData }` | `Update` |
| `POST /PublishedModel/delete` | `?typeName=&id=` | `Delete` |
| `GET /PublishedModel/getall` | `?typeName=&parentColumn=&parentId=&page=&pageSize=` | `Read` |
| `GET /PublishedModel/get` | `?typeName=&id=` | `Read` |
| `GET /PublishedModel/models` | — | listede filtrelenir |
| `GET /PublishedModel/children` | `?parentTypeName=` | `Read` |
| `GET /PublishedModel/lookupOptions` | `?typeName=&displayColumn=&search=&page=&pageSize=&ids=` | hedef modelin `Read`'i |

**Yanıt zarfı** her uçta aynı: `{ success, message, data }` (`ApiControllerBase.Respond`).

İzinler `[RequireModelPermission(...)]` **filtresiyle** uygulanır — `typeName` sırayla action
argümanı, query, route ve body'den aranır; **bulunamazsa `ForbidResult`** (güvenli taraf).

### ❌ Sorgu yüzeyi zayıf

| Yetenek | Durum | Kanıt |
|---|---|---|
| Sayfalama | ⚠️ Var ama **opsiyonel** — `page`+`pageSize` verilmezse **sınırsız** satır | `PublishedModelManager.cs:477-505` |
| Maks sayfa boyutu | 200 | `ListMaxPageSize` |
| Sıralama | ❌ **Yok** — daima `OrderBy(ID)` | `EfEntityRepositoryBase.cs:160-175` |
| Arama | ❌ **Yok** (`lookupOptions` hariç) | — |
| Filtreleme | ⚠️ **Yalnız tek FK** (`parentColumn` + `parentId`) | `PublishedModelManager.cs:462-467` |
| Alan seçimi (projeksiyon) | ❌ Yok — hep tüm kolonlar | — |
| Toplu işlem | ❌ Yok — N kayıt = N istek | — |

> ❌ **Bu, G-06'nın API tarafıdır ve G-06'dan daha geniştir.** UI'da arama olmaması bir ekran
> sorunu; API'de filtre olmaması **entegrasyon sorunudur**. "Bekleyen faturaları getir" gibi en
> temel sorgu bile yapılamaz; istemci tüm faturaları çekip kendisi filtrelemek zorunda.
>
> Filtre altyapısı **zaten var**: `ReportingManager` 8 operatörlük bir beyaz liste ve güvenli
> ifade kurucu içeriyor (`ReportingManager.cs:502-513`). `getall`'a bağlanması yeni bir tasarım
> değil, mevcut parçanın yeniden kullanımı.

### `/Published` — şema yönetimi (admin)

| Uç | İş |
|---|---|
| `POST /Published/addTable` | Model tanımla |
| `POST /Published/addMember` | Kolon ekle |
| `POST /Published/removeMember` | Kolon kaldır (⚠️ **yalnız metadata** — SQL kolonu kalır) |
| `POST /Published/publish?typeName=` | Derle + tablo aç |
| `GET/POST/PUT/DELETE /publish/models/{id}/relationships` | İlişki CRUD |
| `POST /publish/models/{id}/validate-graph` | Döngü/derinlik kontrolü |
| `POST /publish/models/{id}/preview` | Entity grafiği + C# + DDL önizlemesi |

### Workflow (25 uç)

| Grup | Uçlar | Yetki |
|---|---|---|
| `/Workflow` | `define` `update` `list` `get` `versions` `validate` `publish` `delete` `deleted` `restore` | **10'u da admin** |
| `/WorkflowInstance` | `start` `get` `list` `forEntity` · admin: `cancel` `verifyChain` `rollback` `steps` | `[Authorize]` |
| `/WorkflowTask` | `my` `myCount` `get` `forInstance` `complete` · admin: `skip` `reassign` | atama bazlı |

### Diğer platform uçları

`/Auth` · `/User` · `/Role` · `/Permission` · `/Profile` · `/Report` · `/Dashboard` · `/AuditLog` ·
`/ModelColumnSetting` · `/Parameter` · `/Ai`

---

## Uygulamanın ihtiyaç duyduğu: domain API'si

İstenen tasarımdaki uçlar (`POST /api/purchase-requests/{id}/submit` gibi) **platformda yoktur ve
üretilemez**. Aşağıda her biri için bugünkü karşılığı ve boşluk.

### Satın alma talebi

| İstenen uç | Bugünkü karşılık | Fark |
|---|---|---|
| `POST /api/purchase-requests` | `POST /PublishedModel/addTree` (`typeName=PurchaseRequest`) | ✅ İşlevsel eşdeğer |
| `GET /api/purchase-requests` | `GET /PublishedModel/getall?typeName=PurchaseRequest&page=&pageSize=` | ⚠️ Filtre/sıralama/arama yok |
| `GET /api/purchase-requests/{id}` | `GET /PublishedModel/get?typeName=&id=` | ✅ |
| `PUT /api/purchase-requests/{id}` | `POST /PublishedModel/update` | ⚠️ Durum kontrolü yok — onaylanmış kayıt güncellenebilir |
| `DELETE /api/purchase-requests/{id}` | `POST /PublishedModel/delete` | ✅ soft-delete |
| `POST /api/purchase-requests/{id}/submit` | ❌ **Yok** | `Status` alanını `Submitted` yapan bir `update` çağrısı. İş kuralı yok, doğrulama yok |
| `POST /api/purchase-requests/{id}/approve` | ⚠️ `POST /WorkflowTask/complete` | Görev üzerinden; kayıt üzerinden değil. Talebi değil **görevi** onaylıyorsunuz |
| `POST /api/purchase-requests/{id}/reject` | ⚠️ Aynı, `decision: "reject"` | Aynı |
| `POST /api/purchase-requests/{id}/cancel` | ❌ **Yok** | `update` ile `Status = Cancelled`; "onaylanmış iptal edilemez" kuralı yok |
| `POST /api/purchase-requests/{id}/create-rfq` | ❌ **Yok** | İstemci `Rfq` + `RfqItem` ağacını kendisi kurup `addTree` çağırır |

> ❌ **Eylem uçlarının hiçbiri yok ve olamaz.** Platform, bir modele **özel eylem** tanımlama
> yeteneği sunmuyor: `PublishedTableMember` benzeri bir `PublishedTableAction` kavramı yok, toolbar'a
> buton eklenemiyor, sunucu tarafı kanca yok.
>
> Sonuç: her "eylem" aslında bir `update` çağrısıdır ve **hiçbir iş kuralı taşımaz** (G-02). Bu,
> "hard-coded çözümlerden kaçın" hedefinin **en net şekilde tutmadığı** yer.

### Belge türetme uçları — hepsi ❌

| İstenen | Ne yapardı | Bugün |
|---|---|---|
| `POST /api/purchase-requests/{id}/create-rfq` | Talep kalemlerini RFQ kalemlerine kopyala | İstemci kopyalar |
| `POST /api/rfqs/{id}/send` | Tedarikçilere gönder, `SentOn` damgala, bildirim | İstemci elle |
| `POST /api/rfqs/{id}/compare` | Karşılaştırma matrisi üret | ❌ **özel backend ucu gerekir** |
| `POST /api/quotations/{id}/select` | Seçileni işaretle, diğerlerini reddet | İstemci N ayrı `update` |
| `POST /api/quotation-comparisons/{id}/create-po` | Seçilen tekliften sipariş türet | İstemci kopyalar |
| `POST /api/purchase-orders/{id}/send-to-supplier` | Gönder + damgala + bildir | İstemci elle |
| `POST /api/purchase-orders/{id}/receive` | Mal kabul aç, açık kalemleri getir | ❌ **çapraz-model okuma gerekir** |
| `POST /api/invoices/{id}/match` | **3-way matching çalıştır** | ❌ **karşılığı yok** (G-02) |
| `POST /api/invoices/{id}/approve` | Uyuşmazlık onayı | ⚠️ workflow görevi |
| `POST /api/payments/{id}/execute` | Ödeme gerçekleştir, fatura bakiyesi güncelle | İstemci N `update` |
| `POST /api/budgets/{id}/check` | Bütçe yeterlilik kontrolü | ❌ (G-02) |

---

## Yazılması gereken özel uçlar

Blueprint'in "kod yazmak zorunda kaldığımız yerler" listesi. Bunlar platform boşluğunu kapatmıyor,
**bu uygulama için** yazılıyor.

### 1. `POST /api/procurement/quotation-comparison/{rfqId}` (zorunlu)

| | |
|---|---|
| **Neden** | Rapor motoru tek modelden çalışıyor (G-07); teklif + kalem + tedarikçi + geçmiş fiyat bir arada okunamıyor |
| **Ne döner** | Matris: satır = kalem, kolon = tedarikçi, hücre = fiyat/puan; + ağırlıklı toplam puan ve sıralama |
| **Alternatif** | Yok. S5 süreci bu uç olmadan çalışmaz |
| **Maliyet** | ~3 gün (backend) + ~4 gün (Angular ekranı) |

### 2. `POST /api/procurement/three-way-match/{invoiceId}` (zorunlu)

| | |
|---|---|
| **Neden** | G-02 — çapraz-model iş kuralı yok |
| **Ne yapar** | `PurchaseOrderItem` + `GoodsReceiptItem` + `SupplierInvoiceItem` satır bazlı karşılaştırır, `InvoiceException` kayıtları **üretir**, `MatchStatus` yazar |
| **Alternatif** | ⚠️ Uyuşmazlıkları elle tespit edip elle kaydetmek. M8 modülünün değeri sıfırlanır |
| **Maliyet** | ~4 gün |

### 3. `POST /api/procurement/rollup/{model}/{id}` (şiddetle önerilir)

| | |
|---|---|
| **Neden** | G-05 — rollup yok |
| **Ne yapar** | Belge toplamlarını ve teslim/faturalanan miktarları alt kayıtlardan yeniden hesaplar |
| **Alternatif** | ⚠️ İstemci hesaplar — tutarlılık garantisi yok, güvenlik açığı (T-31) |
| **Maliyet** | ~2 gün |

> Bu uç **G-02/G-05 kapatılana kadar bir köprüdür**. Platform rollup desteklerse silinmeli.

### 4. `POST /api/procurement/budget-check` (önerilir)

Talep tutarını ilgili bütçenin kullanılabilir tutarıyla karşılaştırır, `BudgetCheckResult` yazar ve
gerekirse `BudgetTransaction` (`Commitment`) açar. ~2 gün.

### 5. `GET /api/procurement/open-order-items/{purchaseOrderId}` (önerilir)

Mal kabul ekranı için açık kalemleri (`RemainingQuantity > 0`) döndürür. ~1 gün.

**Toplam özel backend işi: ~12 gün + ~4 gün UI.** Platform boşlukları kapanırsa 2, 3, 4 ve 5
silinebilir; 1 (karşılaştırma matrisi) **her durumda kalır** çünkü bir UI probleminin çözümüdür.

---

## Kimlik doğrulama ve başlıklar

| Başlık | Kaynak |
|---|---|
| `Authorization: Bearer <jwt>` | `authInterceptor` — `localStorage('access_token')` |
| `Accept-Language: tr\|en` | `languageInterceptor` — `localStorage('lang')` |

⚠️ **SSE istisnası:** `POST /Ai/chat` `text/event-stream` döndüğü için `fetch` kullanılır ve
**interceptor'ları bypass eder** — `ai.service.ts` başlıkları kendisi ekler. Bu uygulamada SSE
kullanılmıyor, ama benzer bir uç yazılırsa aynı tuzak geçerli.

## Hata sözleşmesi

Tüm uçlar `{ success: false, message: "..." }` döner; HTTP durumu `BadRequest`. Yetki hatası `403` +
mesaj. Doğrulama hataları `DynamicEntityValidator` üzerinden **tek mesajda birleştirilir**.

✅ `addTree` için özel davranış: **tüm ağaç DB'ye dokunulmadan doğrulanır** ve bir hata varsa hiçbiri
yazılmaz, tüm hatalar birden döner (`{ savedIds: {...}, errors: { clientId: msg } }`). Bu, 20 kalemlik
bir siparişte kullanıcıyı 20 kez hata ekranına düşürmemek için doğru tasarım.

## Versiyonlama

❌ Platform API'si **versiyonlanmamış** (`/PublishedModel/...`, `/v1/` yok). Platform Console uçları
`api/platform/v1/...` kullanıyor — tenant API'si aynı disiplini izlemiyor.

Yazılacak özel uçlar `/api/procurement/v1/...` altında toplanmalı.

---

## Özet

| Katman | Durum |
|---|---|
| Generic CRUD | ✅ Tam ve tutarlı |
| Ağaç kaydetme | ✅ İki fazlı, tek transaction, toplu hata |
| Yetki uygulaması | ✅ Filtre tabanlı, güvenli taraf |
| Yanıt/hata sözleşmesi | ✅ Tutarlı |
| **Sorgu yüzeyi** | ❌ Filtre, sıralama, arama, projeksiyon yok |
| **Eylem uçları** | ❌ Kavram olarak yok |
| **Belge türetme** | ❌ İstemcide, kural yok |
| **İş kuralı kancası** | ❌ Yok (G-02) |
| Versiyonlama | ❌ Yok |

> **Sonuç:** CoreLogic'in API'si bir **veri erişim katmanıdır**, bir **uygulama API'si değildir**.
> Bu, bir "Dynamic Data Platform" için yeterli; "Dynamic Enterprise Application Platform" için
> değil. Eksik olan tek kavram, şemanın yanına **davranış** koyabilmek: `PublishedTableAction` +
> `BusinessRule`.
