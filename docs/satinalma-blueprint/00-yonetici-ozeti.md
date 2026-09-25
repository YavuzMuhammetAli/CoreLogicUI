# 00 · Yönetici Özeti

> Tek sayfada: CoreLogic bu uygulamayı taşıyabilir mi, nerede kırılıyor, ne kadara düzelir.

> ✅ **Canlı doğrulama yapıldı (2026-09-22).** Tasarım kâğıtta kalmadı: temiz bir tenant'a
> **49 model yayınlandı** (73 tablo, 1.272 kolon, 206 FK), **7 workflow** tanımlandı ve tutar
> kademeli onay **uçtan uca koşturuldu**. Sonuçlar:
> [20-canli-dogrulama-sonuclari.md](20-canli-dogrulama-sonuclari.md).
>
> Koşu **5 yeni bulgu** çıkardı; ikisi (**H-10**, **G-14**) kod okumasıyla bulunamazdı.
> Bir hipotez de **yanlış çıktı**: publish süresinin model sayısıyla süper-lineer artacağını
> öngörmüştüm — artmadı, platform bu testi temiz geçti.
>
> 🔧 **Düzeltme turu tamamlandı — 2026-09-24.** Bulguların **9'u kapatıldı** (H-4, H-5, H-8,
> H-10, H-11, H-12, Ö-1, B-06, B-07, G-14); test kapsamı **120 → 153**. Kurulum süresi
> **~110 sn → 24,2 sn** ve hız sınırına artık takılmıyor. Ayrıntı:
> [20-canli-dogrulama-sonuclari.md](20-canli-dogrulama-sonuclari.md#-düzeltme-turu--2026-09-24).
> Backlog'un büyük kalemleri (G-02, G-03, G-04, G-05, G-07) **hâlâ açık** — aşağıdaki kapsam
> oranları onlara göre ve **değişmedi**.

---

## Verdict

**CoreLogic bu uygulamanın veri ve ekran katmanını bugün taşıyabilir; iş mantığı ve otomasyon
katmanını taşıyamaz.**

Platform "runtime'da entity tanımla → C# üret → derle → tablo aç → CRUD + form + grid + izin + audit
ver" zincirini gerçekten ve sağlamca çalıştırıyor. 50 entity'nin **50'si de** metadata olarak
tanımlanabiliyor ve yayınlanabiliyor. Sorun entity'lerin *varlığında* değil, aralarındaki
**kuralların** hiçbir yere yazılamamasında.

Somut haliyle: `PurchaseRequest` tablosu açılır, formu çıkar, izni işler, audit'i tutulur — ama
"talep numarası otomatik üretilsin", "satır toplamı miktar × fiyat olsun", "onaylanınca durumu
Approved'a çeksin", "bütçe yetmiyorsa engellesin", "vadesi yaklaşan faturayı hatırlatsın"
cümlelerinin **hiçbiri** platformda ifade edilemez. Bunların tamamı bugün ya elle yapılır ya da
CoreLogic'in dışında kod yazılarak.

Bu, platformun **Dynamic Data Platform** olarak başarılı, **Dynamic Application Platform** olarak
ise yarı yolda olduğu anlamına gelir.

---

## Kapsam oranı

Yüzdeler, her yetenek alanında bu uygulamanın ihtiyaç duyduğu maddelerin kaçının bugün
workaround'suz karşılandığını gösterir. Ayrıntı ve sayım her bölümün kendi dosyasında.

| Yetenek alanı | Kapsam | Değerlendirme |
|---|---|---|
| Entity / alan tanımı | **85%** | 17 veri tipi, enum, lookup, dosya. Eksik: unique, varsayılan değer, hesaplanan kolon, precision |
| İlişkiler | **80%** | Üç FK mekanizması çalışıyor. Derinlik sınırları lookup stratejisiyle aşılıyor |
| CRUD + dinamik form | **75%** | Ağaç kaydetme tek transaction, doğrulama şemadan türüyor. Eksik: çoklu dosya, textarea, alan gruplama |
| Dinamik grid | **45%** | Sunucu sayfalama var; **arama, filtre, sıralama yok** |
| Yetkilendirme | **65%** | Model bazlı RBAC + kişisel izin sağlam. **Alan seviyesi yok**, `Approve` izni yok |
| Audit | **70%** | EF interceptor ile otomatik ve kaçırmıyor. Eksik: onay/red eylemleri, kayıt bazlı görünüm |
| Workflow / onay | **55%** | Tutar kademeli onay kurulabiliyor. **İş alanı yazamıyor**, akış ortası dallanma yok |
| Raporlama | **40%** | Tek model, JOIN yok, parametre yok, lookup ham ID |
| Dashboard | **50%** | Çalışıyor ama **düzenlenemiyor**, filtre yok |
| Bildirim | **30%** | E-posta + webhook var. Şablon yok, in-app yok, tercih yok |
| İş kuralları | **25%** | Yalnız alan içi doğrulama. Kayıtlar/modeller arası kural yok |
| Zamanlanmış işler | **5%** | Altyapı tam, **yüzey yedeklemeye kilitli** |
| Dosya / ek yönetimi | **35%** | `file` kolonu var; satır içi, tek dosya, ad/MIME yok |

**Ağırlıklı ortalama: ~%58.** Ağırlıklandırma, [14-is-kurallari.md](14-is-kurallari.md)'daki 34 iş
kuralı ve [19-test-senaryolari.md](19-test-senaryolari.md)'daki 54 senaryonun alanlara dağılımına
göre yapılmıştır; yöntem [18](18-teknik-zorluklar-ve-backlog.md) sonunda açıktır.

---

## Kritik 10 boşluk

Öncelik, *bu uygulamada öldürdüğü senaryo sayısına* göredir — teknik zorluğa göre değil.

| # | Boşluk | Öldürdüğü | Büyüklük |
|---|---|---|---|
| **G-02** | Sunucu tarafı iş kuralı kancası yok | 3-way matching, bütçe kontrolü, **34 kuralın 30'u** | ●●●○ |
| **G-04** | Kullanıcı tanımlı zamanlanmış iş yok | 9 hatırlatma senaryosunun tamamı | ●●○○ |
| **G-01** | Otomatik numara, varsayılan değer, unique yok | Tüm belge numaraları, tekillik garantileri | ●●○○ |
| **G-03** | Workflow iş alanı yazamıyor | Durum otomasyonunun tamamı | ●○○○ |
| **G-07** | Rapor tek modelden çalışıyor | 12 raporun 4'ü tamamen, 8'i kısmen | ●●●● |
| **G-06** | Grid'de arama/filtre/sıralama yok | 10.000 satırlık listeler fiilen kullanılamaz | ●●○○ |
| **G-05** | Hesaplanan / rollup kolon yok | Satır toplamı, kalan miktar, belge toplamı | ●●○○ |
| **G-08** | Bildirim şablonu ve in-app bildirim yok | Bildirim tasarımının tamamı | ●●○○ |
| **G-09** | Alan seviyesi yetki yok | Maliyet gizleme, gizli kolon API'de açık | ●●○○ |
| **G-10** | Generic attachment yok | Belge yönetimi | ●●●○ |

**Büyüklük ölçeği:** ●○○○ birkaç gün · ●●○○ 1-2 hafta · ●●●○ 3-4 hafta · ●●●● 1 ay ve üzeri

Tam tanımlar, workaround'lar, kapatma önerileri ve dokunulacak dosyalar:
**[18-teknik-zorluklar-ve-backlog.md](18-teknik-zorluklar-ve-backlog.md)**

---

## En yüksek kaldıraçlı iki hamle

Backlog'un tamamı büyük. Ama ikisi, maliyetine göre orantısız getiri sağlıyor.

### 1. G-02 — İş kuralı motoru (`BusinessRule`)

`Business/Workflow/Engine/WorkflowCondition.cs` zaten **saf, DB'siz ve test edilmiş** bir koşul
değerlendiricisi. Kültür güvenliği çözülmüş (`IConvertible.ToDouble(InvariantCulture)`, satır
148-154), regresyon testleri var (`Tests/Business.Tests/Workflow/WorkflowConditionTests.cs`).

Bu değerlendiriciyi kayıt-kaydetme yoluna (`PublishedModelManager.Add/Update`) "kaydetmeyi reddet"
semantiğiyle takmak, 34 iş kuralının **11'ini ilk aşamada, kademeli olarak 30'unu** açar. Yeni bir dil, parser veya editör
gerekmiyor — mevcut koşul arayüzü (`workflow-build` tetikleyici sekmesi) neredeyse aynen
kullanılabilir.

**Eksik kalan:** çapraz-kayıt ve çapraz-model kurallar (3-way matching gibi). Onlar için
değerlendiriciye "ilişkili kayıtların toplamı" tipinde bir erişimci eklemek gerekir — ikinci adım.

### 2. G-04 — Genel amaçlı zamanlanmış iş (`tenant.rule-sweep`)

Scheduler altyapısı **tam**: cron ayrıştırma (`Core/Utilities/Scheduling/CronSchedule.cs`, dış paket
yok), kuyruk (`PlatformJob`), lease'li worker (`JobWorker`), retry/park, çalışma günlüğü. Eksik olan
tek şey **yüzey**: `ScheduledTask` satırı yazan yalnız iki yer var ve ikisi de sabit `JobType`
kullanıyor (`BackupSettingManager.cs:85-100`, `MigrationOrchestratorManager.cs:388-394`).

Tek bir `IPlatformJobHandler` — "şu modelde şu koşulu sağlayan kayıtlar için şu bildirimi gönder" —
ve `ScheduledTask` için bir CRUD ucu, **9 zamanlanmış senaryonun 9'unu birden** açar. Koşul kısmı
yine G-02'nin değerlendiricisidir; yani iki hamle aynı parçayı paylaşır.

> İkisi birlikte yapıldığında kapsam oranı **%58 → yaklaşık %80**'e çıkar. Tek başına en pahalı
> kalem olan G-07 (raporlama JOIN'i) bundan bağımsızdır ve ayrı planlanmalıdır.

---

## Platformun güçlü yanları

Boşluk listesi uzun olduğu için iyi çalışanı da kayda geçmek gerekir. Bunlar bu stres testinde
gerçekten sağlam çıktı:

- **Publish hattı disiplinli.** Tek Roslyn derlemesi, collectible `AssemblyLoadContext`, EF model
  cache invalidasyonu (`ModelVersion++`), hata durumunda bellek geri yükleme
  (`ModelDefinitionManager.cs:206-217`). Yarım kalmış durum bırakmıyor.
- **İlişki doğrulaması ciddi.** 16 ayrı kural (`Business/Concrete/Graph/Rules/`) — döngü, derinlik,
  cascade yolu (SQL Server 1785), navigation çakışması, dolu tabloda `Required`. Çoğu ticari düşük
  kod platformu bunları çalışma anında patlatır; CoreLogic publish'ten önce reddediyor.
- **Roslyn sandbox'ı gerçek.** `System.IO`/`Net`/`Reflection`/`Threading` yasak, `unsafe` yasak,
  method/ctor/field tanımı AST seviyesinde engelli (`DotNetCodeCompiler.cs:423-439`). Dinamik kod
  yürütme riskine ciddi yaklaşılmış.
- **Audit kaçırmıyor.** EF `SaveChangesInterceptor` tek boğaz noktası; `addTree` ve cascade silme
  dahil her yazma yolu oradan geçiyor.
- **Ağaç kaydetme iki fazlı.** Önce tüm ağaç DB'ye dokunmadan doğrulanır ve *tüm* hatalar birden
  döner, sonra tek transaction'da yazılır (`PublishedModelManager.cs:224-226`). FK'yı sunucu atar,
  istemciden geleni yok sayar.
- **Kültür hatası bir kez yaşanıp kalıcı kapatılmış.** `(500.00m).ToString()` tuzağı workflow koşul
  motorunda hem düzeltilmiş hem teste bağlanmış.

---

## Sonraki adım

Bu doküman bir **tasarım ve boşluk analizi**dir. [19-test-senaryolari.md](19-test-senaryolari.md)
içindeki 54 senaryo canlı bir tenant'ta koşturulur ve sonuçlar
[20-canli-dogrulama-sonuclari.md](20-canli-dogrulama-sonuclari.md)'ye **PASS / FAIL / BLOCKED (G-nn)**
olarak işlenir. Yukarıdaki yüzdeler o koşudan sonra kanıta bağlanır.
