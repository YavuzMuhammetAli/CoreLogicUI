# 15 · Edge Case'ler

**24 vaka.** Her biri için: senaryo, **olması gereken**, **bugün olan**.

---

## Eşzamanlılık

### EC-01 · İki onaycı aynı anda karar veriyor

İki departman müdürü aynı görevi aynı saniyede açıp biri onay, diğeri red veriyor.

**Olması gereken:** İlk işlenen kazanır, ikinciye "bu görev kapatıldı" denir.

**Bugün:** ✅ **Doğru çalışıyor.** Görev `Pending` değilse `CompleteInternal` reddediyor. Rol
havuzunda ilk karar veren kapatır. ⚠️ Ancak iki istek **tam olarak eşzamanlı** gelirse optimistic
concurrency token yok — teorik bir yarış penceresi var. Pratikte EF `SaveChanges` sırası kazanır.

### EC-02 · Aynı kayıtta iki süreç başlatılıyor

Kullanıcı kaydı hızlıca iki kez güncelliyor; iki outbox satırı oluşuyor.

**Bugün:** ✅ `GetActiveForEntity` kontrolü ikinciyi engelliyor. Tek aktif instance garantili.

⚠️ Ama süreç **bittikten sonra** yapılan bir güncelleme yeni bir instance başlatır — terminal
instance engel değil. Onaylanmış bir talep düzenlenirse onay süreci **baştan koşar**. Kayıt
kilitleme olmadığı için (BR-01) bu her zaman mümkün.

### EC-03 · İki kullanıcı aynı kaydı düzenliyor

**Olması gereken:** İkincisi "kayıt değişti" uyarısı alır.

**Bugün:** ❌ **Son yazan kazanır.** Optimistic concurrency yok — `RowVersion`/`Timestamp` kolonu
yok. İki finans uzmanı aynı faturayı düzenlerse biri sessizce diğerinin değişikliğini siler.
Audit'te iki `Modified` satırı görünür ama kimse fark etmez.

> Bu, platformun **dokümante edilmemiş** bir eksiği. `DbBaseObject`'e bir `RowVersion` kolonu ve
> `Update`'te kontrol eklenmesi göreli olarak küçük bir iş (G-14).

---

## Workflow

### EC-04 · Süreç başladıktan sonra tutar değişiyor

9.000 TL'lik talep `PR-ONAY-K1` (departman müdürü) akışını başlatıyor. Kullanıcı sonra tutarı
400.000 TL yapıyor.

**Olması gereken:** Süreç iptal edilip `PR-ONAY-K4` başlamalı, veya tutar kilitlenmeli.

**Bugün:** ❌ **Akış değişmez.** Koşullar yalnız tetikleme anında değerlendirilir
(`WorkflowWorker.cs:287-295`). Departman müdürü 400.000 TL'lik talebi onaylar. Kayıt kilitleme de
yok.

**Kapanma:** G-02 (Submitted sonrası düzenlemeyi reddet) — tek başına yeterli.

### EC-05 · Tutar alanı elle düşürülüyor

Kullanıcı API'yi doğrudan çağırıp `TotalAmountTry = 1` yazıyor.

**Bugün:** ❌ Onay kademesi atlanır. `TotalAmountTry` istemci tarafından yazılıyor (G-05) ve
sunucuda doğrulanmıyor (G-02). **Gerçek bir yetki yükseltme açığı.** Test T-31.

### EC-06 · Onaycının yetkisi kaldırılıyor

Kullanıcı `Purchasing Manager` rolünden çıkarılıyor ama üzerinde açık görev var.

**Bugün:** ⚠️ İki katmanlı sorun:
1. Görev `AssignedRoleId` üzerinden hâlâ o role bağlı. Kullanıcı artık üye olmadığı için
   `IsAssignedTo` `false` döner → **kapatamaz**.
2. Rolde başka üye yoksa görev **kalıcı olarak takılır**. Tek çıkış: admin'in `reassign` veya
   `skip` etmesi.
3. ⚠️ Yetki değişiklikleri **yeni JWT oturumunda** etkinleşir — mevcut oturumu boyunca onaylamaya
   devam edebilir.

### EC-07 · Görev kimseye atanamıyor

`assignment.mode = "creator"` ama kaydın `CreatedBy`'ı çözülemiyor (kullanıcı silinmiş).

**Bugün:** ⚠️ `creator` çözülemezse `instance.StartedBy`'a düşer; o da yoksa görev **atamasız**
kalır ve `IsAssignedTo` herkese `false` döner (`WorkflowTaskManager.cs:388-390`). Görev
kapatılamaz; yalnız admin `skip` edebilir.

### EC-08 · Workflow sürümü değişiyor

`PR-ONAY-K2` yeni sürümü yayınlanıyor; eski sürümde 30 açık instance var.

**Bugün:** ✅ **Doğru çalışıyor.** Instance `DefinitionId` ile **kendi sürümüne** bağlı kalır;
arşivlenmiş tanım `GetAllIgnoringActiveFilter` ile okunmaya devam eder. Görev form şeması da
tanımdan **kopyalanmış** olduğu için değişmez. Açık süreçler eski kurallarla tamamlanır — doğru
semantik.

⚠️ Ancak: yayınlanmış tanım düzenlenemez ve UI'da "yeni sürüm oluştur" düğmesi yok; kullanıcı aynı
`Code` ile elle taslak açmak zorunda. Üstelik `Define`'da **Code benzersizlik kontrolü yok** —
aynı kodla iki taslak açılabilir ve hangisinin yayınlanacağı karışır.

### EC-09 · Tüm tutar kademeleri kaçırılıyor

Talep tutarı boş (`null`) bırakılıyor.

**Bugün:** ⚠️ `TryToDouble` `null`'ı sayı saymaz, metne düşer; `lt 10000` karşılaştırması **false**
döner. Hiçbir kademe eşleşmez → **hiçbir akış başlamaz**. Talep `Submitted` durumunda sonsuza kadar
bekler ve kimse haberdar olmaz.

**Olması gereken:** `TotalAmountTry` zorunlu olduğu için boş kaydedilememeli — ama `IsRequired`
SQL'de NOT NULL üretmiyor (G-01) ve API doğrudan çağrılırsa boş geçer.

> **Tavsiye:** Beşinci bir "yakalama" (catch-all) workflow tanımı — tetikleyici yalnız
> `Status eq Submitted`, kademesiz, genel müdür onayına giden. Ama ❌ **bu da çalışmaz**: kademeli
> tanımlarla kesişir ve ilk eşleşen rastgele seçilir. Koşul dilinde `isnull` operatörü olmadığı
> için bu vaka **kapatılamıyor**.

### EC-10 · Paralel dalın biri reddediyor

Tedarikçi onayında ticari onaylıyor, mali reddediyor.

**Bugün:** ✅ **Doğru çalışıyor.** Herhangi bir dal reddederse join beklenmez; kalan dal görevleri
**iptal edilir** ve `onAnyReject`'e gidilir (`WorkflowStateMachine.cs:161-172`). Doğru semantik.

### EC-11 · Yalnız-eskalasyon SLA'sı kuruluyor

Kullanıcı `DueHours` boş, `EscalateAfterHours = 48` giriyor.

**Bugün:** ❌ **Sessiz hata.** Doğrulayıcı kabul ediyor, UI üretebiliyor, ama `DueAt` yazılmadığı
için `GetOverdue` taraması bu görevi **hiç görmüyor**. Eskalasyon asla tetiklenmez ve kullanıcı
nedenini anlayamaz. Bulgu [18](18-teknik-zorluklar-ve-backlog.md)'de.

### EC-12 · Yetkisiz kullanıcı onay yapıyor

Bir çalışana geçici olarak bir onay görevi atanıyor; `PurchaseRequest` üzerinde `Read` izni yok.

**Bugün:** ⚠️ **Onaylayabilir.** `WorkflowTaskController.complete` yalnız `[Authorize]` taşıyor,
yetki atamayla belirleniyor. Kullanıcı onayladığı kaydı **göremez** ama kararı verebilir. Tasarım
gereği mi hata mı, tartışmalı — ama satın alma bağlamında kabul edilemez.

### EC-13 · Tetikleme kayboluyor

Kayıt bir örtük transaction içinde güncelleniyor, süreç yazma sırasında çöküyor.

**Bugün:** ❌ Outbox satırı çağıranın context'iyle yazıldığı için rollback'te geri alınır — bu
**doğru**. Ama süreç, satır yazıldıktan sonra worker onu işlemeden çökerse, satır `Pending` kalır ve
worker yeniden alır → ✅.

**Gerçek boşluk:** 3 deneme sonrası `Failed` damgalanan satırlar **hiç telafi edilmez**. Kod üç
yerde "mutabakat taraması yakalar" diyor ama **Pass 3 yazılmamış** — `ExistsForEntity` implemente
edilmiş, hiçbir çağıranı yok. Tetikleme sessizce kaybolur.

---

## Veri ve referans bütünlüğü

### EC-14 · Tedarikçi süreç ortasında pasifleşiyor

RFQ gönderilmiş, teklif beklenirken tedarikçi `Blacklisted` yapılıyor.

**Olması gereken:** Uyarı verilmeli; teklifi seçilememeli.

**Bugün:** ❌ Hiçbir şey olmaz. Teklif girilebilir, seçilebilir, sipariş açılabilir (G-02).

### EC-15 · Ürün silinmiş, sipariş kalemi ona referans veriyor

**Bugün:** ⚠️ Soft-delete olduğu için SQL FK devreye girmez; satır `Active = 0` kalır. Sipariş
kalemi geçerli görünür ama `lookupOptions` o ürünü artık döndürmez → **detay ekranında ürün alanı
boş görünür**, veritabanında dolu. Kullanıcı kaydı düzenleyip kaydederse ürün referansı **kalıcı
olarak kaybolabilir**.

⚠️ Bu yüzden tasarımda her lookup'ın yanına denormalize ad kolonu konuldu (`ProductName`) — ürün
silinse bile adı kayıtta kalır. G-07 için yapılan denormalizasyonun **beklenmeyen ikinci faydası**.

### EC-16 · Silinen kullanıcı kayıt üretmiş

**Bugün:** ✅ **Platform koruyor.** `CreatedBy`/`LastModifiedBy` FK'ları nedeniyle kayıt üretmiş
kullanıcı **kalıcı silinemez**; FK ihlali yakalanır, transaction geri alınır ve kullanıcı
pasifleştirmeye yönlendirilir. Denetim izi bozulmaz.

### EC-17 · Aynı kolon iki kez ekleniyor

Admin `AddMember`'ı aynı adla iki kez çağırıyor (API'den veya çift tıklama).

**Bugün:** ❌ **Engellenmemiş.** `PublishedTableManager.AddMember` duplicate kontrolü yapmıyor.
Üretilen C#'ta iki aynı adlı property olur → **CS0102 ile publish kırılır**. 50 modellik bir
kurulumda gerçek bir risk. Test T-27.

### EC-18 · Rezerve kolon adı kullanılıyor

Kullanıcı `Active` veya `CreatedBy` adında bir kolon tanımlıyor.

**Bugün:** ❌ **Engellenmemiş.** `DbBaseObjectColumns.All` rezerve ad listesi **yalnız ilişki
property'lerinde** kontrol ediliyor (`RelationshipRuleHelpers.cs:16`); `PublishedTableMemberValidator`
ona hiç bakmıyor. Üretilen sınıf taban property'yi gölgeler (CS0108 = uyarı, derleme geçer) ama
`CreateSqlScript` aynı kolonu **iki kez** yazar → `CREATE TABLE` patlar.

### EC-19 · Kolon silinip aynı adla farklı tiple ekleniyor

`Quantity` (decimal) siliniyor → publish → `Quantity` (string) ekleniyor → publish.

**Bugün:** ❌ **Tip kontrolü bypass ediliyor.** `DetectTypeChanges` eski tipi artık görmüyor
(snapshot'tan düştü), `CheckDb` kolonu **ada göre** var sayıyor ve `ALTER` üretmiyor. Sonuç:
**C# tipi `string`, SQL kolonu `decimal`** — çalışma anında dönüşüm hataları.

### EC-20 · Uzun metin 250 karakteri aşıyor

Kullanıcı sipariş notuna 400 karakter yazıyor.

**Bugün:** ⚠️ `MaxLength = 400` tanımlanmışsa uygulama doğrulaması **geçer** (çünkü `MaxLength`
uygulama katmanında kontrol ediliyor), ama SQL kolonu `nvarchar(250)` olduğu için **SQL hatası**
alınır. Kullanıcıya anlamsız bir veritabanı hatası döner.

**Tasarım önlemi:** Hiçbir alanda `MaxLength > 250` tanımlanmadı. Uzun metin ihtiyacı olan alanlar
(`Description`, `Terms`, `Notes`) **250 ile sınırlı** kabul edildi — gerçek bir işlevsellik kaybı.

---

## Ölçek ve performans

### EC-21 · Alt sekmede 5.000 kalem var

Büyük bir çerçeve sipariş açılıyor.

**Bugün:** ❌ Alt model sekmelerinde **sayfalama yok** — `getAll(typeName, fkColumn, recordId)`
paramsız çağrılıyor. 5.000 satır tek seferde gelir ve tarayıcı kilitlenir.

### EC-22 · 100 kayıt toplu siliniyor

**Bugün:** ⚠️ **100 ayrı HTTP isteği** (`forkJoin`). Sunucuda toplu silme ucu yok. Kısmi başarı
destekli (silinemeyenler seçili kalır) ama ağ yükü ve transaction bütünlüğü sorunlu — 60 silinip 40
başarısız olursa sistem tutarsız bir ara durumda kalır.

### EC-23 · Denetim kaydı ekranı açılıyor

3 yıllık sistemde `/audit-logs`.

**Bugün:** ❌ Backend **tüm kayıtları** döndürüyor, UI istemcide sayfalıyor. ~4 milyon satır →
ekran açılmaz. Test T-40.

### EC-24 · 50 model art arda yayınlanıyor

**Bugün:** ⚠️ Her publish tek Roslyn derlemesi + collectible ALC unload. `MergePublishBatch`
ilişkili karşı tarafları da yeniden derliyor, yani 18 dalga sonunda bazı modeller onlarca kez
derlenmiş olur. Derleme süresi ve bellek davranışı **bilinmiyor** — test T-47…T-50 bunu ölçecek.

---

## Özet

| Kategori | Vaka | ✅ doğru | ⚠️ kısmi | ❌ hatalı |
|---|---|---|---|---|
| Eşzamanlılık | 3 | 2 | 0 | 1 |
| Workflow | 10 | 3 | 3 | 4 |
| Veri bütünlüğü | 6 | 1 | 2 | 3 |
| Ölçek | 5 | 0 | 2 | 3 |
| **Toplam** | **24** | **6** | **7** | **11** |

### Platformun iyi savunduğu 6 vaka

EC-01 (eşzamanlı onay), EC-02 (çift süreç), EC-08 (sürüm değişimi), EC-10 (paralel red),
EC-13 (transaction'lı outbox), EC-16 (silinmiş kullanıcı FK koruması).

Hepsinin ortak özelliği: **workflow motoru ve publish hattı içinde** olmaları. Bu iki bileşen
dikkatle yazılmış ve edge case'leri düşünülmüş.

### En tehlikeli 4 vaka

| # | Vaka | Neden |
|---|---|---|
| **EC-05** | Tutar düşürülerek onay kademesi atlanıyor | **Yetki yükseltme açığı** |
| **EC-03** | Son yazan kazanır — sessiz veri kaybı | Kimse fark etmez |
| **EC-09** | Tutar boşsa hiçbir akış başlamaz | Talep sessizce kaybolur |
| **EC-19** | Kolon tipi kontrolü bypass ediliyor | Şema/veri tutarsızlığı |

Dördü de **sessiz** — sistem hata vermiyor, yanlış çalışıyor. Memory notundaki "uçtan uca test beş
sessiz hata yakaladı" deneyimiyle aynı sınıf. Bu yüzden Faz 2 canlı doğrulaması bu blueprint'in
ayrılmaz parçası.
