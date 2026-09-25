# 09 · Scheduler Tasarımı

> ❌ **Bu bölümün tamamı bugün uygulanamaz.** Platformun zamanlanmış iş yüzeyi **yedeklemeye
> kilitlidir**. Bölüm yine de tam olarak tasarlandı, çünkü G-04'ün kapatılması durumunda doğrudan
> uygulanabilir olması gerekiyor ve boşluğun büyüklüğünü ancak somut ihtiyaç listesi gösterir.

---

## Platformun gerçek durumu

### Altyapı: tam ve sağlam

```
ScheduledTask (master DB)
   → SchedulerTick (dakikada 1)          vadesi geleni kuyruğa atar, iş YAPMAZ
   → PlatformJobClient.Enqueue
   → PlatformJob (master kuyruk)
   → JobWorker (2 sn, lease'li)          TryLease → handler → Complete/Retry/Park
   → IPlatformJobHandler
   → PlatformJobRun (deneme günlüğü)
```

| Bileşen | Durum | Kanıt |
|---|---|---|
| Cron ayrıştırma (5 alan, dış paket yok, saat dilimi + DST duyarlı) | ✅ | `Core/Utilities/Scheduling/CronSchedule.cs:22-107` |
| Kuyruk, lease (300 sn), retry (`4^deneme` dk backoff), park | ✅ | `CreateDLL/Workers/JobWorker.cs:54-100` |
| Terk edilmiş lease kurtarma | ✅ | `JobWorker.cs:39-52` |
| Bozuk cron tespiti → `LastOutcome = "InvalidCron"`, görev durdurulur | ✅ | `SchedulerTick.cs:66-73` |
| Duraklat/aralık/yenileme kontrol düzlemi + heartbeat | ✅ | `PeriodicWorker.cs:34-302` |

### Yüzey: yedeklemeye kilitli

| Kanıt | Bulgu |
|---|---|
| `ScheduledJobTypes` kataloğu | **Tam 2 satır**: `tenant.backup`, `platform.migration-upgrade` (`ScheduledTask.cs:6-17`) |
| `ScheduledTask` satırı yazan yerler | **Tam 2**: `BackupSettingManager.cs:85-100`, `MigrationOrchestratorManager.cs:388-394` — ikisi de sabit `JobType` |
| `IScheduledTaskDal` yüzeyi | `GetByTenantAndType` · `GetPlatformTask` · `Upsert` · `GetDue` · `MarkRun` — **generic CRUD yok** |
| `ScheduledTask` için controller | ❌ **Yok** |
| Sorgu tabanlı aksiyon motoru | ❌ Kod tabanında mevcut değil |

**Kayıtlı handler'lar (5):**

| JobType | Sınıf | Kuyruğa nereden girer |
|---|---|---|
| `tenant.provision` | `TenantProvisionJobHandler` | Şirket kaydı |
| `workflow.notify` | `WorkflowNotifyJobHandler` | Workflow görev olayları |
| `notification.email` | `EmailJobHandler` | `EmailQueue` |
| `tenant.backup` | `BackupJobHandler` | `SchedulerTick` (cron) |
| `platform.migration-upgrade` | `MigrationJobHandler` | `SchedulerTick` (cron) |

> **Yeni iş tipi = yeni C# sınıfı + `PlatformAutofacModule.cs`'e DI satırı + derleme + deploy.**
> `JobWorker` handler'ı string eşlemeyle çözüyor (`JobWorker.cs:68`); runtime kaydı yok.
>
> Yani tenant kullanıcısının kurabileceği **tek zamanlanmış iş veritabanı yedeğidir**.

---

## Önerilen çözüm: `tenant.rule-sweep`

Dokuz senaryonun dokuzu da aynı şekle sahip: **"şu modelde, şu koşulu sağlayan kayıtlar için, şu
aksiyonu çalıştır."** Tek bir generic handler hepsini karşılar.

### Yeni entity: `ScheduledRule` (tenant DB)

| Alan | Tip | Açıklama |
|---|---|---|
| `Name` | string | Kullanıcıya görünen ad |
| `TargetModel` | string | Taranacak dinamik model |
| `CronExpression` | string | Mevcut `cron-builder.ts` arayüzü yeniden kullanılır |
| `TimeZoneId` | string | `CronSchedule` zaten destekliyor |
| `ConditionJson` | string | **`WorkflowCondition` formatı** — aynı değerlendirici |
| `DateOffsetField` | string | Göreli tarih için: `DueDate` |
| `DateOffsetDays` | int | `-7` = 7 gün önce, `+1` = 1 gün sonra |
| `ActionType` | enum | `Notify` · `StartWorkflow` · `SetField` |
| `ActionPayloadJson` | string | Şablon kodu / workflow kodu / alan-değer |
| `RecipientMode` | enum | `RecordOwner` · `Role` · `FixedUsers` · `FieldReference` |
| `RecipientValue` | string | Rol ID / kullanıcı listesi / alan adı |
| `IsEnabled` | boolean | |
| `LastRunAt`, `LastMatchCount` | datetime / int | İzlenebilirlik |

### Neden bu tasarım

1. **Koşul dili zaten var.** `WorkflowCondition` saf, DB'siz, kültür-güvenli ve test edilmiş.
   `ConditionJson` aynı formatı kullanırsa yeni parser, yeni editör ve yeni test gerekmez — mevcut
   `workflow-build` tetikleyici sekmesi neredeyse aynen kullanılabilir.
2. **Cron kurucu zaten var.** `utils/cron-builder.ts` sıklık seçimini cron'a çeviriyor ve "sonraki 5
   çalışma" önizlemesi gösteriyor; spec'i de var.
3. **`DateOffsetField` + `DateOffsetDays` göreli tarihi çözüyor.** Koşul dilinde tarih aritmetiği
   yok (ve eklemek pahalı); bu iki alan "vadesine 7 gün kalanlar" sorusunu **koşul diline
   dokunmadan** cevaplıyor. Handler taramayı `WHERE {DateOffsetField} = @today + @offset` ile yapar.
4. **`ActionType: StartWorkflow`** G-03'ü kısmen telafi eder — zamanlanmış iş bir onay akışı
   başlatabilir.

### Tahmini maliyet

| Parça | İş |
|---|---|
| `ScheduledRule` entity + migration + DAL | 1 gün |
| `RuleSweepJobHandler` (`IPlatformJobHandler`) | 2 gün |
| `ScheduledRuleController` + manager + yetki | 1 gün |
| `SchedulerTick`'in tenant kurallarını da kuyruğa atması | 0,5 gün |
| UI ekranı (`/scheduled-rules`) — cron kurucu + koşul editörü yeniden kullanımı | 3 gün |
| Test | 2 gün |
| **Toplam** | **~1,5-2 hafta** (●●○○) |

**Getiri: 9 senaryonun 9'u.** Backlog'un en yüksek getiri/maliyet oranlı kalemi.

---

## Zamanlanmış iş tanımları

Dokuzunun tamamı `ScheduledRule` şemasıyla ifade edildi. Her biri **bugün ❌**.

### SCH-1 · Ödeme vadesi hatırlatması — 7 gün

| | |
|---|---|
| **Tetikleyici** | Cron `0 8 * * *` (her gün 08:00, Europe/Istanbul) |
| **Hedef model** | `SupplierInvoice` |
| **Koşul** | `Status eq Approved` **AND** `Status ne Paid` |
| **Tarih ofseti** | `DueDate`, `-7` gün |
| **Aksiyon** | `Notify` → şablon `INV_DUE_7` |
| **Alıcı** | Rol: Finance Specialist |
| **Durum** | ❌ G-04 |

### SCH-2 · Ödeme vadesi hatırlatması — 3 gün

Aynı, `DueDate −3`, şablon `INV_DUE_3`, alıcı **Finance Specialist + Finance Manager**.

### SCH-3 · Vade günü bildirimi

`DueDate ±0`, şablon `INV_DUE_TODAY`, alıcı Finance Manager, öncelik yüksek.

### SCH-4 · Gecikmiş fatura

| | |
|---|---|
| **Tetikleyici** | Cron `0 9 * * *` |
| **Koşul** | `Status ne Paid` **AND** `Status ne Cancelled` |
| **Tarih ofseti** | `DueDate`, `+1` gün (ve sonrası) |
| **Aksiyon** | `Notify` → `INV_OVERDUE` · ek olarak `SetField`: `Status = Overdue` |
| **Alıcı** | Finance Manager + Purchasing Manager |
| **Tekrar** | Ödenene kadar **her gün** |
| **Durum** | ❌ G-04 |

> ⚠️ "Her gün tekrar" ihtiyacı, `DateOffsetDays` yerine `<=` karşılaştırması gerektirir. Handler
> tasarımı bunu `DateOffsetOperator` (`eq` / `le` / `ge`) alanıyla desteklemeli.

### SCH-5 · Teklif geçerlilik süresi

| | |
|---|---|
| **Cron** | `0 7 * * *` |
| **Hedef** | `SupplierQuotation` |
| **Koşul** | `Status eq Submitted` |
| **Ofset** | `ValidUntil`, `-3` gün → uyarı; `+0` → `SetField: Status = Expired` |
| **Alıcı** | `BuyerEmployeeId` (alan referansı) |
| **Şablon** | `QUOTE_EXPIRING` / `QUOTE_EXPIRED` |
| **Durum** | ❌ G-04 |

### SCH-6 · Tedarikçi belge süresi

| | |
|---|---|
| **Cron** | `0 6 * * 1` (her pazartesi) |
| **Hedef** | `SupplierDocument` |
| **Koşul** | `IsVerified eq true` |
| **Ofset** | `ExpiryDate`, `-30` / `-7` / `+0` gün |
| **Aksiyon** | `Notify` → `SUPPLIER_DOC_EXPIRING`; süre dolunca **`StartWorkflow`** → tedarikçiyi `Suspended` yapan akış |
| **Alıcı** | Purchasing Specialist |
| **Durum** | ❌ G-04 |

> Bu senaryo `ActionType: StartWorkflow`'un neden gerekli olduğunu gösteriyor: belge süresi dolunca
> tedarikçi otomatik askıya alınmalı, ama alan yazma da yok (G-03). Zamanlanmış iş bir onay akışı
> başlatırsa en azından insan kararına taşınır.

### SCH-7 · RFQ yanıt hatırlatması

Hedef `RfqSupplier`; koşul `Status eq Sent`; ofset `Rfq.DueDate −2` ⚠️ **çapraz-model** — bu tasarımda
`RfqSupplier`'a `DueDate` kopyalanarak çözülür (denormalizasyon). Alıcı: `Rfq.BuyerEmployeeId`.
Şablon `RFQ_NO_RESPONSE`. ❌ G-04.

### SCH-8 · Teslimat gecikme uyarısı

| | |
|---|---|
| **Cron** | `0 8 * * *` |
| **Hedef** | `PurchaseOrder` |
| **Koşul** | `Status eq SentToSupplier` **OR** `Status eq PartiallyDelivered` — ❌ **OR yok** |
| **Ofset** | `ExpectedDeliveryDate`, `+1` |
| **Alıcı** | `BuyerEmployeeId` + Warehouse Manager |
| **Durum** | ❌ G-04 **ve** koşul dili yetersiz |

> ❌ **Koşul dili AND-only** (`WorkflowCondition.cs:74-91`). "SentToSupplier **veya**
> PartiallyDelivered" ifade edilemez.
>
> **Ara çözüm (⚠️):** İki ayrı `ScheduledRule` tanımlamak. Çalışır ama bildirim **iki kez**
> gidebilir mi? Hayır — bir kayıt aynı anda tek durumda olur, yani iki kural birbirini dışlar.
> Yine de kural sayısı şişer. `in` operatörü koşul diline eklenmeli — küçük ama değerli bir iyileştirme.

### SCH-9 · Bekleyen onay hatırlatması

| | |
|---|---|
| **Hedef** | `WorkflowTask` — ❌ **dinamik model değil, taranamaz** |
| **Durum** | ❌ **Çift engel: G-04 + hedef sistem tablosu** |

> ❌ **Bu senaryo `ScheduledRule` ile bile çözülemez**, çünkü `WorkflowTask` bir sistem tablosudur ve
> `TargetModel` yalnız yayınlanmış dinamik modelleri kabul eder.
>
> **Doğru çözüm:** Workflow modülünün kendi tekrarlayan hatırlatma yeteneği olmalı. Bugün yalnız
> **tek atımlık** eskalasyon var (`EscalatedAt` damgası); tekrarlayan hatırlatma kavramı yok. Bu,
> G-04'ten ayrı bir eksiktir ve [18](18-teknik-zorluklar-ve-backlog.md)'de ikincil bulgu olarak
> raporlandı.

### SCH-10 · Bütçe uyarı eşiği (bonus)

| | |
|---|---|
| **Hedef** | `Budget` |
| **Koşul** | `Status eq Active` — asıl koşul `(Committed + Actual) / Planned > AlertThresholdPercent` ❌ **alan-alan karşılaştırma yok** |
| **Durum** | ❌ G-04 **ve** koşul dili yetersiz |

> ❌ Koşul dili **alanı sabit değerle** karşılaştırır; **alanı başka bir alanla** karşılaştıramaz
> (`WorkflowCondition.cs:36-41` — `value` bir string sabit). Bu, hem workflow hem scheduler için
> gerçek bir sınır.

---

## Zamanlanmış iş özeti

| # | Ad | Hedef | Cron | Aksiyon | Engel |
|---|---|---|---|---|---|
| SCH-1 | Vade −7 | `SupplierInvoice` | `0 8 * * *` | Notify | G-04 |
| SCH-2 | Vade −3 | `SupplierInvoice` | `0 8 * * *` | Notify | G-04 |
| SCH-3 | Vade günü | `SupplierInvoice` | `0 8 * * *` | Notify | G-04 |
| SCH-4 | Gecikme | `SupplierInvoice` | `0 9 * * *` | Notify + SetField | G-04 |
| SCH-5 | Teklif süresi | `SupplierQuotation` | `0 7 * * *` | Notify + SetField | G-04 |
| SCH-6 | Belge süresi | `SupplierDocument` | `0 6 * * 1` | Notify + StartWorkflow | G-04 |
| SCH-7 | RFQ yanıt | `RfqSupplier` | `0 8 * * *` | Notify | G-04 |
| SCH-8 | Teslimat gecikmesi | `PurchaseOrder` | `0 8 * * *` | Notify | G-04 + OR yok |
| SCH-9 | Bekleyen onay | `WorkflowTask` | `0 8 * * *` | Notify | G-04 + sistem tablosu |
| SCH-10 | Bütçe eşiği | `Budget` | `0 8 1 * *` | Notify | G-04 + alan-alan yok |

**0/10 bugün kurulabiliyor. `ScheduledRule` eklenirse 7/10.** Kalan üçü ek koşul dili yetenekleri
(`in`, alan-alan karşılaştırma) ve workflow tekrarlayan hatırlatması gerektiriyor.

---

## Cron ve saat dilimi notları

Çözüm geldiğinde dikkat edilmesi gerekenler — platformun mevcut davranışından:

| Konu | Davranış |
|---|---|
| Cron formatı | **5 alan**; saniye alanı yok, `L`/`W`/`#`/`?` yok. `*`, `*/n`, `a`, `a-b`, `a-b/n` ve virgüllü listeler |
| Saat dilimi | `TimeZoneId` ile yerel saatte yorumlanır, UTC'ye çevrilir. DST boşluğuna denk gelen saatler **atlanır** |
| İlk çalıştırma | Yeni görev **hemen koşmaz**; yalnız `NextDueAt` kurulur |
| Kaçırılan koşu | **Telafi edilmez** — önce `MarkRun`, sonra `Enqueue` (mükerrer yerine kaçırma tercih edilmiş) |
| Tur başına tavan | 100 görev |
| Bozuk cron | `LastOutcome = "InvalidCron"`, görev durdurulur |

> Satın alma bağlamında "kaçırılan koşu telafi edilmez" kabul edilebilir: bir günlük vade
> hatırlatması kaçarsa ertesi gün yine çalışır. Ama **SCH-4 (gecikme)** için bu, bir günlük gecikme
> bildiriminin tamamen kaybolması demektir. Kritik bildirimler için `catch-up` desteği
> değerlendirilmeli.
