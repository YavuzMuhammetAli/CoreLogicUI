# 19 · Test Senaryoları

**54 senaryo.** Amaç uygulamayı değil, **CoreLogic platformunu** test etmek.

Format: **Ön Koşul → Eylem → Beklenen Sonuç**. Her senaryonun bir **Hipotez** satırı var — kod
okumasından çıkan tahmin. Canlı koşu sonuçları
[20-canli-dogrulama-sonuclari.md](20-canli-dogrulama-sonuclari.md)'ye yazılacak.

**Sonuç kodları:** `PASS` · `FAIL` (platform hatası) · `BLOCKED (G-nn)` (boşluk engelliyor) ·
`PARTIAL`

---

## Ortam

| | |
|---|---|
| Backend | `cd CreateDLL; dotnet run --launch-profile https` → `https://localhost:7254` |
| Tenant | `POST /Auth/register-company` → kod `satinalma` |
| Tenant DB | `CoreLogic_satinalma` |
| Şart | Yeni provisioning tüm migrasyon zincirini koşturur → `DatabaseVersion >= 17` (workflow modülü) |

---

# A · Dinamik Entity ve Alan Oluşturma

### T-01 · Boş şemadan model oluşturma

| | |
|---|---|
| **Ön koşul** | Temiz tenant, hiç model yok |
| **Eylem** | `POST /Published/addTable` → `{name: "Unit"}`, ardından 4 `addMember`, sonra `publish` |
| **Beklenen** | `PublishedTable` + 4 `PublishedTableMember` satırı; `ModelDefinition` `Status=Published`, `Version=1`; `[Unit]` tablosu **8 platform + 4 kullanıcı kolonuyla** açılır |
| **Hipotez** | `PASS` |

### T-02 · 17 veri tipinin tamamı

| | |
|---|---|
| **Ön koşul** | Temiz tenant |
| **Eylem** | `TypeProbe` modeli — 17 tipin her birinden bir kolon; publish |
| **Beklenen** | Tümü doğru SQL tipine eşlenir: `string`→`nvarchar(250)`, `decimal`→`decimal(18,2)`, `file`/`image`→`varbinary(max)`, `dateonly`→`date`, `timeonly`→`time`, `guid`→`uniqueidentifier` |
| **Hipotez** | `PASS` |

### T-03 · Zorunluluk SQL'e yansımıyor

| | |
|---|---|
| **Ön koşul** | T-01 |
| **Eylem** | `IsRequired = true` kolon tanımla, publish, `INFORMATION_SCHEMA.COLUMNS` sorgula |
| **Beklenen** | `IS_NULLABLE = 'YES'` — zorunluluk yalnız uygulama katmanında |
| **Hipotez** | `PASS` (boşluğu doğrular, **G-01**) |

### T-04 · `MaxLength > 250` sessiz kırılma

| | |
|---|---|
| **Ön koşul** | Temiz tenant |
| **Eylem** | `MaxLength = 1000` string kolon tanımla, publish, 400 karakterlik değer kaydet |
| **Beklenen** | Uygulama doğrulaması **geçer**, SQL truncation/hata verir |
| **Hipotez** | `PASS` — **G-01** doğrulanır |

---

# B · İlişkiler ve Derinlik

### T-05 · Lookup zinciri derinlik sınırını aşıyor mu ⭐ **kritik**

| | |
|---|---|
| **Ön koşul** | Temiz tenant |
| **Eylem** | 7 model zinciri: `A ← B ← C ← D ← E ← F ← G`, her bağ **lookup kolonuyla**; hepsini publish |
| **Beklenen** | **7 seviyenin tamamı publish edilir**; `MaxDepthRule` devreye girmez (yalnız `RelationshipGraph` kenarlarına bakar) |
| **Hipotez** | `PASS` — [05](05-entity-iliskileri.md) K1 kararının temeli |
| **Başarısızsa** | ❌ **Tasarımın omurgası değişir.** Belge zinciri parçalanıp gevşek referansla (`int`, FK'sız) bağlanmak zorunda kalır |

### T-06 · İlişki FK'sı formda nasıl görünüyor ⭐

| | |
|---|---|
| **Ön koşul** | İki model + aralarında `OneToMany` `RelationshipDefinition` |
| **Eylem** | Bağımlı modelin `/models/{name}/new` formunu aç |
| **Beklenen** | ⚠️ FK alanı **çıplak `<input type="number">`** olarak çıkar — lookup picker **değil** |
| **Hipotez** | `PASS` (boşluğu doğrular, **G-11**) |
| **Sonucu** | Doğrulanırsa R3/R4/R5 ilişkileri lookup'a çevrilir |

### T-07 · Lookup döngüsü engellenmiyor

| | |
|---|---|
| **Ön koşul** | `Department` ve `Employee` |
| **Eylem** | `Department.ManagerEmployeeId → Employee` **ve** `Employee.DepartmentId → Department` lookup'larını tanımla, publish |
| **Beklenen** | ✅ Publish **geçer** — `CircularDependencyRule` legacy kenarları hariç tutuyor |
| **Hipotez** | `PASS` — döngü koruması lookup'larda çalışmıyor (tasarım için gerekli, ama bilinçli mi?) |

### T-08 · `User` tablosuna lookup verilemiyor

| | |
|---|---|
| **Ön koşul** | Temiz tenant |
| **Eylem** | `LookupTargetTable = "User"` olan bir kolon eklemeyi dene |
| **Beklenen** | Hata: hedef kayıtlı bir `PublishedTable` olmalı |
| **Hipotez** | `PASS` (sınırı doğrular) |

### T-09 · Runtime model mevcut modele bağlanıyor ⭐

| | |
|---|---|
| **Ön koşul** | 50 model yayınlanmış, sistem "canlıda" |
| **Eylem** | `CompanyVehicle` oluştur; `PurchaseOrderId` lookup'ı **mevcut** `PurchaseOrder`'a bağla; publish |
| **Beklenen** | Publish başarılı; FK oluşur; `PurchaseOrder` **yeniden derlenmez** (lookup `MergePublishBatch`'e girmez) |
| **Hipotez** | `PASS` |

### T-10 · `OneToOne` UNIQUE index üretiyor

| | |
|---|---|
| **Ön koşul** | `PurchaseRequest` ve `Rfq` |
| **Eylem** | R5 (`OneToOne`) tanımla, publish, iki `Rfq` kaydını aynı `PurchaseRequestId` ile ekle |
| **Beklenen** | `UX_Rfq_PurchaseRequestId_Rel` oluşur; ikinci kayıt **reddedilir** (BR-09 ✅) |
| **Hipotez** | `PASS` — platformun UNIQUE ürettiği tek durum |

### T-11 · `ManyToMany` join tablosu

| | |
|---|---|
| **Ön koşul** | `Product` ve `Supplier` |
| **Eylem** | R6 (`ManyToMany`, `ProductSupplierLink`) tanımla, publish |
| **Beklenen** | Join tablosu **yalnız 2 FK + bileşik PK**; `DbBaseObject` kolonları **yok**; `IX_..._SupplierId_Rel` ters index var |
| **Hipotez** | `PASS` ⚠️ join tablosu audit'lenmez |

### T-12 · Derinlik 5 alt model reddediliyor

| | |
|---|---|
| **Eylem** | 5 seviyeli alt model ağacı (`ParentTableId`) kurmayı dene |
| **Beklenen** | 5. seviyede hata — `Depth > 4` |
| **Hipotez** | `PASS` |

---

# C · Derleme ve Runtime Assembly

### T-13 · Roslyn sandbox'ı

| | |
|---|---|
| **Eylem** | Kolon adı olarak `System.IO` içeren bir ifade enjekte etmeyi dene; ayrıca üretilen kodda method tanımı oluşturacak bir ad dene |
| **Beklenen** | Ad deseni (`^[A-Za-z][A-Za-z0-9_]*$`) zaten engeller; sandbox ikinci savunma hattı |
| **Hipotez** | `PASS` |

### T-14 · Derleme hatasında geri alma

| | |
|---|---|
| **Ön koşul** | Çalışan bir model |
| **Eylem** | Aynı adlı iki kolon ekleyerek publish'i kır (CS0102), sonra mevcut kayıtları okumayı dene |
| **Beklenen** | Publish hata döner; `RollbackInMemoryState` eski assembly'yi geri yükler; **mevcut CRUD çalışmaya devam eder** |
| **Hipotez** | `PARTIAL` — bellek geri yüklenir ama DB'deki sürüm kaydı geri alınmayabilir (`ModelDefinitionManager.cs:201-204`) |

### T-15 · Kolon tipi değişimi engelleniyor

| | |
|---|---|
| **Ön koşul** | `decimal` bir kolon yayınlanmış |
| **Eylem** | Aynı kolonu `string` yapmayı dene, publish |
| **Beklenen** | `DetectTypeChanges` **engeller** |
| **Hipotez** | `PASS` |

---

# D · Şema Evrimi (Dinamik Migration)

### T-16 · Kolon ekleme (`ALTER ADD`)

| | |
|---|---|
| **Ön koşul** | Dolu bir tablo (100 kayıt) |
| **Eylem** | Yeni kolon ekle, publish |
| **Beklenen** | `ALTER TABLE ADD ... NULL`; **veri kaybı yok**; `IsRequired = true` olsa bile kolon `NULL` |
| **Hipotez** | `PASS` |

### T-17 · Kolon silme SQL'e yansımıyor

| | |
|---|---|
| **Eylem** | `removeMember` + publish, sonra `INFORMATION_SCHEMA.COLUMNS` sorgula |
| **Beklenen** | Metadata soft-delete, **SQL kolonu tabloda kalır**; veri korunur |
| **Hipotez** | `PASS` |

### T-18 · Sil + aynı adla farklı tiple ekle (tip kontrolü bypass) 🐞

| | |
|---|---|
| **Eylem** | `Quantity` (decimal) sil → publish → `Quantity` (string) ekle → publish |
| **Beklenen** | ❌ Publish **geçer**; C# tipi `string`, SQL kolonu `decimal` → okuma/yazma hatası |
| **Hipotez** | `FAIL` — **H-6** doğrulanır |

### T-19 · Elle eklenen DDL publish'ten sağ çıkıyor mu

| | |
|---|---|
| **Ön koşul** | Yayınlanmış bir model |
| **Eylem** | `sqlcmd` ile `UNIQUE INDEX` ve `CHECK` constraint ekle; sonra modele yeni kolon ekleyip publish et |
| **Beklenen** | `CheckDb` yalnız eksik kolon ekler, mevcut kısıtlara dokunmaz → **kısıtlar kalır** |
| **Hipotez** | `PASS` ⚠️ ama **belgelenmemiş davranış** — üretimde güvenilmemeli |

---

# E · CRUD ve Sorgu

### T-20 · Ağaç kaydetme tek transaction

| | |
|---|---|
| **Eylem** | `addTree` ile 1 sipariş + 20 kalem; kalemlerden birinde doğrulama hatası olacak şekilde |
| **Beklenen** | **Hiçbiri yazılmaz**; **tüm hatalar birden** döner (`errors: {clientId: msg}`); FK'yı sunucu atar, istemciden gelen yok sayılır |
| **Hipotez** | `PASS` |

### T-21 · Sayfasız `getall` sınırsız satır döndürüyor

| | |
|---|---|
| **Ön koşul** | 10.000 kayıtlı model |
| **Eylem** | `GET /PublishedModel/getall?typeName=X` (page/pageSize **vermeden**) |
| **Beklenen** | ❌ 10.000 satırın tamamı döner |
| **Hipotez** | `PASS` — **Ö-4** doğrulanır |

### T-22 · Filtre / sıralama / arama yok

| | |
|---|---|
| **Eylem** | `getall`'a `search=`, `sort=`, `filter=` parametreleri göndermeyi dene |
| **Beklenen** | Parametreler **yok sayılır**; sonuç daima `ORDER BY ID`, filtresiz |
| **Hipotez** | `PASS` — **G-06** doğrulanır |

### T-23 · Belge türetme elle yapılıyor

| | |
|---|---|
| **Eylem** | Onaylı `PurchaseRequest`'ten `Rfq` türetmek için bir platform ucu ara |
| **Beklenen** | ❌ Yok. İstemci kalemleri okuyup yeni ağacı kendisi kurar |
| **Hipotez** | `BLOCKED (G-12)` |

### T-24 · Toplu silme N istek

| | |
|---|---|
| **Eylem** | Grid'de 50 satır seç, toplu sil, ağ trafiğini izle |
| **Beklenen** | ⚠️ **50 ayrı** `POST /PublishedModel/delete` isteği; transaction bütünlüğü yok |
| **Hipotez** | `PASS` — **Ö-3** doğrulanır |

---

# F · Doğrulama ve İş Kuralları

### T-25 · Alan içi doğrulamalar çalışıyor

| | |
|---|---|
| **Eylem** | `Regex`, `Min`/`Max`, `MinLength`/`MaxLength`, `EnumValues` ihlal eden kayıtlar gönder |
| **Beklenen** | Hepsi reddedilir; regex hatasında kolonun `RegexMessage`'ı döner; ReDoS için 200 ms timeout |
| **Hipotez** | `PASS` — platformun güçlü olduğu tek kural sınıfı |

### T-26 · Alanlar arası kural kurulamıyor

| | |
|---|---|
| **Eylem** | `RequiredDate >= RequestDate` kuralını tanımlamak için bir yüzey ara |
| **Beklenen** | ❌ Yok; `RequiredDate` geçmişte olan kayıt kabul edilir |
| **Hipotez** | `BLOCKED (G-02)` |

### T-27 · Aynı adlı kolon iki kez eklenebiliyor 🐞

| | |
|---|---|
| **Eylem** | `addMember` çağrısını aynı adla iki kez yap, publish |
| **Beklenen** | ❌ `addMember` **kabul eder**; publish CS0102 ile kırılır |
| **Hipotez** | `FAIL` — **H-4** doğrulanır |

### T-28 · Rezerve kolon adı engellenmiyor 🐞

| | |
|---|---|
| **Eylem** | `Active` adında bir kolon ekle, publish |
| **Beklenen** | ❌ Metadata kabul eder; `CREATE TABLE` aynı kolonu iki kez yazar → patlar |
| **Hipotez** | `FAIL` — **H-5** doğrulanır |

---

# G · Workflow

### T-29 · Tutar kademesi doğru seçiliyor ⭐

| | |
|---|---|
| **Ön koşul** | WF-1…WF-4 yayınlanmış; roller ve üyelikler kurulu |
| **Eylem** | Beş talep: 5.000 · 9.999 · **10.000** · **50.000** · 300.000 TL; hepsini `Submitted` yap |
| **Beklenen** | Sırasıyla `K1` · `K1` · `K2` · `K3` · `K4` başlar. **Sınır değerleri kritik**: `ge`/`lt` kombinasyonu boşluk ve kesişme bırakmamalı |
| **Hipotez** | `PASS` — [08](08-workflow-tasarimi.md) K2 kararının doğrulaması |

### T-30 · Tutar sonradan değiştirilince akış değişmiyor

| | |
|---|---|
| **Ön koşul** | 9.000 TL'lik talep `K1` akışını başlatmış |
| **Eylem** | Tutarı 400.000 yap, kaydet |
| **Beklenen** | ❌ Akış değişmez; departman müdürü 400.000 TL'lik talebi onaylar |
| **Hipotez** | `PASS` — **EC-04** doğrulanır |

### T-31 · Tutar düşürülerek onay kademesi atlanıyor 🔴 **güvenlik**

| | |
|---|---|
| **Eylem** | API'yi doğrudan çağırıp 500.000 TL'lik talebi `TotalAmountTry = 1` ile `Submitted` yap |
| **Beklenen** | ❌ `K1` başlar — departman müdürü onayı yeterli olur |
| **Hipotez** | `FAIL` — **EC-05**, yetki yükseltme açığı |

### T-32 · Paralel adım ve red semantiği

| | |
|---|---|
| **Ön koşul** | WF-5 (`SUPPLIER-ONAY`) yayınlanmış |
| **Eylem** | Tedarikçiyi `PendingApproval` yap; ticari dalı **onayla**, mali dalı **reddet** |
| **Beklenen** | ✅ Join beklenmez; **kalan dal görevleri iptal edilir**; `onAnyReject`'e gidilir; `WorkflowInstance.Status = Rejected` |
| **Hipotez** | `PASS` — **EC-10** |

### T-33 · Motor iş alanı yazamıyor

| | |
|---|---|
| **Eylem** | WF-3 zincirini tamamla, `PurchaseRequest` kaydını oku |
| **Beklenen** | ❌ `Status` hâlâ `Submitted`; `WorkflowStatus` **`null`** (terminal adıma etiket map'lenemez) |
| **Hipotez** | `PASS` — **G-03** doğrulanır |

### T-34 · Sürüm değişimi açık instance'ları etkilemiyor

| | |
|---|---|
| **Ön koşul** | `PR-ONAY-K2` v1'de 3 açık instance |
| **Eylem** | Aynı `Code` ile yeni taslak → publish (v2, farklı adımlar) |
| **Beklenen** | ✅ v1 `Archived`; açık 3 instance **v1 kurallarıyla** tamamlanır; görev form şemaları değişmez |
| **Hipotez** | `PASS` — **EC-08** |

---

# H · Scheduler, Bildirim, Yetki, Audit

### T-35 · Kullanıcı tanımlı zamanlanmış iş yok

| | |
|---|---|
| **Eylem** | `ScheduledTask` CRUD ucu ara; `tenant.backup` dışında bir `JobType` yazmayı dene |
| **Beklenen** | ❌ Controller yok; `ScheduledJobTypes` 2 satır; yeni tip için kod+deploy gerekir |
| **Hipotez** | `BLOCKED (G-04)` |

### T-36 · Süreç sonucu bildirimi gitmiyor

| | |
|---|---|
| **Ön koşul** | SMTP yapılandırılmış tenant |
| **Eylem** | Onay zincirini tamamla; talep sahibinin gelen kutusunu kontrol et |
| **Beklenen** | ❌ Bildirim **yok** — `WorkflowCompleted` hiç enqueue edilmiyor. Yalnız `TaskAssigned` gitmiş |
| **Hipotez** | `FAIL` — **G-08 #1** |

### T-37 · Kolon görünürlüğü API'de uygulanmıyor 🔴 **güvenlik**

| | |
|---|---|
| **Ön koşul** | Admin `SupplierBankAccount.Iban`'ı `list` ve `detail`'de gizlemiş |
| **Eylem** | `Read` yetkili bir kullanıcıyla `GET /PublishedModel/getall?typeName=SupplierBankAccount` çağır |
| **Beklenen** | ❌ `Iban` **JSON yanıtta gelir** — gizleme yalnız görsel |
| **Hipotez** | `PASS` — **G-09** doğrulanır |

### T-38 · İzinsiz kullanıcı onay yapabiliyor

| | |
|---|---|
| **Ön koşul** | `PurchaseRequest` üzerinde **hiç izni olmayan** bir kullanıcıya onay görevi atanmış |
| **Eylem** | `POST /WorkflowTask/complete` |
| **Beklenen** | ⚠️ **Başarılı** — yetki atamayla belirleniyor; kullanıcı onayladığı kaydı göremiyor |
| **Hipotez** | `PASS` — **EC-12** |

### T-39 · Audit kapsaması

| | |
|---|---|
| **Eylem** | `addTree` (1+20 kayıt) · bir güncelleme · bir soft-delete (cascade'li) |
| **Beklenen** | 21 `Added` · 1 `Modified` · cascade'deki her kayıt için `Deleted` (`Active` true→false doğru tespit edilir); `Ip` ve `CreatedBy` dolu |
| **Hipotez** | `PASS` — platformun güçlü tarafı |

### T-40 · Audit ekranı ölçekte çöküyor

| | |
|---|---|
| **Ön koşul** | ~200.000 audit satırı üretilmiş |
| **Eylem** | `/audit-logs` ekranını aç |
| **Beklenen** | ❌ Backend **tüm** satırları döndürür; tarayıcı kilitlenir veya çok uzun sürer |
| **Hipotez** | `FAIL` — **Ö-1** |

### T-41 · Dosya kolonu sınırsız

| | |
|---|---|
| **Eylem** | `file` kolonuna 100 MB'lık bir dosya yükle; ardından kaydı güncelle |
| **Beklenen** | ❌ Boyut sınırı yok; kabul edilir. Güncelleme sonrası `AuditLog` satırı **~200 MB** (eski + yeni) |
| **Hipotez** | `PASS` — **G-10** doğrulanır, audit şişmesi ölçülür |

---

# I · Raporlama

### T-42 · Rapor JOIN yapamıyor

| | |
|---|---|
| **Eylem** | Rapor kurucuda `PurchaseOrder` + `Supplier.RatingAverage` kolonunu seçmeyi dene |
| **Beklenen** | ❌ Model seçici tek `<select>`; nokta notasyonu reddedilir |
| **Hipotez** | `BLOCKED (G-07)` |

### T-43 · Lookup raporda ham ID

| | |
|---|---|
| **Eylem** | `PurchaseOrder` · grup `SupplierId` · `SUM(GrandTotalTry)` raporu çalıştır |
| **Beklenen** | ❌ Gruplar `7`, `12`, `31` olarak görünür — tedarikçi adı yok |
| **Hipotez** | `PASS` — denormalize ad kolonu kararının gerekçesi |

### T-44 · Göreli tarih yok

| | |
|---|---|
| **Eylem** | Filtre değeri olarak `@today` veya `son 30 gün` yazmayı dene |
| **Beklenen** | ❌ `DateTime.Parse` hatası veya sabit metin olarak yorumlanır |
| **Hipotez** | `BLOCKED (G-07)` — **en ucuz düzeltme** |

### T-45 · `SUM` tip uyuşmazlığı sessiz 🐞

| | |
|---|---|
| **Eylem** | `long` tipli bir kolonda `SUM` seç, kaydet |
| **Beklenen** | ❌ UI seçime izin verir, backend **Kaydet'te** reddeder |
| **Hipotez** | `FAIL` — **H-8** |

### T-46 · Dashboard düzenlenemiyor

| | |
|---|---|
| **Ön koşul** | 4 widget'lı bir dashboard |
| **Eylem** | Beşinci widget eklemeyi dene |
| **Beklenen** | ❌ `update` ucu yok; dashboard **sıfırdan kurulmalı** |
| **Hipotez** | `FAIL` — **U-1** |

---

# J · Ölçek ve Performans ⭐

Bu grup blueprint'in asıl stres testi. Platform bu yükü hiç görmedi.

### T-47 · 50 model publish süresi

| | |
|---|---|
| **Eylem** | `seed/publish-all.ps1` ile 18 dalgayı koştur; her dalganın süresini kaydet |
| **Ölçülecek** | Dalga başına süre · kümülatif süre · süre model sayısıyla **lineer mi süper-lineer mi** |
| **Hipotez** | Süper-lineer — `MergePublishBatch` karşı tarafları da derliyor ve `OnModelCreating` her seferinde tüm modelleri kuruyor |

### T-48 · `MergePublishBatch` yeniden derleme sayısı

| | |
|---|---|
| **Eylem** | Her publish'te derlenen tip sayısını logla |
| **Ölçülecek** | 18 dalga sonunda toplam derlenen tip sayısı; en çok kaç kez derlenen model |
| **Hipotez** | Bazı modeller **10+ kez** derleniyor |

### T-49 · ALC unload ve bellek

| | |
|---|---|
| **Eylem** | 18 dalga boyunca `GC.GetTotalMemory` ve yüklü assembly sayısını izle; sonunda `GC.Collect` |
| **Beklenen** | Eski ALC'ler **boşalır**; bellek plato çizer |
| **Hipotez** | ⚠️ **Bilinmiyor** — en riskli test. Bir referans sızarsa ALC'ler birikir |

### T-50 · `OnModelCreating` süresi

| | |
|---|---|
| **Eylem** | 50 model yayınlandıktan sonra ilk sorgunun (model kurulumu) süresini ölç |
| **Beklenen** | EF model cache soğukken bir defa; `ModelVersion++` sonrası her publish'te yeniden |
| **Hipotez** | Kabul edilebilir ama publish sonrası **ilk istek yavaş** |

### T-51 · 50.000 SKU'da lookup picker

| | |
|---|---|
| **Ön koşul** | `Product` tablosunda 50.000 kayıt |
| **Eylem** | Sipariş formunda ürün lookup'ını aç, ara, kaydır |
| **Beklenen** | ✅ İlk 50, arama sunucuda, sonsuz kaydırma ile 50'şer — **çalışmalı** |
| **Hipotez** | `PASS` — picker doğru tasarlanmış |

### T-52 · 50.000 SKU'da liste ekranı

| | |
|---|---|
| **Eylem** | `/models/Product` ekranını aç, belirli bir SKU'yu bul |
| **Beklenen** | ❌ Arama yok, filtre yok, sıralama yok → 1.000 sayfa arasında gezinmek gerekir |
| **Hipotez** | `FAIL` — **G-06**, ekran fiilen kullanılamaz |

### T-53 · Alt sekmede 1.000 kalem

| | |
|---|---|
| **Ön koşul** | 1.000 kalemli bir sipariş |
| **Eylem** | Sipariş detayını aç |
| **Beklenen** | ❌ Sayfalama yok; 1.000 satır tek seferde gelir |
| **Hipotez** | `FAIL` — **Ö-2** |

### T-55 · Kendi kendine lookup publish'i kırıyor 🔴🐞 — **canlıda doğrulandı**

| | |
|---|---|
| **Ön koşul** | Temiz tenant |
| **Eylem** | Bir modele kendi kendini hedefleyen `lookup` kolonu ekle (`X.ParentId → X`), publish et. Ardından **tamamen bağımsız, lookup'sız** başka bir modeli publish etmeyi dene |
| **Beklenen** | ❌ Her iki publish de `"Tablo oluşturma script'leri üretilemedi"` ile başarısız. Tek bir self-lookup **tenant'taki her publish'i** kırar |
| **Kurtarma** | `removeMember` ile kolonu pasifleştir → tenant hemen açılır |
| **Sonuç** | **FAIL — doğrulandı** (2026-09-22). Kök neden `CheckingDataBase.cs:128-156`, ayrıntı [18](18-teknik-zorluklar-ve-backlog.md) **H-10** |

### T-54 · Eşzamanlı düzenleme sessiz veri kaybı 🐞

| | |
|---|---|
| **Eylem** | İki oturumdan aynı kaydı aç, ikisinde farklı alan değiştir, sırayla kaydet |
| **Beklenen** | ❌ İkinci kayıt birincinin değişikliğini **sessizce siler**; uyarı yok |
| **Hipotez** | `FAIL` — **H-9**, optimistic concurrency yok |

---

## Kapsam matrisi

| Alan | Testler |
|---|---|
| Dynamic Entity Creation | T-01, T-09 |
| Dynamic Field Creation | T-02, T-03, T-04, T-27, T-28 |
| Runtime Compilation | T-13, T-14, T-15, T-47, T-48 |
| Runtime Assembly Loading | T-49, T-50 |
| Dynamic Migration | T-16, T-17, T-18, T-19 |
| Dynamic Table Creation | T-01, T-02, T-10, T-11 |
| CRUD | T-20, T-21, T-22, T-23, T-24 |
| Relationships | T-05, T-06, T-07, T-08, T-10, T-11, T-12 |
| Validation | T-25, T-26, T-27, T-28 |
| Workflow | T-29 … T-34 |
| Scheduler | T-35 |
| Notification | T-36 |
| Authorization | T-31, T-37, T-38 |
| Audit | T-39, T-40, T-41 |
| File Attachment | T-41 |
| Reporting | T-42 … T-46 |
| Scale / Performance | T-47 … T-54 |

## Hipotez özeti

| Beklenen sonuç | Sayı |
|---|---|
| `PASS` (doğru çalışıyor) | 17 |
| `PASS` (boşluğu **doğruluyor**) | 16 |
| `FAIL` (platform hatası) | 11 |
| `BLOCKED (G-nn)` | 5 |
| `PARTIAL` / bilinmiyor | 5 |
| **Toplam** | **54** |

> ⚠️ **11 `FAIL` hipotezi** kod okumasına dayanıyor; hepsi canlıda doğrulanmalı. Memory notundaki
> "uçtan uca test beş sessiz hata yakaladı — hiçbiri birim testle çıkmazdı" deneyimi, bu listenin
> neden koşturulması gerektiğini gösteriyor.
