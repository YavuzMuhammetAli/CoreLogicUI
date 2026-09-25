# 17 · CoreLogic Dinamik Model Mimarisi

Şirket yöneticisi runtime'da bir entity tanımladığında ne oluyor? 11 adım, gerçek kod yollarıyla.

**Örnek:** Sistem canlıya alındıktan sonra IT müdürü `CompanyVehicle` adında yeni bir entity
oluşturuyor — hiçbir kod değişikliği, hiçbir deployment, hiçbir migration dosyası olmadan.

---

## Giriş: kullanıcının yaptığı

`/build/new` ekranında:

| Alan | Tip | Zorunlu | Ek |
|---|---|---|---|
| `PlateNumber` | string | ✔ | Regex `^[0-9]{2}[A-Z]{1,3}[0-9]{2,4}$` |
| `Brand` | string | ✔ | |
| `Model` | string | ✔ | |
| `Year` | int | ✔ | Min 1990, Max 2100 |
| `DepartmentId` | lookup | ✔ | → `Department`, etiket `Name` |
| `DriverEmployeeId` | lookup | | → `Employee`, etiket `FullName` |
| `InsuranceExpiration` | dateonly | ✔ | |
| `PurchaseOrderId` | lookup | | → `PurchaseOrder` — **mevcut modele bağlanma testi** |

Sonra **"Yayınla"**.

---

## Adım 1 — Metadata

`POST /Published/addTable` → `PublishedTableManager.Add`

```
PublishedTable
  Name = "CompanyVehicle", ParentTableId = null, Depth = 1, TenantId
```

Her kolon için `POST /Published/addMember` → `PublishedTableMember` satırı.

**Doğrulama** (`PublishedTableMemberValidator.cs:19-69`):

| Kontrol | Kural |
|---|---|
| Ad deseni | `^[A-Za-z][A-Za-z0-9_]*$` (`SqlIdentifier.cs:26`) |
| Tip | 17 tipin beyaz listesinde (`CoreLogicTypeMap.cs:33-54`) |
| Enum | En az bir değer |
| Lookup | Hedef **kayıtlı bir `PublishedTable`** olmalı (`PublishedTableManager.cs:115-120`) |
| Uzunluk | `MinLength <= MaxLength` |
| Regex | Derlenebilir olmalı |

> ❌ **Yakalanmayan ikisi:** aynı adlı kolonun tekrarı (duplicate kontrolü yok, EC-17) ve rezerve
> ad kullanımı (`Active`, `CreatedBy` — `DbBaseObjectColumns.All` bu validator'dan çağrılmıyor,
> EC-18). İkisi de publish'i kırar ve hata mesajı anlaşılmaz olur.

Derinlik sınırı burada uygulanır: `Depth > 4` → hata (`PublishedTableManager.cs:44-45`).

---

## Adım 2 — İlişki grafiği doğrulaması

`POST /Published/publish?typeName=CompanyVehicle` → `ModelDefinitionManager.Publish`

Önce ağaç toplanır (`CollectTree` — köke çıkıp BFS parent-first), sonra grafik kurulup **16 kuralla**
doğrulanır (`Business/Concrete/Graph/Rules/`):

| Kural | Ne engeller |
|---|---|
| `CircularDependencyRule` | Döngü — ⚠️ yalnız ilişki kenarlarında; lookup'lar hariç |
| `MaxDepthRule` | Derinlik > 3 |
| `LegacyFkConflictRule` | İlişki FK'sının lookup/alt-model kolonuyla çakışması |
| `RequiredOnNonEmptyTableRule` | Dolu tabloya `NOT NULL` FK |
| `CascadePathRule` | SQL Server 1785 (çoklu cascade yolu) |
| `NavigationCollisionRule`, `DuplicatePropertyRule` | Ad çakışmaları, rezerve adlar |
| `TargetModelExistsRule`, `LookupTargetTableExistsRule` | Var olmayan hedef |
| `InversePropertyRule`, `ManyToManyJoinRule`, `SelfReferenceRule` | Tip-özel tutarlılık |
| `PropertyNameValidRule`, `RequiredNullableRule`, `DuplicateRelationshipRule` | — |

✅ **Bu, platformun en güçlü tarafı.** Çoğu düşük-kod platformu bu hataları çalışma anında patlatır;
CoreLogic publish'ten **önce** reddeder ve hiçbir yan etki bırakmaz.

`CompanyVehicle` üç lookup taşıyor ama hiç `RelationshipDefinition` yok → grafik kuralları trivially
geçer. `PurchaseOrderId` lookup'ı **derinliğe sayılmaz**.

---

## Adım 3 — C# üretimi

`ModelCodeGenerator` — `BuildNodePlan` (`ModelDefinitionManager.cs:308-350`) içinde.

```csharp
namespace CoreLogic.Dynamic
{
    public class CompanyVehicle : DbBaseObject
    {
        public string PlateNumber { get; set; }
        public string Brand { get; set; }
        public string Model { get; set; }
        public int Year { get; set; }
        public int DepartmentId { get; set; }
        public string DepartmentName { get; set; }
        public int? DriverEmployeeId { get; set; }
        public string DriverName { get; set; }
        public DateOnly InsuranceExpiration { get; set; }
        public DateOnly? InspectionExpiration { get; set; }
        public int? PurchaseOrderId { get; set; }
        public bool IsActive { get; set; }
    }
}
```

| Detay | Davranış |
|---|---|
| Taban sınıf | `DbBaseObject` — 8 platform kolonu miras alınır |
| Nullability | `IsRequired = false` → `?` (`ModelDefinitionManager.cs:338`) |
| Alt model olsaydı | `public int {Parent}Id` eklenirdi |
| Üretilen üyeler | **Yalnız otomatik property** (`ModelCodeGenerator.cs:54-58`) |

> ⚠️ Miras alınan `ID`, `Active`, `CreatedBy`, `WorkflowStatus` **üretilen sınıfta tanımlanmaz** —
> bilinçli. `GetModels()` kolon listesini `DeclaredProperties` üzerinden kuruyor; tanımlansalardı
> her formda düzenlenebilir alan, her rapor kurucusunda seçilebilir kolon olurlardı
> (`DbBaseObject.cs:24-28`).

---

## Adım 4 — Roslyn derlemesi

`AssemblyManager.PublishModels` → `DotNetCodeCompiler.CompileCode`

**Tek derleme, tüm düğümler aynı syntax tree'de** (`ModelDefinitionManager.cs:126`). Tek bir model
yayınlansa bile, `MergePublishBatch` ilişkiyle bağlı karşı tarafları da batch'e katar
(`ModelDefinitionManager.cs:226-263`) — çünkü EF navigation'ın iki tarafı aynı assembly'de olmalı.

### Sandbox (`DotNetCodeCompiler.cs:65-80, 377-440`)

| Yasak | Neden |
|---|---|
| `System.IO`, `System.Net`, `System.Diagnostics.Process` | Dosya/ağ/süreç erişimi |
| `System.Runtime.InteropServices`, `System.Reflection`, `System.Threading` | Native çağrı, yansıma, iş parçacığı |
| `DllImport`, `NativeLibrary`, `Marshal` | Native köprü |
| `unsafe` | Bellek |
| **Method, constructor, field tanımı** | AST seviyesinde engelli — **yalnız property** |

Referanslar küratörlü (satır 332-373).

> ✅ **Sandbox ciddi ve gerçek.** Dinamik kod yürütmenin en büyük riski kapatılmış.
>
> ❌ **Ama bedeli var:** method yasak olduğu için üretilen tipe **hesaplanan alan, iş kuralı veya
> doğrulama metodu yazılamaz**. G-05'in kök sebebi budur ve sandbox'ın doğrudan sonucudur. Çözüm
> sandbox'ı gevşetmek değil, DDL tarafında `AS ... PERSISTED` desteği veya G-02'nin metadata
> tabanlı kural motoru olmalı.

---

## Adım 5 — Collectible AssemblyLoadContext

```csharp
new AssemblyLoadContext(name, isCollectible: true)
    .LoadFromStream(peStream);
// eski ALC:
oldAlc.TrackAndUnload();
```

`DotNetCodeCompiler.cs:202-232, 245-258`

Her publish yeni bir ALC açar, eskisini bırakır. Collectible olması, yayınlanmış tiplerin
**bellekten gerçekten temizlenebilmesi** için gerekli — aksi halde her publish kalıcı bellek
büyümesi olurdu.

> ⚠️ **Bu, 50 modellik bir kurulumda asıl risk.** 18 publish dalgası × `MergePublishBatch` ile
> yeniden derlenen karşı taraflar = onlarca ALC yaratma/bırakma. `Unload()` **hemen değil**, GC
> referansları bıraktığında gerçekleşir; bir referans sızarsa ALC asla boşalmaz. Test T-49 bunu
> ölçüyor.
>
> Memory notundaki "Elsa'nın expression motoru collectible ALC'deki Roslyn tiplerine referans
> tutardı (somut sızıntı riski)" gerekçesi, ekibin bu riskin farkında olduğunu gösteriyor.

---

## Adım 6 — EF Core model kaydı

İki parça:

**1. Kenar kaydı — derlemeden ÖNCE** (`ModelDefinitionManager.cs:120`)

`RegisterEdges` ilişki kenarlarını kaydeder. Sıra kritik: derleme sonrası yapılsaydı EF navigation
property'leri çözemezdi.

**2. Fluent API** — `CoreLogicContext.OnModelCreating` (`CoreLogicContext.cs:73-114`) →
`DynamicRelationshipConfigurator.Apply` (`:33-93`)

Data Annotation kullanılmıyor; string/`Type` tabanlı overload'lar (satır 168-243).

> ✅ **Kritik savunma:** konfigüre edilemeyen her navigation `Ignore` edilir (satır 113-138) —
> aksi halde tek bozuk ilişki **tüm kiracıyı** çökertirdi.
>
> ⚠️ Ama bozuk ilişki yalnız `LogWarning` yazıyor (satır 74-89); **kullanıcıya bildirim yok**.
> İlişki sessizce çalışmaz hale gelir ve kimse fark etmez.

**3. Cache invalidasyonu**

```csharp
ModelVersion++;   // DotNetCodeCompiler.cs:225
```

`DynamicModelCacheKeyFactory` bu sayıyı cache anahtarına katıyor. Artmasa EF eski modeli
kullanmaya devam ederdi.

---

## Adım 7 — DDL üretimi ve tablo oluşturma

`DataBaseOperationsManager.CreateTable` → `CheckingDataBase.CreateSqlScript`

**Topolojik sıralı**, parent-first, **tek transaction** (`DataBaseOperationsManager.cs:128-164`).
Döngü tespit edilirse exception (`CheckingDataBase.cs:118-162`).

```sql
CREATE TABLE [CompanyVehicle] (
    [ID] INT IDENTITY(1,1) NOT NULL,
    [Active] BIT NOT NULL DEFAULT 1,
    [RecordStatus] INT NULL,
    [CreatedOn] DATETIME NOT NULL DEFAULT GETUTCDATE(),
    [CreatedBy] INT NULL,
    [LastModifiedOn] DATETIME NOT NULL DEFAULT GETUTCDATE(),
    [LastModifiedBy] INT NULL,
    [WorkflowStatus] NVARCHAR(50) NULL,

    [PlateNumber] NVARCHAR(250) NULL,
    [Brand] NVARCHAR(250) NULL,
    [Model] NVARCHAR(250) NULL,
    [Year] INT NULL,
    [DepartmentId] INT NULL,
    [DepartmentName] NVARCHAR(250) NULL,
    [DriverEmployeeId] INT NULL,
    [DriverName] NVARCHAR(250) NULL,
    [InsuranceExpiration] DATE NULL,
    [InspectionExpiration] DATE NULL,
    [PurchaseOrderId] INT NULL,
    [IsActive] BIT NULL,

    CONSTRAINT [PK_CompanyVehicle] PRIMARY KEY ([ID]),
    CONSTRAINT [FK_CompanyVehicle_CreatedBy] FOREIGN KEY ([CreatedBy]) REFERENCES [User]([ID]),
    CONSTRAINT [FK_CompanyVehicle_LastModifiedBy] FOREIGN KEY ([LastModifiedBy]) REFERENCES [User]([ID]),
    CONSTRAINT [FK_CompanyVehicle_DepartmentId] FOREIGN KEY ([DepartmentId]) REFERENCES [Department]([ID]),
    CONSTRAINT [FK_CompanyVehicle_DriverEmployeeId] FOREIGN KEY ([DriverEmployeeId]) REFERENCES [Employee]([ID]),
    CONSTRAINT [FK_CompanyVehicle_PurchaseOrderId] FOREIGN KEY ([PurchaseOrderId]) REFERENCES [PurchaseOrder]([ID])
);

CREATE INDEX [IX_CompanyVehicle_DepartmentId]     ON [CompanyVehicle] ([DepartmentId]);
CREATE INDEX [IX_CompanyVehicle_DriverEmployeeId] ON [CompanyVehicle] ([DriverEmployeeId]);
CREATE INDEX [IX_CompanyVehicle_PurchaseOrderId]  ON [CompanyVehicle] ([PurchaseOrderId]);
```

Ardından iki idempotent geçiş:

| Geçiş | İş |
|---|---|
| `CheckDb` | Var olan tablolarda **eksik kolonları `ALTER ADD`** (`CheckingDataBase.cs:338-372`) |
| `EnsureLookupForeignKeys` | Lookup FK/index onarımı (`DataBaseOperationsManager.cs:192-225`) |

> ⚠️ Not: `IsRequired = true` olan `PlateNumber` **`NULL` olarak** üretildi. Platform kullanıcı
> kolonlarında `NOT NULL` üretmiyor (yalnız alt model `{Parent}Id`). Zorunluluk sadece uygulama
> katmanında (G-01).

### Şema evrimi sınırları

| İşlem | Durum |
|---|---|
| Kolon **ekleme** | ✅ `ALTER TABLE ADD ... NULL` |
| Kolon **silme** | ❌ Yalnız metadata soft-delete; **SQL kolonu kalır** |
| Kolon **tipi değiştirme** | ❌ `DetectTypeChanges` **aktif olarak engeller** (`ModelDefinitionManager.cs:662-700`) |
| Kolon **kuralı değiştirme** (regex, min/max, label) | ❌ `updateMember` ucu **yok**; UI diff yalnız kolon **adı** üzerinden çalışır |

> ❌ **Son satır, canlı bir sistemde ciddi bir kısıt.** "Plaka regex'i 3 harfli plakaları kabul
> etmiyor, düzeltelim" gibi sıradan bir istek **karşılanamıyor**. Tek yol: kolonu silip yeniden
> eklemek — ve o zaman da tip kontrolü bypass edilir (EC-19).

---

## Adım 8 — Dinamik CRUD uçları

**Yeni endpoint üretilmez.** Generic controller model adını parametre alır:

```
POST /PublishedModel/add        { typeName: "CompanyVehicle", jsonData: {...} }
GET  /PublishedModel/getall     ?typeName=CompanyVehicle&page=1&pageSize=20
GET  /PublishedModel/get        ?typeName=CompanyVehicle&id=5
POST /PublishedModel/update
POST /PublishedModel/delete     ?typeName=CompanyVehicle&id=5
```

Yetki `[RequireModelPermission(...)]` filtresiyle; `typeName` bulunamazsa `ForbidResult`.

Doğrulama `DynamicEntityValidator` üzerinden — `PublishedTableMember` metadata'sından türer.
JSON okuma `AllowReadingFromString` ile (frontend her şeyi string gönderebilir).

---

## Adım 9 — Dinamik form

`/models/CompanyVehicle/new` → `model-detail` component.

`GET /PublishedModel/models` kolon metadata'sını döndürür → form `inputTypeFor` eşlemesiyle kurulur:

| Kolon | Kontrol |
|---|---|
| `PlateNumber`, `Brand`, `Model` | `<input type="text">` |
| `Year` | `<input type="number">` |
| `DepartmentId`, `DriverEmployeeId`, `PurchaseOrderId` | `<app-lookup-picker>` — sunucu araması, sonsuz kaydırma, ARIA |
| `InsuranceExpiration` | `<input type="date">` |
| `IsActive` | `<input type="checkbox">` |

Doğrulayıcılar backend şemasından türetilir (`staged-tree.util.ts:196-229`): `required`,
`minLength`, `maxLength`, `pattern`, `min`, `max`. Regex hatasında kolonun kendi `RegexMessage`'ı
gösterilir.

✅ **Bu adım gerçekten iyi çalışıyor.** Kullanıcı hiçbir şey yapmadan aranabilir combobox'lı,
doğrulamalı, erişilebilir bir form elde ediyor.

---

## Adım 10 — Dinamik grid

`/models/CompanyVehicle` → `model-data` component. Sunucu sayfalama (20/50/100), kolon görünürlüğü
(admin), toplu silme, `WorkflowStatus` kolonu (dolu satır varsa).

❌ Arama, filtre, sıralama, export yok (G-06).

---

## Adım 11 — İzin ve denetim

**İzin:** Model yayınlandığı anda `/permissions` ve `/roles` ekranlarında görünür. Admin
`Read|Create|Update|Delete|Navigation|OwnRecordsOnly` bitlerini atar. Atanana kadar **admin dışında
kimse erişemez** — güvenli varsayılan.

**Denetim:** Otomatik. `AuditSaveChangesInterceptor` dinamik tipi tanır; `Added`/`Modified`/
`Deleted` satırları `OldValues`/`NewValues` JSON'ıyla yazılır. `CreatedBy`/`LastModifiedBy` otomatik
dolar. **Ek yapılandırma gerekmez.**

**Workflow:** Aynı interceptor `WorkflowOutbox` satırı da yazar — yani yeni model **anında**
workflow tetikleyicisi olabilir. `CompanyVehicle` için bir sigorta yenileme onay akışı, model
yayınlandıktan hemen sonra tanımlanabilir.

---

## 11 adımın skoru

| # | Adım | Durum |
|---|---|---|
| 1 | Entity metadata | ✅ ⚠️ duplicate/rezerve ad kontrolü eksik |
| 2 | Graf doğrulaması | ✅ **çok iyi** — 16 kural |
| 3 | C# üretimi | ✅ |
| 4 | Roslyn derlemesi | ✅ sandbox ciddi ⚠️ method yasağı G-05'in kökü |
| 5 | Runtime assembly (collectible ALC) | ✅ ⚠️ ölçek davranışı doğrulanmadı |
| 6 | EF Core model kaydı | ✅ ⚠️ bozuk ilişki sessizce `Ignore` |
| 7 | DDL + tablo | ✅ ⚠️ `NOT NULL`/unique/CHECK/computed yok · şema evrimi kısıtlı |
| 8 | CRUD uçları | ✅ ⚠️ sorgu yüzeyi zayıf (G-06) |
| 9 | Dinamik form | ✅ **iyi** |
| 10 | Dinamik grid | ⚠️ arama/filtre/sıralama yok (G-06) |
| 11 | İzin + denetim | ✅ **çok iyi** — otomatik |

**11/11 adım çalışıyor.** Bu, CoreLogic'in asıl başarısı ve iddiasının karşılandığı yer: bir entity
gerçekten runtime'da, kod yazmadan, deployment yapmadan oluşuyor ve tam işlevsel hale geliyor.

---

## Hata ve geri alma

| Senaryo | Davranış |
|---|---|
| Derleme hatası | Publish durur; `RollbackInMemoryState` eski assembly'yi geri yükler (`ModelDefinitionManager.cs:206-217`) |
| DDL hatası | Tek transaction — tüm `CREATE TABLE` geri alınır |
| Kısmi başarı | ⚠️ **Bellek geri yüklenir ama DB'ye yazılmış sürüm kayıtları geri alınmaz** (satır 201-204) |
| İlişki konfigüre edilemedi | Navigation `Ignore` edilir, yalnız log |

⚠️ Üçüncü satır gerçek bir tutarsızlık kapısı: `ModelDefinition` satırı `Published` olarak kalabilir
ama assembly eski sürümde olur. Şema anlık görüntüsü ile çalışan kod ayrışır.

---

## Bu blueprint'in stres testi

Normal kullanımda bir kullanıcı ayda birkaç model yayınlar. Bu blueprint **18 dalgada 50 model**
yayınlıyor — platformun hiç karşılaşmadığı bir yük.

| Ölçülecek | Test |
|---|---|
| Publish süresi model sayısıyla nasıl ölçekleniyor | T-47 |
| `MergePublishBatch` kaç kez yeniden derliyor | T-48 |
| ALC unload gerçekleşiyor mu, bellek geri veriliyor mu | T-49 |
| EF `OnModelCreating` 50 modelde ne kadar sürüyor | T-50 |

Sonuçlar [20-canli-dogrulama-sonuclari.md](20-canli-dogrulama-sonuclari.md)'ye yazılacak.
