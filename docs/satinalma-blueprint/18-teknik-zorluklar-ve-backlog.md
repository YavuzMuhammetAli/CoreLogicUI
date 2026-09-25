# 18 · Teknik Zorluklar ve Platform Backlog'u

Bu dosya blueprint'in **asıl çıktısıdır**. Diğer bölümlerdeki her ❌ ve ⚠️ işareti buradaki bir
boşluğa işaret eder.

**Büyüklük ölçeği:** ●○○○ birkaç gün · ●●○○ 1-2 hafta · ●●●○ 3-4 hafta · ●●●● 1 ay ve üzeri

---

# Birincil boşluklar (G-01 … G-13)

## G-01 · Otomatik numara, varsayılan değer, unique ve precision yok

**●●○○**

### Sorun

Dört ayrı eksik, aynı kökten: `PublishedTableMember` metadata'sı DDL'e tam yansımıyor.

| Eksik | Kanıt |
|---|---|
| Otomatik kayıt numarası | `NEXT VALUE FOR`, `CREATE SEQUENCE`, `autonumber` → grep **0 sonuç** |
| `DefaultValue` | Alan **şemada var**, tek referans `PublishedTableMember.cs:12` — **hiçbir kod okumuyor** |
| Unique constraint | `IsUnique` → grep **0 sonuç**. Tek UNIQUE üretimi `OneToOne` ilişkisi |
| `IsRequired` → `NOT NULL` | `CheckingDataBase.cs:191-198` — yalnız `{Parent}Id` NOT NULL |
| Enum → `CHECK` | Düz `nvarchar(250)`, kısıt yalnız uygulama katmanında |
| `MaxLength` → `nvarchar(n)` | Hep `nvarchar(250)`; `MaxLength > 250` **uygulama geçer, SQL kırılır** |
| `decimal` precision | Hep `decimal(18,2)` — döviz kuru ve hassas miktar için yetersiz |

### Etkisi

- **9 belge numarası** elle giriliyor (`PR-2026-0001`, `PO-2026-0018`, …) — demo senaryosunda 7 manuel müdahale
- **BR-10** (tedarikçi vergi no), **BR-30** (mükerrer fatura), **Product.Sku**, `(ProductId, SupplierId)` — hiçbiri tekil değil
- `ExchangeRateUsed = 34.27` saklanabiliyor, `34.2715` saklanamıyor → 1M$'lık siparişte **~1.500 TL sapma**
- `Quantity` `decimal(18,2)` → 0.001 kg **0.00** olarak saklanır

### Çözüm

| Parça | İş |
|---|---|
| `DefaultValue`'yu canlandır → `DEFAULT` constraint | 1 gün |
| `IsUnique` alanı + filtreli `UNIQUE INDEX` (`WHERE Active = 1`) | 2 gün |
| `IsRequired` → `NOT NULL` (⚠️ dolu tabloda geriye dönük uygulanamaz — yeni kolonlar için) | 1 gün |
| Enum → `CHECK` constraint | 1 gün |
| `MaxLength` → `nvarchar(n)`, `Precision`/`Scale` alanları | 2 gün |
| **Sequence** tabanlı numaralandırma (`NumberPattern` alanı: `PR-{yyyy}-{seq:0000}`) | 3 gün |
| Test | 2 gün |

**Not:** Unique ve NOT NULL için **mevcut verinin ihlal etmediğinin** kontrol edilmesi gerekir —
`RequiredOnNonEmptyTableRule` zaten benzer bir kontrol yapıyor, deseni hazır.

---

## G-02 · Sunucu tarafı iş kuralı kancası yok

**●●●○** — **en yüksek öncelik**

### Sorun

Platform, kayıt kaydedilirken çalışan **hiçbir kullanıcı-tanımlı kural** mekanizması sunmuyor.
Tek doğrulama katmanı `DynamicEntityValidator` ve o yalnız **alan içi** kurallara bakıyor
(`IsRequired`, uzunluk, aralık, regex, enum).

Üretilen tipte method tanımı Roslyn sandbox'ında **AST seviyesinde yasak**
(`DotNetCodeCompiler.cs:423-439`) — yani kural kodun içine de yazılamaz.

### Etkisi

**34 iş kuralının 30'u karşılanamıyor** ([14](14-is-kurallari.md)):

| Kural sınıfı | Sayı | Örnek |
|---|---|---|
| Alanlar arası | 6 | `RequiredDate >= RequestDate` |
| Durum geçişi | 5 | "Onaylanmış talep değiştirilemez" |
| Rollup | 7 | "Toplam = kalemler toplamı" |
| Çapraz-belge | 10 | **3-way matching** |
| Referans durumu | 5 | "Blacklist tedarikçiye sipariş açılamaz" |

Ayrıca **EC-05** (tutar düşürerek onay kademesi atlama) bir **yetki yükseltme açığı**.

### Çözüm: `BusinessRule` — mevcut parçanın yeniden kullanımı

`Business/Workflow/Engine/WorkflowCondition.cs` zaten:
- **Saf** (DB bağımlılığı yok)
- **Kültür-güvenli** (`IConvertible.ToDouble(InvariantCulture)`, satır 148-154)
- **Test edilmiş** (`WorkflowConditionTests.cs`, 16 test)
- **UI'sı var** (`workflow-build` tetikleyici sekmesi)

Kademeli plan:

| Aşama | Ne eklenir | Açılan kural | İş |
|---|---|---|---|
| **1** | `BusinessRule` entity + `PublishedModelManager.Add/Update`'e kanca · `fieldRef` (alan-alan karşılaştırma) · `oldValue` erişimi | **11** (B + C sınıfı) | ~1 hafta |
| **2** | Lookup hedefini okuyan erişimci | **+5** (F) | ~3 gün |
| **3** | Alt kayıt toplamı erişimcisi (G-05 ile birlikte) | **+7** (D) | ~1 hafta |
| **4** | Çapraz-model okuma (3-way matching) | **+10** (E) | ~2 hafta |

**Aşama 1 tek başına 11 kural açıyor** ve yeni bir dil/parser/editör gerektirmiyor.

Koşul diline ayrıca eklenmesi gerekenler (küçük, yüksek getirili):

| Ekleme | Açtığı |
|---|---|
| `in` / `notin` operatörü | SCH-8 "Sent **veya** PartiallyDelivered" |
| `isnull` / `isnotnull` | EC-09 (boş tutar) |
| `OR` gruplama | Genel |
| `fieldRef` (alan-alan) | BR-05, BR-24, SCH-10 |

---

## G-03 · Workflow iş alanı yazamıyor

**●○○○** — **en ucuz yüksek-etkili düzeltme**

### Sorun

Motorun yazabildiği **tek kolon** `WorkflowStatus`. Tek yazma komutu `SetEntityStatusCommand`,
uygulaması `WorkflowEntityAccessor.SetWorkflowStatus` — ham SQL `UPDATE`
(`WorkflowEntityAccessor.cs:47-64`).

Üstelik terminal adımlara etiket map'lenemediği için (`workflow-build.component.html:191,200`),
süreç bitince `WorkflowStatus` **boşalıyor**.

### Etkisi

- **9 sürecin durum otomasyonu** ([07](07-is-surecleri.md)) — hiçbiri çalışmıyor
- Demo senaryosunda **6 manuel durum değişikliği**
- Onay zinciri tamamlandığında `Status` hâlâ `Submitted` — onayın anlamı boşalıyor
- BR-01 ("onaylanmış talep değiştirilemez") denetlenemez hale geliyor

### Çözüm

`SetFieldCommand` — `SetWorkflowStatus`'ün beyaz listeli genellemesi. Aynı ham SQL yolu, aynı
"interceptor'ı tetikleme" korumasıyla (EF üzerinden gidilirse akış kendini tetikler).

```json
"onApprove": "",
"onApproveActions": [
  { "field": "Status",     "value": "Approved" },
  { "field": "ApprovedOn", "value": "@now" }
]
```

| Parça | İş |
|---|---|
| `SetFieldCommand` + executor | 1 gün |
| Beyaz liste (hangi kolonlar yazılabilir — metadata'da `IsWorkflowWritable`) | 0,5 gün |
| `@now`, `@currentUser` token'ları | 0,5 gün |
| Terminal adım etiketleri (`entityStatusMap`'e `__completed`/`__rejected`) — **UI düzeltmesi** | 0,5 gün |
| UI: adım tasarımcısına aksiyon editörü | 2 gün |
| Test | 1 gün |

**~1 hafta, 9 sürecin durum otomasyonunu açıyor.** Getiri/maliyet oranı en yüksek kalem.

---

## G-04 · Kullanıcı tanımlı zamanlanmış iş yok

**●●○○**

### Sorun

Altyapı **tam** (cron + kuyruk + lease + retry + park + günlük), yüzey **yedeklemeye kilitli**:

- `ScheduledJobTypes` kataloğu **2 satır**
- `ScheduledTask` yazan **2 yer**, ikisi de sabit `JobType`
- `ScheduledTask` için **controller yok**
- Yeni iş tipi = yeni C# sınıfı + DI satırı + deploy

### Etkisi

**10 zamanlanmış senaryonun 10'u** ([09](09-scheduler-tasarimi.md)) — ödeme vadesi hatırlatmaları,
gecikmiş fatura, teklif geçerliliği, tedarikçi belge süresi, teslimat gecikmesi, bütçe eşiği.

M9 (Ödeme) modülünün otomasyon değeri **sıfır**.

### Çözüm: `ScheduledRule` + `tenant.rule-sweep`

Ayrıntılı tasarım [09](09-scheduler-tasarimi.md)'da. Özet:

| Parça | İş |
|---|---|
| `ScheduledRule` entity + migration + DAL | 1 gün |
| `RuleSweepJobHandler : IPlatformJobHandler` | 2 gün |
| Controller + manager + yetki | 1 gün |
| `SchedulerTick`'in tenant kurallarını kuyruğa atması | 0,5 gün |
| UI (`cron-builder.ts` + koşul editörü yeniden kullanımı) | 3 gün |
| Test | 2 gün |

**~1,5-2 hafta, 7/10 senaryo açılıyor.** Koşul kısmı G-02'nin değerlendiricisiyle **aynı parça** —
iki iş birlikte planlanmalı.

---

## G-05 · Hesaplanan / rollup kolon yok

**●●○○**

### Sorun

İki ayrı eksik:

1. **Hesaplanan kolon** (`LineTotal = Quantity × UnitPrice`) — DDL'de `AS ... PERSISTED` üreten kod
   yok; üretilen tipte method yasak
2. **Rollup** (`PurchaseOrderItem.ReceivedQuantity = SUM(GoodsReceiptItem)`) — alt kayıt toplamı
   kavramı yok

### Etkisi

- **~35 kolon** hesaplanması gerekirken saklanıyor ([04](04-entity-listesi.md)) — toplam kolonun %6'sı
- Demo senaryosunda **9 manuel hesap**
- **En tehlikelisi:** `PurchaseOrderItem.ReceivedQuantity`/`RemainingQuantity`/`InvoicedQuantity` —
  kısmi teslimat ve 3-way matching'in tamamı bu üç sayıya dayanıyor ve üçü de elle güncelleniyor
  (S7). Bir kez unutulursa **fatura eşleştirmesi sessizce yanlış çalışır**
- **Güvenlik:** `TotalAmountTry` istemci yazdığı için onay kademesi atlatılabilir (EC-05)

### Çözüm

İki yol, birlikte:

| Yol | Kapsam | İş |
|---|---|---|
| **A.** `ComputedExpression` alanı → DDL'de `AS (<expr>) PERSISTED` | Aynı satır içi hesaplar (`Quantity * UnitPrice`) | ~1 hafta |
| **B.** `RollupDefinition` (hedef kolon, kaynak alt model, fonksiyon, filtre) → kaydetmede yeniden hesapla | Alt kayıt toplamları | ~1,5 hafta |

A için güvenlik: ifade **beyaz listeli** bir mini-dilde olmalı (kolon adları + `+ - * /` +
parantez), ham SQL kabul edilmemeli. `ReportingManager`'ın güvenlik sözleşmesi
(`ReportingManager.cs:23-27` — *"kullanıcıdan ham expression alınmaz"*) aynı disiplinle izlenmeli.

B için `PublishedModelManager.Add/Update` sonrası parent'ı yeniden hesaplayan bir kanca — G-02 ile
aynı noktaya takılır.

---

## G-06 · Grid ve API'de arama, filtre, sıralama yok

**●●○○**

### Sorun

| Katman | Eksik |
|---|---|
| API (`getall`) | `search`, `sort`, alan bazlı filtre — yalnız tek FK filtresi var |
| UI (`model-data`) | Arama kutusu, sütun filtresi, sıralanabilir başlık, export |
| Sayfalama | ⚠️ **opsiyonel** — verilmezse sınırsız satır döner |

### Etkisi

- 3.000 tedarikçi, 50.000 ürün, 20.000 fatura → **listeler fiilen kullanılamaz**
- Entegrasyon açısından daha kötü: "bekleyen faturaları getir" bile yapılamıyor; istemci hepsini
  çekip filtrelemek zorunda

### Çözüm

Filtre altyapısı **zaten var**: `ReportingManager` 8 operatörlük beyaz liste ve güvenli ifade
kurucu içeriyor (`ReportingManager.cs:502-513`).

| Parça | İş |
|---|---|
| `getall`'a `filter` (operatör beyaz listesi yeniden kullanımı) | 2 gün |
| `getall`'a `sort` | 1 gün |
| `getall`'a `search` (string kolonlarda `LIKE`) | 1 gün |
| Sayfalamayı **zorunlu** yap (varsayılan 50) | 0,5 gün |
| UI: arama kutusu + sıralanabilir başlık + sütun filtresi | 4 gün |
| UI: grid export (Excel) | 2 gün |

⚠️ Sayfalamayı zorunlu yapmak **kırıcı bir değişiklik** — mevcut istemciler sınırsız liste
bekliyor olabilir. Geçiş için varsayılan yüksek (500) başlatılıp kademeli düşürülmeli.

---

## G-07 · Rapor tek modelden çalışıyor

**●●●●** — **en pahalı kalem**

### Sorun

| Eksik | Kanıt |
|---|---|
| JOIN / ilişkili model kolonu | `ReportingManager.cs:395-396` — `Include`/`Join` yok |
| Lookup etiket çözümü | Rapor `DepartmanId = 7` gösterir |
| Parametreli filtre | `ReportFilter.value` kayıtlı **sabit** string |
| Göreli tarih (`@today`) | `ConvertValue` `DateTime.Parse` ile sabit tarihe çevirir |
| Hesaplanan kolon / ifade | Yok |
| `HAVING` | Yok |
| `TOP N` | Yok |
| OR / gruplama | AND-only |
| Aya göre gruplama | Yok — tarih gün bazında gruplanır |

### Etkisi

- **12 raporun 8'i çalışmıyor** ([13](13-ui-ux-tasarimi.md))
- **Dashboard'daki 9 widget'ın 4'ü çalışmıyor**
- "Gecikmiş Faturalar" widget'ı göreli tarih olmadığı için **her gün eskiyor**
- Departman bazlı dashboard için 15 × 6 = **90 rapor tanımı** gerekiyor
- ~40 denormalize ad kolonu ([04](04-entity-listesi.md)) **yalnız bu boşluk yüzünden** var

### Çözüm — kademeli

| Aşama | Ne | Açtığı | İş |
|---|---|---|---|
| **1** | Göreli tarih token'ları (`@today`, `@monthStart`, `@yearStart`, `@daysAgo(n)`) | 6 rapor + 2 widget | **~0,5 gün** |
| **2** | Lookup etiket çözümü (rapor çıktısında FK → etiket) | ~40 denormalize kolonu gereksizleştirir | ~3 gün |
| **3** | Rapor parametreleri (çalışma anında değer) | Departman/tedarikçi bazlı raporlar tek tanıma iner | ~1 hafta |
| **4** | Tarih gruplama granülerliği (gün/ay/çeyrek/yıl) | Trend raporları | ~2 gün |
| **5** | `TOP N` + `HAVING` | 2 rapor | ~2 gün |
| **6** | **JOIN / ilişkili model kolonları** | 4 rapor + 3-way matching altyapısı | **~3 hafta** |
| **7** | Hesaplanan kolon / ifade | Oran ve fark raporları | ~1 hafta |

> **Aşama 1 yarım günlük iş ve 6 raporu kurtarıyor.** Backlog'daki en ucuz kazançlardan biri —
> `ConvertValue` (`ReportingManager.cs:523-543`) içinde bir `switch`.
>
> Aşama 6 (JOIN) tek başına projenin en büyük kalemi ve ayrı planlanmalı.

---

## G-08 · Bildirim şablonu ve in-app bildirim yok

**●●○○**

### Sorun

- Konu/gövde C# `switch`'inde **sabit ve Türkçe** (`WorkflowNotifyJobHandler.cs:177-215`)
- Yer tutucu motoru yok — kaydın hiçbir alanı bildirime konulamaz
- Tenant kullanıcısı için in-app bildirim **yok** (platform `Notification` tablosu ops konsoluna ait)
- Bildirim tercihi yok
- `WorkflowCompleted`/`WorkflowRejected` **hiç enqueue edilmiyor**
- Webhook ayarı için **yazma yolu yok** (`AppSetting` generic controller'ı yok)

### Etkisi

**24 şablonun 22'si gönderilmiyor**; gönderilen 2'sinin içeriği neredeyse bilgisiz
([10](10-bildirim-tasarimi.md)).

### Çözüm — öncelik sırasıyla

| # | İş | Süre | Getiri |
|---|---|---|---|
| 1 | `WorkflowCompleted`/`WorkflowRejected` enqueue et | **~1 saat** | 6 şablon açılır; talep sahibi sonucu öğrenir |
| 2 | `AppSetting` yazma ucu → webhook açılır | ~0,5 gün | SMS/Push köprüsü kullanılabilir olur |
| 3 | `NotificationTemplate` + yer tutucu motoru + locale biçimlendirme | ~1 hafta | 24 şablonun içeriği anlamlı olur |
| 4 | `TenantNotification` + in-app zil + okundu takibi | ~1,5 hafta | E-posta bağımlılığı biter |
| 5 | Alıcı çözümleme modları (alan referansı, dış alıcı, yönetici zinciri) | ~1 hafta | RFQ/tedarikçi bildirimleri |

**Madde 1 bir saatlik iş.** Backlog'daki en ucuz kazanç.

---

## G-09 · Alan seviyesi yetki yok

**●●○○**

### Sorun

İzin granülerliği **model bazlı**. `ModelColumnSetting` bir alternatif değil:
- Tenant genelinde **global** (rol boyutu yok)
- Yalnız `list` / `detail` bağlamı
- **Backend'de hiç uygulanmıyor** — gizli kolon JSON yanıtında gelir

Ayrıca satır seviyesi kısıt yalnız `OwnRecordsOnly` (`CreatedBy == @userId`); "kendi departmanım"
gibi bir kural yok.

### Etkisi

| Sorun | Örnek |
|---|---|
| **Güvenlik** | `SupplierBankAccount.Iban` UI'da gizlense bile API'den okunur |
| Teklif gizliliği | `SupplierQuotation.UnitPrice` rakip tekliflerden saklanamaz |
| Departman gizliliği | Departman müdürü **tüm** departmanların taleplerini görür |
| Maliyet gizliliği | Warehouse Manager sipariş fiyatlarını görür |

### Çözüm

| Parça | İş |
|---|---|
| `ModelColumnSetting`'e rol boyutu (`OperationClaimId`) | 2 gün |
| Sunucu tarafı projeksiyon (`getall`/`get` yanıtından gizli kolonları çıkar) | 3 gün |
| Raporlama ve lookup yollarında da uygula | 2 gün |
| Satır seviyesi kısıt: `ScopeField` (`DepartmentId == kullanıcının departmanı`) | ~1 hafta |

⚠️ Sunucu projeksiyonu **kırıcı**: gizli kolon `Update` payload'ında gelmezse null'lanır. UI'daki
"zorunlu alan gizlenemez" kuralının (`model-detail.component.ts:417`) sunucu karşılığı gerekir.

**Bu blueprint'in ara çözümü:** hassas alan = **ayrı model** (`SupplierBankAccount`), `Read` izni
kısıtlanır. `SupplierQuotation.UnitPrice` için işe yaramıyor.

---

## G-10 · Generic attachment yok

**●●●○**

### Sorun

`file`/`image` kolonları:
- Satır içinde `varbinary(max)` — ayrı blob depo, `FILESTREAM`, harici URL yok
- **Tek kolon = tek dosya**
- Orijinal **dosya adı ve MIME saklanmıyor** — indirmede uzantı magic-byte'tan tahmin ediliyor
- **Boyut sınırı yok**, içerik doğrulaması yok (`ImageContentValidator` yalnız profil avatarında)
- Polimorfik ek kavramı yok

### Etkisi

- 6 ayrı `*Attachment` alt modeli gerekiyor; ortak "Belgeler" ekranı yok
- **Veritabanı 4,3 GB'dan 88 GB'a çıkıyor** ([06](06-veritabani-tasarimi.md))
- Yedekleme senkron olduğu için 88 GB'lık DB'de "Şimdi Yedek Al" **kullanılamaz** hale gelir
- `getall` sayfasız çağrılırsa 24 GB'ı belleğe çekmeye çalışır
- Audit `OldValues`/`NewValues`'a dosyayı koyuyor → 2 MB'lık PDF güncellemesi **4 MB** audit satırı

### Çözüm

| Parça | İş |
|---|---|
| `Attachment` entity (polimorfik: `OwnerModel`, `OwnerId`, `FileName`, `ContentType`, `Size`, `StorageKey`) | 3 gün |
| Blob depo soyutlaması (`IFileStore`: yerel disk / S3 / Azure Blob) | 1 hafta |
| Boyut sınırı + MIME beyaz listesi + içerik doğrulaması | 3 gün |
| Yükleme/indirme uçları (stream, chunked) | 3 gün |
| UI: çoklu dosya, sürükle-bırak, ilerleme çubuğu, önizleme | 1 hafta |
| **`file`/`image` kolonlarını audit gövdesinden çıkar** | **~1 saat** |

> Son madde bir saatlik ve acil — audit tablosunun şişmesini tek başına durduruyor.
>
> **Bu blueprint'in tavsiyesi:** G-10 kapanana kadar ekleri sistem dışında tutmak
> (`DocumentUrl` string + SharePoint/S3). 88 GB'lık bir tenant DB'sinden iyidir.

---

## G-11 · İlişki FK'ları formda ham sayı olarak çıkıyor

**●○○○** — *canlı doğrulamaya bağlı*

### Sorun (hipotez)

`RelationshipDefinition` üretilen sınıfa düz bir `int` property ekliyor. `GetModels()`
`DeclaredProperties`'i döndürüyor ve `CoreLogicTypeMap.FromClr` bunu `"int"` olarak etiketliyor
(`CoreLogicTypeMap.cs:104`) → formda **çıplak sayı kutusu**.

Oysa `lookup` kolonu `lookup-picker` bileşenini tetikliyor (arama, sonsuz kaydırma, etiket çözümü).

### Etkisi

Navigation (rollup ve ilişkili kayıt gösterimi için gerekli) ile kullanıcı dostu seçim **aynı anda
elde edilemiyor** — `LegacyFkConflictRule` ikisini aynı bağda yasaklıyor.

Bu blueprint R3/R4/R5 ilişkilerini bu ikilem yüzünden riskli işaretledi
([05](05-entity-iliskileri.md)).

### Çözüm

`RelationshipDefinition`'a `DisplayColumn` alanı + `GetModels()`'in ilişki FK'larını `"lookup"`
olarak etiketlemesi. ~2 gün.

> ⚠️ **Bu boşluk hipotezdir**, kod okumasından çıkarıldı. Test **T-06** doğrulayacak; yanlışsa
> backlog'dan düşer.

---

## G-12 · Modele özel eylem (action) tanımlanamıyor

**●●○○**

### Sorun

Platform, bir modele **özel eylem** tanımlama yeteneği sunmuyor: `PublishedTableAction` benzeri bir
kavram yok, toolbar'a buton eklenemiyor, sunucu tarafı kanca yok.

Sonuç: "Onaya Gönder", "İptal Et", "RFQ Oluştur" gibi her eylem aslında bir `Status` alanını elle
değiştirip Kaydet'e basmaktır.

### Etkisi

- Keşfedilebilir değil — kullanıcı hangi geçişin mümkün olduğunu bilmez
- Doğrulanmıyor — `Draft`'tan `Completed`'a atlanabilir
- Denetimde ayırt edilemiyor — `Modified` olarak görünür ([11](11-audit.md))
- Demo senaryosundaki 23 manuel müdahalenin büyük kısmı buradan

### Çözüm

`PublishedTableAction` metadata'sı:

| Alan | İçerik |
|---|---|
| `Label` | "Onaya Gönder" |
| `VisibleWhen` | `WorkflowCondition` — `Status eq Draft` |
| `EnabledWhen` | `WorkflowCondition` |
| `ActionType` | `SetField` · `StartWorkflow` · `CallEndpoint` |
| `ConfirmMessage` | Onay diyaloğu metni |
| `AuditAction` | Denetim kaydına yazılacak eylem adı |

G-02 ve G-03 ile **aynı altyapıyı** paylaşır (koşul değerlendirici + alan yazma). Üçü birlikte
planlanırsa toplam maliyet ayrı ayrı yapmaktan düşük.

~2 hafta (backend + UI).

---

## G-14 · Toplu şema API'si yok — kurumsal kurulum hız sınırına takılıyor

> ✅ **DÜZELTİLDİ — 2026-09-24.** `POST /Published/addTableWithMembers` eklendi (tablo + tüm
> kolonlar tek istekte, `addTree`'nin iki fazlı "ya hepsi ya hiçbiri" semantiğiyle; parti **içi**
> duplicate kolonları da yakalıyor). Ayrıca rate limiter'a **kimlikli admin partition'ı**
> eklendi (kullanıcı başına 1000/dk).
>
> **Ölçülen kazanç:** 49 modelin tam kurulumu **595 istek / ~110 sn (249. kolonda 429 ile
> kesiliyordu)** → **~75 istek / 24,2 sn, sıfır 429**. Sonuç birebir aynı: 73 tablo, 1.272 kolon,
> 206 FK.

**●○○○** — *canlı ortamda doğrulandı*

### Sorun

Şema kurulumu **kolon başına bir HTTP isteği** gerektiriyor: `addTable` + N× `addMember` +
`publish`. Bu blueprint'in kurulumu:

| İşlem | Adet |
|---|---|
| `addTable` | 50 |
| `addMember` | 520 |
| `publish` (dalga başına kök) | ~25 |
| **Toplam** | **~595 istek** |

Platform ise IP başına **300 istek/dakika** sınırlıyor
(`CreateDLL/Extensions/SecurityExtensions.cs:99-101`):

```csharp
return RateLimitPartition.GetFixedWindowLimiter(ip,
    _ => new FixedWindowRateLimiterOptions { PermitLimit = 300, Window = TimeSpan.FromMinutes(1) });
```

Canlı koşuda **249. kolonda `HTTP 429`** alındı ve kurulum yarıda kesildi.

> ✅ **Hız sınırının kendisi doğru** ve kayda değer bir güvenlik önlemi. Sorun sınır değil,
> **toplu iş için bir yol olmaması**.

### Neden önemli

Bu, "şirket yöneticisi runtime'da entity tanımlar" vaadinin **ölçekteki** sınavı. 5 modelli bir
demo elle kurulur; 50 modelli gerçek bir uygulama **script'le** kurulur — ve script hız sınırına
çarpar. Dahası:

- Yarıda kalan kurulum **kendiliğinden güvenli değil**: `addMember` duplicate kontrolü yapmadığı
  için (**H-4**) yeniden çalıştırma `CS0102` ile publish'i kırar. Canlı koşuda birebir bu yaşandı.
- İstemci `Retry-After` görse bile, **her yeniden deneme yeni bir istek** — tempolu ilerlemek
  şart.

### Çözüm

| Parça | İş |
|---|---|
| `POST /Published/addTableWithMembers` — tablo + tüm kolonlar **tek istekte** | 2 gün |
| Alternatif: `POST /Published/importSchema` — tam model seti (bu blueprint'in `models.json`'ı gibi) | 3 gün |
| `addMember`'da duplicate kontrolü (**H-4** ile aynı düzeltme) → yeniden çalıştırma güvenli olur | 2 saat |
| Şema uçları için ayrı, daha geniş bir rate-limit partition'ı (admin + kimlikli) | 0,5 gün |

> İlk madde tek başına 595 isteği **~75'e** düşürür ve sorunu tamamen ortadan kaldırır.
>
> `seed/publish-all.ps1` bu sorunu istemci tarafında **geri çekilme (backoff)** ve
> **idempotan kolon ekleme** ile çözdü — ama bu, her entegratörün yeniden yazmak zorunda kalacağı
> bir iştir.

---

## G-15 · Plan limiti, platformun **kendi eksiğinin** workaround'unu bloke ediyor

> ⏸️ **BU TURDA KAPSAM DIŞI (2026-09-24).** Gerçek çözüm akış içi koşullu dallanmadır
> (G-02/G-03 ile birlikte); `free` limitini yükseltmek bir **ürün kararıdır** ve mühendislik
> düzeltmesiyle karıştırılmamalı. Aşağıdaki analiz geçerliliğini koruyor.

**●○○○** — *canlıda doğrulandı*

Bu, blueprint'in bulduğu en öğretici nedensellik zinciri:

```
1. Motor akis ortasinda dallanamiyor          (WorkflowDefinitionModel.cs:189-240)
        |
        v
2. Tutar kademeli onay = kademe basina AYRI tanim   -> 4 tanim gerekir  (K2 karari)
        |
        v
3. free plan en fazla 3 yayinlanmis akisa izin veriyor
        |
        v
4. Tasarimin cekirdek onay akisi free planda KURULAMIYOR
```

Canlı koşuda tam olarak bu yaşandı: `PR_ONAY_K1`, `K2`, `K3` yayınlandı, **`K4` reddedildi**.
Yani 250.000 TL üstü talepler için onay akışı **hiç kurulamadı** — en riskli tutar aralığı
korumasız kaldı.

**Kurulum yalnız `pro` planına yükseltilerek tamamlanabildi.** (Yükseltme ürünün kendi akışıyla
çalıştı: `POST /Parameter/subscription/purchase` → `StubPaymentGateway` → plan `Active`.
⚠️ Uç `planCode` kabul etmiyor, `planId` istiyor — küçük bir API tutarsızlığı.)

### Neden bu bir "boşluk"

Limit yanlış değil; **birim yanlış**. Platform "kaç akış tanımı" sayıyor, ama kullanıcının kurduğu
şey **bir** iş sürecidir — 4 tanıma bölünmesinin tek sebebi motorun dallanamaması. Yani kullanıcı,
platformun eksiği yüzünden **kotasını 4 kat hızlı tüketiyor**.

### Çözüm

| Seçenek | Not |
|---|---|
| **A.** G-02/G-03 ile birlikte akış içi koşullu dallanma eklemek | Kök çözüm — 4 tanım 1'e iner |
| **B.** Kotayı "süreç" bazında saymak (aynı `modelName` + amaç grubu tek sayılır) | Yama, ama adil |
| **C.** free limitini yükseltmek | En kolay, en az doğru |

> A yapılırsa G-15 kendiliğinden kapanır. Bu, "workaround'ları ürün limiti sanmayın" örneği olarak
> backlog'da kalmalı.

---

## G-13 · Sidebar menü gruplanamıyor

**●○○○**

Sidebar, `Navigation` izni olan modelleri **düz liste** olarak gösteriyor. 50 modelde kullanılamaz
hale geliyor.

**Çözüm:** `PublishedTable.MenuGroup` + `DisplayOrder` + sidebar'da gruplama. ~2 gün.

---

# İkincil bulgular

Uygulamayı öldürmüyor ama stres testinde çıktı. Bir kısmı **hata**.

## Platform hataları

### H-10 · Kendi kendine lookup publish'i kırıyor — **tenant geneli kesinti** 🔴🐞

> ✅ **DÜZELTİLDİ — 2026-09-24.** `CheckingDataBase.TopologicalSort.Visit` artık self-referansı
> atlıyor; `tablesByName` da `OrdinalIgnoreCase` oldu. Ayrıca iç istisna mesajı artık kaybolmuyor
> (`DataBaseOperationsManager` düzleştirip `ILogger` ile yazıyor).
> Testler: `CheckingDataBaseTopologyTests` (4 test, gerçek döngünün hâlâ reddedildiği dahil).
> Canlı doğrulama: self-lookup'lı model yayınlandı **ve** aynı tenant'taki bağımsız model de
> yayınlanmaya devam etti.

> **CANLI ORTAMDA DOĞRULANDI** (2026-09-22). Bu, blueprint'in bulduğu **en ciddi** hata ve
> kod okumasıyla değil, yalnızca koşturmayla ortaya çıktı.

**Belirti.** Bir modele kendi kendini hedefleyen bir `lookup` kolonu eklenince
(`SupplierCategory.ParentCategoryId → SupplierCategory`), `publish` şu hatayı verir:

```
Yayınlama durduruldu — SQL tabloları oluşturulamadı: Tablo oluşturma script'leri üretilemedi.
```

**Kök neden.** `CheckingDataBase.TopologicalSort.Visit` (`CheckingDataBase.cs:128-156`):

```csharp
if (!visiting.Add(table.Name))
    throw new Exception($"Döngüsel lookup/parent bağımlılığı tespit edildi: '{table.Name}'.");
...
foreach (var targetTableName in lookupTargets.Values)
    if (tablesByName.TryGetValue(targetTableName, out var targetType))
        Visit(targetType);        // <-- hedef KENDISI ise ayni dugume tekrar girilir
```

Kendi kendine referans, `visiting` kümesine ikinci kez girme girişimi yaratır ve **gerçek bir
döngü sanılır**. Oysa self-FK SQL Server'da tamamen geçerlidir ve aynı `CREATE TABLE` içinde
üretilebilir — sıralama sorunu **yoktur**.

**Yayılma yarıçapı — asıl ciddiyet burada.** `ModelDefinitionManager.BuildLookupFkMap`
(`ModelDefinitionManager.cs:270-289`) lookup haritasını **tenant'ın TÜM tabloları** üzerinden kurar,
yalnız yayınlanan düğümler üzerinden değil. Sonuç:

> **Tek bir self-lookup kolonu, o tenant'taki HER publish'i kırar** — o kolonla hiç ilgisi olmayan,
> hiç lookup içermeyen bir model bile yayınlanamaz hale gelir.

Canlı doğrulamada birebir bu yaşandı: `SelfRef` taslağı oluşturulduktan sonra, tamamen bağımsız ve
lookup'sız bir modelin publish'i de başarısız oldu.

**Kurtarma.** `POST /Published/removeMember` ile sorunlu kolon pasifleştirilince tenant **hemen
açılıyor** (doğrulandı). Yani kalıcı hasar yok — ama kullanıcı nedenini asla anlayamaz.

**Teşhis edilemezlik.** Hata mesajı kolonu, modeli veya nedeni **söylemiyor**. İç istisna
(`InvalidOperationException` içindeki gerçek `Exception`) API yanıtına taşınmıyor ve **log'a da
yazılmıyor** — backend log'unda tek bir `ERR` satırı yok. Kullanıcı yalnızca "script'ler
üretilemedi" görür; hangi kolonun suçlu olduğunu bulmak için tek tek silmesi gerekir.

**Etki bu tasarımda:** `SupplierCategory.ParentCategoryId` ve `Employee.ManagerEmployeeId`
(kategori ağacı ve yönetici hiyerarşisi) — ikisi de **kaldırılmak zorunda kaldı**; bağ artık
`RelationshipDefinition` `SelfReference` ile kurulacak (o, döngü kontrolünde açıkça beyaz listede:
`RelationshipGraph.cs:178`).

**Düzeltme — tek satır:**

```csharp
foreach (var targetTableName in lookupTargets.Values)
{
    if (targetTableName.Equals(table.Name, StringComparison.OrdinalIgnoreCase))
        continue;                 // self-FK dongu degildir
    if (tablesByName.TryGetValue(targetTableName, out var targetType))
        Visit(targetType);
}
```

Ayrıca **şiddetle önerilir**: `CreateTable`'ın `catch` bloğu (`CheckingDataBase.cs:104-108`) iç
istisnanın mesajını çağırana taşısın ve en azından `LogError` yazsın. Bugün teşhis imkânsız.

| | |
|---|---|
| **Büyüklük** | ●○○○ — bir satır + hata mesajı iyileştirmesi (~2 saat) |
| **Öncelik** | 🔴 **Acil** — veri kaybı yok ama tenant geneli publish kesintisi |
| **Test** | T-55 (yeni) |

### H-11 · `max_models` kotası hiç zorlanmıyor 🔴🐞

> ✅ **DÜZELTİLDİ — 2026-09-24.** `ModelDefinitionManager.Publish` artık `EnsureModelQuota`
> çağırıyor (`WorkflowQuotaManager` deseni). Sayım **"yeni eklenen model"** üzerinden yapılıyor:
> sınırdaki tenant mevcut ağacını yeniden yayınlayabilir, yalnız yeni model ekleyemez.
> Kontrol yan etkisiz son noktada (`MergePublishBatch` sonrası, derlemeden önce).
> Canlı doğrulama: free planda 6. model reddedildi, mevcut model yeniden yayınlanabildi,
> plan yükseltmesi kotayı **anında** açtı (entitlement cache invalidation çalışıyor).

Plan limitleri master DB'de tanımlı ve **tutarsız uygulanıyor**:

| Plan | `max_models` | `workflow_definitions` | `workflow_runs_per_month` |
|---|---|---|---|
| free | **5** | 3 | 100 |
| pro | 50 | 25 | 5.000 |
| enterprise | 500 | 200 | 100.000 |

Canlı koşuda `free` planlı bir tenant'a **49 model** yayınlandı — hiçbir engel çıkmadı.
Aynı tenant'ta `workflow_definitions = 3` limiti ise **4. akışta düzgünce reddedildi**:

```
Plan sınırına ulaşıldı: en fazla 3 yayınlanmış akış tanımlayabilirsiniz.
```

Yani `EntitlementService` **workflow için çağrılıyor, model yayınlama için çağrılmıyor**.

| | |
|---|---|
| **Etki** | Gelir kaybı (ücretsiz plan sınırsız model açabilir) + plan tasarımının anlamsızlaşması |
| **Düzeltme** | `ModelDefinitionManager.Publish` başına `Entitlement.Can(max_models)` kontrolü | 
| **Büyüklük** | ●○○○ (~4 saat) |
| **Test** | Canlı koşu, `proc4` tenant'ı |

> ⚠️ Kota kontrolü eklenirken **mevcut tenant'ların limiti çoktan aştığı** hesaba katılmalı —
> sert uygulama, çalışan kurulumları kilitler. Yeni yayınları engelleyip mevcutları bırakmak doğru
> davranış.

### H-12 · `add` oluşturulan kaydın ID'sini döndürmüyor 🐞

> ✅ **DÜZELTİLDİ — 2026-09-24.** `PublishedModelManager.Add` artık `IDataResult<int>` dönüyor;
> controller değişmedi (`ApiControllerBase`'in `IDataResult<T>` overload'ı devreye giriyor).
> UI servis imzası `DataResponseModel<number>` oldu — tek çağıran vardı, hiçbir şey kırılmadı.

`POST /PublishedModel/add` yanıtı yalnız `{ success, message }` — **ID yok**.

```json
{ "success": true, "message": "Ekleme başarılı." }
```

Her entegrasyon, eklediği kaydı bulmak için arkasından bir `getall` atmak zorunda. Ve **unique
constraint olmadığı için** (G-01) "hangi kaydı oluşturdum" sorusunun güvenilir bir cevabı yok —
aynı anda iki istemci eklerse yanlış kayda bağlanılır.

Tutarsız da: `ReportService.define()` ve `DashboardService.define()` ID **döndürüyor**
(bkz. `CLAUDE.md` — AI modülü için bu bilinçli olarak düzeltilmiş). Dinamik CRUD aynı şeyi yapmıyor.

Bu, [16-demo-senaryosu.md](16-demo-senaryosu.md)'deki **belge zincirini** doğrudan etkiler: her
belge bir öncekinin ID'sine referans verir ve o ID güvenilir biçimde elde edilemiyor.

| | |
|---|---|
| **Düzeltme** | `Add` → `DataResponseModel<int>` (`addTree` zaten `savedIds` döndürüyor — desen hazır) |
| **Büyüklük** | ●○○○ (~2 saat) |

### H-1 · Yalnız-eskalasyon SLA'sı hiç taranmıyor 🐞

`DueHours` boş + `EscalateAfterHours` dolu olan adımda **eskalasyon asla tetiklenmez**:

- `ApplySla` `DueAt`'i yalnız `DueHours > 0` ise yazıyor (`WorkflowCommandExecutor.cs:230-234`)
- `GetOverdue` filtresi `DueAt != null && DueAt <= now` (`EfWorkflowTaskDal.cs:45-57`)
- Doğrulayıcı bu SLA'yı **kabul ediyor** (`WorkflowValidator.cs:175-194`), UI üretebiliyor

**Sessiz hata.** Düzeltme: ya `EscalateAt`'i de taramaya kat, ya doğrulayıcıda `DueHours` zorunlu
kıl. ~2 saat.

### H-2 · Mutabakat taraması (Pass 3) yazılmamış 🐞

Kod **üç ayrı yerde** "kaybolan tetiklemeyi mutabakat taraması yakalar" diyor
(`WorkflowOutbox.cs:45-46`, `AuditSaveChangesInterceptor.cs:259, 309`).
`IWorkflowOutboxDal.ExistsForEntity` tanımlı ve implemente edilmiş — **hiçbir çağıranı yok**.
`WorkflowWorker` yalnız iki pass koşuyor (Drain + SweepSla).

3 deneme sonrası `Failed` olan tetiklemeler **sessizce kaybolur**. ~1 gün.

### H-3 · `WorkflowTask` `Expired` durumuna hiç geçmiyor 🐞

`WorkflowTaskStatus.Expired` sabiti tanımlı ama hiçbir kod yolu görevi `Expired` yapmıyor — SLA
otomatik kapatma `CompleteInternal` üzerinden `Completed`/`Rejected` yazıyor
(`WorkflowTaskManager.cs:302`). Ölü sabit veya eksik implementasyon.

### H-4 · `AddMember` duplicate kolon kontrolü yapmıyor 🐞

> ✅ **DÜZELTİLDİ — 2026-09-24.** Kontrol **büyük/küçük harf duyarsız** ve bellekte yapılıyor
> (SQL collation'ına güvenilmiyor). Yalnız **aktif** üyelere bakıyor — "sil + aynı adla yeniden
> ekle" akışı bozulmadı. Toplu uç parti içi duplicate'i de yakalıyor.

Aynı adla iki kez çağrılırsa üretilen C#'ta CS0102 → publish kırılır
(`PublishedTableManager.cs:77-146`). 50 modellik kurulumda gerçek risk. ~2 saat.

### H-5 · Rezerve kolon adları engellenmiyor 🐞

> ✅ **DÜZELTİLDİ — 2026-09-24.** `PublishedTableMemberValidator`'a `DbBaseObjectColumns.All`
> kontrolü eklendi (tek kaynak — taban kolon eklenirse kendiliğinden güncellenir). Hata mesajı
> rezerve adların tamamını listeliyor.

`DbBaseObjectColumns.All` yalnız ilişki property'lerinde kontrol ediliyor
(`RelationshipRuleHelpers.cs:16`); `PublishedTableMemberValidator` ona bakmıyor. `Active` adlı kolon
eklenirse `CREATE TABLE` patlar. ~1 saat.

### H-6 · `removeMember` + aynı adla yeniden ekleme tip kontrolünü bypass ediyor 🐞

Kolon sil → publish → aynı adı farklı tiple ekle → publish. `DetectTypeChanges` eski tipi görmez,
`CheckDb` kolonu ada göre var sayar. **C# tipi yeni, SQL kolonu eski.** ~1 gün.

### H-7 · Rapor kolon listesi navigation property'lerini sızdırıyor 🐞

`ReportingManager.GetColumns` `type.GetProperties()` kullanıyor ve `IsPersistedScalar` filtresini
**uygulamıyor** (`ReportingManager.cs:618-626`); kardeş yol `PublishedModelManager.cs:553-554`
uyguluyor. Navigation property'ler ve `RecordStatus` rapor kolonu olarak `"string"` görünüyor.
~2 saat.

### H-8 · `SUM`/`AVG` tip uyuşmazlığı sessiz 🐞

> ✅ **DÜZELTİLDİ — 2026-09-24.** Backend `IsNumeric` yedi sayısal tipin tamamını kabul ediyor
> (`long`/`short`/`byte`/`double` haksız reddediliyordu). UI'daki ölü `isNumericColumn()` artık
> şablonda kullanılıyor — aggregate alan listesi yalnız sayısal kolonları gösteriyor.

Backend yalnız `int|float|decimal` kabul ediyor (`ReportingManager.cs:550`) ama UI **tüm kolonları**
listeliyor. `long`/`double` kolonda `SUM` seçilirse hata ancak Kaydet'te görülür. UI'da
`isNumericColumn()` yazılmış ama şablonda hiç kullanılmamış (ölü kod). ~1 saat.

### H-9 · Optimistic concurrency yok 🐞

`RowVersion`/`Timestamp` kolonu yok; iki kullanıcı aynı kaydı düzenlerse **son yazan kazanır** ve
kimse fark etmez (EC-03). `DbBaseObject`'e `RowVersion` + `Update`'te kontrol. ~2 gün.

## Ölçeklenme sorunları

| # | Sorun | Etki | Düzeltme |
|---|---|---|---|
| Ö-1 | ✅ **DÜZELTİLDİ (2026-09-24)** — `IAuditLogDal`'a `GetPaged`/`Count`, servise ikili mod, controller'a `page`/`pageSize`, UI sunucu sayfalamasına geçti. Sayfasız çağrı geriye dönük uyum için korundu | — | **bitti** |
| Ö-2 | Alt model sekmelerinde sayfalama yok | 5.000 kalem tek seferde | ~1 gün |
| Ö-3 | Toplu silme N ayrı HTTP isteği | 100 satır = 100 istek, transaction yok | ~2 gün |
| Ö-4 | `getall` sayfasız çağrıda sınırsız | Bellek riski | ~0,5 gün |
| Ö-5 | `model-detail`/`model-data` her açılışta `getModels()` | Tüm modellerin metadata'sı | ~0,5 gün (`shareReplay`) |
| Ö-6 | Yedekleme senkron (HTTP isteği içinde) | Büyük DB'de kullanılamaz | ~3 gün |
| Ö-7 | İndeks tanımlama yüzeyi yok | İş sorguları indekssiz | ~3 gün |

## Ulaşılamayan / tamamlanmamış özellikler

| # | Bulgu |
|---|---|
| U-1 | **Dashboard düzenlenemiyor** — `update` ucu backend/servis/route/component hiçbirinde yok |
| U-2 | Rapor ve dashboard **listelerinde silme butonu yok** — ama `/reports/deleted` ve `/dashboard/deleted` ekranları var (ulaşılamayan çöp kutusu) |
| U-3 | **Webhook ayarı yazılamıyor** — `AppSetting` için generic controller yok; kanal yazılmış ama ulaşılamaz |
| U-4 | `GET /WorkflowInstance/list` — hiçbir component çağırmıyor; **çalışan süreçler listesi ekranı yok** |
| U-5 | `IWorkflowQuotaService.GetUsage()` hiçbir controller'dan çağrılmıyor — kullanıcı workflow kotasını göremiyor |
| U-6 | `components/model-children` **orfan** — ~30 KB ölü kod, kendi i18n bloğuyla |
| U-7 | `NotificationService.danger()`/`.info()` tip tanımlı, metot yazılmamış |
| U-8 | `PublishedTableMember.DefaultValue` ve `IsReadOnly` **ölü alanlar** |
| U-9 | `WorkflowInstance.CorrelationId` tanımlı, hiçbir yerde yazılmıyor |
| U-10 | `Messages.WorkflowCodeInUse` tanımlı, kullanılmıyor → `Define`'da Code benzersizlik kontrolü yok |
| U-11 | `model-permission.guard.ts:34-42` hata mesajı **sabit Türkçe**, i18n'den geçmiyor |
| U-12 | Excel export'ta tüm hücreler `.ToString()` — sayı/tarih tipi kaybolur |
| U-13 | **`CLAUDE.md` Routing bölümü güncel değil** — `/tasks`, `/tasks/:id` ve 6 workflow route'u eksik |

---

# Önerilen yol haritası

## Faz A — "Bir haftada yapılabilecekler" (~5 gün, çok yüksek getiri)

| İş | Süre | Getiri |
|---|---|---|
| G-08 #1: `WorkflowCompleted`/`WorkflowRejected` enqueue | 1 saat | 6 bildirim şablonu |
| G-07 #1: göreli tarih token'ları | 0,5 gün | 6 rapor + 2 widget |
| G-10: `file` kolonlarını audit'ten çıkar | 1 saat | Audit şişmesi durur |
| H-1, H-4, H-5, H-7, H-8: beş küçük hata | 1 gün | Sessiz hatalar kapanır |
| Ö-1: `/AuditLog` sunucu sayfalama | 1 gün | Ekran kullanılabilir olur |
| Ö-4: `getall` varsayılan sayfa boyutu | 0,5 gün | Bellek riski |
| G-03 #4: terminal adım etiketleri (UI) | 0,5 gün | Durum etiketi kalıcı olur |
| U-3: `AppSetting` yazma ucu | 0,5 gün | Webhook açılır |

**~5 gün, 8 ayrı sorunu kapatıyor.** Hiçbiri mimari değişiklik gerektirmiyor.

## Faz B — Otomasyon çekirdeği (~6 hafta)

| Sıra | İş | Süre | Kapsam etkisi |
|---|---|---|---|
| 1 | **G-03** tam (`SetFieldCommand`) | 1 hafta | 9 sürecin durum otomasyonu |
| 2 | **G-02 Aşama 1** (`BusinessRule` + alan-alan + eski değer) | 1 hafta | 11 iş kuralı |
| 3 | **G-01** (unique, default, NOT NULL, sequence, precision) | 2 hafta | 9 belge numarası + 4 tekillik kuralı |
| 4 | **G-04** (`ScheduledRule` + `rule-sweep`) | 2 hafta | 7 zamanlanmış senaryo |

**Kapsam oranı: %58 → ~%78.**

## Faz C — Kullanılabilirlik (~5 hafta)

| İş | Süre |
|---|---|
| G-06 (arama/filtre/sıralama/export) | 2 hafta |
| G-08 #3-4 (şablon + in-app bildirim) | 2,5 hafta |
| G-13 (menü gruplama) | 2 gün |
| Ö-2, Ö-3, Ö-5 (ölçekleme) | 4 gün |

**Kapsam oranı: ~%78 → ~%85.**

## Faz D — Derin yetenekler (~3 ay)

| İş | Süre |
|---|---|
| G-05 (hesaplanan + rollup) | 2,5 hafta |
| G-02 Aşama 2-3-4 (lookup okuma, rollup erişimci, çapraz-model) | 4 hafta |
| G-07 Aşama 2-7 (lookup etiketi, parametre, JOIN, ifade) | 6 hafta |
| G-09 (alan seviyesi yetki) | 2 hafta |
| G-12 (`PublishedTableAction`) | 2 hafta |
| G-10 (generic attachment + blob depo) | 3 hafta |

**Kapsam oranı: ~%85 → ~%95.** Bu noktada CoreLogic gerçekten "Dynamic Enterprise Application
Platform" olur.

---

## Kapsam oranı yöntemi

[00-yonetici-ozeti.md](00-yonetici-ozeti.md)'deki yüzdeler şöyle hesaplandı:

1. Her yetenek alanı için bu uygulamanın ihtiyaç duyduğu **madde sayısı** sayıldı (entity, kural,
   senaryo, şablon, rapor, ekran)
2. Her madde ✅ (1,0) · ⚠️ (0,5) · ❌ (0,0) olarak puanlandı
3. Alan yüzdesi = toplam puan / madde sayısı
4. Genel ortalama, alanların **madde sayısına göre ağırlıklı** ortalaması

| Alan | Madde | Puan | % |
|---|---|---|---|
| Entity / alan | 50 entity | 16×1 + 22×0,5 + 12×0 = 27 | 54 → ⚠️ *alan tanımı bazında 85* |
| İş kuralları | 34 kural | 3×1 + 1×0,5 = 3,5 | 10 → ⚠️ *sınıf bazında 25* |
| Zamanlanmış iş | 10 senaryo | 0 | 0 → *altyapı payıyla 5* |
| Bildirim | 24 şablon | 2×0,5 = 1 | 4 → *kanal payıyla 30* |
| Rapor | 12 rapor | 2×1 + 2×0,5 = 3 | 25 → *motor yeteneği payıyla 40* |
| Workflow | 7 tanım + 12 yetenek | 7×1 + 6×0,5 = 10 | 53 → 55 |
| Edge case | 24 vaka | 6×1 + 7×0,5 = 9,5 | 40 |

> Yüzdeler **yaklaşık** ve karşılaştırma içindir; mutlak bir ölçü değil. Asıl bilgi, hangi alanın
> hangi boşluk yüzünden düştüğüdür.
