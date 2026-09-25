# 10 · Bildirim Tasarımı

---

## Platformun gerçek durumu

### Var olan kanallar: 2

| Kanal | Sınıf | Davranış |
|---|---|---|
| **E-posta** | `EmailNotificationChannel` → `TenantSmtpEmailSender` | MailKit; ayarlar tenant `AppSetting`'inden; gövde **düz metin**, HTML yok |
| **Webhook** | `WebhookNotificationChannel` | Makine-okunur JSON POST; sır `X-CoreLogic-Secret` başlığında; 10 sn timeout |

| Kanal | Durum |
|---|---|
| In-app (tenant kullanıcısı için) | ❌ **Yok** |
| SMS | ❌ Yok — webhook köprüsü öneriliyor |
| Push | ❌ Yok |
| WhatsApp | ❌ Yok |

> `Entities/Concrete/Master/Notifications.cs` içindeki `Notification`/`NotificationRule` **platform
> ops konsoluna** aittir (`TargetPlatformUserId`, `api/platform/v1/notifications`,
> `PlatformCapabilities.OpsRead`). Workflow bu tabloya **hiç yazmaz**. Tenant UI'daki
> `notification.service.ts` yalnızca geçici banner gösterir — tek slot, kuyruk yok, geçmiş yok.

### ❌ Şablon sistemi yok

Konu ve gövde C# `switch` ifadelerinde **sabit ve Türkçe**
(`WorkflowNotifyJobHandler.cs:177-215`):

```csharp
WorkflowNotifyKinds.TaskEscalated => $"[Gecikme] {task.Name}",
WorkflowNotifyKinds.TaskExpired   => $"[Süre doldu] {task.Name}",
_                                 => $"[Onayınız bekleniyor] {task.Name}"
```

Gövde sabit 5 satır düz metin. Kayıt referansı `"{EntityType} #{EntityId}"` — **kaydın hiçbir alanı
bildirime konulamaz**. Yani "PR-2026-0001 numaralı, 45.000 TL'lik talep onayınızı bekliyor" **yazılamaz**;
kullanıcı "PurchaseRequest #1234 onayınızı bekliyor" görür.

### ❌ Üretilmeyen bildirimler

`WorkflowNotifyKinds` kataloğu 5 tip içeriyor ama **yalnız 3'ü** kuyruğa giriyor:

| Kind | Enqueue ediliyor mu | Nerede |
|---|---|---|
| `TaskAssigned` | ✅ | `WorkflowCommandExecutor.cs:96` |
| `TaskEscalated` | ✅ | `WorkflowWorker.cs:216` |
| `TaskExpired` | ✅ | `WorkflowWorker.cs:225` |
| `WorkflowCompleted` | ❌ **hiçbir yerde** | — |
| `WorkflowRejected` | ❌ **hiçbir yerde** | — |

> ❌ **Süreci başlatan kişi sonucu öğrenemiyor.** Talep sahibi, talebinin onaylandığını veya
> reddedildiğini bildirimle öğrenemez; `/tasks` ekranına veya kayda bakması gerekir. Bir satın alma
> sisteminde bu ciddi bir eksik ve düzeltmesi küçük (iki `Enqueue` çağrısı).

---

## Tasarım: `NotificationTemplate`

### Entity

| Alan | Tip | Açıklama |
|---|---|---|
| `Code` | string | `PR_SUBMITTED`, `INV_DUE_7` — kod referansı |
| `Name` | string | Yönetim ekranında görünen ad |
| `Channel` | enum | `Email` · `InApp` · `Webhook` · `Sms` |
| `Language` | enum | `tr` · `en` — `Accept-Language` ile seçilir |
| `Subject` | string | Yer tutuculu konu |
| `Body` | string | Yer tutuculu gövde (Markdown veya HTML) |
| `IsEnabled` | boolean | |

### Yer tutucu sözlüğü

Şablon motoru `{{ }}` içinde üç kapsam çözmeli:

| Kapsam | Örnek | Kaynak |
|---|---|---|
| `{{record.*}}` | `{{record.RequestNumber}}`, `{{record.TotalAmountTry}}` | Tetikleyen kaydın kolonları |
| `{{task.*}}` | `{{task.Name}}`, `{{task.DueAt}}` | Workflow görevi |
| `{{user.*}}` | `{{user.FirstName}}` | Alıcı |
| `{{link}}` | Kaydın veya görevin doğrudan URL'i | Sistem üretir |

> Biçimlendirme locale-duyarlı olmalı: `{{record.TotalAmountTry | currency}}` →
> `45.000,00 ₺` (tr) / `₺45,000.00` (en). Projede `utils/locale-format.ts` zaten bu işi yapıyor;
> sunucu tarafı karşılığı yazılmalı.

### Örnek şablon

```
Code:     PR_PENDING_APPROVAL
Channel:  Email
Language: tr
Subject:  [Onay Bekliyor] {{record.RequestNumber}} — {{record.TotalAmountTry | currency}}

Body:
Sayın {{user.FirstName}} {{user.LastName}},

{{record.RequesterName}} tarafından oluşturulan satın alma talebi onayınızı bekliyor.

  Talep No    : {{record.RequestNumber}}
  Departman   : {{record.DepartmentName}}
  Tutar       : {{record.TotalAmountTry | currency}}
  Öncelik     : {{record.Priority}}
  İhtiyaç Tar.: {{record.RequiredDate | date}}
  Açıklama    : {{record.Description}}

Son karar tarihi: {{task.DueAt | datetime}}

Görevi açmak için: {{link}}
```

Bugünkü karşılığı: **"[Onayınız bekleniyor] Departman Müdürü Onayı"** + sabit 5 satır.

---

## Şablon kataloğu (24)

### Satın alma talebi

| Kod | Tetikleyici | Kanal | Alıcı | Durum |
|---|---|---|---|---|
| `PR_PENDING_APPROVAL` | Onay görevi açıldı | E-posta, In-App | Atanan rol/kullanıcı | ⚠️ gönderiliyor ama içerik sabit |
| `PR_APPROVED` | Zincir tamamlandı | E-posta, In-App | Talep sahibi | ❌ üretilmiyor |
| `PR_REJECTED` | Reddedildi | E-posta, In-App | Talep sahibi | ❌ üretilmiyor |
| `PR_ESCALATED` | SLA aşıldı | E-posta | ⚠️ **aynı kişi** | ⚠️ eskalasyon yükseltmiyor |
| `PR_BUDGET_INSUFFICIENT` | Bütçe yetersiz | E-posta, In-App | Talep sahibi + Finance | ❌ G-02 |

### Tedarikçi

| Kod | Tetikleyici | Alıcı | Durum |
|---|---|---|---|
| `SUPPLIER_PENDING_APPROVAL` | Onaya gönderildi | Onay rolleri | ⚠️ |
| `SUPPLIER_APPROVED` | `Active` oldu | Oluşturan | ❌ |
| `SUPPLIER_REJECTED` | Reddedildi | Oluşturan | ❌ |
| `SUPPLIER_DOC_EXPIRING` | Belge 30/7 gün kaldı | Purchasing Specialist | ❌ G-04 |
| `SUPPLIER_SUSPENDED` | Askıya alındı | Purchasing + Finance | ❌ G-03 |

### Teklif

| Kod | Tetikleyici | Alıcı | Durum |
|---|---|---|---|
| `RFQ_SENT` | RFQ gönderildi | Tedarikçi ⚠️ **dış alıcı** | ❌ |
| `RFQ_NO_RESPONSE` | Vadeye 2 gün | Buyer | ❌ G-04 |
| `QUOTE_RECEIVED` | Teklif girildi | Buyer | ❌ |
| `QUOTE_EXPIRING` | Geçerliliğe 3 gün | Buyer | ❌ G-04 |
| `QUOTE_EXPIRED` | Geçerlilik doldu | Buyer | ❌ G-04 |

> ⚠️ `RFQ_SENT` alıcısı **tedarikçidir** — sistemde kullanıcısı olmayan biri. Platform bildirimleri
> `AssignedUserId`/`AssignedRoleId` üzerinden çözüyor ve e-postası olmayanları eliyor
> (`WorkflowNotifyJobHandler.cs:148-175`). **Dış alıcıya bildirim gönderme yolu yok.**
> Ara çözüm: webhook kanalı + tenant'ın kendi e-posta köprüsü.

### Sipariş ve teslimat

| Kod | Tetikleyici | Alıcı | Durum |
|---|---|---|---|
| `PO_PENDING_APPROVAL` | Onay görevi | Onay rolü | ⚠️ |
| `PO_APPROVED` | Onaylandı | Buyer | ❌ |
| `PO_SENT_TO_SUPPLIER` | Gönderildi | Tedarikçi ⚠️ dış | ❌ |
| `PO_DELIVERY_OVERDUE` | Teslim tarihi geçti | Buyer + Warehouse | ❌ G-04 |
| `GR_CREATED` | Mal kabul yapıldı | Buyer + Finance | ❌ |
| `GR_REJECTED_ITEMS` | Ret var | Buyer + Purchasing Mgr | ❌ |

### Fatura ve ödeme

| Kod | Tetikleyici | Alıcı | Durum |
|---|---|---|---|
| `INV_MATCH_EXCEPTION` | 3-way uyuşmazlık | Finance Specialist + Manager | ❌ G-02 |
| `INV_DUE_7` / `INV_DUE_3` / `INV_DUE_TODAY` | Vade yaklaştı | Finance | ❌ G-04 |
| `INV_OVERDUE` | Vade geçti | Finance Manager + Purchasing Mgr | ❌ G-04 |
| `PAYMENT_EXECUTED` | Ödeme yapıldı | Finance + tedarikçi ⚠️ | ❌ |

**Özet: 24 şablonun 2'si bugün gönderiliyor (içeriği sabit), 22'si gönderilmiyor.**

---

## Alıcı çözümleme

Bugünkü mekanizma (`WorkflowNotifyJobHandler.cs:148-175`):

| Mod | Davranış |
|---|---|
| Doğrudan kullanıcı | `AssignedUserId` |
| Rol | Rolün **tüm** üyeleri |
| E-postası boş olan | **Elenir** |
| Alıcı yoksa | İş başarılı sayılır (sessiz) |

### Eksik olan modlar

| Mod | İhtiyaç | Durum |
|---|---|---|
| Kayıt sahibi | `PR_APPROVED` → talep sahibi | ⚠️ `creator` atama modu var ama bildirimde kullanılmıyor |
| Alan referansı | `RFQ_NO_RESPONSE` → `Rfq.BuyerEmployeeId` | ❌ Yok |
| Yönetici zinciri | Eskalasyonda bir üst amir | ❌ Yok |
| Dış alıcı (tedarikçi) | `RFQ_SENT` | ❌ Yok |
| Sabit dağıtım listesi | `satinalma@sirket.com` | ❌ Yok |

---

## Teslim garantisi ve tekrar

| Konu | Davranış |
|---|---|
| Aynı bildirim tüm kanallara gider | Yapılandırılmamış kanal atlanır |
| Bir kanalın hatası diğerini engellemez | Hatalar toplanıp `AggregateException` ile fırlatılır |
| Hata → `JobWorker` retry | ⚠️ **tüm kanalları** yeniden dener → **aynı e-posta iki kez gidebilir** |
| SMTP yapılandırma hatası | `InvalidOperationException` **yutulur** — yoksa SMTP kurmamış her tenant'ta kuyruk ölü işlerle dolardı |
| Gerçek SMTP hatası | Fırlatılır → retry/park |
| Kuyruğa yazma hatası | Akışı durdurmaz — `TryNotify` sessizce yutar |

> ⚠️ **Mükerrer gönderim kabul edilmiş bir tasarım kararı** (`WorkflowNotifyJobHandler.cs:36-40`).
> Satın alma bağlamında kabul edilebilir; ödeme bildirimlerinde kafa karıştırıcı olabilir.
> İdempotans anahtarı (`{templateCode}:{recordId}:{date}`) eklenmesi önerilir.

---

## Webhook kanalı — kurulamıyor

Webhook, SMS/WhatsApp/Push için **öngörülen köprü**. Gövdesi makine-okunur:

```json
{
  "kind": "TaskAssigned",
  "subject": "[Onayınız bekleniyor] Departman Müdürü Onayı",
  "body": "...",
  "recipients": ["mehmet@sirket.com"],
  "task": { "id": 42, "name": "...", "stepKey": "dept", "dueAt": "...", "assignedRoleId": 6 },
  "record": { "entityType": "PurchaseRequest", "entityId": 1234, "instanceId": 88 }
}
```

> ❌ **Ama açılamıyor.** `workflow.webhookUrl` ve `workflow.webhookSecret` ayarları için **hiçbir
> yazma yolu yok**: `IAppSettingService.Set`'i çağıran tek sınıf `MailSettingManager` ve o yalnız
> `mail.*` anahtarlarını yazıyor (`MailSettingManager.cs:65-76`). `AppSetting` için generic
> controller yok, UI'da da geçmiyor.
>
> **Webhook kanalı bugün ancak DB'ye elle satır eklenerek açılabilir.** Bu, yazılmış ve çalışan bir
> özelliğin **ulaşılamaz** olması demek — küçük bir eksik (bir controller ucu + bir UI sekmesi), ama
> SMS ihtiyacının tek çözümünü kilitliyor. [18](18-teknik-zorluklar-ve-backlog.md)'de ikincil bulgu.

---

## In-app bildirim (G-08)

Tenant kullanıcıları için bildirim merkezi **yok**. Bugünkü yerine geçenler:

| Var olan | Ne işe yarıyor |
|---|---|
| `/tasks` görev gelen kutusu | Bekleyen onaylar listesi |
| Sidebar rozeti | Bekleyen görev sayısı — **30 sn polling**, SignalR yok |
| Kayıt detayındaki "Süreç" paneli | O kaydın açık süreçleri |
| Geçici banner | Tek slot, 5 sn, geçmiş yok |

### Önerilen

Platform tarafında `Notification`/`NotificationRule` yapısı **zaten var** (master DB, ops konsolu
için). Tenant ikizini kurmak mimari olarak tanıdık bir iş:

| Parça | İş |
|---|---|
| `TenantNotification` entity + migration | 1 gün |
| Manager + controller (`list`, `unread-count`, `markRead`, `markAllRead`) | 1 gün |
| `InAppNotificationChannel : IWorkflowNotificationChannel` | 0,5 gün |
| UI: topbar zil ikonu + açılır liste + okundu işaretleme | 2 gün |
| Bildirim tercihleri ekranı (kullanıcı hangi kanaldan ne alsın) | 2 gün |
| **Toplam** | **~1,5 hafta** (●●○○) |

`NotificationTemplate` ile birlikte G-08'in tamamı ~2,5 hafta.

---

## Öncelik sırası

Bildirim tarafında en yüksek getiri/maliyet oranına göre:

| Sıra | İş | Maliyet | Getiri |
|---|---|---|---|
| 1 | `WorkflowCompleted` / `WorkflowRejected` enqueue et | **~1 saat** | Talep sahibi sonucu öğrenir — 6 şablon açılır |
| 2 | `AppSetting` yazma ucu (webhook açılsın) | ~0,5 gün | SMS/Push köprüsü kullanılabilir hale gelir |
| 3 | `NotificationTemplate` + yer tutucu motoru | ~1 hafta | 24 şablonun içeriği anlamlı olur |
| 4 | In-app bildirim + zil | ~1,5 hafta | Kullanıcı e-postaya bağımlı kalmaz |
| 5 | Alıcı çözümleme modları (alan referansı, dış alıcı) | ~1 hafta | RFQ/tedarikçi bildirimleri açılır |

> İlk madde **bir saatlik iş** ve tasarımın 6 şablonunu birden açıyor. Backlog'daki en ucuz kazanç.
