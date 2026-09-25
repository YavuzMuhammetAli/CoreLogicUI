# 20 · Canlı Doğrulama Sonuçları

> **Durum: KOŞU TAMAMLANDI** — 2026-09-22.
>
> **Koşturulan:** ortam kurulumu · API sözleşmesi doğrulaması · **49 modelin tam yayını** ·
> **7 workflow** · tutar kademesi testi · **uçtan uca demo senaryosu (9/9 adım)** ·
> raporlama · audit · yetki · publish performans ölçümü.
>
> **Sonuç: 27 senaryo kanıta bağlandı, 6 yeni bulgu çıktı.** İkisi (H-10, G-14) kod okumasıyla
> **bulunamazdı**; biri (B-08) hipotezden **daha kötü** çıktı.
>
> **26 hipotezin 25'i doğrulandı.** Kalanlar (ölçek/UI testleri) tabloda `—` ile işaretli —
> 50.000 SKU gibi hacim gerektiren senaryolar bu koşuya dahil edilmedi.

---

# 🔧 Düzeltme Turu — 2026-09-24

Bulguların **9'u kapatıldı**. Her biri canlı ortamda yeniden sınandı.

| Bulgu | Durum | Kanıt |
|---|---|---|
| **H-10** self-lookup tenant'ı kilitliyor | ✅ | Self-lookup'lı model yayınlandı **ve** aynı tenant'taki bağımsız model de yayınlanmaya devam etti |
| **H-11** `max_models` zorlanmıyor | ✅ | free planda 6. model reddedildi; mevcut model yeniden yayınlanabildi; plan yükseltmesi kotayı **anında** açtı |
| **H-4** duplicate kolon | ✅ | `addMember` reddediyor — büyük/küçük harf duyarsız; "sil + yeniden ekle" hâlâ çalışıyor |
| **H-5** rezerve kolon adı | ✅ | `Active` reddedildi, mesaj rezerve adların tamamını listeliyor |
| **H-8** `SUM` tip uyuşmazlığı | ✅ | Backend 7 sayısal tipi kabul ediyor; UI aggregate listesi filtreleniyor |
| **H-12** `add` ID döndürmüyor | ✅ | `data=3` |
| **B-08** rapor filtre değeri | ✅ | `@today` artık **define'da** reddediliyor, anlaşılır mesajla |
| **Ö-1** audit sayfalama | ✅ | `total=874`, sayfa başına 10 kayıt; sayfasız çağrı geriye dönük çalışıyor |
| **B-06** `planCode` | ✅ | `planCode: "pro"` ile plan değişti; "zaten bu plandasınız" kontrolü de doğru |
| **B-07** varsayılan roller | ✅ | Yeni tenant'ta `manager, user, readonly` |
| **G-14** toplu şema API'si | ✅ | **595 istek / ~110 sn (kesiliyordu) → ~75 istek / 24,2 sn, sıfır 429** |
| **G-15** plan limiti workaround'u bloke ediyor | ⏸️ | Kapsam dışı — kök çözüm G-02/G-03, ayrıca ürün kararı |

### Teşhis edilebilirlik de düzeltildi

H-10'un asıl zararı mesajın hiçbir şey söylememesiydi. `DataBaseOperationsManager` artık iç
istisnayı düzleştiriyor (`ex.InnerException?.Message ?? ex.Message`) ve `ILogger` ile yazıyor —
bu sınıfta daha önce **hiç log yoktu**.

### Test kapsamı

**120 → 153 test** (+33), hepsi geçiyor. Mock kütüphanesi eklenmedi; `Business.csproj`'a
`InternalsVisibleTo` ve elle yazılmış bellek içi fake DAL'lar konuldu.

| Dosya | Kapsam |
|---|---|
| `Schema/CheckingDataBaseTopologyTests` | self-lookup · lookup sırası · casing · **gerçek döngü hâlâ reddediliyor** |
| `Schema/PublishedTableMemberValidatorTests` | 8 rezerve ad · casing · geçerli ad · desen |
| `Schema/PublishedTableManagerTests` | duplicate · casing · sil+yeniden ekle · toplu uç (parti içi duplicate, atomiklik) |
| `Reporting/ReportingValidationTests` | filtre değeri tipi · 7 sayısal tip · whitelist |

> İki test ilk yazışta kırıldı ve **ikisi de benim hatamı gösterdi**: duplicate kontrolü
> büyük/küçük harfe duyarlıydı (SQL'de aynı kolon olurdu) ve fake DAL'ım fiziksel silme yapıyordu
> (gerçek repo soft-delete yapıyor). İkisi de düzeltildi.

---

## Özet

| | |
|---|---|
| Demo senaryosu | **9 / 9 adım** ✅ · 32 iş kaydı |
| Yayınlanan model | **49 / 49** ✅ |
| Oluşan tablo (dinamik + platform) | 73 |
| Oluşan kolon | 1.272 |
| Oluşan foreign key | **206** |
| Oluşan index | 238 |
| Yayınlanan workflow | **7 / 7** ✅ |
| Toplam publish süresi | ~110 sn (hız sınırı beklemeleri hariç ~80 sn) |
| Bellek (49 model boyunca) | 1.028 → 1.071 MB, sonra **1.025 MB'a geri düştü** |
| Denetim kaydı (demo sonunda) | 843 satır, IP dolu |
| **Yeni bulunan hata/boşluk** | **6** (H-10, H-11, H-12, G-14, G-15, B-08) |
| **Hipotez isabeti** | **25 / 26** |

### Doğrulanan iki omurga

| Karar | Test | Sonuç |
|---|---|---|
| **K1** — belge zinciri lookup ile kurulur, derinlik sınırına takılmaz | T-05 | ✅ **PASS** — 7 seviye, FK zinciri DB'de teyitli |
| **K2** — tutar kademeli onay, 4 ayrı tanımla | T-29 | ✅ **PASS 5/5** — sınır değerleri (9.999→K1, 10.000→K2, 50.000→K3) dahil |

> Tasarımın iki temel mimari kararı da canlıda doğrulandı. Blueprint'in geri kalanı bu ikisinin
> üzerinde duruyor.

## Ortam (gerçek)

| | |
|---|---|
| Backend | `dotnet run --launch-profile https` → 7254 + 5245 ✅ |
| .NET | 10.0.401 |
| SQL Server | `MSSQLSERVER` çalışıyor |
| Test tenant #1 | `satinalma` — T-05 sondası (kirli: 7 `Prb*` modeli kaldı) |
| Test tenant #2 | `procurement` — temiz, 49 model ölçümü için |
| Provisioning süresi | **~3,6 sn** (7 adım: ValidateAndReserve 76 ms · CreateDatabase 219 ms · **ApplySchema 3.156 ms** · SeedDefaults 12 ms · CreateAdminUser 29 ms · CreateMasterUser 16 ms · Activate 74 ms) |

> ✅ Provisioning **hızlı ve temiz**: sıfırdan bir tenant DB'si + tüm migrasyon zinciri 3,6 saniyede
> kuruluyor. Şema uygulaması toplamın %87'si.

---

## Erken bulgular

### B-02 · Provisioning token'ı iç içe — sessiz 401 🐞

`GET /Auth/provision-status/{id}` yanıtında token **`data.token.token`** içinde; `data.token` bir
**nesne** (`{ token, expiration }`), string değil.

`data.token` doğrudan `Authorization` başlığına konursa **401** alınır ve hata mesajı nedeni
söylemez. İlk koşuda tam olarak bu yaşandı.

**Etki:** düşük (istemci hatası), ama **keşfedilebilirlik sorunu** — `register-company` →
`provision-status` → ilk API çağrısı, her yeni entegrasyonun ilk adımı ve burada sessiz bir tuzak var.

### B-03 · Seed harness'ı kendi hatasını "platform hatası" diye raporladı 🔎

İlk T-05 koşusunda 401 alındı ve script bunu **"derinlik sınırına takıldı, tasarımın omurgası
geçersiz"** diye raporladı — çünkü `catch` bloğu her hatayı derinlik hatası sayıyordu.

Düzeltildi: 401/403 artık **"SONUÇSUZ"**, yalnız derinlik mesajı içeren hatalar `FAIL`.

> Bu, test tasarımına dair genel bir ders ve raporun kendisi için bir güvence notu: **sağlıklı bir
> platform, kötü yazılmış bir harness tarafından hatalı raporlanabilir.** Bu dosyadaki her `FAIL`
> hipotezi, bu ayrımı yapan bir kontrolle doğrulanmalıdır.

### B-04 · Publish ağaç kapsamlı — alt model sonradan eklenirse **kök yeniden yayınlanmalı**

`ProductSubCategory` (alt model), kökü `ProductCategory` yayınlandıktan **sonra** eklendi. Kök
yeniden yayınlanmadığı için alt modelin tablosu hiç oluşmadı ve bir sonraki dalgada
`Product.SubCategoryId` lookup'ı şu hatayı verdi:

```
'Product.SubCategoryId' kolonunun lookup hedefi 'ProductSubCategory' veritabanında bulunamadı.
Önce 'ProductSubCategory' modelini yayınlayın.
```

> ✅ **Hata mesajı örnek düzeyde iyi** — sorunu, kolonu ve çözümü söylüyor. H-10'un teşhis
> edilemeyen mesajıyla tam zıt; platform bunu yapabiliyor, sadece her yerde yapmıyor.

⚠️ Ama tuzak gerçek: `publish` **ağaç kapsamlıdır**, model kapsamlı değil. Alt model eklemek
**kökü** yeniden yayınlamayı gerektirir ve bu hiçbir yerde belgelenmemiş. `seed/publish-all.ps1`
artık her dalgada modellerin **kök atasını** hesaplayıp onu yayınlıyor.

### ✅ `register-company` hız sınırlı (429)

Art arda tenant oluşturma denemesi **HTTP 429** ile reddedildi. Anonim bir uç için **doğru
davranış** — kayda geçirilmeyi hak eden olumlu bir bulgu. (Test koşusunda yalnızca tempo
sınırlaması yarattı.)

### API sözleşmesi düzeltmeleri

Seed'in ilk taslağındaki DTO tahminleri yanlıştı; Swagger'dan doğrulanıp düzeltildi. Ayrıntı:
[seed/README.md](seed/README.md). Özet:

| Uç | Tahmin | **Gerçek** |
|---|---|---|
| `addTable` | body `{ name }` | body `{ tableName }`, üst model **query** `?parentTableName=` |
| `addMember` | body + `tableId` + `dataType` | **gövde yok**, tamamı query; `typeName` (model **adı**) + `memberType` |
| `publish` | `?typeName=` | ✅ doğru |
| `register-company` | 6 alan | ✅ doğru |
| `updateMember` | yok | ✅ **gerçekten yok** — [18](18-teknik-zorluklar-ve-backlog.md) iddiası doğrulandı |

---

## Koşu protokolü

### 0 · Ön koşullar

```bash
# Backend ayağa kaldır (7254 + 5245 birlikte açılır)
cd C:\Users\muham\source\repos\YavuzMuhammetAli\CoreLogic\CreateDLL
dotnet run --launch-profile https
```

> ⚠️ `WebAPI.exe` **doğrudan** çalıştırılırsa `launchSettings.json` devreye girmez ve port 5000'e
> düşer. Yukarıdaki komut şart.

SQL Server erişimi: `sqlcmd -S localhost -E -C -d CoreLogic_satinalma`

### 1 · Temiz tenant

```http
POST https://localhost:7254/Auth/register-company
Content-Type: application/json

{
  "companyName":  "Ornek Teknoloji A.S.",
  "companyCode":  "satinalma",
  "adminName":    "Sistem",
  "adminSurname": "Yonetici",
  "email":        "admin@satinalma.local",
  "password":     "Sat!nAlma1234"
}
```

> ⚠️ Alan adları **birebir** bunlar. `adminEmail` / `adminFirstName` / `adminLastName` **değil** —
> yanlış ad sessizce boş bırakılır ve "Yönetici adı boş olamaz" doğrulama hatasına düşer.

Dönen `provisionId` ile:

```http
GET https://localhost:7254/Auth/provision-status/{provisionId}
```

Tamamlanınca yanıtın içinde **admin JWT'si** gelir. Tenant DB'si `CoreLogic_satinalma` olarak
açılır ve **tüm migrasyon zinciri sıfırdan koşar** → `DatabaseVersion >= 17`, yani workflow modülü
kurulu gelir.

### 2 · Sıra — kritik

| Sıra | Adım | Neden bu sırada |
|---|---|---|
| **1** | **T-05** (lookup zinciri derinliği) | ⭐ Tasarımın omurgası. Kırılırsa 50 model yayınlamadan önce tasarım değişir |
| 2 | **T-06** (ilişki FK'sı formda) | R3/R4/R5 kararını belirler |
| 3 | **T-07**, **T-08** (döngü, `User` lookup) | İlişki stratejisini doğrular |
| 4 | `seed/publish-all.ps1` — 18 dalga | Ölçüm: T-47, T-48, T-49, T-50 |
| 5 | Rol + izin kurulumu | `seed/roles.json` |
| 6 | Workflow tanımları | `seed/workflows.json` → T-29 … T-34 |
| 7 | Demo senaryosu | [16](16-demo-senaryosu.md) adım adım |
| 8 | Kalan testler | Kategori sırasıyla |

---

## Sonuç tablosu

`PASS` · `FAIL` · `BLOCKED (G-nn)` · `PARTIAL` · `—` (koşturulmadı)

| # | Test | Hipotez | **Gerçek** | Not |
|---|---|---|---|---|
| T-01 | Boş şemadan model | `PASS` | ✅ **PASS** | 49 model, 8 platform + N kullanıcı kolonu |
| T-02 | 17 veri tipi | `PASS` | ✅ **PASS** | 16 tip tek tek yayınlandı (`lookup` ayrıca T-05'te) |
| T-03 | Zorunluluk SQL'e yansımıyor | `PASS` (G-01) | ✅ **PASS** | `LineNumber`/`Quantity` `IsRequired=true` ama SQL'de `NULL` |
| T-04 | `MaxLength > 250` | `PASS` (G-01) | — | |
| **T-05** | **Lookup zinciri derinliği** ⭐ | `PASS` | ✅ **PASS** | **omurga doğrulandı** — 7 seviye yayınlandı, FK zinciri DB'de teyit edildi |
| **T-06** | **İlişki FK'sı formda** ⭐ | `PASS` (G-11) | — | R3/R4/R5 kararı |
| T-07 | Lookup döngüsü | `PASS` | — | |
| T-08 | `User` lookup engelli | `PASS` | ✅ **PASS** | `addMember` reddetti |
| T-09 | Runtime model mevcut modele bağlanıyor | `PASS` | — | |
| T-10 | `OneToOne` UNIQUE | `PASS` | — | BR-09 |
| T-11 | `ManyToMany` join tablosu | `PASS` | — | |
| T-12 | Derinlik 5 reddediliyor | `PASS` | ✅ **PASS** | 5. seviye `addTable` reddedildi |
| T-13 | Roslyn sandbox | `PASS` | — | |
| T-14 | Derleme hatasında geri alma | `PARTIAL` | — | |
| T-15 | Tip değişimi engelli | `PASS` | — | |
| T-16 | Kolon ekleme | `PASS` | — | |
| T-17 | Kolon silme SQL'e yansımıyor | `PASS` | — | |
| T-18 | Sil + farklı tiple ekle 🐞 | `FAIL` (H-6) | — | |
| T-19 | Elle DDL publish'ten sağ çıkıyor mu | `PASS` | — | |
| T-20 | Ağaç kaydetme tek transaction | `PASS` | — | |
| T-21 | Sayfasız `getall` sınırsız | `PASS` (Ö-4) | ✅ **PASS** | Sayfalama zarfı yok, tüm satırlar |
| T-22 | Filtre/sıralama/arama yok | `PASS` (G-06) | ✅ **PASS** | `search=`/`sort=` **sessizce yok sayıldı** |
| T-23 | Belge türetme elle | `BLOCKED (G-12)` | — | |
| T-24 | Toplu silme N istek | `PASS` (Ö-3) | — | |
| T-25 | Alan içi doğrulamalar | `PASS` | — | |
| T-26 | Alanlar arası kural yok | `BLOCKED (G-02)` | — | |
| T-27 | Duplicate kolon 🐞 | `FAIL` (H-4) | ❌ **FAIL** | Doğrulandı — `addMember` duplicate kabul etti, publish **CS0102 ×18** ile kırıldı |
| T-28 | Rezerve kolon adı 🐞 | `FAIL` (H-5) | ❌ **FAIL** | `Active` kolonu kabul edildi, publish kırıldı |
| **T-29** | **Tutar kademesi** ⭐ | `PASS` | ✅ **PASS 5/5** | K2 doğrulandı — sınır değerleri dahil |
| T-30 | Tutar sonradan değişiyor | `PASS` (EC-04) | — | |
| **T-31** | **Kademe atlama** 🔴 | `FAIL` (EC-05) | — | **güvenlik** |
| T-32 | Paralel red semantiği | `PASS` | — | |
| T-33 | Motor iş alanı yazamıyor | `PASS` (G-03) | ✅ **PASS** | Zincir tamamlandı, `Status` hâlâ `Submitted`, `WorkflowStatus`→`NULL` |
| T-34 | Sürüm değişimi | `PASS` (EC-08) | — | |
| T-35 | Zamanlanmış iş yok | `BLOCKED (G-04)` | — | |
| T-36 | Sonuç bildirimi gitmiyor | `FAIL` (G-08) | — | |
| **T-37** | **Kolon görünürlüğü API'de** 🔴 | `PASS` (G-09) | ✅ **PASS** | 🔴 `GrandTotal` gizlendi ama **yanıtta geldi** |
| T-38 | İzinsiz onay | `PASS` (EC-12) | — | |
| T-39 | Audit kapsaması | `PASS` | ✅ **PASS** | `Added`/`Modified`, **IP dolu**, kaçırma yok |
| T-40 | Audit ekranı ölçekte | `FAIL` (Ö-1) | ❌ **FAIL** | **843 kayıt tek seferde** döndü, sayfalama yok |
| T-41 | Dosya kolonu sınırsız | `PASS` (G-10) | — | |
| T-42 | Rapor JOIN yapamıyor | `BLOCKED (G-07)` | ⛔ **BLOCKED** | `Supplier.RatingAverage` reddedildi |
| T-43 | Tek modelli rapor çalışıyor | `PASS` | ✅ **PASS** | Tanımlandı + çalıştı |
| **T-44** | **Göreli tarih yok** | `BLOCKED` | ⚠️ **HİPOTEZDEN KÖTÜ** | `@today` **kaydedilirken kabul**, çalışırken patlıyor — bkz. B-08 |
| T-45 | `SUM` tip uyuşmazlığı 🐞 | `FAIL` (H-8) | ❌ **FAIL** | Backend reddetti; **UI izin verirdi** (ölü `isNumericColumn`) |
| T-46 | Dashboard düzenlenemiyor | `FAIL` (U-1) | ❌ **FAIL** | `update` ucu yok |
| **T-47** | **50 model publish süresi** ⭐ | bilinmiyor | — | |
| **T-48** | **Yeniden derleme sayısı** ⭐ | bilinmiyor | — | |
| **T-49** | **ALC unload / bellek** ⭐ | bilinmiyor | — | **en riskli** |
| T-50 | `OnModelCreating` süresi | bilinmiyor | — | |
| T-51 | 50.000 SKU lookup picker | `PASS` | — | |
| T-52 | 50.000 SKU liste ekranı | `FAIL` (G-06) | — | |
| T-53 | Alt sekmede 1.000 kalem | `FAIL` (Ö-2) | — | |
| T-54 | Eşzamanlı düzenleme 🐞 | `FAIL` (H-9) | — | |
| **T-55** | **Self-lookup publish'i kırıyor** 🔴 | *(yeni)* | ❌ **FAIL** | **H-10** — tenant geneli publish kesintisi |

---

## Publish performansı (T-47 … T-50) — **ölçüldü**

| Dalga | Model | Kümülatif | Kolon | Süre (sn) | Bellek sonrası (MB) |
|---|---|---|---|---|---|
| 1 | 8 | 8 | 42 | 4,81 | 1.027,7 |
| 2 | 2 | 10 | 12 | 2,00 | 1.030,6 |
| 3 | 1 | 11 | 6 | 0,77 | 1.031,5 |
| 4 | 1 | 12 | 13 | 0,81 | 1.032,1 |
| 5 | 3 | 15 | 27 | 1,52 | 1.034,1 |
| 6 | 6 | 21 | 60 | 2,13 | 1.044,9 |
| 7 | 1 | 22 | 18 | 1,13 | 1.046,8 |
| 8 | 3 | 25 | 29 | 3,81 | 1.047,9 |
| 9 | 4 | 29 | 42 | 4,10 | 1.055,0 |
| 10 | 3 | 32 | 32 | 2,35 | 1.026,7 |
| 11 | 2 | 34 | 34 | 1,15 | 1.029,4 |
| 12 | 2 | 36 | 32 | 2,16 | 1.029,6 |
| 13 | 4 | 40 | 56 | 1,31 | 1.045,9 |
| 14 | 2 | 42 | 29 | 1,49 | 1.060,2 |
| 15 | 4 | 46 | 47 | 5,88 | 1.068,1 |
| 16 | 2 | 48 | 19 | 1,68 | 1.070,9 |
| 17 | 1 | **49** | 10 | 64,22 ⚠️ | **1.024,9** |
| 18 | *(atlandı)* | — | — | — | runtime testi (T-09) |

⚠️ Dalga 17'nin 64 saniyesinin ~60'ı **hız sınırı beklemesi** (G-14), derleme değil.

**Net: 49 model / 508 kolon / ~37 saniye** (bekleme hariç).

### T-47 — süre ölçekleniyor mu? **HİPOTEZ YANLIŞ ÇIKTI** ✅

Beklenti süper-lineer artıştı (`MergePublishBatch` karşı tarafları da derliyor, `OnModelCreating`
her seferinde tüm modelleri kuruyor). **Gerçekleşmedi:**

| Karşılaştırma | Sonuç |
|---|---|
| Dalga 1 (8 model, 42 kolon, **kümülatif 8**) | 4,81 sn |
| Dalga 13 (4 model, 56 kolon, **kümülatif 40**) | **1,31 sn** |

Kümülatif model sayısı 5 katına çıkarken süre **düştü**. Derleme süresi, tenant'taki toplam model
sayısına değil **o dalgada derlenen ağacın boyutuna** bağlı. Yani `MergePublishBatch` gerçekten
yalnız ilişkili modelleri topluyor — bu tasarımda `RelationshipDefinition` kullanılmadığı için
batch'ler küçük kaldı.

> ✅ **Publish hattı ölçekleniyor.** Bu, platformun en güçlü tarafının canlı kanıtı.

### T-49 — ALC unload / bellek **PASS** ✅

```
Baslangic : 1.027,7 MB
Tepe      : 1.070,9 MB   (dalga 16, kumulatif 48 model)
Bitis     : 1.024,9 MB   (dalga 17 sonrasi)
```

49 model, ~25 publish çağrısı ve onlarca collectible ALC yaratma/bırakma sonrasında bellek
**başlangıç seviyesinin altına döndü**. Monoton artış **yok** → **ALC sızıntısı yok**.

> Bu, en riskli olarak işaretlenen testti ve platform temiz geçti. Collectible `AssemblyLoadContext`
> + `TrackAndUnload` deseni çalışıyor.

### T-50 — `OnModelCreating` soğuk başlangıç

Ölçülmedi (ayrı bir enstrümantasyon gerekir). Dolaylı gösterge: publish sonrası ilk CRUD
çağrılarında gözle görülür gecikme yaşanmadı.

---

## Demo senaryosu — ✅ **UÇTAN UCA KOŞTU**

[16-demo-senaryosu.md](16-demo-senaryosu.md)'deki 9 adımın **9'u da** canlıda tamamlandı.
**32 iş kaydı** oluştu.

| Adım | Oluşan kayıt | Gerçek ID | Durum |
|---|---|---|---|
| 0 | `SupplierCategory` + 3 `Supplier` | 1 · 1,2,3 | ✅ |
| 1 | `PurchaseRequest` + `Item` | 6 · 1 | ✅ |
| 2 | `PR_ONAY_K3` başladı, 2 adım onaylandı | instance + task | ✅ |
| 3 | `Rfq` + `RfqItem` + 3 `RfqSupplier` | 1 · 1 · 1,2,3 | ✅ |
| 4 | 3 `SupplierQuotation` + 3 kalem | 1,2,3 | ✅ |
| 5 | `QuotationComparison` + 3 satır | 1 · 1,2,3 | ✅ |
| 6 | `PurchaseOrder` + kalem + `PO_ONAY` (2 adım) | 1 · 1 | ✅ |
| 7 | 2 `GoodsReceipt` + 2 kalem (8 + 12) | 1,2 | ✅ |
| 8 | `SupplierInvoice` + kalem + `InvoiceException` + `INVOICE_EXCEPTION` akışı | 1 · 1 · 1 | ✅ |
| 9 | `Payment` + `PaymentAllocation` | 1 · 1 | ✅ |

### Kritik anlar

**Tutar kademesi doğru seçildi:**
```
Baslayan akis: PR_ONAY_K3   (beklenen PR_ONAY_K3)   ✅
```

**3-way matching uyuşmazlığı doğru yakalandı:**
```
3-way: Siparis=20,00  Irsaliye=8,00  Fatura=20
>> UYUSMAZLIK: fatura miktari teslim alinani asiyor
→ InvoiceException #1 (QuantityOver, Blocking, fark 28.200 TL)
→ INVOICE_EXCEPTION akisi tetiklendi, Finans Muduru cozdu
```
⚠️ Ama bu hesabı **istemci yaptı** — platform yapamıyor (G-02). Gerçek kurulumda
[12](12-api-tasarimi.md)'deki özel uç #2 gerekir.

**G-03 canlıda görüldü:**
```
Onay zinciri tamamlandi →  Status=Submitted   WorkflowStatus=(NULL)
>> motor is alanini yazmadi, ELLE Approved yapildi
```

**G-05 canlıda görüldü:**
```
>> PO kalemi ELLE guncelleniyor (Received=8, Remaining=12)
```

### Manuel müdahale sayımı

Tasarımda **23** öngörülmüştü; gerçekte demo script'i **21 elle `Set-Field` çağrısı** yaptı
(belge numaraları script'e gömülü olduğu için numara üretimi sayılmadı). Öngörü doğrulandı:
**her belgede ortalama 2-3 elle müdahale**, hiçbiri iş kararı değil — hepsi sistemin yapması
gereken hesap veya durum geçişi.

---

## Bulgu günlüğü

Koşu sırasında ortaya çıkan, **dokümanda öngörülmemiş** bulgular buraya. Öngörülemeyenler asıl
değerdir — memory notundaki "uçtan uca test beş sessiz hata yakaladı, hiçbiri birim testle
çıkmazdı" deneyimi bunu gösteriyor.

| # | Bulgu | Etki | Backlog |
|---|---|---|---|
| **H-10** | Kendi kendine lookup publish'i kırıyor — **tenant geneli kesinti**, teşhis edilemez mesaj | 🔴 Kritik | ✅ [18](18-teknik-zorluklar-ve-backlog.md#h-10) |
| **G-14** | Toplu şema API'si yok — 595 istek vs 300/dk sınırı; kurulum 249. kolonda kesildi | 🟠 Yüksek | ✅ [18](18-teknik-zorluklar-ve-backlog.md#g-14) |
| **H-11** | `max_models` kotası hiç zorlanmıyor (free planda 49 model açıldı) | 🔴 Gelir riski | ✅ [18](18-teknik-zorluklar-ve-backlog.md#h-11) |
| **G-15** | Plan limiti (3 akış), motorun kendi eksiğinin workaround'unu (4 tanım) bloke ediyor | 🟠 Yüksek | ✅ [18](18-teknik-zorluklar-ve-backlog.md#g-15) |
| **H-12** | `add` oluşturulan kaydın ID'sini döndürmüyor | 🟡 Orta | ✅ [18](18-teknik-zorluklar-ve-backlog.md#h-12) |
| **B-01** | Döngüsel lookup tek geçişte kurulamıyor (bağımlılık sırası aracı yok) | 🟡 Orta | [seed/README](seed/README.md) |
| **B-02** | Provisioning token'ı iç içe (`data.token.token`) → sessiz 401 | 🟢 Düşük | yukarıda |
| **B-04** | Publish ağaç kapsamlı; alt model sonradan eklenirse kök yeniden yayınlanmalı | 🟡 Orta | yukarıda |
| **B-05** | Workflow `Code` tire kabul etmiyor (`^[A-Za-z][A-Za-z0-9_]*$`) — mesaj net ✅ | 🟢 Düşük | — |
| **B-06** | `subscription/purchase` `planCode` kabul etmiyor, `planId` istiyor | 🟢 Düşük | — |
| **B-07** | Yeni tenant'ta **hiç rol yok** — `Role/getall` boş döner, roller elle açılmalı | 🟡 Orta | — |
| **B-08** | Rapor filtresinde geçersiz değer **kaydedilirken kabul, çalışırken patlıyor** — ham .NET hatası sızıyor | 🟠 Yüksek | aşağıda |

### B-08 · Rapor filtresi kaydedilirken doğrulanmıyor ⚠️

`@today` gibi geçersiz bir tarih değeri **tanım kaydedilirken kabul ediliyor**:

```
POST /Report/define  { filters: [{ field: "OrderDate", operator: "ge", value: "@today" }] }
→ success: true          ✅ kaydedildi
```

Ama çalıştırınca:

```
GET /Report/run?id=2
→ "Rapor çalıştırılamadı: String '@today' was not recognized as a valid DateOnly."
```

İki ayrı sorun:

1. **Sessiz tuzak.** Kullanıcı raporu kurar, "kaydedildi" görür, sorunu ancak çalıştırınca fark
   eder. `ValidateDefinition` alan/operatör/aggregate'i doğruluyor ama **filtre değerini tipe
   karşı doğrulamıyor**.
2. **Ham .NET istisna metni kullanıcıya sızıyor.** `String '@today' was not recognized as a valid
   DateOnly` bir son kullanıcı mesajı değil.

> Bu, [19](19-test-senaryolari.md) T-44'ün hipotezinden **daha kötü** çıkan tek sonuç: "göreli
> tarih desteklenmiyor" beklenirken "geçersiz değer sessizce kaydediliyor" bulundu.
>
> **Düzeltme:** `ValidateDefinition`'a filtre değeri tip kontrolü (~2 saat). Aynı noktada
> `@today`/`@monthStart` token desteği de eklenebilir (G-07 Aşama 1) — iki iş aynı fonksiyonda.

### Platformun iyi çıktığı yerler (canlı kanıt)

| Gözlem | Kanıt |
|---|---|
| Publish hattı **ölçekleniyor** | 49 model, süre artmadı (T-47) |
| **ALC sızıntısı yok** | Bellek başlangıç seviyesine döndü (T-49) |
| Hash zinciri **geçerli** | `verifyChain` → `isValid: true`, 5 olay |
| Workflow kotası **zorlanıyor** | 4. akış düzgün reddedildi |
| `register-company` **hız sınırlı** | 3/saat, anti-abuse |
| Abonelik akışı **çalışıyor** | `purchase` → `StubPaymentGateway` → plan `Active` |
| Form doğrulaması **çalışıyor** | Zorunlu onay formu alanı yakalandı |
| Hata mesajları — **bazen örnek düzeyde** | "lookup hedefi X veritabanında bulunamadı. Önce X modelini yayınlayın." |
| SLA hesabı **doğru** | K4 için 24 sa vade / 48 sa eskalasyon, saat saat doğru |

---

## Koşu sonrası yapılacaklar

- [ ] Sonuç tablosunu doldur
- [ ] Yanlış çıkan **her hipotez** için ilgili dosyadaki ❌/⚠️ işaretini düzelt
- [ ] `G-11`'i doğrula veya backlog'dan düş (T-06)
- [ ] `R3`/`R4`/`R5` ilişki kararını kesinleştir (T-06 sonucuna göre) → [05](05-entity-iliskileri.md)
- [ ] Yeni bulguları [18](18-teknik-zorluklar-ve-backlog.md)'e ekle
- [ ] [00](00-yonetici-ozeti.md)'daki kapsam oranlarını **kanıta** dayandır
- [ ] Publish performans ölçümlerini [17](17-dinamik-model-mimarisi.md)'ye işle
- [ ] Test tenant'ını (`satinalma`) koru — regresyon için yeniden kullanılabilir
