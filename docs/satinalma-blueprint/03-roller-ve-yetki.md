# 03 · Roller ve Yetkilendirme

Bu bölüm istenen çıktının **(3) User Roles** ve **(11) Authorization** başlıklarını birlikte
karşılar — ikisi CoreLogic'te aynı mekanizmaya oturduğu için ayrılmaları yapay olurdu.

---

## Platformun yetki modeli

Tasarıma geçmeden önce, üzerine inşa edilen mekanizma.

### İzin birimi: `PermissionAction` bit maskesi

`Core/Entities/Concrete/PermissionAction.cs:9-33` — tam liste:

| Bit | Değer | Anlam |
|---|---|---|
| `Read` | 1 | Kayıtları okuma |
| `Create` | 2 | Yeni kayıt |
| `Update` | 4 | Güncelleme |
| `Delete` | 8 | Silme (soft-delete) |
| `All` | 15 | Yukarıdaki dördü |
| `Navigation` | 16 | Sol menüde görünürlük — `Read`'den **bağımsız** |
| `OwnRecordsOnly` | 32 | Satır seviyesi sahiplik; `All`'a **dahil değil** |

> ❌ **`Approve` izni yoktur.** Onay yetkisi ayrı bir kavramdır ve yalnızca workflow modülünde,
> **görev ataması** üzerinden yaşar. Bu, tasarımın en çok etkilenen noktasıdır — aşağıda.

### Birleşim kuralı

```
EtkinBitler = kişisel Permission.Permissions  OR  (üyesi olunan TÜM rollerin RolePermission.Permissions)
```

`PermissionManager.cs:128-149`. **Bitwise OR, deny/override yok.** Yani bir rol bir izni veremiyorsa
başka bir rol verebilir; hiçbir rol bir izni **geri alamaz**.

Admin bypass: `AmbientTenantScope.Current.IsAdmin` ise `HasPermission` koşulsuz `true` döner ve izin
tablosu hiç okunmaz (`PermissionManager.cs:116`).

### Granülerlik

**Model (entity) bazlı.** `Permission` kaydının anahtarı `(UserId, ModelName)`; `RolePermission`'ınki
`(OperationClaimId, ModelName)`.

❌ **Alan (field) seviyesi yetki yoktur** (G-09). `ModelColumnSetting` bir alternatif değildir:
tenant genelinde globaldir (rol boyutu yok), yalnızca `list` ve `detail` bağlamları vardır ve
**backend'de hiç uygulanmaz** — gizlenen kolon `/PublishedModel/getall` yanıtında gelmeye devam eder
(`PublishedModelManager.cs:440-506`, projeksiyon yok). Görsel sadeleştirmedir, veri gizleme değil.

---

## Roller

10 rol tanımlandı. Her biri bir `OperationClaim` (RBAC rolü) olarak kurulur.

### R1 · System Admin

| | |
|---|---|
| **Kim** | Platform yöneticisi, genellikle BT |
| **Yapar** | Model tanımlar ve yayınlar, workflow tasarlar, rol/izin yönetir, kullanıcı açar, parametreleri ayarlar |
| **Platform karşılığı** | Tenant `admin` rolü — `Roles.Admin = "admin"` |
| **Durum** | ✅ Doğrudan karşılanıyor |

Admin, izin kontrolünü tamamen bypass eder. Bu, "admin her şeyi görür" demektir — **maliyet
bilgisini gizleme gibi senaryolar admin için hiçbir zaman çalışmaz.**

### R2 · Purchasing Manager (Satın Alma Müdürü)

| | |
|---|---|
| **Yapar** | 10.000 TL üstü talepleri onaylar, siparişleri onaylar, tedarikçi onay zincirinde ilk halka, teklif seçimini nihai onaylar |
| **Okur** | Tüm satın alma verisi, tüm tedarikçiler, tüm bütçeler (salt okunur) |
| **Yazmaz** | Fatura, ödeme, organizasyon |

| Model | İzin |
|---|---|
| `PurchaseRequest`, `Rfq`, `SupplierQuotation`, `QuotationComparison` | `Read + Update + Navigation` |
| `PurchaseOrder` | `All + Navigation` |
| `Supplier`, `Product`, `PriceList` | `Read + Update + Navigation` |
| `Budget`, `BudgetTransaction` | `Read` |
| `SupplierInvoice`, `Payment` | `Read` |

⚠️ Onay yetkisi bu tabloda **yok** — çünkü `Approve` biti yok. Onay, workflow adımının
`assignment: {mode:"role", roleId: <PurchasingManager>}` ile bu role atanmasıyla doğar.

### R3 · Purchasing Specialist (Satın Alma Uzmanı)

| | |
|---|---|
| **Yapar** | RFQ açar, tedarikçi davet eder, gelen teklifleri sisteme girer, karşılaştırma hazırlar, sipariş taslağı oluşturur, tedarikçi ve ürün kataloğunu yönetir |
| **Onaylamaz** | Hiçbir şeyi |

| Model | İzin |
|---|---|
| `Rfq`, `RfqItem`, `RfqSupplier`, `SupplierQuotation`, `SupplierQuotationItem`, `QuotationComparison` | `All + Navigation` |
| `Supplier` + 6 alt model | `All + Navigation` |
| `Product`, `ProductSupplier`, `PriceList`, `PriceListItem` + katalog | `All + Navigation` |
| `PurchaseOrder`, `PurchaseOrderItem` | `Create + Read + Update + Navigation` (Delete yok) |
| `PurchaseRequest` | `Read` |

### R4 · Finance Manager (Finans Müdürü)

| | |
|---|---|
| **Yapar** | 50.000 TL üstü talepleri onaylar, tedarikçi onay zincirinde finans halkası, ödemeleri onaylar, bütçe tanımlar |

| Model | İzin |
|---|---|
| `Budget`, `BudgetPeriod`, `BudgetItem`, `BudgetTransaction` | `All + Navigation` |
| `SupplierInvoice`, `InvoiceException` | `Read + Update + Navigation` |
| `Payment`, `PaymentAllocation` | `All + Navigation` |
| `PurchaseRequest`, `PurchaseOrder` | `Read` |
| `Supplier` | `Read + Update` |

### R5 · Finance Specialist (Finans Uzmanı)

| | |
|---|---|
| **Yapar** | Fatura girer, 3-way matching sonucunu inceler, uyuşmazlık kaydı açar, ödeme planlar |
| **Onaylamaz** | Ödemeyi |

| Model | İzin |
|---|---|
| `SupplierInvoice`, `SupplierInvoiceItem`, `InvoiceException`, `InvoiceAttachment` | `All + Navigation` |
| `Payment`, `PaymentAllocation` | `Create + Read + Update + Navigation` |
| `PurchaseOrder`, `GoodsReceipt` | `Read` |
| `Budget` | `Read` |

### R6 · Department Manager (Departman Müdürü)

| | |
|---|---|
| **Yapar** | Kendi departmanından gelen talepleri onaylar (ilk halka, her tutarda), departman bütçesini izler |

| Model | İzin |
|---|---|
| `PurchaseRequest`, `PurchaseRequestItem` | `Read + Update + Navigation` |
| `Budget`, `BudgetTransaction` | `Read` |
| `PurchaseOrder` | `Read` |
| `Product` | `Read` |

> ❌ **"Kendi departmanı" kısıtı uygulanamaz.** Platformda satır seviyesi filtre olarak yalnız
> `OwnRecordsOnly` var (`CreatedBy == @userId`, `OwnerScopeFilter.cs:29-40`) — "kaydın
> `DepartmentId`'si benim departmanıma eşit" gibi bir kural yok. Departman müdürü **tüm** talepleri
> görür. Bu, G-09'un ikinci yüzüdür ve gerçek bir gizlilik sorunudur.

### R7 · Employee (Çalışan)

| | |
|---|---|
| **Yapar** | Satın alma talebi oluşturur, kendi taleplerini izler |

| Model | İzin |
|---|---|
| `PurchaseRequest`, `PurchaseRequestItem`, `PurchaseRequestAttachment` | `Create + Read + Update + OwnRecordsOnly + Navigation` |
| `Product`, `ProductCategory`, `Unit` | `Read` |
| `Department`, `CostCenter` | `Read` |

`OwnRecordsOnly` burada doğru çalışır: çalışan yalnızca `CreatedBy == kendisi` olan talepleri görür.
Platformun **tek işleyen satır seviyesi kısıtı** budur.

⚠️ Ancak `Update` izni `OwnRecordsOnly` ile birlikte verildiğinde, çalışan **onaylanmış** talebini de
düzenleyebilir — çünkü "onaylanmış kayıt kilitlenir" kuralı platformda yok (BR-01, G-02/G-03).

### R8 · Warehouse Manager (Depo Sorumlusu)

| Model | İzin |
|---|---|
| `GoodsReceipt`, `GoodsReceiptItem` | `All + Navigation` |
| `PurchaseOrder`, `PurchaseOrderItem` | `Read` |
| `Product`, `Unit` | `Read` |
| `Supplier` | `Read` |

### R9 · Management (Üst Yönetim)

| | |
|---|---|
| **Yapar** | 250.000 TL üstü talepleri onaylar, tedarikçi onay zincirinin son halkası, dashboard izler |

| Model | İzin |
|---|---|
| Tüm iş modelleri | `Read + Navigation` |
| `PurchaseRequest`, `Supplier` | `Read + Update` (onay adımı için) |

Üst yönetim **hiçbir şey oluşturmaz veya silmez**; yalnızca okur ve onaylar.

### R10 · Supplier User (Tedarikçi Kullanıcısı)

| | |
|---|---|
| **Olmalıydı** | Tedarikçi kendi teklifini sisteme girer, sipariş durumunu görür, fatura yükler |
| **Durum** | ❌ **Bugün uygulanamaz** |

Gerekçe — platformun kullanıcı modeli buna kapalı:

1. **Dışarıdan katılım yok.** Bir şirkete kullanıcı yalnızca o şirketin admin'i tarafından
   `/users` ekranından eklenir; "mevcut şirkete kaydol" akışı ne backend'de ne UI'da var.
2. Eklenen her kullanıcı **çağıran admin'in ambient tenant'ına** girer; tenant/şirket seçilemez.
3. Tedarikçiye kullanıcı açılsa bile, izinler **model bazlı**dır — "yalnızca kendi tedarikçi
   kaydına bağlı teklifleri görsün" ifade edilemez (`OwnRecordsOnly` yalnız `CreatedBy`'a bakar).

**Bu tasarımdaki karşılığı:** Tedarikçi teklifi **Purchasing Specialist tarafından girilir**
(R3). Teklif belgesi `SupplierQuotation.QuotationFile` alanına PDF olarak eklenir. Tedarikçi
portalı, platforma **çok kiracılı dış kullanıcı** kavramı eklenmeden yapılamaz — bu, G-09'dan da
büyük, ayrı bir mimari iştir ve bu blueprint'in kapsamı dışında bırakıldı.

---

## İzin matrisi (özet)

`C` Create · `R` Read · `U` Update · `D` Delete · `N` Navigation · `O` OwnRecordsOnly · `—` yetki yok

| Model | Admin | Pur.Mgr | Pur.Spec | Fin.Mgr | Fin.Spec | Dept.Mgr | Employee | Warehouse | Mgmt |
|---|---|---|---|---|---|---|---|---|---|
| `Company`/`Branch`/`Department` | tümü | R | R | R | R | R | R | R | RN |
| `Employee`/`Position` | tümü | R | R | R | R | R | R | R | RN |
| `CostCenter` | tümü | R | R | RU | R | R | R | — | RN |
| `Supplier` + alt | tümü | RUN | CRUDN | RU | R | — | — | R | RN |
| `SupplierRating` | tümü | CRUDN | CRUN | R | — | — | — | R | RN |
| `Product` + katalog | tümü | RUN | CRUDN | R | R | R | R | R | RN |
| `PriceList`/`PriceListItem` | tümü | RUN | CRUDN | R | R | — | — | — | RN |
| `PurchaseRequest` + alt | tümü | RUN | R | R | R | RUN | CRU**O**N | — | RUN |
| `Rfq` + alt | tümü | RUN | CRUDN | R | — | — | — | — | RN |
| `SupplierQuotation` + alt | tümü | RUN | CRUDN | R | R | — | — | — | RN |
| `QuotationComparison` + alt | tümü | RUN | CRUDN | R | — | — | — | — | RN |
| `PurchaseOrder` + alt | tümü | CRUDN | CRUN | R | R | R | — | R | RN |
| `GoodsReceipt` + alt | tümü | RN | R | R | R | — | — | CRUDN | RN |
| `SupplierInvoice` + alt | tümü | R | — | RUN | CRUDN | — | — | — | RN |
| `InvoiceException` | tümü | R | — | RUN | CRUDN | — | — | — | RN |
| `Payment`/`PaymentAllocation` | tümü | R | — | CRUDN | CRUN | — | — | — | RN |
| `Budget` + alt | tümü | R | — | CRUDN | R | R | — | — | RN |
| `ExchangeRate` | tümü | R | R | CRUDN | R | R | R | R | R |
| `CompanyVehicle` | tümü | R | R | R | R | RN | R | — | RN |

---

## Onay yetkisi: platformun kör noktası

Tabloda 10 rol var ama **onay** hiçbirinde yok. Çünkü platformda onay bir izin değil, bir
**görev ataması**dır.

| Soru | Cevap | Kanıt |
|---|---|---|
| Onay yetkisi nasıl verilir? | Workflow adımının `assignment`'ına rol/kullanıcı yazılarak | `WorkflowCommandExecutor.cs:201-223` |
| Atama modları | `user` · `role` · `creator` — **üçü bu kadar** | `WorkflowDefinitionModel.cs:51-64` |
| "Talebin departman müdürü" atanabilir mi? | ❌ Hayır. Organizasyonel/dinamik atama yok | aynı |
| Görevi kim kapatabilir? | Atanan kullanıcı, veya atanan rolün herhangi bir üyesi | `WorkflowTaskManager.cs:377-391` |
| Admin kapatabilir mi? | ❌ Hayır — bilinçli olarak dışarıda. Admin'in yaptığı "atlama"dır ve ayrı uçtur | `WorkflowTaskManager.cs:370-376` |
| Vekalet / delegasyon var mı? | ❌ Yok. Tek yol admin'in tek tek `reassign` etmesi | — |

### Sonuçları

1. **"Departman müdürü kendi departmanının talebini onaylar" kurulamaz.** Atama `role` moduyla
   yapılırsa **tüm** departman müdürleri aynı havuzu görür; ilk karar veren kapatır. IT talebini
   Pazarlama müdürü onaylayabilir.

   **Workaround (⚠️):** Her departman için ayrı bir rol (`DeptMgr_IT`, `DeptMgr_Finance`, …) ve her
   departman için ayrı bir workflow tanımı — tetikleyici koşulunda `DepartmentName eq IT`. 15
   departman × 4 tutar kademesi = **60 workflow tanımı**. Teknik olarak mümkün, operasyonel olarak
   sürdürülemez. Eşik değişirse 60 tanım yeniden yayınlanır.

2. **Yetki kaldırıldığında açık görev sahipsiz kalır.** Kullanıcı rolden çıkarılırsa `AssignedRoleId`
   üzerinden görev hâlâ o role bağlıdır; kullanıcı artık üye olmadığı için kapatamaz, rolde başka
   üye yoksa görev **kalıcı olarak takılır**. Edge case EC-11.

3. **İzinsiz kullanıcı onay yapabilir.** `WorkflowTaskController.complete` yalnızca `[Authorize]`
   taşır; atanmışsa, ilgili model üzerinde `Read` izni **olmasa bile** görevi kapatabilir. Kararını
   verdiği kaydı göremez ama onaylayabilir. Edge case EC-12.

---

## Alan seviyesi yetki ihtiyacı (G-09)

Bu uygulamada alan seviyesi yetki gerçekten gerekli. Somut ihtiyaçlar:

| Alan | Kim görmemeli | Neden |
|---|---|---|
| `SupplierQuotation.UnitPrice` (rakip teklifler) | Purchasing Specialist dışı | Teklif gizliliği |
| `Supplier.RatingAverage` | Tedarikçiyle temas edenler | Değerlendirme bağımsızlığı |
| `PurchaseOrderItem.UnitPrice` | Warehouse Manager | Depo fiyatı bilmemeli |
| `SupplierBankAccount.Iban` | Finance dışı herkes | Dolandırıcılık riski |
| `Employee.Salary` (varsa) | Herkes | — |
| `Budget.PlannedAmount` | Employee | Bütçe gizliliği |

Bugünkü tek araç `ModelColumnSetting` ve üç açıdan yetersiz:

1. **Rol boyutu yok** — ayar tenant genelinde tektir (`ModelColumnSettingManager.cs:39-40`)
2. **Backend'de uygulanmaz** — kolon JSON yanıtında gelir; DevTools ile okunur
3. **Yalnız 2 bağlam** (`list`, `detail`); rapor ve dashboard hiç etkilenmez

`SupplierBankAccount.Iban` satırı bunu bir **güvenlik bulgusu** yapar: IBAN'ı UI'dan gizleseniz bile
`GET /PublishedModel/getall?typeName=SupplierBankAccount` çağıran herhangi bir `Read` yetkili
kullanıcı görür.

**Ara çözüm (⚠️):** Hassas alanları **ayrı bir modele** taşımak ve o modele `Read` iznini kısmak.
`SupplierBankAccount` zaten ayrı bir model — `Read` izni yalnızca Finance rollerine verilir. Bu,
alan seviyesi yetkinin model seviyesine indirgenmiş halidir ve tasarımda bilinçli kullanılmıştır:
**hassas alan = ayrı model**.

Bu yaklaşım `SupplierQuotation.UnitPrice` için işe yaramaz — fiyat teklifin kendisidir, ayrılamaz.

---

## Kullanıcı sağlama (provisioning)

| Adım | Uç | Not |
|---|---|---|
| Şirket kaydı | `POST /Auth/register-company` | Tek admin oluşur |
| Kullanıcı ekleme | `POST /User/create` | Yalnız admin; başlangıç parolasını admin belirler |
| Rol atama | `POST /Role/...` üyelik uçları | `RoleAdminService` |
| İzin atama | `POST /Permission/...` | Rol bazlı tercih edilir |
| Pasifleme | `POST /User/setActive` | Master + tenant **birlikte** yazılır |

> **Tasarım kuralı:** İzinler **role** verilir, kullanıcıya değil. Kişisel `Permission` kayıtları
> yalnızca istisna içindir (örneğin bir çalışana geçici olarak `GoodsReceipt` yetkisi). Gerekçe:
> birleşim bitwise OR olduğu için kişisel izin **geri alınamaz** bir ek yetkidir; rolden çıkarmak
> yetmez, kişisel kaydı da silmek gerekir.

> ⚠️ **Yetki değişiklikleri yeni JWT oturumunda etkinleşir.** Bir kullanıcının onay yetkisi
> kaldırıldığında, mevcut oturumu boyunca onaylamaya devam edebilir. Edge case EC-11.
