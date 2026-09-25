# 11 · Denetim Kaydı (Audit)

---

## Platformun mekanizması

Denetim, CoreLogic'in **en iyi tasarlanmış** özelliklerinden biri. Tek boğaz noktası var ve
kaçırmıyor.

### Tetikleyici

`AuditSaveChangesInterceptor` — bir EF Core `SaveChangesInterceptor`, `CoreLogicContext.cs:44`'te
bağlanır. Sınıf yorumu (satır 29-31) iddiayı açıkça koyuyor:

> *"Bu sınıf sistemdeki TEK kayıt-yazma boğaz noktasıdır: `PublishedModelManager.Add/Update/Delete`,
> `AddTree` ve cascade silme dahil her yol buradan geçer."*

Bu doğrulandı. Toplu silme, ağaç kaydetme, cascade soft-delete — hepsi aynı noktadan geçiyor.

### `AuditLog` şeması

`Entities/Concrete/AuditLog.cs:16-46`:

| Kolon | Tip | İçerik |
|---|---|---|
| `ID` | int | |
| `EntityName` | string | CLR kısa adı — `PurchaseRequest` |
| `EntityId` | string | Kaydın ID'si |
| `Action` | string | `Added` · `Modified` · `Deleted` |
| `OldValues` | string | JSON — değişen alanların eski değerleri |
| `NewValues` | string | JSON — yeni değerler |
| `UserId` | int | Anonim ise `0` |
| `Timestamp` | datetime | UTC |
| `Ip` | string | İstemci IP'si |
| `TenantId` | int | |

`DbBaseObject` türevi **değil** — bilinçli: salt-ekleme log olsun ve interceptor kendi yazımını
audit'lemesin diye (satır 8-12).

### İki fazlı çalışma

1. `SavingChanges` — ChangeTracker'dan eski + yeni değerler toplanır (satır 71-178)
2. `SavedChanges` — identity dolduktan sonra **ayrı bir `CoreLogicContext`** ile yazılır (satır 236-245)

Re-entrancy `ConditionalWeakTable` ile kırılır.

### Aynı interceptor iki iş daha yapıyor

| İş | Satır |
|---|---|
| `CreatedOn`/`CreatedBy`/`LastModifiedOn`/`LastModifiedBy` otomatik doldurma | 96-114 |
| `WorkflowOutbox` satırı yazma (yalnız dinamik tipler, **çağıranın context'iyle**) | 261-315 |

---

## ✅ İyi çalışanlar

### Soft-delete doğru tespit ediliyor

`Active` `true → false` geçişi, EF açısından `Modified` olmasına rağmen `"Deleted"` olarak yazılır
(`AuditSaveChangesInterceptor.cs:134` + `IsSoftDelete:323-331`). Tüm silmeler soft olduğu için bu
kritik — aksi halde denetim kaydında **hiçbir silme görünmezdi**.

### Ağaç ve cascade kapsanıyor

`addTree` ile 1 sipariş + 20 kalem kaydedildiğinde **21 audit satırı** oluşur. Sipariş soft-delete
edildiğinde cascade ile silinen her alt kayıt ayrı satır yazar. Kapsama boşluğu yok.

### IP kaydediliyor

Çoğu benzer platform bunu atlar. Uyum denetimlerinde "bu değişiklik nereden yapıldı" sorusu
cevaplanabilir.

---

## ❌ Eksikler

### 1. Yalnız 3 eylem tipi

Üretilen `Action` değerleri **tam olarak**: `Added`, `Modified`, `Deleted`
(`AuditSaveChangesInterceptor.cs:121-137`). Bu tasarımın ihtiyaç duyduğu eylemler:

| Eylem | Bugün nasıl görünüyor | Sorun |
|---|---|---|
| **Approve** | Görünmüyor — `WorkflowTask` audit'lenmiyor | ❌ "Bu talebi kim onayladı" `AuditLog`'da yok |
| **Reject** | Görünmüyor | ❌ |
| **Cancel** | `Modified` (`Status` değişimi olarak) | ⚠️ ayırt edilemiyor |
| **Status Change** | `Modified` | ⚠️ diğer alan değişikliklerinden ayrılamıyor |
| **Submit** | `Modified` | ⚠️ |
| **Export** | Görünmüyor | ❌ "Kim tüm tedarikçi listesini indirdi" bilinmiyor |
| **Login / Logout** | Görünmüyor | ❌ |
| **Permission change** | `Modified` (`Permission` tablosunda) | ⚠️ okunabilir ama yorumlanması zor |
| **Publish (şema değişikliği)** | Görünmüyor | ❌ Model yayınlama izi yok |

> ❌ **Onay izi `AuditLog`'da değil.** Workflow kendi olay zincirini `WorkflowEvent` tablosunda
> tutuyor (14 olay tipi, **hash zincirli**, salt-ekleme, `verifyChain` ucuyla doğrulanabilir) — bu
> aslında `AuditLog`'dan **daha güçlü** bir mekanizma. Ama iki iz **birleşmiyor**: bir kaydın
> tam hikâyesini görmek için iki ayrı tabloya bakmak gerekiyor ve bunu yapan bir ekran yok.

### 2. Kayıt bazlı denetim görünümü yok

| Nerede | Durum |
|---|---|
| Kayıt detay ekranı (`model-detail`) | ❌ Audit paneli **yok** |
| `model-data`'daki "Sürümler" paneli | ⚠️ **Şema sürümleridir**, kayıt geçmişi değil |
| `/audit-logs` ekranı | ⚠️ Global, **yalnız admin**, filtre `entityName` + tarih aralığı |

> ❌ **"Bu talebin geçmişi" sorusu son kullanıcı tarafından cevaplanamıyor.** Finance Specialist,
> bir faturanın tutarının ne zaman ve kim tarafından değiştirildiğini göremez — admin olması ve
> `/audit-logs`'ta `entityName = SupplierInvoice` filtreleyip **tüm** faturalar arasından ilgili
> `EntityId`'yi aramaya çalışması gerekir.

### 3. Ölçeklenmiyor

| Sorun | Kanıt |
|---|---|
| Okuma ucu **sayfalama yapmıyor** | `AuditLogController.cs:15-42` — yalnız `entityName`, `from`, `to` |
| UI **istemcide** sayfalıyor | `audit-log.component.ts:38-52` — *"backend tüm kayıtları döndürür, dilimleme client-side"* |
| `EntityId` filtresi yok | Tek bir kaydın geçmişi çekilemez |
| `UserId` filtresi yok | "Bu kullanıcı ne yaptı" sorulamaz |
| `Action` filtresi yok | "Tüm silmeleri göster" sorulamaz |

Bu uygulamada 3 yılda **~4 milyon** audit satırı bekleniyor ([06](06-veritabani-tasarimi.md)).
`/audit-logs` ekranı bu hacimde **açılmaz** — tarayıcı 4 GB JSON indirmeye çalışır.

> ❌ Bu, blueprint'in bulduğu en somut **ölçeklenme hatası**. Düzeltmesi küçük: sunucu tarafı
> sayfalama + `entityId`/`userId`/`action` filtreleri. ~1 gün.

### 4. Kayıp sessiz

Audit yazımı `try/catch` ile **yutuluyor** (`AuditSaveChangesInterceptor.cs:242-245`):

> *"Audit hatası asıl işlemi kesmemeli; ileride retry/dead-letter kuyruğu eklenebilir"*

Ayrıca **ayrı context** kullandığı için iş transaction'ına katılmıyor (satır 253-256) — iş rollback
olursa audit kaydı **kalabilir** (hayalet kayıt), ya da audit yazımı patlarsa iş devam eder ve iz
**kaybolur**.

> ⚠️ İş kararı olarak savunulabilir (kullanıcının işini audit yüzünden kesmemek), ama **uyum
> gerektiren bir satın alma sisteminde kabul edilemez**. En azından bir dead-letter kuyruğu ve
> "audit kaybı" alarmı gerekir.

### 5. `AuditLog` raporlanamıyor

Rapor motoru yalnızca **yayınlanmış dinamik modeller** üzerinde çalışır. `AuditLog` bir sistem
tablosudur → "Aylık değişiklik hacmi", "En çok kayıt değiştiren kullanıcılar", "Onay süreleri"
raporları **yapılamaz**.

---

## Bu uygulamanın denetim gereksinimleri

Satın alma, denetimin en sıkı olduğu alanlardan biri. Gerekenler ve karşılanma durumu:

| Gereksinim | Neden | Durum |
|---|---|---|
| Her tutar değişikliği izlenebilir | Yolsuzluk tespiti | ✅ `OldValues`/`NewValues` |
| Onay kararı ve kim verdiği | Sorumluluk | ⚠️ `WorkflowEvent`'te, `AuditLog`'da değil |
| Tedarikçi seçim gerekçesi | Rekabet denetimi | ✅ `SelectionReason` alanı + audit |
| Bütçe aşım onayı (override) | Mali kontrol | ⚠️ `BudgetCheckResult = Overridden` audit'lenir ama kim override etti belirsiz |
| Fatura uyuşmazlığı kabulü | Mali risk | ✅ `InvoiceException.Resolution` audit'lenir |
| Banka hesabı değişikliği | **Dolandırıcılık** — en kritik | ✅ audit'lenir ⚠️ ama **alarm yok** |
| Ödeme onayı | Mali kontrol | ⚠️ `WorkflowEvent` |
| Yetki değişiklikleri | Erişim kontrolü | ⚠️ `Permission` tablosunda `Modified` olarak |
| Şema değişiklikleri (yeni kolon) | Değişiklik yönetimi | ❌ İzlenmiyor |
| Veri dışa aktarma | Veri sızıntısı | ❌ İzlenmiyor |
| Denetim kaydı değiştirilemezliği | Uyum | ⚠️ Controller INSERT'e kapalı ama **DB seviyesinde koruma yok** |

> ⚠️ **`SupplierBankAccount.Iban` değişikliği en kritik denetim olayıdır.** Tedarikçi IBAN'ını
> değiştirip ödemeyi kendine yönlendirme, satın alma dolandırıcılığının en yaygın biçimi. Platform
> bu değişikliği **kaydediyor** (✅) ama **kimseye haber vermiyor** (❌ G-04/G-08). Gerçek bir
> kurulumda bu, anlık bildirim gerektiren bir olaydır.

---

## Tasarım kararları

Platformun verdiğiyle çalışmak için bu tasarımın aldığı önlemler:

### 1. `*Approval` alt modelleri (okuma kopyası)

`PurchaseRequestApproval` ve `PurchaseOrderApproval`, workflow görevlerinin dinamik model
kopyasıdır. **Var olma sebepleri denetimdir**: `WorkflowTask` raporlanamadığı ve `AuditLog`'a
girmediği için, onay geçmişi ancak bir dinamik modele yazılırsa rapor edilebilir ve audit'lenebilir.

⚠️ Bedeli: senkronizasyon garantisi yok (G-03). Detay [04](04-entity-listesi.md) #25.

### 2. Durum alanları ayrı tutuldu

`Status` ve `MatchStatus` gibi alanlar ayrı kolonlar olarak tanımlandı; tek bir "durum" alanına
sıkıştırılmadı. Böylece `OldValues`/`NewValues` JSON'ında hangi boyutun değiştiği okunabiliyor.

### 3. Gerekçe alanları zorunlu

`RejectionReason`, `SelectionReason`, `BlacklistReason`, `ResolutionNote`, `MatchNote` — hepsi
denetim izinin **anlamlı** olması için var. Audit "Status: Approved → Rejected" der; gerekçe alanı
**neden** olduğunu söyler.

### 4. Ekler audit'leniyor

`file` kolonları `varbinary(max)` ve audit `OldValues`/`NewValues`'a girer.

> ⚠️ **Bu bir risk.** 2 MB'lık bir PDF güncellenirse audit satırı **4 MB** olur (eski + yeni).
> `InvoiceAttachment` için bu, audit tablosunu belge tablosundan büyük yapar. Ek dosyaları
> sistem dışında tutma tavsiyesi ([06](06-veritabani-tasarimi.md)) bu açıdan da doğru.
>
> Platform tarafında `file`/`image` kolonlarının audit'ten **hariç tutulması** önerilir — bu, bir
> satırlık bir düzeltme.

---

## Backlog katkısı

Denetim tarafından çıkan işler, öncelik sırasıyla:

| # | İş | Maliyet | Gerekçe |
|---|---|---|---|
| A1 | `/AuditLog` sunucu sayfalama + `entityId`/`userId`/`action` filtreleri | ~1 gün | Ekran 4M satırda açılmıyor |
| A2 | Kayıt detayında "Geçmiş" sekmesi (`AuditLog` + `WorkflowEvent` birleşik) | ~2 gün | En çok istenen eksik |
| A3 | `file`/`image` kolonlarını audit gövdesinden çıkar | ~1 saat | Audit tablosu şişmesi |
| A4 | `Approve`/`Reject`/`Submit`/`Cancel` eylemlerini `AuditLog`'a yaz | ~1 gün | Onay izi tek yerde |
| A5 | Audit dead-letter kuyruğu + kayıp alarmı | ~2 gün | Uyum |
| A6 | Şema değişikliği (publish) audit'i | ~1 gün | Değişiklik yönetimi |
| A7 | Export audit'i | ~0,5 gün | Veri sızıntısı izi |

A1 ve A3 **acil** — ikisi de bir günden az ve ikisi de sistemi kullanılamaz hale getiren sorunları
çözüyor.
