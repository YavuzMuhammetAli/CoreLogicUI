# 04 · Entity Listesi

**50 entity.** Her biri bir CoreLogic **modeli** (`PublishedTable`) olarak tanımlanır.

---

## Okuma kılavuzu

Her tabloda şu kolonlar vardır:

| Kolon | Anlam |
|---|---|
| **Alan** | `PublishedTableMember.Name` — C# property ve SQL kolon adı |
| **Tip** | CoreLogic veri tipi (17 tipten biri) |
| **Z** | Zorunlu mu — `PublishedTableMember.IsRequired` |
| **Doğrulama** | `MinLength`/`MaxLength`/`Min`/`Max`/`Regex`/`EnumValues` |
| **İlişki** | Lookup hedefi veya alt model bağı |
| **Durum** | ✅ / ⚠️ / ❌ — [README](README.md) lejantı |

### Tüm modeller için geçerli platform gerçekleri

Bunlar her tabloda tekrar edilmez; bir kez burada yazılır.

| Gerçek | Kanıt | Etki |
|---|---|---|
| Her model `DbBaseObject` türer: `ID`, `Active`, `RecordStatus`, `CreatedOn`, `CreatedBy`, `LastModifiedOn`, `LastModifiedBy`, `WorkflowStatus` | `Entities/Concrete/DbBaseObject.cs:8-33` | Bu 8 alan **formda görünmez** (miras `DeclaredProperties`'e girmez), **raporda görünür** |
| `CreatedBy`/`LastModifiedBy` otomatik dolar ve `[User](ID)`'ye FK verir | `AuditSaveChangesInterceptor.cs:96-114`, `CheckingDataBase.cs:202-204` | "Kim oluşturdu" ayrı alan gerektirmez |
| `string` daima `nvarchar(250)` — `MaxLength` **DDL'e yansımaz** | `CoreLogicTypeMap.cs:33-54` | ⚠️ `MaxLength > 250` verilirse uygulama geçer, SQL kırılır |
| `decimal` daima `decimal(18,2)` — precision seçilemez | aynı | ⚠️ Döviz kuru için 2 basamak yetersiz → `ExchangeRate` için özel not |
| `IsRequired` **SQL'de NOT NULL üretmez** | `CheckingDataBase.cs:191-198` | ⚠️ Zorunluluk yalnız uygulama katmanında; API doğrudan çağrılırsa boş yazılabilir |
| ❌ **`DefaultValue` ölü alan** — hiçbir kod okumuyor | `PublishedTableMember.cs:12` tek referans | Tüm varsayılanlar elle girilir (**G-01**) |
| ❌ **Unique constraint yok** (OneToOne ilişkisi hariç) | grep: `IsUnique` 0 sonuç | Tekillik hiçbir yerde garanti edilmez (**G-01**) |
| ❌ **Hesaplanan kolon yok** | `DotNetCodeCompiler.cs:423-439` | Tüm türetilmiş değerler saklanan kolon + elle hesap (**G-05**) |
| `enum` tipi DB'de düz `nvarchar(250)`, CHECK constraint yok | `DynamicEntityValidator.cs:72-79` | ⚠️ Kısıt yalnız uygulama katmanında |
| `file`/`image` satır içinde `varbinary(max)`; dosya adı ve MIME saklanmaz | `CoreLogicTypeMap.cs`, `model-data.util.ts:214-215` | Her dosya alanının yanına `...FileName` string kolonu konur (**G-10**) |

### Tasarım konvansiyonları

1. **Her lookup kolonunun yanına denormalize ad kolonu.** `SupplierId` (lookup) + `SupplierName`
   (string). Gerekçe: rapor motoru lookup'ı ham ID olarak gösterir (G-07). Yazma anında doldurulur.
   Bu, tasarımdaki en yaygın ⚠️ işaretidir ve **~40 ek kolon** maliyeti getirir.
2. **Hassas alan = ayrı model.** Alan seviyesi yetki olmadığı için (G-09) IBAN gibi alanlar ayrı
   modele taşınır ve `Read` izni kısılır.
3. **Belge numaraları `string`, elle girilir.** `Regex` ile format zorlanır ama **tekillik
   garanti edilmez** (G-01).
4. **Durum alanları `enum`.** Platform `enum` tipi destekler (`EnumValues`, `|` ayraçlı).

---

# M1 · Organizasyon

## 1. `Company`

| Alan | Tip | Z | Doğrulama | İlişki | Durum |
|---|---|---|---|---|---|
| `Code` | string | ✔ | `^[A-Z0-9_-]{2,20}$` | — | ⚠️ unique değil (G-01) |
| `Name` | string | ✔ | MinLength 2 | — | ✅ |
| `LegalName` | string | ✔ | — | — | ✅ |
| `TaxNumber` | string | ✔ | `^[0-9]{10,11}$` | — | ⚠️ unique değil (G-01) |
| `TaxOffice` | string | | — | — | ✅ |
| `Address` | string | | — | — | ⚠️ 250 karakter sınırı, textarea yok |
| `City` | string | | — | — | ✅ |
| `Country` | enum | ✔ | `TR\|DE\|US\|GB\|CN\|Other` | — | ✅ |
| `Phone` | string | | `^[0-9+ ()-]{7,20}$` | — | ✅ |
| `Email` | string | | e-posta regex | — | ✅ |
| `DefaultCurrency` | enum | ✔ | `TRY\|USD\|EUR\|GBP` | — | ✅ |
| `IsActive` | boolean | ✔ | — | — | ⚠️ varsayılan `true` yazılamaz (G-01) |

## 2. `Branch`

| Alan | Tip | Z | Doğrulama | İlişki | Durum |
|---|---|---|---|---|---|
| `CompanyId` | lookup | ✔ | — | → `Company` (`Name`) | ✅ |
| `CompanyName` | string | ✔ | — | denormalize | ⚠️ G-07 |
| `Code` | string | ✔ | `^[A-Z0-9_-]{2,20}$` | — | ⚠️ G-01 |
| `Name` | string | ✔ | — | — | ✅ |
| `Address`, `City`, `Phone` | string | | — | — | ✅ |
| `IsActive` | boolean | ✔ | — | — | ⚠️ G-01 |

## 3. `Department`

| Alan | Tip | Z | Doğrulama | İlişki | Durum |
|---|---|---|---|---|---|
| `CompanyId` | lookup | ✔ | — | → `Company` | ✅ |
| `BranchId` | lookup | | — | → `Branch` | ✅ |
| `Code` | string | ✔ | `^[A-Z0-9_-]{2,20}$` | — | ⚠️ G-01 |
| `Name` | string | ✔ | — | — | ✅ |
| `ManagerEmployeeId` | lookup | | — | → `Employee` | ⚠️ döngüsel referans, aşağıda |
| `ManagerName` | string | | — | denormalize | ⚠️ G-07 |
| `IsActive` | boolean | ✔ | — | — | ⚠️ G-01 |

> ⚠️ `Department.ManagerEmployeeId → Employee.DepartmentId → Department` bir **döngüdür**.
> `RelationshipDefinition` ile kurulsa `CircularDependencyRule` reddederdi. `lookup` kolonuyla
> kurulduğu için **geçer** — çünkü cycle kontrolü legacy kenarları hariç tutuyor
> (`CircularDependencyRule.cs:14-15`). Bu, lookup stratejisinin bir yan faydası; ama aynı zamanda
> platformun döngü korumasının lookup'larda **hiç çalışmadığını** gösterir. Test T-07.
>
> ⚠️ **Ama tek geçişte kurulamaz.** Lookup hedefi *kayıtlı bir `PublishedTable`* olmak zorunda;
> `Department` (dalga 3) yayınlanırken `Employee` (dalga 4) henüz yok. `ManagerEmployeeId`
> **ikinci geçişte** eklenir (`seed/publish-all.ps1 -SecondPass`). Bu kısıt seed yazılırken
> keşfedildi ve `seed/README.md`'de **B-01** olarak belgelendi — platform, kullanıcıya bağımlılık
> sırasını çözecek hiçbir araç sunmuyor.

## 4. `CostCenter`

| Alan | Tip | Z | Doğrulama | İlişki | Durum |
|---|---|---|---|---|---|
| `Code` | string | ✔ | `^[A-Z0-9_.-]{2,30}$` | — | ⚠️ G-01 |
| `Name` | string | ✔ | — | — | ✅ |
| `DepartmentId` | lookup | ✔ | — | → `Department` | ✅ |
| `DepartmentName` | string | ✔ | — | denormalize | ⚠️ G-07 |
| `IsActive` | boolean | ✔ | — | — | ⚠️ G-01 |

## 5. `Position`

| Alan | Tip | Z | Doğrulama | Durum |
|---|---|---|---|---|
| `Code` | string | ✔ | `^[A-Z0-9_-]{2,20}$` | ⚠️ G-01 |
| `Name` | string | ✔ | — | ✅ |
| `Level` | int | ✔ | Min 1, Max 10 | ✅ |
| `IsManagerial` | boolean | ✔ | — | ⚠️ G-01 |

## 6. `Employee`

| Alan | Tip | Z | Doğrulama | İlişki | Durum |
|---|---|---|---|---|---|
| `EmployeeNumber` | string | ✔ | `^[A-Z0-9-]{3,20}$` | — | ⚠️ G-01 |
| `FirstName` | string | ✔ | MinLength 2 | — | ✅ |
| `LastName` | string | ✔ | MinLength 2 | — | ✅ |
| `FullName` | string | ✔ | — | denormalize | ⚠️ G-05 — `FirstName + LastName` hesaplanamaz |
| `Email` | string | ✔ | e-posta regex | — | ⚠️ unique değil (G-01) |
| `Phone` | string | | — | — | ✅ |
| `DepartmentId` | lookup | ✔ | — | → `Department` | ✅ |
| `DepartmentName` | string | ✔ | — | denormalize | ⚠️ G-07 |
| `PositionId` | lookup | ✔ | — | → `Position` | ✅ |
| `PositionName` | string | ✔ | — | denormalize | ⚠️ G-07 |
| `ManagerName` | string | | — | denormalize | ❌ **self-lookup kullanılamıyor — H-10** |
| `PlatformUserId` | int | | — | → `[User].ID` | ❌ **FK verilemez** |
| `HireDate` | dateonly | ✔ | — | — | ✅ |
| `IsActive` | boolean | ✔ | — | — | ⚠️ G-01 |

> ❌ **`PlatformUserId` doğrulanmayan bir tamsayıdır.** Lookup hedefi kayıtlı bir `PublishedTable`
> olmak zorunda (`PublishedTableManager.cs:117-119`); `User` dinamik model değil. Sonuç: bir
> çalışan var olmayan bir kullanıcı ID'sine bağlanabilir ve kimse fark etmez. Bu, "talebi oluşturan
> çalışanı bul" tipindeki her sorguyu kırılgan yapar.
>
> **Ara çözüm (⚠️):** Platformun otomatik `CreatedBy` alanı zaten `[User](ID)`'ye FK verir ve
> raporda seçilebilir. "Kim oluşturdu" için `PlatformUserId` yerine `CreatedBy` kullanılmalıdır.
> `Employee` ↔ `User` eşlemesi yalnızca **atama** için gerekir (workflow `assignment`), ve orada da
> `WorkflowTask.AssignedUserId` platform `User` ID'si ister — yani eşleme elle ve doğrulanmadan
> yapılır. Test T-08.

---

# M2 · Tedarikçi Yönetimi

## 7. `Supplier`

| Alan | Tip | Z | Doğrulama | İlişki | Durum |
|---|---|---|---|---|---|
| `SupplierCode` | string | ✔ | `^SUP-[0-9]{5}$` | — | ❌ otomatik üretilemez (G-01) |
| `LegalName` | string | ✔ | MinLength 2 | — | ✅ |
| `TradeName` | string | | — | — | ✅ |
| `TaxNumber` | string | ✔ | `^[0-9]{10,11}$` | — | ❌ **unique olmalı** (G-01) |
| `TaxOffice` | string | ✔ | — | — | ✅ |
| `Status` | enum | ✔ | `Draft\|PendingApproval\|Active\|Suspended\|Blacklisted\|Archived` | — | ⚠️ motor yazamaz (G-03) |
| `CategoryId` | lookup | ✔ | — | → `SupplierCategory` | ✅ |
| `CategoryName` | string | ✔ | — | denormalize | ⚠️ G-07 |
| `Country` | enum | ✔ | `TR\|DE\|US\|GB\|CN\|IT\|FR\|Other` | — | ✅ |
| `City` | string | | — | — | ✅ |
| `Website` | string | | URL regex | — | ✅ |
| `Email` | string | ✔ | e-posta regex | — | ✅ |
| `Phone` | string | ✔ | — | — | ✅ |
| `DefaultCurrency` | enum | ✔ | `TRY\|USD\|EUR\|GBP` | — | ✅ |
| `PaymentTermDays` | int | ✔ | Min 0, Max 365 | — | ✅ |
| `RatingAverage` | decimal | | Min 0, Max 5 | — | ❌ rollup (G-05) |
| `IsPreferred` | boolean | ✔ | — | — | ⚠️ G-01 |
| `ApprovedOn` | datetime | | — | — | ⚠️ elle (G-03) |
| `ApprovedByEmployeeId` | lookup | | — | → `Employee` | ⚠️ elle (G-03) |
| `BlacklistReason` | string | | — | — | ✅ |
| `Notes` | string | | — | — | ⚠️ 250 karakter, textarea yok |

## 8. `SupplierContact` — alt model (`Supplier`)

| Alan | Tip | Z | Doğrulama | Durum |
|---|---|---|---|---|
| `FullName` | string | ✔ | MinLength 2 | ✅ |
| `Title` | string | | — | ✅ |
| `Email` | string | ✔ | e-posta regex | ✅ |
| `Phone` | string | | — | ✅ |
| `Mobile` | string | | — | ✅ |
| `IsPrimary` | boolean | ✔ | — | ❌ "yalnız biri primary" kuralı yok (G-02) |

## 9. `SupplierAddress` — alt model (`Supplier`)

| Alan | Tip | Z | Doğrulama | Durum |
|---|---|---|---|---|
| `AddressType` | enum | ✔ | `HeadOffice\|Billing\|Shipping\|Warehouse` | ✅ |
| `Line1` | string | ✔ | — | ✅ |
| `Line2` | string | | — | ✅ |
| `District`, `City`, `PostalCode` | string | | — | ✅ |
| `Country` | enum | ✔ | (yukarıdaki liste) | ✅ |
| `IsDefault` | boolean | ✔ | — | ❌ tekillik kuralı yok (G-02) |

## 10. `SupplierBankAccount` — alt model (`Supplier`) · 🔒 kısıtlı erişim

| Alan | Tip | Z | Doğrulama | Durum |
|---|---|---|---|---|
| `BankName` | string | ✔ | — | ✅ |
| `BranchName` | string | | — | ✅ |
| `AccountHolder` | string | ✔ | — | ✅ |
| `Iban` | string | ✔ | `^TR[0-9]{24}$` veya uluslararası | ⚠️ alan gizlenemez (G-09) |
| `SwiftCode` | string | | `^[A-Z0-9]{8,11}$` | ✅ |
| `Currency` | enum | ✔ | `TRY\|USD\|EUR\|GBP` | ✅ |
| `IsDefault` | boolean | ✔ | — | ❌ (G-02) |

> 🔒 Bu model, alan seviyesi yetki olmadığı için (G-09) **ayrı model olarak** tasarlandı.
> `Read` izni yalnızca Finance rollerine verilir. Bkz. [03](03-roller-ve-yetki.md).

## 11. `SupplierDocument` — alt model (`Supplier`)

| Alan | Tip | Z | Doğrulama | Durum |
|---|---|---|---|---|
| `DocumentType` | enum | ✔ | `TaxCertificate\|TradeRegistry\|ActivityCertificate\|ISO9001\|ISO14001\|Insurance\|Contract\|Other` | ✅ |
| `DocumentNumber` | string | | — | ✅ |
| `IssueDate` | dateonly | ✔ | — | ✅ |
| `ExpiryDate` | dateonly | | — | ❌ **süre bitimi hatırlatması yok** (G-04) |
| `DocumentFile` | file | ✔ | — | ⚠️ tek dosya, boyut sınırı yok (G-10) |
| `DocumentFileName` | string | ✔ | — | ⚠️ dosya adı elle (G-10) |
| `IsVerified` | boolean | ✔ | — | ⚠️ G-01 |
| `VerifiedByEmployeeId` | lookup | | → `Employee` | ✅ |

## 12. `SupplierCategory`

| Alan | Tip | Z | Doğrulama | İlişki | Durum |
|---|---|---|---|---|---|
| `Code` | string | ✔ | `^[A-Z0-9_-]{2,20}$` | — | ⚠️ G-01 |
| `Name` | string | ✔ | — | — | ✅ |
| `ParentCategoryName` | string | | — | denormalize | ❌ **self-lookup kullanılamıyor — H-10** |
| `Description` | string | | — | — | ✅ |

## 13. `SupplierRating` — alt model (`Supplier`)

| Alan | Tip | Z | Doğrulama | Durum |
|---|---|---|---|---|
| `PeriodYear` | int | ✔ | Min 2020, Max 2100 | ✅ |
| `PeriodQuarter` | enum | ✔ | `Q1\|Q2\|Q3\|Q4` | ✅ |
| `QualityScore` | decimal | ✔ | Min 0, Max 5 | ✅ |
| `DeliveryScore` | decimal | ✔ | Min 0, Max 5 | ✅ |
| `PriceScore` | decimal | ✔ | Min 0, Max 5 | ✅ |
| `ServiceScore` | decimal | ✔ | Min 0, Max 5 | ✅ |
| `OverallScore` | decimal | ✔ | Min 0, Max 5 | ❌ ortalama hesaplanamaz (G-05) |
| `EvaluatedByEmployeeId` | lookup | ✔ | → `Employee` | ✅ |
| `EvaluationDate` | dateonly | ✔ | — | ✅ |
| `Comment` | string | | — | ✅ |

---

# M3 · Ürün / Hizmet Kataloğu

## 14. `ProductCategory`

`Code` (string ✔, regex) · `Name` (string ✔) · `Description` (string) · `IsActive` (boolean ✔) — ✅
tümü, `Code` unique değil (G-01)

## 15. `ProductSubCategory` — alt model (`ProductCategory`)

`Code` (string ✔) · `Name` (string ✔) · `DefaultVatRate` (decimal, Min 0 Max 100) · `IsActive`
(boolean ✔) — ✅

## 16. `Unit`

`Code` (string ✔, `^[A-Z]{1,5}$` — EA/KG/M/LT/BOX) · `Name` (string ✔) · `Precision` (int ✔, Min 0
Max 4) · `IsActive` (boolean ✔) — ⚠️ `Code` unique olmalı (G-01)

## 17. `Brand`

`Code` (string ✔) · `Name` (string ✔) · `Country` (enum) · `IsActive` (boolean ✔) — ✅

## 18. `Product`

| Alan | Tip | Z | Doğrulama | İlişki | Durum |
|---|---|---|---|---|---|
| `Sku` | string | ✔ | `^[A-Z0-9-]{3,30}$` | — | ❌ **unique olmalı** (G-01) |
| `Name` | string | ✔ | MinLength 2 | — | ✅ |
| `Description` | string | | — | — | ⚠️ 250 karakter |
| `ItemType` | enum | ✔ | `Product\|Service` | — | ✅ |
| `CategoryId` | lookup | ✔ | — | → `ProductCategory` | ✅ |
| `CategoryName` | string | ✔ | — | denormalize | ⚠️ G-07 |
| `SubCategoryId` | lookup | | — | → `ProductSubCategory` | ✅ |
| `SubCategoryName` | string | | — | denormalize | ⚠️ G-07 |
| `BrandId` | lookup | | — | → `Brand` | ✅ |
| `BrandName` | string | | — | denormalize | ⚠️ G-07 |
| `UnitId` | lookup | ✔ | — | → `Unit` | ✅ |
| `UnitCode` | string | ✔ | — | denormalize | ⚠️ G-07 |
| `VatRate` | decimal | ✔ | Min 0, Max 100 | — | ✅ |
| `MinimumStock` | decimal | | Min 0 | — | ✅ |
| `MaximumStock` | decimal | | Min 0 | — | ❌ `Max >= Min` kuralı yok (G-02) |
| `Barcode` | string | | `^[0-9]{8,14}$` | — | ⚠️ unique değil (G-01) |
| `ProductImage` | image | | — | — | ⚠️ satır içi, boyut sınırı yok (G-10) |
| `IsActive` | boolean | ✔ | — | — | ⚠️ G-01 |

## 19. `ProductSupplier`

Bir ürünün birden çok tedarikçisi ve farklı fiyatları — bu modelin varlık sebebi.

| Alan | Tip | Z | Doğrulama | İlişki | Durum |
|---|---|---|---|---|---|
| `ProductId` | lookup | ✔ | — | → `Product` (`Name`) | ✅ |
| `ProductName`, `ProductSku` | string | ✔ | — | denormalize | ⚠️ G-07 |
| `SupplierId` | lookup | ✔ | — | → `Supplier` | ✅ |
| `SupplierName` | string | ✔ | — | denormalize | ⚠️ G-07 |
| `SupplierPartNumber` | string | | — | — | ✅ |
| `LeadTimeDays` | int | ✔ | Min 0, Max 365 | — | ✅ |
| `MinOrderQuantity` | decimal | ✔ | Min 0 | — | ✅ |
| `LastPurchasePrice` | decimal | | Min 0 | — | ❌ otomatik güncellenmeli (G-02) |
| `LastPurchaseDate` | dateonly | | — | — | ❌ (G-02) |
| `Currency` | enum | ✔ | `TRY\|USD\|EUR\|GBP` | — | ✅ |
| `IsPreferred` | boolean | ✔ | — | — | ⚠️ G-01 |

> ❌ `(ProductId, SupplierId)` çifti **unique olmalı** — aynı ürün-tedarikçi ikilisi iki kez
> girilebilir (G-01).

## 20. `PriceList`

`Code` (string ✔) · `Name` (string ✔) · `SupplierId` (lookup ✔) + `SupplierName` · `Currency` (enum ✔)
· `ValidFrom` (dateonly ✔) · `ValidTo` (dateonly ✔) · `Status` (enum ✔: `Draft|Active|Expired`) ·
`Notes` (string)

❌ `ValidTo >= ValidFrom` kuralı yok (G-02). ❌ Süresi dolan liste otomatik `Expired` olmaz (G-04).

## 21. `PriceListItem` — alt model (`PriceList`)

`ProductId` (lookup ✔) + `ProductName`, `ProductSku` · `UnitPrice` (decimal ✔, Min 0) ·
`DiscountRate` (decimal, Min 0 Max 100) · `MinQuantity` (decimal ✔, Min 0) · `VatRate` (decimal ✔) ·
`LeadTimeDays` (int)

---

# M4 · Satın Alma Talebi

## 22. `PurchaseRequest`

| Alan | Tip | Z | Doğrulama | İlişki | Durum |
|---|---|---|---|---|---|
| `RequestNumber` | string | ✔ | `^PR-[0-9]{4}-[0-9]{4}$` | — | ❌ **otomatik üretilemez** (G-01) |
| `RequesterEmployeeId` | lookup | ✔ | — | → `Employee` | ✅ |
| `RequesterName` | string | ✔ | — | denormalize | ⚠️ G-07 |
| `DepartmentId` | lookup | ✔ | — | → `Department` | ✅ |
| `DepartmentName` | string | ✔ | — | denormalize | ⚠️ G-07 · workflow koşulunda kullanılır |
| `CostCenterId` | lookup | ✔ | — | → `CostCenter` | ✅ |
| `CostCenterCode` | string | ✔ | — | denormalize | ⚠️ G-07 |
| `Priority` | enum | ✔ | `Low\|Normal\|High\|Urgent` | — | ✅ workflow koşulunda kullanılır |
| `RequestDate` | dateonly | ✔ | — | — | ⚠️ varsayılan "bugün" yazılamaz (G-01) |
| `RequiredDate` | dateonly | ✔ | — | — | ❌ `>= RequestDate` kuralı yok (G-02) |
| `Description` | string | ✔ | MinLength 10 | — | ⚠️ 250 karakter, textarea yok |
| `Status` | enum | ✔ | `Draft\|Submitted\|UnderReview\|Approved\|Rejected\|Cancelled\|Completed` | — | ⚠️ motor yazamaz (G-03) |
| `Currency` | enum | ✔ | `TRY\|USD\|EUR\|GBP` | — | ✅ |
| `TotalAmount` | decimal | ✔ | Min 0 | — | ❌ **rollup** (G-05) · workflow kademesini belirler |
| `TotalAmountTry` | decimal | ✔ | Min 0 | — | ❌ kur çevrimi yok (G-05) |
| `BudgetId` | lookup | | — | → `Budget` | ✅ |
| `BudgetCheckResult` | enum | ✔ | `NotChecked\|Sufficient\|Insufficient\|Overridden` | — | ❌ otomatik hesaplanmalı (G-02) |
| `RejectionReason` | string | | — | — | ✅ |

> ❌ **`TotalAmountTry` kritik bir kırılganlıktır.** Workflow tutar kademesi bu alanı okur
> ([08](08-workflow-tasarimi.md) K2). Alan istemci tarafından yazıldığı için, API'yi doğrudan çağıran
> bir kullanıcı `TotalAmountTry = 1` yazıp 500.000 TL'lik talebi **en düşük onay kademesine**
> düşürebilir. Bu, G-05 ve G-02'nin birleşik güvenlik sonucudur. Test T-31.

## 23. `PurchaseRequestItem` — alt model (`PurchaseRequest`)

| Alan | Tip | Z | Doğrulama | İlişki | Durum |
|---|---|---|---|---|---|
| `LineNumber` | int | ✔ | Min 1 | — | ⚠️ elle (G-01) |
| `ProductId` | lookup | | — | → `Product` | ✅ |
| `ProductName`, `ProductSku` | string | | — | denormalize | ⚠️ G-07 |
| `Description` | string | ✔ | MinLength 3 | — | ✅ katalog dışı kalem için |
| `Quantity` | decimal | ✔ | Min 0.001 | — | ✅ |
| `UnitId` | lookup | ✔ | — | → `Unit` | ✅ |
| `UnitCode` | string | ✔ | — | denormalize | ⚠️ G-07 |
| `EstimatedUnitPrice` | decimal | ✔ | Min 0 | — | ✅ |
| `EstimatedLineTotal` | decimal | ✔ | Min 0 | — | ❌ `Quantity × UnitPrice` (G-05) |
| `RequiredDate` | dateonly | | — | — | ✅ |
| `Note` | string | | — | — | ✅ |

## 24. `PurchaseRequestAttachment` — alt model (`PurchaseRequest`)

`FileName` (string ✔) · `AttachmentFile` (file ✔) · `DocumentType` (enum ✔:
`Specification|Quote|Drawing|Justification|Other`) · `Description` (string) — ⚠️ G-10

## 25. `PurchaseRequestApproval` — alt model (`PurchaseRequest`)

Workflow görevlerinin **okuma kopyası**. Var olma sebebi aşağıda.

| Alan | Tip | Z | Doğrulama | Durum |
|---|---|---|---|---|
| `StepOrder` | int | ✔ | Min 1 | ✅ |
| `StepName` | string | ✔ | — | ✅ |
| `ApproverEmployeeId` | lookup | | → `Employee` | ✅ |
| `ApproverName` | string | | denormalize | ⚠️ G-07 |
| `Decision` | enum | ✔ | `Pending\|Approved\|Rejected\|Skipped` | ⚠️ elle senkronlanır |
| `DecisionDate` | datetime | | — | ⚠️ elle |
| `Comment` | string | | — | ✅ |
| `WorkflowTaskId` | int | | — | ⚠️ FK verilemez |

> ⚠️ **Bu model bir veri tekrarıdır ve bilinçlidir.** Gerçek onay verisi `WorkflowTask` tablosunda
> durur, ama o tablo **raporlanamaz**: rapor motoru yalnızca yayınlanmış dinamik modeller üzerinde
> çalışır (`ReportingManager.cs`), `WorkflowTask` bir sistem tablosudur. "Onay bekleme süresi" veya
> "kim kaç talebi reddetti" raporu başka türlü yapılamaz.
>
> Bedeli: senkronizasyon garantisi yok. Workflow görevi kapandığında bu satırın güncellenmesi için
> bir mekanizma **yok** (G-03) — elle ya da dış entegrasyonla yapılır. Aynı desen
> `PurchaseOrderApproval` için de geçerlidir.

---

# M5 · Teklif Süreci

## 26. `Rfq`

| Alan | Tip | Z | Doğrulama | İlişki | Durum |
|---|---|---|---|---|---|
| `RfqNumber` | string | ✔ | `^RFQ-[0-9]{4}-[0-9]{4}$` | — | ❌ G-01 |
| `PurchaseRequestId` | lookup | ✔ | — | → `PurchaseRequest` | ✅ |
| `PurchaseRequestNumber` | string | ✔ | — | denormalize | ⚠️ G-07 |
| `Title` | string | ✔ | MinLength 5 | — | ✅ |
| `IssueDate` | dateonly | ✔ | — | — | ⚠️ G-01 |
| `DueDate` | dateonly | ✔ | — | — | ❌ süre dolumu otomatik işlenmez (G-04) |
| `Status` | enum | ✔ | `Draft\|Sent\|Collecting\|Evaluating\|Awarded\|Cancelled\|Expired` | — | ⚠️ G-03 |
| `BuyerEmployeeId` | lookup | ✔ | — | → `Employee` | ✅ |
| `BuyerName` | string | ✔ | — | denormalize | ⚠️ G-07 |
| `Currency` | enum | ✔ | `TRY\|USD\|EUR\|GBP` | — | ✅ |
| `DeliveryAddress` | string | | — | — | ✅ |
| `Terms` | string | | — | — | ⚠️ 250 karakter — sözleşme şartları için çok kısa |
| `Description` | string | | — | — | ⚠️ 250 karakter |

## 27. `RfqItem` — alt model (`Rfq`)

`LineNumber` (int ✔) · `ProductId` (lookup) + `ProductName`, `ProductSku` · `Description` (string ✔) ·
`Quantity` (decimal ✔, Min 0.001) · `UnitId` (lookup ✔) + `UnitCode` · `TargetUnitPrice` (decimal) ·
`Specification` (string) · `RequiredDate` (dateonly)

## 28. `RfqSupplier` — alt model (`Rfq`)

| Alan | Tip | Z | Doğrulama | İlişki | Durum |
|---|---|---|---|---|---|
| `SupplierId` | lookup | ✔ | — | → `Supplier` | ✅ |
| `SupplierName` | string | ✔ | — | denormalize | ⚠️ G-07 |
| `ContactEmail` | string | ✔ | e-posta regex | — | ✅ |
| `SentOn` | datetime | | — | — | ⚠️ elle |
| `RespondedOn` | datetime | | — | — | ⚠️ elle |
| `Status` | enum | ✔ | `Invited\|Sent\|Responded\|Declined\|NoResponse` | — | ⚠️ G-03 |
| `Note` | string | | — | — | ✅ |

> ❌ **"Tedarikçi aktif değilse RFQ gönderilemez" kuralı uygulanamaz** (BR-14). Lookup, hedef
> kaydın `Status` alanına bakmaz — yalnız FK bütünlüğünü sağlar. Blacklist'teki bir tedarikçi
> davet edilebilir ve sistem uyarmaz (G-02).

## 29. `SupplierQuotation`

| Alan | Tip | Z | Doğrulama | İlişki | Durum |
|---|---|---|---|---|---|
| `QuotationNumber` | string | ✔ | — | — | ❌ G-01 |
| `RfqId` | lookup | ✔ | — | → `Rfq` | ✅ |
| `RfqNumber` | string | ✔ | — | denormalize | ⚠️ G-07 |
| `SupplierId` | lookup | ✔ | — | → `Supplier` | ✅ |
| `SupplierName` | string | ✔ | — | denormalize | ⚠️ G-07 |
| `QuotationDate` | dateonly | ✔ | — | — | ✅ |
| `ValidUntil` | dateonly | ✔ | — | — | ❌ geçerlilik kontrolü yok (G-04) |
| `Currency` | enum | ✔ | `TRY\|USD\|EUR\|GBP` | — | ✅ |
| `Subtotal` | decimal | ✔ | Min 0 | — | ❌ rollup (G-05) |
| `DiscountAmount` | decimal | ✔ | Min 0 | — | ✅ |
| `VatAmount` | decimal | ✔ | Min 0 | — | ❌ (G-05) |
| `GrandTotal` | decimal | ✔ | Min 0 | — | ❌ (G-05) |
| `GrandTotalTry` | decimal | ✔ | Min 0 | — | ❌ kur çevrimi (G-05) |
| `DeliveryDays` | int | ✔ | Min 0, Max 365 | — | ✅ karşılaştırma kriteri |
| `PaymentTermDays` | int | ✔ | Min 0, Max 365 | — | ✅ karşılaştırma kriteri |
| `WarrantyMonths` | int | | Min 0, Max 120 | — | ✅ karşılaştırma kriteri |
| `Incoterm` | enum | | `EXW\|FCA\|FOB\|CIF\|DAP\|DDP` | — | ✅ |
| `Status` | enum | ✔ | `Draft\|Submitted\|UnderEvaluation\|Selected\|Rejected\|Expired` | — | ⚠️ G-03 |
| `QuotationFile` | file | | — | — | ⚠️ G-10 |
| `QuotationFileName` | string | | — | — | ⚠️ G-10 |
| `Notes` | string | | — | — | ✅ |

## 30. `SupplierQuotationItem` — alt model (`SupplierQuotation`)

`LineNumber` (int ✔) · `RfqItemLineNumber` (int ✔) · `ProductId` (lookup) + `ProductName` ·
`Quantity` (decimal ✔) · `UnitId` (lookup ✔) + `UnitCode` · `UnitPrice` (decimal ✔, Min 0) ·
`DiscountRate` (decimal, Min 0 Max 100) · `VatRate` (decimal ✔) · `LineTotal` (decimal ✔ — ❌ G-05) ·
`DeliveryDays` (int) · `Note` (string)

> ⚠️ `RfqItemLineNumber` bir **zayıf referanstır** — `RfqItem`'a lookup verilemiyor, çünkü `RfqItem`
> bir alt modeldir ve lookup hedefi olarak seçilse bile hangi RFQ'nun kalemi olduğu doğrulanmaz.
> Eşleştirme satır numarası üzerinden, uygulama katmanında yapılır.

## 31. `QuotationComparison`

| Alan | Tip | Z | Doğrulama | İlişki | Durum |
|---|---|---|---|---|---|
| `RfqId` | lookup | ✔ | — | → `Rfq` | ✅ |
| `RfqNumber` | string | ✔ | — | denormalize | ⚠️ G-07 |
| `ComparisonDate` | dateonly | ✔ | — | — | ✅ |
| `PreparedByEmployeeId` | lookup | ✔ | — | → `Employee` | ✅ |
| `PreparedByName` | string | ✔ | — | denormalize | ⚠️ G-07 |
| `Method` | enum | ✔ | `LowestPrice\|BestValue\|TechnicalScore\|SoleSource\|Other` | — | ✅ |
| `WeightPrice` | int | ✔ | Min 0, Max 100 | — | ✅ |
| `WeightDelivery` | int | ✔ | Min 0, Max 100 | — | ✅ |
| `WeightPayment` | int | ✔ | Min 0, Max 100 | — | ✅ |
| `WeightWarranty` | int | ✔ | Min 0, Max 100 | — | ✅ |
| `WeightRating` | int | ✔ | Min 0, Max 100 | — | ❌ toplam 100 kuralı yok (G-02) |
| `SelectedQuotationId` | lookup | | — | → `SupplierQuotation` | ✅ |
| `SelectedSupplierName` | string | | — | denormalize | ⚠️ G-07 |
| `SelectionReason` | string | ✔ | MinLength 10 | — | ✅ |
| `TotalSavings` | decimal | | — | — | ❌ (G-05) |
| `Status` | enum | ✔ | `Draft\|PendingApproval\|Approved\|Rejected` | — | ⚠️ G-03 |

## 32. `QuotationComparisonLine` — alt model (`QuotationComparison`)

`QuotationId` (lookup ✔) + `SupplierName` · `GrandTotalTry` (decimal ✔) · `DeliveryDays` (int ✔) ·
`PaymentTermDays` (int ✔) · `WarrantyMonths` (int) · `SupplierRating` (decimal) ·
`PreviousPurchasePrice` (decimal) · `PriceScore`, `DeliveryScore`, `PaymentScore`, `WarrantyScore`,
`RatingScore` (decimal, Min 0 Max 100) · `TotalScore` (decimal — ❌ G-05) · `Rank` (int — ❌ G-05) ·
`IsSelected` (boolean ✔)

> ❌ **Bu modelin tamamı hesaplanmış veridir.** Puanlar, toplam puan ve sıralama sistemin üretmesi
> gereken değerlerdir; bugün elle girilir veya özel bir ekran tarafından hesaplanıp yazılır (G-05).
> `PreviousPurchasePrice` ayrıca çapraz-model bir sorgudur (`ProductSupplier.LastPurchasePrice`) —
> platformda karşılığı yok (G-02).

---

# M6 · Satın Alma Siparişi

## 33. `PurchaseOrder`

| Alan | Tip | Z | Doğrulama | İlişki | Durum |
|---|---|---|---|---|---|
| `OrderNumber` | string | ✔ | `^PO-[0-9]{4}-[0-9]{4}$` | — | ❌ G-01 |
| `SupplierId` | lookup | ✔ | — | → `Supplier` | ✅ |
| `SupplierName` | string | ✔ | — | denormalize | ⚠️ G-07 |
| `QuotationId` | lookup | | — | → `SupplierQuotation` | ✅ |
| `QuotationNumber` | string | | — | denormalize | ⚠️ G-07 |
| `PurchaseRequestId` | lookup | | — | → `PurchaseRequest` | ✅ |
| `PurchaseRequestNumber` | string | | — | denormalize | ⚠️ G-07 |
| `OrderDate` | dateonly | ✔ | — | — | ⚠️ G-01 |
| `ExpectedDeliveryDate` | dateonly | ✔ | — | — | ❌ teslimat gecikme uyarısı yok (G-04) |
| `Currency` | enum | ✔ | `TRY\|USD\|EUR\|GBP` | — | ✅ |
| `ExchangeRateUsed` | decimal | ✔ | Min 0 | — | ⚠️ `decimal(18,2)` — kur için **yetersiz hassasiyet** |
| `PaymentTermDays` | int | ✔ | Min 0, Max 365 | — | ✅ |
| `ShippingAddress` | string | ✔ | — | — | ⚠️ 250 karakter |
| `BillingAddress` | string | ✔ | — | — | ⚠️ 250 karakter |
| `Subtotal` | decimal | ✔ | Min 0 | — | ❌ rollup (G-05) |
| `DiscountAmount` | decimal | ✔ | Min 0 | — | ✅ |
| `VatAmount` | decimal | ✔ | Min 0 | — | ❌ (G-05) |
| `GrandTotal` | decimal | ✔ | Min 0 | — | ❌ (G-05) |
| `GrandTotalTry` | decimal | ✔ | Min 0 | — | ❌ (G-05) |
| `Status` | enum | ✔ | `Draft\|PendingApproval\|Approved\|SentToSupplier\|PartiallyDelivered\|Delivered\|Cancelled\|Closed` | — | ⚠️ G-03 |
| `BuyerEmployeeId` | lookup | ✔ | — | → `Employee` | ✅ |
| `BuyerName` | string | ✔ | — | denormalize | ⚠️ G-07 |
| `DepartmentId` | lookup | ✔ | — | → `Department` | ✅ |
| `DepartmentName` | string | ✔ | — | denormalize | ⚠️ G-07 · departman harcama raporu için |
| `CostCenterId` | lookup | ✔ | — | → `CostCenter` | ✅ |
| `CostCenterCode` | string | ✔ | — | denormalize | ⚠️ G-07 |
| `SentToSupplierOn` | datetime | | — | — | ⚠️ elle |
| `Notes` | string | | — | — | ✅ |

> ⚠️ **`ExchangeRateUsed` platform sınırına takılıyor.** `decimal` daima `decimal(18,2)`
> (`CoreLogicTypeMap.cs:40`). USD/TRY kuru `34.27` yazılabilir ama `34.2715` yazılamaz — yuvarlanır.
> 1 milyon dolarlık bir siparişte bu **1.500 TL'lik** bir sapmadır. Precision seçilebilirliği
> G-01'in parçası olarak raporlandı.

## 34. `PurchaseOrderItem` — alt model (`PurchaseOrder`)

| Alan | Tip | Z | Doğrulama | Durum |
|---|---|---|---|---|
| `LineNumber` | int | ✔ | Min 1 | ⚠️ G-01 |
| `ProductId` | lookup | | → `Product` | ✅ |
| `ProductName`, `ProductSku` | string | | denormalize | ⚠️ G-07 |
| `Description` | string | ✔ | MinLength 3 | ✅ |
| `OrderedQuantity` | decimal | ✔ | Min 0.001 | ✅ |
| `UnitId` | lookup | ✔ | → `Unit` | ✅ |
| `UnitCode` | string | ✔ | denormalize | ⚠️ G-07 |
| `UnitPrice` | decimal | ✔ | Min 0 | ✅ |
| `DiscountRate` | decimal | | Min 0, Max 100 | ✅ |
| `VatRate` | decimal | ✔ | Min 0, Max 100 | ✅ |
| `LineTotal` | decimal | ✔ | Min 0 | ❌ (G-05) |
| `ReceivedQuantity` | decimal | ✔ | Min 0 | ❌ **rollup** — `GoodsReceiptItem` toplamı (G-05) |
| `RemainingQuantity` | decimal | ✔ | Min 0 | ❌ `Ordered − Received` (G-05) |
| `InvoicedQuantity` | decimal | ✔ | Min 0 | ❌ rollup — 3-way matching girdisi (G-05) |
| `ExpectedDeliveryDate` | dateonly | | — | ✅ |

> ❌ Üç rollup alanı (`ReceivedQuantity`, `RemainingQuantity`, `InvoicedQuantity`) bu tasarımın
> **en kritik G-05 örneğidir**. Kısmi teslimat takibi ve 3-way matching'in tamamı bu üç sayıya
> dayanır ve üçü de platformda otomatik güncellenemez.

## 35. `PurchaseOrderApproval` — alt model (`PurchaseOrder`)

`PurchaseRequestApproval` (#25) ile aynı şema ve aynı ⚠️ notu.

## 36. `PurchaseOrderAttachment` — alt model (`PurchaseOrder`)

`FileName` (string ✔) · `AttachmentFile` (file ✔) · `DocumentType` (enum ✔:
`SignedOrder|Contract|Specification|Correspondence|Other`) · `Description` (string) — ⚠️ G-10

---

# M7 · Teslimat

## 37. `GoodsReceipt`

| Alan | Tip | Z | Doğrulama | İlişki | Durum |
|---|---|---|---|---|---|
| `ReceiptNumber` | string | ✔ | `^GR-[0-9]{4}-[0-9]{4}$` | — | ❌ G-01 |
| `PurchaseOrderId` | lookup | ✔ | — | → `PurchaseOrder` | ✅ |
| `OrderNumber` | string | ✔ | — | denormalize | ⚠️ G-07 |
| `SupplierId` | lookup | ✔ | — | → `Supplier` | ✅ |
| `SupplierName` | string | ✔ | — | denormalize | ⚠️ G-07 |
| `ReceiptDate` | dateonly | ✔ | — | — | ⚠️ G-01 |
| `DeliveryNoteNumber` | string | ✔ | — | — | ⚠️ unique değil (G-01) |
| `ReceivedByEmployeeId` | lookup | ✔ | — | → `Employee` | ✅ |
| `ReceivedByName` | string | ✔ | — | denormalize | ⚠️ G-07 |
| `Status` | enum | ✔ | `Draft\|Confirmed\|PartiallyAccepted\|Rejected\|Cancelled` | — | ⚠️ G-03 |
| `InspectionResult` | enum | ✔ | `NotInspected\|Passed\|Failed\|Conditional` | — | ✅ |
| `IsPartial` | boolean | ✔ | — | — | ❌ hesaplanmalı (G-05) |
| `DeliveryNoteFile` | file | | — | — | ⚠️ G-10 |
| `DeliveryNoteFileName` | string | | — | — | ⚠️ G-10 |
| `Notes` | string | | — | — | ✅ |

## 38. `GoodsReceiptItem` — alt model (`GoodsReceipt`)

| Alan | Tip | Z | Doğrulama | Durum |
|---|---|---|---|---|
| `LineNumber` | int | ✔ | Min 1 | ⚠️ G-01 |
| `PurchaseOrderItemLineNumber` | int | ✔ | Min 1 | ⚠️ zayıf referans |
| `ProductId` | lookup | | → `Product` | ✅ |
| `ProductName`, `ProductSku` | string | | denormalize | ⚠️ G-07 |
| `OrderedQuantity` | decimal | ✔ | Min 0 | ⚠️ kopya (G-05) |
| `ReceivedQuantity` | decimal | ✔ | Min 0 | ✅ |
| `AcceptedQuantity` | decimal | ✔ | Min 0 | ❌ `<= Received` kuralı yok (G-02) |
| `RejectedQuantity` | decimal | ✔ | Min 0 | ❌ `Received − Accepted` (G-05) |
| `UnitId` | lookup | ✔ | → `Unit` | ✅ |
| `UnitCode` | string | ✔ | denormalize | ⚠️ G-07 |
| `RejectionReason` | string | | — | ✅ |
| `BatchNumber` | string | | — | ✅ |
| `ExpiryDate` | dateonly | | — | ✅ |

---

# M8 · Fatura

## 39. `SupplierInvoice`

| Alan | Tip | Z | Doğrulama | İlişki | Durum |
|---|---|---|---|---|---|
| `InvoiceNumber` | string | ✔ | — | — | ❌ **tedarikçi bazında unique olmalı** (G-01) |
| `InternalNumber` | string | ✔ | `^INV-[0-9]{4}-[0-9]{4}$` | — | ❌ G-01 |
| `SupplierId` | lookup | ✔ | — | → `Supplier` | ✅ |
| `SupplierName` | string | ✔ | — | denormalize | ⚠️ G-07 |
| `PurchaseOrderId` | lookup | ✔ | — | → `PurchaseOrder` | ✅ |
| `OrderNumber` | string | ✔ | — | denormalize | ⚠️ G-07 |
| `InvoiceDate` | dateonly | ✔ | — | — | ✅ |
| `DueDate` | dateonly | ✔ | — | — | ❌ **vade hatırlatması yok** (G-04) |
| `Currency` | enum | ✔ | `TRY\|USD\|EUR\|GBP` | — | ✅ |
| `Subtotal` | decimal | ✔ | Min 0 | — | ❌ rollup (G-05) |
| `DiscountAmount` | decimal | ✔ | Min 0 | — | ✅ |
| `VatAmount` | decimal | ✔ | Min 0 | — | ❌ (G-05) |
| `GrandTotal` | decimal | ✔ | Min 0 | — | ❌ (G-05) |
| `GrandTotalTry` | decimal | ✔ | Min 0 | — | ❌ (G-05) |
| `Status` | enum | ✔ | `Draft\|PendingMatch\|Matched\|Exception\|Approved\|PartiallyPaid\|Paid\|Cancelled` | — | ⚠️ G-03 |
| `MatchStatus` | enum | ✔ | `NotMatched\|ThreeWayOk\|QuantityMismatch\|PriceMismatch\|MissingReceipt\|DuplicateInvoice\|Exception` | — | ❌ **otomatik hesaplanmalı** (G-02) |
| `MatchNote` | string | | — | — | ✅ |
| `PaidAmount` | decimal | ✔ | Min 0 | — | ❌ rollup — `PaymentAllocation` toplamı (G-05) |
| `RemainingAmount` | decimal | ✔ | Min 0 | — | ❌ (G-05) |
| `InvoiceFile` | file | | — | — | ⚠️ G-10 |
| `InvoiceFileName` | string | | — | — | ⚠️ G-10 |

## 40. `SupplierInvoiceItem` — alt model (`SupplierInvoice`)

`LineNumber` (int ✔) · `PurchaseOrderItemLineNumber` (int ✔ — ⚠️ zayıf referans) · `ProductId`
(lookup) + `ProductName` · `InvoicedQuantity` (decimal ✔) · `UnitId` (lookup ✔) + `UnitCode` ·
`UnitPrice` (decimal ✔) · `VatRate` (decimal ✔) · `LineTotal` (decimal ✔ — ❌ G-05) ·
`MatchStatus` (enum ✔: `NotMatched|Ok|QuantityMismatch|PriceMismatch` — ❌ G-02)

## 41. `InvoiceException` — alt model (`SupplierInvoice`)

3-way matching'in çıktısı. **Bugün elle açılır.**

| Alan | Tip | Z | Doğrulama | Durum |
|---|---|---|---|---|
| `ExceptionType` | enum | ✔ | `QuantityOver\|QuantityUnder\|PriceOver\|NoReceipt\|DuplicateInvoice\|VatMismatch\|CurrencyMismatch\|DateMismatch` | ❌ G-02 |
| `Severity` | enum | ✔ | `Info\|Warning\|Blocking` | ✅ |
| `Description` | string | ✔ | MinLength 5 | ✅ |
| `OrderedQuantity` | decimal | | Min 0 | ❌ G-02 |
| `ReceivedQuantity` | decimal | | Min 0 | ❌ G-02 |
| `InvoicedQuantity` | decimal | | Min 0 | ❌ G-02 |
| `DifferenceAmount` | decimal | | — | ❌ G-05 |
| `Resolution` | enum | ✔ | `Open\|Accepted\|Rejected\|Corrected\|CreditNoteRequested` | ✅ |
| `ResolvedByEmployeeId` | lookup | | → `Employee` | ✅ |
| `ResolvedOn` | datetime | | — | ⚠️ elle |
| `ResolutionNote` | string | | — | ✅ |

## 42. `InvoiceAttachment` — alt model (`SupplierInvoice`)

`FileName` (string ✔) · `AttachmentFile` (file ✔) · `DocumentType` (enum ✔:
`Invoice|CreditNote|DeliveryNote|Correspondence|Other`) · `Description` (string) — ⚠️ G-10

---

# M9 · Ödeme

## 43. `Payment`

| Alan | Tip | Z | Doğrulama | İlişki | Durum |
|---|---|---|---|---|---|
| `PaymentNumber` | string | ✔ | `^PAY-[0-9]{4}-[0-9]{4}$` | — | ❌ G-01 |
| `SupplierId` | lookup | ✔ | — | → `Supplier` | ✅ |
| `SupplierName` | string | ✔ | — | denormalize | ⚠️ G-07 |
| `BankAccountId` | lookup | | — | → `SupplierBankAccount` | ✅ |
| `PlannedDate` | dateonly | ✔ | — | — | ❌ hatırlatma yok (G-04) |
| `PaymentDate` | dateonly | | — | — | ✅ |
| `Amount` | decimal | ✔ | Min 0.01 | — | ❌ dağıtım toplamına eşit olmalı (G-02) |
| `Currency` | enum | ✔ | `TRY\|USD\|EUR\|GBP` | — | ✅ |
| `ExchangeRateUsed` | decimal | | Min 0 | — | ⚠️ precision (G-01) |
| `PaymentMethod` | enum | ✔ | `BankTransfer\|Check\|Cash\|CreditCard\|LetterOfCredit\|Offset` | — | ✅ |
| `ReferenceNumber` | string | | — | — | ✅ |
| `Status` | enum | ✔ | `Planned\|PendingApproval\|Approved\|Executed\|Failed\|Cancelled` | — | ⚠️ G-03 |
| `ApprovedByEmployeeId` | lookup | | — | → `Employee` | ⚠️ elle (G-03) |
| `Notes` | string | | — | — | ✅ |

## 44. `PaymentAllocation` — alt model (`Payment`)

Bir ödemenin birden çok faturaya dağıtılması (toplu havale).

`SupplierInvoiceId` (lookup ✔) + `InvoiceNumber` (string ✔) · `AllocatedAmount` (decimal ✔, Min 0.01)
· `AllocatedAmountTry` (decimal ✔ — ❌ G-05) · `Note` (string)

> ❌ `SUM(AllocatedAmount) == Payment.Amount` ve `AllocatedAmount <= Invoice.RemainingAmount`
> kurallarının ikisi de uygulanamaz (G-02). Bir faturaya borcundan fazla ödeme dağıtılabilir.

---

# M10 · Bütçe

## 45. `BudgetPeriod`

`Code` (string ✔, `^[0-9]{4}-(Q[1-4]|H[12]|FY)$`) · `Name` (string ✔) · `StartDate` (dateonly ✔) ·
`EndDate` (dateonly ✔) · `Status` (enum ✔: `Open|Locked|Closed`) — ❌ `EndDate > StartDate` kuralı yok
(G-02), ❌ dönem otomatik kapanmaz (G-04)

## 46. `Budget`

| Alan | Tip | Z | Doğrulama | İlişki | Durum |
|---|---|---|---|---|---|
| `Code` | string | ✔ | — | — | ⚠️ G-01 |
| `Name` | string | ✔ | — | — | ✅ |
| `BudgetPeriodId` | lookup | ✔ | — | → `BudgetPeriod` | ✅ |
| `PeriodCode` | string | ✔ | — | denormalize | ⚠️ G-07 |
| `DepartmentId` | lookup | ✔ | — | → `Department` | ✅ |
| `DepartmentName` | string | ✔ | — | denormalize | ⚠️ G-07 |
| `CostCenterId` | lookup | | — | → `CostCenter` | ✅ |
| `CostCenterCode` | string | | — | denormalize | ⚠️ G-07 |
| `Currency` | enum | ✔ | `TRY\|USD\|EUR\|GBP` | — | ✅ |
| `PlannedAmount` | decimal | ✔ | Min 0 | — | ✅ |
| `CommittedAmount` | decimal | ✔ | Min 0 | — | ❌ **rollup** (G-02, G-05) |
| `ActualAmount` | decimal | ✔ | Min 0 | — | ❌ **rollup** (G-02, G-05) |
| `AvailableAmount` | decimal | ✔ | — | — | ❌ `Planned − Committed − Actual` (G-05) |
| `Status` | enum | ✔ | `Draft\|Approved\|Active\|Closed` | — | ⚠️ G-03 |
| `OwnerEmployeeId` | lookup | ✔ | — | → `Employee` | ✅ |
| `AlertThresholdPercent` | int | | Min 0, Max 100 | — | ❌ uyarı tetiklenemez (G-04) |

## 47. `BudgetItem` — alt model (`Budget`)

`ProductCategoryId` (lookup ✔) + `CategoryName` · `PlannedAmount` (decimal ✔) · `CommittedAmount`
(decimal ✔ — ❌ G-05) · `ActualAmount` (decimal ✔ — ❌ G-05) · `Note` (string)

## 48. `BudgetTransaction`

Bütçe hareket defteri. Her taahhüt ve gerçekleşme burada iz bırakmalı.

| Alan | Tip | Z | Doğrulama | İlişki | Durum |
|---|---|---|---|---|---|
| `BudgetId` | lookup | ✔ | — | → `Budget` | ✅ |
| `BudgetCode` | string | ✔ | — | denormalize | ⚠️ G-07 |
| `TransactionDate` | datetime | ✔ | — | — | ⚠️ G-01 |
| `TransactionType` | enum | ✔ | `Commitment\|Release\|Actual\|Adjustment\|Reversal` | — | ✅ |
| `SourceDocumentType` | enum | ✔ | `PurchaseRequest\|PurchaseOrder\|SupplierInvoice\|Manual` | — | ✅ |
| `SourceDocumentNumber` | string | ✔ | — | — | ⚠️ zayıf referans |
| `Amount` | decimal | ✔ | — | — | ✅ |
| `Currency` | enum | ✔ | `TRY\|USD\|EUR\|GBP` | — | ✅ |
| `AmountTry` | decimal | ✔ | — | — | ❌ (G-05) |
| `Description` | string | ✔ | — | — | ✅ |

> ❌ **Bu modelin tamamı otomatik üretilmeliydi.** Sipariş onaylanınca `Commitment`, fatura
> onaylanınca `Actual`, sipariş iptal olunca `Reversal`. Hiçbiri platformda tetiklenemez (G-02).
> Bugün her satır elle açılır — yani bütçe takibi **disipline bağlıdır, sisteme değil**.

---

# Yatay / Referans

## 49. `ExchangeRate`

`CurrencyCode` (enum ✔: `USD|EUR|GBP`) · `RateDate` (dateonly ✔) · `BuyRate` (decimal ✔) ·
`SellRate` (decimal ✔) · `Source` (enum ✔: `TCMB|Manual|Api`)

> ⚠️ **`decimal(18,2)` kur için yetersizdir** (G-01). `34.27` saklanabilir, `34.2715` saklanamaz.
> ❌ `(CurrencyCode, RateDate)` unique olmalı (G-01). ❌ Günlük kur otomatik çekilemez (G-04).
>
> **Ara çözüm (⚠️):** Kuru 10.000 ile çarpıp `int` olarak saklamak (`342715`). Çirkin ama
> hassasiyeti korur. Tüm hesaplar bu ölçeği bilmek zorunda kalır.

## 50. `CompanyVehicle` — runtime'da oluşturulan demo entity

Bu model, [17-dinamik-model-mimarisi.md](17-dinamik-model-mimarisi.md) ve test senaryosu T-01…T-11
için **sistem kurulduktan sonra** şirket yöneticisi tarafından açılır. Amaç, 11 adımlı runtime
entity yaratma zincirini uçtan uca göstermek.

| Alan | Tip | Z | Doğrulama | İlişki | Durum |
|---|---|---|---|---|---|
| `PlateNumber` | string | ✔ | `^[0-9]{2}[A-Z]{1,3}[0-9]{2,4}$` | — | ⚠️ unique olmalı (G-01) |
| `Brand` | string | ✔ | — | — | ✅ |
| `Model` | string | ✔ | — | — | ✅ |
| `Year` | int | ✔ | Min 1990, Max 2100 | — | ✅ |
| `DepartmentId` | lookup | ✔ | — | → `Department` | ✅ |
| `DepartmentName` | string | ✔ | — | denormalize | ⚠️ G-07 |
| `DriverEmployeeId` | lookup | | — | → `Employee` | ✅ |
| `DriverName` | string | | — | denormalize | ⚠️ G-07 |
| `InsuranceExpiration` | dateonly | ✔ | — | — | ❌ **hatırlatma yok** (G-04) |
| `InspectionExpiration` | dateonly | | — | — | ❌ (G-04) |
| `PurchaseOrderId` | lookup | | — | → `PurchaseOrder` | ✅ mevcut modele bağlanabilmesi kritik test |
| `IsActive` | boolean | ✔ | — | — | ⚠️ G-01 |

> Bu entity'nin **var olan bir modele lookup verebilmesi** (`PurchaseOrderId`) testin en önemli
> kısmıdır: runtime'da eklenen bir model, önceden yayınlanmış bir modele bağlanabiliyor mu?
> `MergePublishBatch` karşı tarafı yeniden derlediği için bu bir regresyon riski taşır. Test T-09.

---

## Özet sayım

| Modül | Entity | ✅ tam | ⚠️ bedelli | ❌ engelli |
|---|---|---|---|---|
| M1 Organizasyon | 6 | 4 | 2 | 0 |
| M2 Tedarikçi | 7 | 2 | 4 | 1 |
| M3 Katalog | 8 | 4 | 3 | 1 |
| M4 Talep | 4 | 1 | 2 | 1 |
| M5 Teklif | 7 | 2 | 3 | 2 |
| M6 Sipariş | 4 | 1 | 2 | 1 |
| M7 Teslimat | 2 | 0 | 2 | 0 |
| M8 Fatura | 4 | 1 | 1 | 2 |
| M9 Ödeme | 2 | 0 | 1 | 1 |
| M10 Bütçe | 4 | 1 | 1 | 2 |
| Yatay | 2 | 0 | 1 | 1 |
| **Toplam** | **50** | **16** | **22** | **12** |

**Kolon sayısı: 520** (`seed/models.json` ile doğrulandı). Bunun **~40'ı denormalize ad kolonu**
(G-07 vergisi) ve **~35'i hesaplanması gerekirken saklanan** kolon (G-05 vergisi). Yani toplam
kolonun **%14'ü** platform eksiklerini telafi etmek için var.
