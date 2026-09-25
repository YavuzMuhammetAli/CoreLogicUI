# seed · Makine-Okunur Şema ve Kurulum

Bu klasör, blueprint'in tasarımını **çalıştırılabilir** hale getirir. Amaç: tasarım ile canlı
doğrulama arasında kopukluk bırakmamak.

| Dosya | İçerik |
|---|---|
| `models.json` | 50 model, 520 kolon, 18 publish dalgası |
| `relationships.json` | 6 `RelationshipDefinition` |
| `roles.json` | 10 rol + model bazlı izin bitmaskları |
| `workflows.json` | 7 workflow tanımı ([08](../08-workflow-tasarimi.md)'in JSON'ları) |
| `publish-all.ps1` | Tenant açar, 18 dalgayı sırayla yayınlar, ölçüm toplar |

---

## API sözleşmesi — ✅ doğrulandı (2026-09-22, Swagger)

İlk taslakta tahmin edilen DTO şemaları **yanlıştı**. Aşağıdakiler canlı Swagger'dan doğrulandı ve
`publish-all.ps1` bunlara göre yazıldı.

### `POST /Published/addTable?parentTableName={ad}`

```jsonc
// body: PublishedTable
{ "tableName": "PurchaseRequest", "description": "Satın Alma Talebi" }
```

> ⚠️ Alan adı **`tableName`**, `name` değil. Üst model **query parametresiyle** (`parentTableName`)
> ve **ada göre** verilir — `parentTableId` gövdede var ama kullanılmıyor.

### `POST /Published/addMember?...` — **gövde yok**

Her şey query parametresi:

```
?typeName=PurchaseRequest&memberName=RequestNumber&memberType=string&isRequired=true
&minLength=&maxLength=&min=&max=&regex=...&regexMessage=...&enumValues=...
&lookupTargetTable=...&lookupDisplayColumn=...&label=Talep%20No&description=...
```

> ⚠️ İki önemli fark: model **numerik ID ile değil `typeName` (model adı) ile** gösterilir, ve tip
> alanı **`memberType`**, `dataType` değil.

### `POST /Published/publish?typeName={ad}` — gövde yok ✅

### `POST /Auth/register-company` ✅

`companyName` · `companyCode` · `adminName` · `adminSurname` · `email` · `password`

### 🔎 Bulgu B-02: provisioning token'ı iç içe

`GET /Auth/provision-status/{id}` yanıtında token **`data.token.token`** içindedir — `data.token`
bir **nesnedir** (`{ token, expiration }`), string değil.

`data.token` doğrudan `Authorization` başlığına konursa sessizce **401** alınır; hata mesajı
nedeni söylemez. Bu, ilk koşuda tam olarak yaşandı ve testin yanlışlıkla "derinlik hatası" diye
raporlanmasına yol açtı.

> Ders: bir test harness'ında **her hata aynı sonuç değildir**. `Invoke-DepthProbe`'un `catch`
> bloğu artık 401/403'ü "sonuçsuz" olarak ayırıyor; aksi halde sağlıklı bir platform
> "derinlik sınırı var" diye raporlanırdı.

### ❌ `updateMember` yok — doğrulandı

Swagger'da `/Published/` altında `addMember` ve `removeMember` var, **`updateMember` yok**.
[18](../18-teknik-zorluklar-ve-backlog.md)'deki "mevcut kolonun kuralları güncellenemiyor" iddiası
**doğrulandı**. (`/Published/updateTable` vardır ama o **tabloyu** günceller — ad/açıklama —
kolon kurallarını değil.)

---

## `models.json` şeması

Kısa anahtarlar dosya boyutunu ~3 kat düşürüyor.

```jsonc
{
  "name":   "PurchaseRequest",   // model adı (İngilizce, ^[A-Za-z][A-Za-z0-9_]*$)
  "label":  "Satın Alma Talebi",  // ekranda görünen ad (Türkçe)
  "parent": null,                 // alt model ise üst modelin adı
  "wave":   9,                    // publish dalgası (bağımlılık sırası)
  "cols": [
    { "n": "RequestNumber", "t": "string", "r": true, "lbl": "Talep No",
      "rx": "^PR-[0-9]{4}-[0-9]{4}$", "rxMsg": "Format: PR-2026-0001" },
    { "n": "DepartmentId",  "t": "lookup", "r": true, "lbl": "Departman",
      "lk": "Department", "lkd": "Name" },
    { "n": "Priority",      "t": "enum",   "r": true, "lbl": "Öncelik",
      "enum": "Low|Normal|High|Urgent" },
    { "n": "TotalAmountTry","t": "decimal","r": true, "lbl": "Tutar (TL)", "min": 0 }
  ]
}
```

| Anahtar | `PublishedTableMember` karşılığı |
|---|---|
| `n` | `Name` |
| `t` | `DataType` |
| `r` | `IsRequired` |
| `lbl` | `Label` |
| `lk` / `lkd` | `LookupTargetTable` / `LookupDisplayColumn` |
| `enum` | `EnumValues` (`\|` ayraçlı) |
| `rx` / `rxMsg` | `Regex` / `RegexMessage` |
| `min` / `max` | `Min` / `Max` |
| `minLen` / `maxLen` | `MinLength` / `MaxLength` |

### Dosyada bilinçli olarak **olmayanlar**

| Yok | Neden |
|---|---|
| `default` | `PublishedTableMember.DefaultValue` **ölü alan** — hiçbir kod okumuyor (G-01) |
| `unique` | Platformda `IsUnique` kavramı yok (G-01) |
| `computed` | Hesaplanan kolon yok (G-05) — türetilmiş değerler saklanan kolon olarak tanımlı |
| `precision` | `decimal` daima `(18,2)` (G-01) |
| `index` | İndeks tanımlama yüzeyi yok (Ö-7) |

Bu beş eksik, JSON'a **yazılamadığı için** boşluk listesinin en somut kanıtıdır: tasarımın
ifade etmek istediği şeyi metadata taşıyamıyor.

---

## Kullanım

```powershell
cd docs\satinalma-blueprint\seed

# 1. Tenant aç + tüm modelleri yayınla + ölçüm topla
.\publish-all.ps1 -TenantCode satinalma -BaseUrl https://localhost:7254

# 2. Var olan tenant'a bağlan (yeniden kurulum yapmadan)
.\publish-all.ps1 -TenantCode satinalma -Jwt $env:CORELOGIC_JWT -SkipProvision

# 3. Yalnız T-05 (lookup derinliği) doğrulaması — 50 model yayınlamadan önce
.\publish-all.ps1 -DepthProbeOnly
```

Script `publish-metrics.csv` üretir — [20](../20-canli-dogrulama-sonuclari.md)'deki ölçüm
tablosunun kaynağı.

---

## Sıra neden önemli

Lookup hedefi **kayıtlı bir `PublishedTable`** olmak zorunda
(`PublishedTableManager.cs:115-120`). Sıra bozulursa `addMember` doğrulaması hata verir.

`wave` alanı bu bağımlılık sırasını kodlar; ayrıntılı gerekçe
[05-entity-iliskileri.md](../05-entity-iliskileri.md#publish-sırası).

> ⚠️ Her dalga bir publish çağrısıdır ve `MergePublishBatch` ilişkiyle bağlı karşı tarafları da
> yeniden derler. 18 dalga sonunda bazı modeller onlarca kez derlenmiş olur — T-47/T-48 bunu ölçer.

### 🔎 Seed yazarken çıkan bulgu: döngüsel lookup tek geçişte kurulamıyor

Tasarım `Department.ManagerEmployeeId → Employee` ve `Employee.DepartmentId → Department`
lookup'larını içeriyor ([05](../05-entity-iliskileri.md)). Ama lookup hedefi **kayıtlı bir
`PublishedTable` olmak zorunda** (`PublishedTableManager.cs:115-120`) — yani:

- `Department` (dalga 3) yayınlanırken `Employee` **henüz yok** → `ManagerEmployeeId` eklenemez
- `Employee` (dalga 4) yayınlanırken `Department` var → `DepartmentId` eklenebilir

Sonuç: **döngüsel lookup ancak iki geçişte kurulur.** `models.json`'da `Department` yalnız
`ManagerName` (string) taşır; `ManagerEmployeeId` kolonu `publish-all.ps1`'in **dalga 19'unda**
(`-SecondPass`) eklenir.

Bu, dokümanda öngörülmemiş bir kısıttı ve seed'i yazarken ortaya çıktı. Platform hatası değil —
lookup doğrulamasının doğal sonucu — ama **belgelenmemiş** ve kullanıcıya "önce hangi modeli
yayınlamalıyım" sorusunu çözmesi için hiçbir araç sunulmuyor. Bağımlılık sırasını kullanıcı
kendisi keşfetmek zorunda.

> Bulgu [20](../20-canli-dogrulama-sonuclari.md)'nin bulgu günlüğüne **B-01** olarak eklendi.
