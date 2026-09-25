# Kurumsal Satın Alma ve Tedarik Yönetim Sistemi — CoreLogic Blueprint

Bu klasör, CoreLogic platformu üzerinde kurulacak tam ölçekli bir **kurumsal satın alma ve tedarik
yönetim sistemi**nin tasarımını içerir. İkinci ve asıl amacı, bu tasarımı bir **stres testi** olarak
kullanıp CoreLogic'in "Dynamic Enterprise Application Platform" iddiasını kanıtla sınamaktır.

> **Not — klasör konumu.** Doküman platform geneli (backend + UI) hakkındadır, ancak `CoreLogicUI`
> repo'suna yazılmıştır. Backend karşılığı `C:\Users\muham\source\repos\YavuzMuhammetAli\CoreLogic`
> ayrı bir repo'dur ve bu iş kapsamında **değiştirilmemiştir**.

---

## Nasıl okunur

Aceleniz varsa **[00-yonetici-ozeti.md](00-yonetici-ozeti.md)** tek başına yeterlidir: verdict,
kapsam oranı ve en kritik 10 platform boşluğu orada.

| Okur | Okuma sırası |
|---|---|
| **Ürün sahibi** | 00 → 01 → 02 → 07 → 16 |
| **Platform backend ekibi** | 00 → 17 → 18 → 06 → 19 → 20 |
| **Platform UI ekibi** | 00 → 13 → 18 → 05 |
| **Uygulamayı kuracak konsültan** | 04 → 05 → 08 → 14 → seed/ |

---

## İçindekiler

| # | Dosya | İçerik |
|---|---|---|
| — | [00-yonetici-ozeti.md](00-yonetici-ozeti.md) | **Verdict** + kapsam oranı + kritik 10 boşluk |
| 1 | [01-urun-genel-bakis.md](01-urun-genel-bakis.md) | Ürün tanımı, kapsam, kapsam dışı, başarı ölçütleri |
| 2 | [02-moduller.md](02-moduller.md) | 13 modül, bağımlılık haritası, modüller arası veri akışı |
| 3 | [03-roller-ve-yetki.md](03-roller-ve-yetki.md) | 10 rol, izin matrisi, RBAC eşlemesi, alan seviyesi yetki analizi |
| 4 | [04-entity-listesi.md](04-entity-listesi.md) | **50 entity**, alan alan: tip · zorunlu · varsayılan · doğrulama · ilişki · unique |
| 5 | [05-entity-iliskileri.md](05-entity-iliskileri.md) | Metinsel ER diyagramı, derinlik stratejisi, üç FK mekanizmasının kullanımı |
| 6 | [06-veritabani-tasarimi.md](06-veritabani-tasarimi.md) | Üretilecek gerçek DDL, index'ler, constraint'ler, platform kolonları |
| 7 | [07-is-surecleri.md](07-is-surecleri.md) | 9 uçtan uca iş süreci, durum makineleri, sorumluluk devirleri |
| 8 | [08-workflow-tasarimi.md](08-workflow-tasarimi.md) | 7 workflow tanımı, gerçek `DefinitionJson` gövdeleri, tutar kademeleri |
| 9 | [09-scheduler-tasarimi.md](09-scheduler-tasarimi.md) | 9 zamanlanmış iş, tetikleyici · koşul · aksiyon · bildirim eşlemesi |
| 10 | [10-bildirim-tasarimi.md](10-bildirim-tasarimi.md) | Kanallar, 24 şablon, yer tutucu sözlüğü, tercih yönetimi |
| 11 | [11-audit.md](11-audit.md) | Denetim kapsamı, hangi eylem nerede loglanır, uyum gereksinimleri |
| 12 | [12-api-tasarimi.md](12-api-tasarimi.md) | REST yüzeyi: platformun verdiği + uygulamanın ihtiyaç duyduğu |
| 13 | [13-ui-ux-tasarimi.md](13-ui-ux-tasarimi.md) | 28 ekran, detay sayfa anatomisi, dinamik UI'ın yettiği/yetmediği yerler |
| 14 | [14-is-kurallari.md](14-is-kurallari.md) | **34 iş kuralı**, her biri uygulanabilirlik işaretli |
| 15 | [15-edge-cases.md](15-edge-cases.md) | **24 edge case**, beklenen sistem davranışı ve bugünkü gerçek davranış |
| 16 | [16-demo-senaryosu.md](16-demo-senaryosu.md) | Uçtan uca demo: 20 laptop alımı, adım adım oluşan kayıtlar |
| 17 | [17-dinamik-model-mimarisi.md](17-dinamik-model-mimarisi.md) | Runtime entity yaratmanın 11 adımı, gerçek kod yollarıyla |
| 18 | [18-teknik-zorluklar-ve-backlog.md](18-teknik-zorluklar-ve-backlog.md) | **Platform boşlukları G-01…G-10** + ikincil bulgular + hatalar |
| 19 | [19-test-senaryolari.md](19-test-senaryolari.md) | **54 test senaryosu**: Precondition · Action · Expected Result |
| 20 | [20-canli-dogrulama-sonuclari.md](20-canli-dogrulama-sonuclari.md) | Canlı tenant'ta koşturulan testlerin gerçek sonuçları |
| — | [seed/](seed/) | Makine-okunur şema (`*.json`) + tekrarlanabilir kurulum script'i |

---

## İşaretleme lejantı

Her entity, alan, iş kuralı, workflow adımı ve rapor maddesi bu üç işaretten birini taşır. İşaret,
**bugünkü CoreLogic** ile (2026-09-22 itibarıyla) o maddenin kurulabilirliğini gösterir.

| İşaret | Anlam |
|---|---|
| ✅ | Bugünkü CoreLogic ile doğrudan kurulabilir, workaround gerekmez |
| ⚠️ | Kurulabilir, ama bedeli var — denormalizasyon, elle veri girişi, kaybedilen doğrulama. Bedel her zaman yazılır |
| ❌ | Platform işi yapılmadan kurulamaz. Hangi boşluğun (**G-nn**) öldürdüğü yazılır |

Boşluk numaraları (`G-01` … `G-10`) tüm dokümanlarda **aynı** anlama gelir ve tanımları
[18-teknik-zorluklar-ve-backlog.md](18-teknik-zorluklar-ve-backlog.md) içindedir.

---

## Adlandırma konvansiyonu

CoreLogic model ve kolon adları `^[A-Za-z][A-Za-z0-9_]*$` deseniyle sınırlıdır
(`Core/Utilities/SqlIdentifier.cs:26`) — **Türkçe karakter kullanılamaz**, çünkü ad hem C# property
adı hem SQL kolon adı olur.

Bu yüzden:

- **Model ve kolon adları İngilizce**: `PurchaseRequest`, `RequestNumber`, `GrandTotal`
- **Ekranda görünen etiketler Türkçe**, `PublishedTableMember.Label` alanı üzerinden:
  `RequestNumber` → "Talep No"
- **Doküman dili Türkçe** (proje konvansiyonu)

Mevcut `wftest01` fixture'ındaki `SatinalmaTalebi` gibi ASCII'leştirilmiş Türkçe adlar
(`SatinAlmaTalebiKalemi`) tercih edilmedi — okunurluğu düşük ve tutarsız ASCII'leştirme riski taşıyor.

---

## Bu dokümanın kanıt standardı

Her ❌ ve ⚠️ işareti, en az bir **`dosya:satır`** referansıyla desteklenir. Referanslar iki repo'ya
işaret eder:

| Önek | Repo |
|---|---|
| `Business/`, `Core/`, `Entities/`, `DataAccess/`, `CreateDLL/`, `migrations/`, `Tests/` | Backend — `…\YavuzMuhammetAli\CoreLogic` |
| `src/app/` | Tenant UI — `C:\CoreLogic\CoreLogicUI` |

Referanslar 2026-09-22 tarihli kod okumasına dayanır. Platform hızlı geliştiriliyor; bir referans
tutmuyorsa önce kodu doğrulayın.
