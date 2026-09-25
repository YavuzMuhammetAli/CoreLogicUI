# 06 · Veritabanı Tasarımı

Bu bölüm, [04](04-entity-listesi.md)'teki metadata'dan CoreLogic'in **gerçekten üreteceği** SQL'i
gösterir. Tasarım burada bitmiyor — üretilen DDL ile ideal DDL arasındaki fark, platform
boşluklarının somut hali.

---

## Veritabanı bağlamı

| | |
|---|---|
| **Sunucu** | SQL Server |
| **Tenant DB adı** | `CoreLogic_{tenantCode}` — bu blueprint için `CoreLogic_satinalma` |
| **Master DB** | `CoreLogicMaster` — tenant kaydı, plan, zamanlanmış görev, iş kuyruğu |
| **Şema** | `dbo` (tek şema; platform şema ayrımı desteklemiyor) |
| **Migrasyon** | Elle yazılmış numaralı SQL zinciri (`migrations/NNN_*.sql`) — dinamik tablolar buna dahil **değil** |
| **Collation** | Sunucu varsayılanı |

> Dinamik tablolar migrasyon zincirinin parçası değildir; `Published/publish` çağrısıyla, **çalışma
> anında** `CREATE TABLE` ile açılır (`CheckingDataBase.cs:61-266`). Bu, tasarımın
> versiyonlanmasının `migrations/` klasöründe değil `ModelDefinition.SchemaSnapshotJson` alanında
> olduğu anlamına gelir.

---

## Her dinamik tablonun taban yapısı

`DbBaseObject` türevi olan her model şu kolonları **otomatik** alır
(`CheckingDataBase.cs:190-213, 320-336`):

```sql
[ID]              INT            IDENTITY(1,1) NOT NULL,
[Active]          BIT            NOT NULL DEFAULT 1,
[RecordStatus]    INT            NULL,
[CreatedOn]       DATETIME       NOT NULL DEFAULT GETUTCDATE(),
[CreatedBy]       INT            NULL,
[LastModifiedOn]  DATETIME       NOT NULL DEFAULT GETUTCDATE(),
[LastModifiedBy]  INT            NULL,
[WorkflowStatus]  NVARCHAR(50)   NULL,

CONSTRAINT [PK_{Table}]                 PRIMARY KEY ([ID]),
CONSTRAINT [FK_{Table}_CreatedBy]       FOREIGN KEY ([CreatedBy])      REFERENCES [User]([ID]),
CONSTRAINT [FK_{Table}_LastModifiedBy]  FOREIGN KEY ([LastModifiedBy]) REFERENCES [User]([ID])
```

**Bunun anlamı:**

- "Kim oluşturdu / ne zaman" için ayrı kolon tanımlamaya gerek yok; otomatik ve `[User]`'a FK'lı
- Bu 8 kolon **formda görünmez** (miras `DeclaredProperties`'e girmez) ama **raporda seçilebilir**
- `[User]`'a FK olduğu için **kayıt üretmiş bir kullanıcı kalıcı olarak silinemez** — platform bunu
  yakalar ve pasifleştirmeye yönlendirir
- `WorkflowStatus` yalnızca workflow motoru tarafından yazılır; `Update` payload'ından kopyalanmaz
  (`PublishedModelManager.cs:316`)

---

## Örnek: `PurchaseRequest` — üretilecek gerçek DDL

```sql
CREATE TABLE [PurchaseRequest] (
    -- DbBaseObject (otomatik)
    [ID]                    INT            IDENTITY(1,1) NOT NULL,
    [Active]                BIT            NOT NULL DEFAULT 1,
    [RecordStatus]          INT            NULL,
    [CreatedOn]             DATETIME       NOT NULL DEFAULT GETUTCDATE(),
    [CreatedBy]             INT            NULL,
    [LastModifiedOn]        DATETIME       NOT NULL DEFAULT GETUTCDATE(),
    [LastModifiedBy]        INT            NULL,
    [WorkflowStatus]        NVARCHAR(50)   NULL,

    -- Kullanici kolonlari
    [RequestNumber]         NVARCHAR(250)  NULL,   -- ⚠ IsRequired=true ama NOT NULL degil
    [RequesterEmployeeId]   INT            NULL,   -- lookup
    [RequesterName]         NVARCHAR(250)  NULL,   -- denormalize (G-07)
    [DepartmentId]          INT            NULL,   -- lookup
    [DepartmentName]        NVARCHAR(250)  NULL,
    [CostCenterId]          INT            NULL,   -- lookup
    [CostCenterCode]        NVARCHAR(250)  NULL,
    [Priority]              NVARCHAR(250)  NULL,   -- ⚠ enum ama CHECK constraint YOK
    [RequestDate]           DATE           NULL,
    [RequiredDate]          DATE           NULL,
    [Description]           NVARCHAR(250)  NULL,   -- ⚠ uzun metin icin yetersiz
    [Status]                NVARCHAR(250)  NULL,   -- ⚠ enum, CHECK yok
    [Currency]              NVARCHAR(250)  NULL,
    [TotalAmount]           DECIMAL(18,2)  NULL,
    [TotalAmountTry]        DECIMAL(18,2)  NULL,
    [BudgetId]              INT            NULL,   -- lookup
    [BudgetCheckResult]     NVARCHAR(250)  NULL,
    [RejectionReason]       NVARCHAR(250)  NULL,

    CONSTRAINT [PK_PurchaseRequest] PRIMARY KEY ([ID]),
    CONSTRAINT [FK_PurchaseRequest_CreatedBy]           FOREIGN KEY ([CreatedBy])            REFERENCES [User]([ID]),
    CONSTRAINT [FK_PurchaseRequest_LastModifiedBy]      FOREIGN KEY ([LastModifiedBy])       REFERENCES [User]([ID]),
    CONSTRAINT [FK_PurchaseRequest_RequesterEmployeeId] FOREIGN KEY ([RequesterEmployeeId])  REFERENCES [Employee]([ID]),
    CONSTRAINT [FK_PurchaseRequest_DepartmentId]        FOREIGN KEY ([DepartmentId])         REFERENCES [Department]([ID]),
    CONSTRAINT [FK_PurchaseRequest_CostCenterId]        FOREIGN KEY ([CostCenterId])         REFERENCES [CostCenter]([ID]),
    CONSTRAINT [FK_PurchaseRequest_BudgetId]            FOREIGN KEY ([BudgetId])             REFERENCES [Budget]([ID])
);

CREATE INDEX [IX_PurchaseRequest_RequesterEmployeeId] ON [PurchaseRequest] ([RequesterEmployeeId]);
CREATE INDEX [IX_PurchaseRequest_DepartmentId]        ON [PurchaseRequest] ([DepartmentId]);
CREATE INDEX [IX_PurchaseRequest_CostCenterId]        ON [PurchaseRequest] ([CostCenterId]);
CREATE INDEX [IX_PurchaseRequest_BudgetId]            ON [PurchaseRequest] ([BudgetId]);
```

### Üretilmeyen ama gereken DDL

Aşağıdakilerin **hiçbiri** platform tarafından üretilmez. İdeal tasarımla gerçek arasındaki fark
budur:

```sql
-- ❌ G-01: belge numarasi tekilligi
CREATE UNIQUE INDEX [UX_PurchaseRequest_RequestNumber]
    ON [PurchaseRequest] ([RequestNumber]) WHERE [Active] = 1;

-- ❌ G-01: zorunluluk SQL seviyesinde
ALTER TABLE [PurchaseRequest] ALTER COLUMN [RequestNumber] NVARCHAR(250) NOT NULL;

-- ❌ G-01: enum kisiti
ALTER TABLE [PurchaseRequest] ADD CONSTRAINT [CK_PurchaseRequest_Status]
    CHECK ([Status] IN ('Draft','Submitted','UnderReview','Approved','Rejected','Cancelled','Completed'));

-- ❌ G-01: varsayilan deger
ALTER TABLE [PurchaseRequest] ADD CONSTRAINT [DF_PurchaseRequest_Status]
    DEFAULT 'Draft' FOR [Status];

-- ❌ G-02: is kurali
ALTER TABLE [PurchaseRequest] ADD CONSTRAINT [CK_PurchaseRequest_Dates]
    CHECK ([RequiredDate] >= [RequestDate]);

-- ❌ G-05: hesaplanan kolon
ALTER TABLE [PurchaseRequestItem] ADD [EstimatedLineTotal]
    AS ([Quantity] * [EstimatedUnitPrice]) PERSISTED;

-- ❌ performans: sik sorgulanan durum kolonu
CREATE INDEX [IX_PurchaseRequest_Status_RequestDate]
    ON [PurchaseRequest] ([Status], [RequestDate]) WHERE [Active] = 1;

-- ❌ uzun metin
ALTER TABLE [PurchaseRequest] ALTER COLUMN [Description] NVARCHAR(MAX);
```

> Bunlar `sqlcmd` ile elle uygulanabilir ama **bir sonraki publish'te hayatta kalmaları garanti
> değildir**. `CheckDb` yalnızca eksik kolon ekler, mevcut kolona dokunmaz
> (`CheckingDataBase.cs:338-372`) — yani `NOT NULL` ve `CHECK` muhtemelen kalır. Ancak bu,
> **belgelenmemiş bir davranışa güvenmek** demektir ve üretimde önerilmez. Test T-19 bunu ölçer.

---

## Örnek: alt model — `PurchaseRequestItem`

```sql
CREATE TABLE [PurchaseRequestItem] (
    [ID]                     INT            IDENTITY(1,1) NOT NULL,
    [Active]                 BIT            NOT NULL DEFAULT 1,
    [RecordStatus]           INT            NULL,
    [CreatedOn]              DATETIME       NOT NULL DEFAULT GETUTCDATE(),
    [CreatedBy]              INT            NULL,
    [LastModifiedOn]         DATETIME       NOT NULL DEFAULT GETUTCDATE(),
    [LastModifiedBy]         INT            NULL,
    [WorkflowStatus]         NVARCHAR(50)   NULL,

    [PurchaseRequestId]      INT            NOT NULL,   -- ✅ alt model FK'si NOT NULL

    [LineNumber]             INT            NULL,
    [ProductId]              INT            NULL,
    [ProductName]            NVARCHAR(250)  NULL,
    [ProductSku]             NVARCHAR(250)  NULL,
    [Description]            NVARCHAR(250)  NULL,
    [Quantity]               DECIMAL(18,2)  NULL,   -- ⚠ 0.001 dogrulamasi var ama SQL 2 basamak
    [UnitId]                 INT            NULL,
    [UnitCode]               NVARCHAR(250)  NULL,
    [EstimatedUnitPrice]     DECIMAL(18,2)  NULL,
    [EstimatedLineTotal]     DECIMAL(18,2)  NULL,   -- ❌ hesaplanan olmaliydi (G-05)
    [RequiredDate]           DATE           NULL,
    [Note]                   NVARCHAR(250)  NULL,

    CONSTRAINT [PK_PurchaseRequestItem] PRIMARY KEY ([ID]),
    CONSTRAINT [FK_PurchaseRequestItem_CreatedBy]      FOREIGN KEY ([CreatedBy])      REFERENCES [User]([ID]),
    CONSTRAINT [FK_PurchaseRequestItem_LastModifiedBy] FOREIGN KEY ([LastModifiedBy]) REFERENCES [User]([ID]),
    CONSTRAINT [FK_PurchaseRequestItem_purchaserequest] FOREIGN KEY ([PurchaseRequestId])
        REFERENCES [PurchaseRequest]([ID]),
    CONSTRAINT [FK_PurchaseRequestItem_ProductId] FOREIGN KEY ([ProductId]) REFERENCES [Product]([ID]),
    CONSTRAINT [FK_PurchaseRequestItem_UnitId]    FOREIGN KEY ([UnitId])    REFERENCES [Unit]([ID])
);

-- Alt model FK'si icin FILTRELI index (platform otomatik uretir)
CREATE INDEX [IX_PurchaseRequestItem_PurchaseRequestId]
    ON [PurchaseRequestItem] ([PurchaseRequestId]) WHERE [Active] = 1;

CREATE INDEX [IX_PurchaseRequestItem_ProductId] ON [PurchaseRequestItem] ([ProductId]);
CREATE INDEX [IX_PurchaseRequestItem_UnitId]    ON [PurchaseRequestItem] ([UnitId]);
```

> ⚠️ **`Quantity DECIMAL(18,2)` bir veri kaybı riskidir.** Uygulama doğrulaması `Min 0.001` kabul
> eder ama SQL iki basamağa yuvarlar. 0.001 kg altın yazılırsa **0.00** saklanır. Precision
> seçilebilirliği G-01'in parçası.
>
> ⚠️ Filtreli index (`WHERE [Active] = 1`) `QUOTED_IDENTIFIER ON` gerektirir. `SqlClient` bunu
> varsayılan açar ama **`sqlcmd` açmaz** — elle script çalıştırılırsa "SET options have incorrect
> settings" hatası alınır.

---

## İlişki DDL'i — `_Rel` son eki

`RelationshipDefinition` ile kurulan FK'lar, eski mekanizmalarla **ad çakışmasını önlemek için**
`_Rel` son eki taşır (`RelationshipNaming.cs:64-77`).

### R5 · `PurchaseRequest` ⟷ `Rfq` (OneToOne)

```sql
ALTER TABLE [Rfq] ADD [PurchaseRequestId] INT NULL;

ALTER TABLE [Rfq] ADD CONSTRAINT [FK_Rfq_PurchaseRequestId_Rel]
    FOREIGN KEY ([PurchaseRequestId]) REFERENCES [PurchaseRequest]([ID]);

-- OneToOne = UNIQUE index (platformun UNIQUE urettigi TEK yer)
CREATE UNIQUE INDEX [UX_Rfq_PurchaseRequestId_Rel] ON [Rfq] ([PurchaseRequestId])
    WHERE [PurchaseRequestId] IS NOT NULL;
```

> ✅ Bu, platformun **unique constraint ürettiği tek durumdur**
> (`RelationshipMigrationGenerator.cs:120-128`). "Bir talepten en fazla bir RFQ" kuralı bu sayede
> **gerçekten garanti edilir** — tasarımdaki nadir ✅ iş kurallarından biri (BR-09).

### R6 · `Product` ⟷ `Supplier` (ManyToMany)

```sql
CREATE TABLE [ProductSupplierLink] (
    [ProductId]   INT NOT NULL,
    [SupplierId]  INT NOT NULL,
    CONSTRAINT [PK_ProductSupplierLink] PRIMARY KEY ([ProductId], [SupplierId]),
    CONSTRAINT [FK_ProductSupplierLink_ProductId_Rel]  FOREIGN KEY ([ProductId])  REFERENCES [Product]([ID]),
    CONSTRAINT [FK_ProductSupplierLink_SupplierId_Rel] FOREIGN KEY ([SupplierId]) REFERENCES [Supplier]([ID])
);

CREATE INDEX [IX_ProductSupplierLink_SupplierId_Rel] ON [ProductSupplierLink] ([SupplierId]);
```

> Join tablosu **`DbBaseObject` kolonları taşımaz** — yalnız iki FK ve bileşik PK
> (`RelationshipMigrationGenerator.cs:143-179`). Gerekçe: EF'in `UsingEntity` konvansiyonuyla
> birebir aynı olması.
>
> ⚠️ **Sonucu:** join tablosu **audit'lenmez** (audit `DbBaseObject` türevlerine bakar), **soft-delete
> edilmez**, **`CreatedBy` tutmaz**. "Bu ürünü bu tedarikçiye kim bağladı" sorusu cevapsızdır.
> Bu tasarımda `ProductSupplier` (ek alanlı, tam modelli) asıl kayıt, `ProductSupplierLink` yalnız
> navigation içindir.

### R1 · `Employee` SelfReference

```sql
ALTER TABLE [Employee] ADD [ManagerId] INT NULL;
ALTER TABLE [Employee] ADD CONSTRAINT [FK_Employee_ManagerId_Rel]
    FOREIGN KEY ([ManagerId]) REFERENCES [Employee]([ID]);
CREATE INDEX [IX_Employee_ManagerId_Rel] ON [Employee] ([ManagerId]);
```

⚠️ `CascadeDelete` istense bile `SelfReference` **her zaman güvensiz** sayılır ve `NO ACTION`'a
düşer (`CascadeSafety.cs:30-60`).

---

## İndeks stratejisi

### Platformun otomatik ürettikleri

| İndeks | Ne zaman | Filtre |
|---|---|---|
| `PK_{Table}` | Her tabloda | — |
| `IX_{Table}_{Parent}Id` | Alt model FK'si | `WHERE Active = 1` |
| `IX_{Table}_{Column}` | Her lookup kolonu | yok |
| `IX_{Table}_{Column}_Rel` | İlişki FK'sı | yok |
| `UX_{Table}_{Column}_Rel` | Yalnız OneToOne | `WHERE ... IS NOT NULL` |

Bu tasarımda **~75 otomatik indeks** oluşur (60 lookup + 12 alt model + 6 ilişki).

### ❌ Üretilmeyen ama gereken indeksler

Platform, **iş sorgularına göre** indeks üretmez — yalnızca FK'lara. Bu uygulamanın gerçek sorgu
desenleri için gereken indeksler:

```sql
-- "Bekleyen taleplerim" — en sik calisan sorgu
CREATE INDEX [IX_PurchaseRequest_Status_CreatedBy]
    ON [PurchaseRequest] ([Status], [CreatedBy]) WHERE [Active] = 1;

-- "Vadesi yaklasan faturalar" — scheduler'in tarayacagi
CREATE INDEX [IX_SupplierInvoice_Status_DueDate]
    ON [SupplierInvoice] ([Status], [DueDate]) WHERE [Active] = 1;

-- "Acik siparisler"
CREATE INDEX [IX_PurchaseOrder_Status_ExpectedDeliveryDate]
    ON [PurchaseOrder] ([Status], [ExpectedDeliveryDate]) WHERE [Active] = 1;

-- Departman harcama raporu
CREATE INDEX [IX_PurchaseOrder_DepartmentId_OrderDate]
    ON [PurchaseOrder] ([DepartmentId], [OrderDate]) INCLUDE ([GrandTotalTry]) WHERE [Active] = 1;

-- Belge numarasi ile arama (kullanici en cok bunu yapar)
CREATE INDEX [IX_PurchaseOrder_OrderNumber] ON [PurchaseOrder] ([OrderNumber]) WHERE [Active] = 1;

-- Tedarikçi belge suresi taramasi (G-04 kapatilinca gerekli)
CREATE INDEX [IX_SupplierDocument_ExpiryDate]
    ON [SupplierDocument] ([ExpiryDate]) WHERE [Active] = 1 AND [ExpiryDate] IS NOT NULL;
```

> ❌ **Platformda indeks tanımlama yüzeyi yoktur.** `PublishedTableMember`'da `IsIndexed` gibi bir
> alan yok. Bu indeksler ancak DBA tarafından elle eklenir ve publish'ten sağ çıkmaları
> belgelenmemiştir. Performans, platformun hiç ele almadığı bir boyut — G-06 ile birlikte
> değerlendirilmeli.

---

## Tablo büyüklüğü tahmini (3 yıl)

| Tablo | Satır | Ortalama satır | Toplam | Not |
|---|---|---|---|---|
| `Product` | 50.000 | ~1 KB | 50 MB | ⚠️ `ProductImage` varbinary satır içinde |
| `Supplier` + 6 alt | ~15.000 | ~0,5 KB | 8 MB | |
| `SupplierDocument` | 12.000 | **~2 MB** | **24 GB** | ❌ PDF'ler satır içinde (G-10) |
| `PurchaseRequest` + alt | ~90.000 | ~0,5 KB | 45 MB | |
| `PurchaseOrder` + alt | ~70.000 | ~0,5 KB | 35 MB | |
| `SupplierInvoice` + alt | ~180.000 | ~0,4 KB | 72 MB | |
| `InvoiceAttachment` | 60.000 | **~1 MB** | **60 GB** | ❌ (G-10) |
| `AuditLog` | ~4.000.000 | ~1 KB | 4 GB | JSON eski/yeni değerler |
| **Toplam (ekler hariç)** | | | **~4,3 GB** | Yönetilebilir |
| **Toplam (eklerle)** | | | **~88 GB** | ❌ Sürdürülemez |

> ❌ **Ekler veritabanını 20 katına çıkarıyor.** `file`/`image` kolonları `varbinary(max)` olarak
> **satır içinde** saklanıyor; ayrı blob depo, `FILESTREAM`, harici URL veya deduplikasyon yok.
> Bunun üç somut sonucu var:
>
> 1. **Yedekleme sürdürülemez.** Platformun yedekleme özelliği (`/parameters` → Yedekleme) 88 GB'lık
>    bir DB'yi HTTP isteği içinde almaya çalışacak (`BackupManager` senkron çalışıyor) — "Şimdi
>    Yedek Al" butonu pratikte kullanılamaz hale gelir.
> 2. **Tablo taramaları çöker.** `getall` sayfasız çağrıldığında sınırsız satır döner
>    (`PublishedModelManager.cs:502-505`); `SupplierDocument` için bu, 24 GB'ı belleğe çekme
>    girişimidir.
> 3. **Boyut sınırı yok.** `file` kolonuna 2 GB'lık bir dosya yüklenebilir ve platform uyarmaz;
>    `ImageContentValidator` yalnızca profil avatarında çalışıyor (`ProfileController.cs:81-88`),
>    dinamik `image` kolonunda **hiç çağrılmıyor**.
>
> **Ara çözüm (⚠️):** Ek dosyaları sisteme **koymamak**; `SupplierDocument.DocumentFile` yerine
> `DocumentUrl` (string) tutup dosyaları bir SharePoint/S3 üzerinde saklamak. Bu, platformun dosya
> özelliğini tamamen bypass etmek demektir ama 88 GB'lık DB'den iyidir. Blueprint'in tavsiyesi budur.

---

## Platform sistem tabloları (referans)

Uygulamanın dolaylı olarak kullandığı, tenant DB'sinde hazır bulunan tablolar:

| Tablo | Rolü |
|---|---|
| `User` | Platform kullanıcıları. Her dinamik tablo `CreatedBy`/`LastModifiedBy` ile buraya FK verir |
| `OperationClaim`, `UserOperationClaim` | RBAC rolleri ve üyelik |
| `Permission`, `RolePermission` | Model bazlı izin bitmaskları |
| `PublishedTable`, `PublishedTableMember` | Model metadata'sı |
| `ModelDefinition` | Yayınlanmış sürümler, üretilen C#, şema anlık görüntüsü |
| `RelationshipDefinition`, `RelationshipMigrationHistory` | İlişki metadata'sı ve uygulanmış DDL |
| `AuditLog` | Denetim kaydı ([11](11-audit.md)) |
| `ReportDefinition`, `DashboardDefinition` | Rapor/dashboard tanımları |
| `WorkflowDefinition`, `WorkflowInstance`, `WorkflowTask`, `WorkflowEvent`, `WorkflowOutbox` | Workflow modülü ([08](08-workflow-tasarimi.md)) |
| `AppSetting` | Tenant ayarları (SMTP, webhook) |
| `ModelColumnSetting` | Kolon görünürlüğü (yalnız UI) |

> ⚠️ **Tenant migration şartı.** Workflow tabloları `migrations/017_workflow.sql` ile gelir ve tenant
> migrasyonları **uygulama açılışında koşmaz**. `DatabaseVersion >= 17` olmayan bir tenant'ta
> workflow uçları "modül bu şirkette kurulmamış" döner. Yeni provisioning (`register-company`) tüm
> zinciri baştan koşturduğu için bu blueprint'in test tenant'ı sorunsuz olacaktır.

---

## Veri bütünlüğü özeti

| Katman | Ne garanti ediliyor |
|---|---|
| **SQL** | PK, FK (lookup + alt model + ilişki), `Active`/`CreatedOn` varsayılanları, OneToOne UNIQUE |
| **Uygulama** | `IsRequired`, `MinLength`/`MaxLength`, `Min`/`Max`, `Regex` (200 ms ReDoS timeout'lu), `EnumValues` — `DynamicEntityValidator.cs` |
| **Hiçbir yerde** | Unique (OneToOne hariç), varsayılan değer, CHECK, hesaplanan kolon, çapraz-kayıt kural, çapraz-model kural, indeks stratejisi |

Son satır, bu uygulamanın veri kalitesinin **kullanıcı disiplinine** bağlı olduğu anlamına gelir.
Kurumsal bir satın alma sisteminde bu kabul edilemez; G-01 ve G-02 bu yüzden backlog'un tepesinde.
