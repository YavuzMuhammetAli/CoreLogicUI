# 08 · Workflow Tasarımı

7 workflow tanımı. Hiçbiri kod içermez — tamamı `WorkflowDefinition.DefinitionJson` metadata'sıdır ve
`/workflows` ekranından değiştirilebilir.

---

## Motorun gerçek yetenekleri

Tasarıma geçmeden, üzerine inşa edilen motorun sınırları. Bunlar tasarımın şeklini doğrudan
belirledi.

| Yetenek | Durum | Kanıt |
|---|---|---|
| Adım tipleri | **Yalnız 2**: `approval`, `parallel` | `WorkflowDefinitionModel.cs:22-35` |
| Sistem/otomatik adım, karar gateway'i, betik, alt-süreç, bekleme | ❌ Yok | aynı |
| Geçiş üzerinde koşul | ❌ Yok — akış ortasında dallanma yapılamaz | `WorkflowDefinitionModel.cs:189-240` |
| Koşul yeri | **Yalnız tetikleme anında** | `WorkflowWorker.cs:287-295` |
| Koşul operatörleri | `eq ne gt ge lt le contains startswith` | `WorkflowCondition.cs:13-30` |
| Koşul gruplama | **Yalnız AND** — OR ve parantez yok | `WorkflowCondition.cs:74-91` |
| Koşulda erişilebilir alanlar | Yalnız tetikleyen kaydın **kullanıcı kolonları** | `WorkflowValidator.cs:303-330` |
| Atama modları | `user` · `role` · `creator` | `WorkflowDefinitionModel.cs:51-64` |
| Organizasyonel atama ("talebin müdürü") | ❌ Yok | — |
| Delegasyon / vekalet | ❌ Yok | — |
| Paralel join | `all` veya `any` — **N/M quorum yok** | `WorkflowJoinModes.Supported` |
| SLA | Adım/dal bazlı `DueHours`, `EscalateAfterHours`, `OnTimeout` | `WorkflowDefinitionModel.cs:276-286` |
| Timeout politikası | `escalate` · `autoApprove` · `autoReject` | `WorkflowDefinitionModel.cs:67-81` |
| Eskalasyon davranışı | ⚠️ Yukarı taşımaz — **aynı kişilere ikinci e-posta** | `WorkflowTaskManager.cs:157-180` |
| Tekrarlayan hatırlatma | ❌ Yok — tek atımlık | — |
| İş günü / mesai takvimi | ❌ Yok — SLA düz saat | — |
| Motorun yazabildiği alan | **Yalnız `WorkflowStatus`** | `WorkflowEntityAccessor.cs:47-64` |
| Kayıt kilitleme (onaydayken düzenlemeyi engelleme) | ❌ Yok | — |
| Aynı kayıtta eşzamanlı süreç | ❌ Tek — `GetActiveForEntity` engeller | `WorkflowInstanceManager.cs:83-84` |
| Bir değişiklikten başlayan akış sayısı | **En fazla 1** — ilk eşleşende çıkılır | `WorkflowWorker.cs:303` |
| Adım üst sınırı | 50 | `WorkflowValidator.cs:16` |

---

## K2 kararı: tutar kademeleri nasıl kuruldu

Motor akış ortasında dallanamıyor. Ama **tetikleyici koşulu** yeterli: dört ayrı tanım, kesişmeyen
tutar aralıkları.

```
PR-ONAY-K1   Status eq Submitted  AND  TotalAmountTry lt 10000
PR-ONAY-K2   Status eq Submitted  AND  TotalAmountTry ge 10000   AND  TotalAmountTry lt 50000
PR-ONAY-K3   Status eq Submitted  AND  TotalAmountTry ge 50000   AND  TotalAmountTry lt 250000
PR-ONAY-K4   Status eq Submitted  AND  TotalAmountTry ge 250000
```

**Aralıkların kesişmemesi zorunludur.** Bir kayıt değişikliği en fazla bir akış başlatır ve ilk
eşleşende döngüden çıkılır (`WorkflowWorker.cs:303`); eşleşme sırası deterministik değil. Aralıklar
kesişirse **hangi kademenin çalışacağı rastgele** olur.

✅ Bu, tasarımın platform tarafından **tam olarak karşılanan** en önemli gereksinimidir. Eşikleri
değiştirmek = 4 tanımı yeniden yayınlamak. Kod değişikliği yok.

### Sayı ayrıştırma güvenli

`TotalAmountTry` bir `decimal` ve SQL'den boxed geliyor. `TryToDouble`
(`WorkflowCondition.cs:136-167`) `IConvertible.ToDouble(InvariantCulture)` kullanıyor — **asla
`.ToString()` değil**. Bu, `(500.00m).ToString()` tr-TR'de `"500,00"` üretip virgülün binlik ayracı
sanılarak **50000** okunması hatasını kapatıyor. Regresyon testi:
`WorkflowConditionTests.Ondalikli_decimal_binlik_ayraci_sanilmaz`.

### ⚠️ İki gerçek risk

1. **Koşul yalnız tetikleme anında bakılır.** Talep `Submitted` olduğunda tutar 9.000 TL ise K1
   başlar. Kullanıcı sonra tutarı 400.000 TL yapabilir — akış değişmez, departman müdürü onaylar.
   Kayıt kilitleme olmadığı için (motor sınırı) bu **her zaman mümkündür**. Edge case EC-04.
2. **Tutar istemci tarafından yazılıyor** (G-05). API'yi doğrudan çağıran biri tutarı düşük yazıp
   kademeyi atlatabilir. Edge case EC-05, test T-31.

> Her iki risk de tek bir düzeltmeyle kapanır: **G-02 + G-05** — tutar sunucuda hesaplansın ve
> `Submitted` sonrası düzenleme reddedilsin.

---

## WF-1…WF-4 · Satın alma talebi onayı

Dördü aynı yapıda; yalnız adım sayısı ve atanan roller değişiyor.

### WF-1 · `PR-ONAY-K1` (0 – 10.000 TL)

```json
{
  "name": "Satın Alma Talebi Onayı — Kademe 1",
  "code": "PR-ONAY-K1",
  "modelName": "PurchaseRequest",
  "triggerEvent": "onUpdate",
  "isEnabled": true,
  "triggerConditionJson": [
    { "field": "Status",         "operator": "eq", "value": "Submitted" },
    { "field": "TotalAmountTry", "operator": "lt", "value": "10000" }
  ],
  "definitionJson": {
    "startStep": "dept",
    "entityStatusMap": {
      "dept": "Departman Müdürü Onayında"
    },
    "steps": [
      {
        "key": "dept",
        "type": "approval",
        "name": "Departman Müdürü Onayı",
        "assignment": { "mode": "role", "roleId": 6 },
        "sla": { "dueHours": 48, "escalateAfterHours": 72, "onTimeout": "escalate" },
        "form": {
          "fields": [
            { "name": "Comment",       "dataType": "string",  "isRequired": false, "label": "Açıklama" },
            { "name": "BudgetChecked", "dataType": "boolean", "isRequired": true,  "label": "Bütçe kontrol edildi" }
          ]
        },
        "onApprove": "",
        "onReject": ""
      }
    ]
  }
}
```

`onApprove` / `onReject` boş bırakıldığında motor terminal duruma düşer: onay → `__completed`,
red → `__rejected` (`WorkflowStateMachine.cs:128-138`).

> ⚠️ **`entityStatusMap` terminal adımları kapsamıyor** ve kapsayamaz — UI tasarımcısı terminal
> anahtarlara etiket yazamıyor (`workflow-build.component.html:191,200`). Sonuç: süreç bitince
> `WorkflowStatus` **boşalır**. "Onaylandı" etiketi kalıcı olarak yazılamaz (G-03).

### WF-2 · `PR-ONAY-K2` (10.000 – 50.000 TL)

```json
{
  "name": "Satın Alma Talebi Onayı — Kademe 2",
  "code": "PR-ONAY-K2",
  "modelName": "PurchaseRequest",
  "triggerEvent": "onUpdate",
  "isEnabled": true,
  "triggerConditionJson": [
    { "field": "Status",         "operator": "eq", "value": "Submitted" },
    { "field": "TotalAmountTry", "operator": "ge", "value": "10000" },
    { "field": "TotalAmountTry", "operator": "lt", "value": "50000" }
  ],
  "definitionJson": {
    "startStep": "dept",
    "entityStatusMap": {
      "dept":       "Departman Müdürü Onayında",
      "purchasing": "Satın Alma Müdürü Onayında"
    },
    "steps": [
      {
        "key": "dept",
        "type": "approval",
        "name": "Departman Müdürü Onayı",
        "assignment": { "mode": "role", "roleId": 6 },
        "sla": { "dueHours": 48, "escalateAfterHours": 72, "onTimeout": "escalate" },
        "onApprove": "purchasing",
        "onReject": ""
      },
      {
        "key": "purchasing",
        "type": "approval",
        "name": "Satın Alma Müdürü Onayı",
        "assignment": { "mode": "role", "roleId": 2 },
        "sla": { "dueHours": 48, "escalateAfterHours": 96, "onTimeout": "escalate" },
        "form": {
          "fields": [
            { "name": "Comment",           "dataType": "string", "isRequired": false, "label": "Açıklama" },
            { "name": "SuggestedSupplier", "dataType": "string", "isRequired": false, "label": "Önerilen Tedarikçi" }
          ]
        },
        "onApprove": "",
        "onReject": ""
      }
    ]
  }
}
```

### WF-3 · `PR-ONAY-K3` (50.000 – 250.000 TL)

Adımlar: `purchasing` → `finance`. Departman müdürü **atlanır** (tutar büyüdükçe teknik onay değil
mali onay önem kazanır — iş kararı).

```json
{
  "code": "PR-ONAY-K3",
  "modelName": "PurchaseRequest",
  "triggerEvent": "onUpdate",
  "triggerConditionJson": [
    { "field": "Status",         "operator": "eq", "value": "Submitted" },
    { "field": "TotalAmountTry", "operator": "ge", "value": "50000" },
    { "field": "TotalAmountTry", "operator": "lt", "value": "250000" }
  ],
  "definitionJson": {
    "startStep": "purchasing",
    "entityStatusMap": {
      "purchasing": "Satın Alma Müdürü Onayında",
      "finance":    "Finans Müdürü Onayında"
    },
    "steps": [
      {
        "key": "purchasing", "type": "approval", "name": "Satın Alma Müdürü Onayı",
        "assignment": { "mode": "role", "roleId": 2 },
        "sla": { "dueHours": 48, "escalateAfterHours": 96, "onTimeout": "escalate" },
        "onApprove": "finance", "onReject": ""
      },
      {
        "key": "finance", "type": "approval", "name": "Finans Müdürü Onayı",
        "assignment": { "mode": "role", "roleId": 4 },
        "sla": { "dueHours": 72, "escalateAfterHours": 120, "onTimeout": "escalate" },
        "form": {
          "fields": [
            { "name": "Comment",         "dataType": "string",  "isRequired": true,  "label": "Mali Değerlendirme" },
            { "name": "BudgetAvailable", "dataType": "boolean", "isRequired": true,  "label": "Bütçe Uygun" }
          ]
        },
        "onApprove": "", "onReject": ""
      }
    ]
  }
}
```

### WF-4 · `PR-ONAY-K4` (250.000 TL ve üzeri)

Üç adım: `purchasing` → `finance` → `management`.

```json
{
  "code": "PR-ONAY-K4",
  "modelName": "PurchaseRequest",
  "triggerEvent": "onUpdate",
  "triggerConditionJson": [
    { "field": "Status",         "operator": "eq", "value": "Submitted" },
    { "field": "TotalAmountTry", "operator": "ge", "value": "250000" }
  ],
  "definitionJson": {
    "startStep": "purchasing",
    "entityStatusMap": {
      "purchasing": "Satın Alma Müdürü Onayında",
      "finance":    "Finans Müdürü Onayında",
      "management": "Genel Müdür Onayında"
    },
    "steps": [
      {
        "key": "purchasing", "type": "approval", "name": "Satın Alma Müdürü Onayı",
        "assignment": { "mode": "role", "roleId": 2 },
        "sla": { "dueHours": 24, "escalateAfterHours": 48, "onTimeout": "escalate" },
        "onApprove": "finance", "onReject": ""
      },
      {
        "key": "finance", "type": "approval", "name": "Finans Müdürü Onayı",
        "assignment": { "mode": "role", "roleId": 4 },
        "sla": { "dueHours": 48, "escalateAfterHours": 72, "onTimeout": "escalate" },
        "onApprove": "management", "onReject": ""
      },
      {
        "key": "management", "type": "approval", "name": "Genel Müdür Onayı",
        "assignment": { "mode": "role", "roleId": 9 },
        "sla": { "dueHours": 120, "escalateAfterHours": 168, "onTimeout": "escalate" },
        "form": {
          "fields": [
            { "name": "Comment",           "dataType": "string", "isRequired": true, "label": "Yönetim Kararı" },
            { "name": "StrategicJustification", "dataType": "string", "isRequired": true, "label": "Stratejik Gerekçe" }
          ]
        },
        "onApprove": "", "onReject": ""
      }
    ]
  }
}
```

> ⚠️ **`roleId` sabit sayılardır ve tenant'a özgüdür.** Rol ID'leri `/roles` ekranından okunup
> tanımlara yazılmalı; farklı bir tenant'a taşınırken **elle güncellenmeli**. Platformda rol adına
> göre atama yok. `seed/publish-all.ps1` bu ID'leri çalışma anında çözüp JSON'a enjekte eder.

---

## WF-5 · `SUPPLIER-ONAY` — paralel adım testi

Tedarikçi onayı, **paralel** adım tipini sınamak için tasarlandı: ticari ve mali inceleme aynı anda
yürür, ikisi de onaylarsa yönetim onayına geçer.

```json
{
  "name": "Tedarikçi Onay Süreci",
  "code": "SUPPLIER-ONAY",
  "modelName": "Supplier",
  "triggerEvent": "onUpdate",
  "isEnabled": true,
  "triggerConditionJson": [
    { "field": "Status", "operator": "eq", "value": "PendingApproval" }
  ],
  "definitionJson": {
    "startStep": "inceleme",
    "entityStatusMap": {
      "inceleme": "İncelemede",
      "yonetim":  "Yönetim Onayında"
    },
    "steps": [
      {
        "key": "inceleme",
        "type": "parallel",
        "name": "Ticari ve Mali İnceleme",
        "mode": "all",
        "branches": [
          {
            "key": "ticari",
            "name": "Ticari İnceleme",
            "assignment": { "mode": "role", "roleId": 2 },
            "sla": { "dueHours": 72, "escalateAfterHours": 120, "onTimeout": "escalate" },
            "form": {
              "fields": [
                { "name": "CommercialNote",  "dataType": "string",  "isRequired": true,  "label": "Ticari Değerlendirme" },
                { "name": "ReferenceChecked","dataType": "boolean", "isRequired": true,  "label": "Referans Kontrolü Yapıldı" }
              ]
            }
          },
          {
            "key": "mali",
            "name": "Mali İnceleme",
            "assignment": { "mode": "role", "roleId": 4 },
            "sla": { "dueHours": 72, "escalateAfterHours": 120, "onTimeout": "escalate" },
            "form": {
              "fields": [
                { "name": "TaxNumberVerified", "dataType": "boolean", "isRequired": true, "label": "Vergi No Doğrulandı" },
                { "name": "IbanVerified",      "dataType": "boolean", "isRequired": true, "label": "IBAN Doğrulandı" },
                { "name": "CreditRating",      "dataType": "string",  "isRequired": false,"label": "Kredi Notu" }
              ]
            }
          }
        ],
        "onComplete": "yonetim",
        "onAnyReject": ""
      },
      {
        "key": "yonetim",
        "type": "approval",
        "name": "Yönetim Onayı",
        "assignment": { "mode": "role", "roleId": 9 },
        "sla": { "dueHours": 120, "escalateAfterHours": 168, "onTimeout": "escalate" },
        "onApprove": "",
        "onReject": ""
      }
    ]
  }
}
```

### Paralel semantiği (motorun gerçek davranışı)

| Durum | Davranış | Kanıt |
|---|---|---|
| Adıma girişte | **Tüm dalların görevleri aynı anda** açılır | `WorkflowStateMachine.cs:258-272` |
| Herhangi bir dal **reddederse** | Join beklenmez; kalan görevler **iptal edilir**, `onAnyReject`'e gidilir | `:161-172` |
| `mode: "all"` | Tüm dallar onaylanmadan ilerlenmez | `:182-186` |
| `mode: "any"` | İlk onay yeter, kalan dallar iptal | `:174-180` |
| "Hepsi" ölçütü | **Tanımdaki dal listesi** — eksik dal sessizce tamam sayılmaz | `AllBranchesApproved:196-224` |
| `Skipped` dal | Tamamlanmış sayılır | `:216-217` |

⚠️ Paralel adımın **kendi ataması ve formu olamaz** (`WorkflowValidator.cs:139-141`); en az 2 dal
zorunlu. Dal bir alt-süreç değil, **tek bir görevdir** — iç içe paralel yapılamaz.

---

## WF-6 · `PO-ONAY` — sipariş onayı

```json
{
  "name": "Satın Alma Siparişi Onayı",
  "code": "PO-ONAY",
  "modelName": "PurchaseOrder",
  "triggerEvent": "onUpdate",
  "isEnabled": true,
  "triggerConditionJson": [
    { "field": "Status", "operator": "eq", "value": "PendingApproval" }
  ],
  "definitionJson": {
    "startStep": "purchasing",
    "entityStatusMap": { "purchasing": "Satın Alma Müdürü Onayında", "finance": "Finans Onayında" },
    "steps": [
      {
        "key": "purchasing", "type": "approval", "name": "Satın Alma Müdürü Onayı",
        "assignment": { "mode": "role", "roleId": 2 },
        "sla": { "dueHours": 24, "escalateAfterHours": 48, "onTimeout": "escalate" },
        "onApprove": "finance", "onReject": ""
      },
      {
        "key": "finance", "type": "approval", "name": "Finans Onayı",
        "assignment": { "mode": "role", "roleId": 4 },
        "sla": { "dueHours": 48, "escalateAfterHours": 72, "onTimeout": "autoApprove" },
        "onApprove": "", "onReject": ""
      }
    ]
  }
}
```

> ⚠️ **`onTimeout: "autoApprove"` dikkatli kullanılmalı.** 48 saat içinde karar verilmezse sistem
> görevi **onaylanmış** sayar, yorum alanına *"Süre aşımı — otomatik sonuçlandırıldı."* yazar ve
> `CompletedBy = null` bırakır (`WorkflowTaskManager.cs:153-154`). Denetimde "sistem onayladı" olarak
> okunur. Mali onayda bu politikanın kullanılması tartışmalıdır; burada **bilinçli olarak** seçildi
> çünkü sipariş zaten satın alma müdürü onayından geçmiş oluyor. Gerçek kurulumda `escalate`
> tercih edilmeli.

---

## WF-7 · `INVOICE-EXCEPTION` — fatura uyuşmazlığı onayı

```json
{
  "name": "Fatura Uyuşmazlığı Onayı",
  "code": "INVOICE-EXCEPTION",
  "modelName": "SupplierInvoice",
  "triggerEvent": "onUpdate",
  "isEnabled": true,
  "triggerConditionJson": [
    { "field": "Status",      "operator": "eq", "value": "Exception" },
    { "field": "MatchStatus", "operator": "ne", "value": "ThreeWayOk" }
  ],
  "definitionJson": {
    "startStep": "finance",
    "entityStatusMap": { "finance": "Finans Müdürü İncelemesinde" },
    "steps": [
      {
        "key": "finance", "type": "approval", "name": "Uyuşmazlık Değerlendirmesi",
        "assignment": { "mode": "role", "roleId": 4 },
        "sla": { "dueHours": 24, "escalateAfterHours": 48, "onTimeout": "escalate" },
        "form": {
          "fields": [
            { "name": "Resolution", "dataType": "enum", "isRequired": true, "label": "Karar",
              "enumValues": "Accepted|Rejected|CreditNoteRequested" },
            { "name": "Comment",    "dataType": "string", "isRequired": true, "label": "Gerekçe" }
          ]
        },
        "onApprove": "", "onReject": ""
      }
    ]
  }
}
```

> ⚠️ Bu akış **`MatchStatus` alanının doğru doldurulmuş olmasına** bağlı — ve o alan 3-way
> matching'in çıktısı, yani platformda hesaplanmıyor (G-02). Akış teknik olarak kurulur ama
> **tetikleyicisi elle doldurulan bir alandır**.

---

## SLA ve eskalasyon politikası

| Süreç | Adım | `DueHours` | `EscalateAfter` | `OnTimeout` |
|---|---|---|---|---|
| PR-K1 | Departman Müdürü | 48 | 72 | `escalate` |
| PR-K2 | Departman Müdürü | 48 | 72 | `escalate` |
| PR-K2 | Satın Alma Müdürü | 48 | 96 | `escalate` |
| PR-K3 | Satın Alma Müdürü | 48 | 96 | `escalate` |
| PR-K3 | Finans Müdürü | 72 | 120 | `escalate` |
| PR-K4 | Satın Alma Müdürü | 24 | 48 | `escalate` |
| PR-K4 | Finans Müdürü | 48 | 72 | `escalate` |
| PR-K4 | Genel Müdür | 120 | 168 | `escalate` |
| SUPPLIER | her iki dal | 72 | 120 | `escalate` |
| SUPPLIER | Yönetim | 120 | 168 | `escalate` |
| PO | Satın Alma Müdürü | 24 | 48 | `escalate` |
| PO | Finans | 48 | 72 | `autoApprove` |
| INVOICE-EXC | Finans Müdürü | 24 | 48 | `escalate` |

### ⚠️ Eskalasyonun gerçekte ne yaptığı

`MarkEscalated` yalnızca `EscalatedAt` damgası ve bir olay kaydı yazar
(`WorkflowTaskManager.cs:157-180`). **Atama değişmez.** Bildirim alıcıları yine aynı kişi/roldür
(`WorkflowNotifyJobHandler.cs:148-175`).

Yani "eskalasyon" fiilen **aynı kişilere ikinci bir e-posta**dır. "Yöneticiye yükselt" kavramı
platformda yoktur ve bu tasarımın beklediği davranış budur. Gerçek eskalasyon G-03'ün (alan yazma)
ve organizasyonel atamanın birlikte çözülmesini gerektirir.

### ❌ Tespit edilen platform hatası: yalnız-eskalasyon SLA'sı taranmıyor

`DueHours` boş bırakılıp yalnız `EscalateAfterHours` verilen bir adımda **eskalasyon asla
tetiklenmez**:

- `ApplySla` `DueAt`'i yalnızca `DueHours > 0` ise yazıyor (`WorkflowCommandExecutor.cs:230-234`)
- `GetOverdue` filtresi `DueAt != null && DueAt <= now` (`EfWorkflowTaskDal.cs:45-57`)
- Ama doğrulayıcı yalnız-eskalasyon SLA'sını **kabul ediyor** (`WorkflowValidator.cs:175-194`) ve UI
  da üretebiliyor (`workflow-build.component.ts:56-66`)

Sessiz bir hata: kullanıcı SLA kurar, sistem kabul eder, hiçbir şey olmaz. Bu tasarımdaki tüm SLA'lar
**her iki alanı da** doldurur — hatadan kaçınmak için. Bulgu [18](18-teknik-zorluklar-ve-backlog.md)'de
raporlandı.

---

## Sürümleme

| Kural | Davranış |
|---|---|
| Taslak sürüm rezerve etmez | `Define` → `Version = 0` |
| Yalnız `Draft` güncellenebilir | `Published`/`Archived` değiştirilemez |
| Yayınlama | Aynı `Code`'un mevcut `Published` satırı `Archived`'e çekilir, yeni sürüm `max+1` |
| DB garantisi | Filtreli unique index `UX_WorkflowDefinition_PublishedCode` |
| Çalışan instance | `DefinitionId` ile **kendi sürümüne** bağlı kalır; arşivlenmiş tanım da okunur |
| Görev form şeması | Tanımdan **kopyalanır**, referans verilmez |

> ⚠️ **Yayınlanmış tanım düzenlenemez ve UI'da "yeni sürüm oluştur" düğmesi yok.** Kullanıcı aynı
> `Code` ile elle yeni bir taslak açmak zorunda. Ayrıca `Define`'da **Code benzersizlik kontrolü
> yok** (`Messages.WorkflowCodeInUse` tanımlı ama hiç kullanılmıyor) — aynı kodla iki taslak
> açılabilir. Edge case EC-08.

---

## Tetikleme mekanizması

```
Kullanici kaydi degistirir
   → EF SaveChangesInterceptor dinamik tipi yakalar     (AuditSaveChangesInterceptor.cs:157-170)
   → WorkflowOutbox satiri yazilir (cagiranin context'i, transaction'a katilir)
   → WorkflowWorker (10 sn periyot) outbox'i bosaltir
   → Added → onCreate, Modified → onUpdate
   → Model icin etkin+yayinli tanimlar taranir, kosullar degerlendirilir
   → ILK eslesen tanimda StartFromTrigger, DONGUDEN CIKILIR
```

| Not | Ayrıntı |
|---|---|
| `Deleted` değişiklik | Her zaman `Skipped` — silme akış başlatmaz **ve açık süreci iptal de etmez** |
| Yeniden deneme | 3 deneme sonrası `Failed` |
| Tur başına tavan | Tenant başına 200 outbox satırı |
| Tenant sürüm geçidi | `DatabaseVersion < 17` olan tenant **atlanır** |
| `StartFromTrigger` | **İzin kontrolü yapmaz** — otomasyon yolu |
| Elle başlatma | `POST /WorkflowInstance/start`; yetki = kayıt üzerinde `Update` izni veya admin |

> ❌ **Mutabakat taraması (Pass 3) yazılmamış.** Kod üç ayrı yerde "kaybolan tetiklemeyi mutabakat
> taraması yakalar" diyor (`WorkflowOutbox.cs:45-46`, `AuditSaveChangesInterceptor.cs:259, 309`);
> `IWorkflowOutboxDal.ExistsForEntity` tanımlı ve implemente edilmiş ama **hiçbir çağıranı yok**.
> Örtük transaction'da süreç çökerse tetikleme **sessizce kaybolur** ve telafi edilmez. Bulgu
> [18](18-teknik-zorluklar-ve-backlog.md)'de.

---

## Workflow özeti

| # | Kod | Model | Adım | Tip | Platform |
|---|---|---|---|---|---|
| WF-1 | `PR-ONAY-K1` | `PurchaseRequest` | 1 | approval | ✅ |
| WF-2 | `PR-ONAY-K2` | `PurchaseRequest` | 2 | approval ×2 | ✅ |
| WF-3 | `PR-ONAY-K3` | `PurchaseRequest` | 2 | approval ×2 | ✅ |
| WF-4 | `PR-ONAY-K4` | `PurchaseRequest` | 3 | approval ×3 | ✅ |
| WF-5 | `SUPPLIER-ONAY` | `Supplier` | 2 | parallel + approval | ✅ |
| WF-6 | `PO-ONAY` | `PurchaseOrder` | 2 | approval ×2 | ✅ |
| WF-7 | `INVOICE-EXCEPTION` | `SupplierInvoice` | 1 | approval | ⚠️ tetikleyici alanı elle |

**7/7 kurulabiliyor.** Onay akışları platformun **en iyi çalışan** parçası. Sorun akışların
kendisinde değil, **sonuçlarını iş verisine yazamamasında** (G-03).
