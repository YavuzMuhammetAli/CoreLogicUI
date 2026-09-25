# 01 · Ürün Genel Bakış

## Ürün

**CoreLogic Procurement** — orta ve büyük ölçekli bir şirketin satın alma ve tedarik zinciri
süreçlerini uçtan uca yöneten kurumsal uygulama.

Sistem, bir ihtiyacın ilk ifade edildiği andan (satın alma talebi) paranın tedarikçiye gittiği ana
(ödeme) kadar geçen tüm adımları tek bir veri modeli ve tek bir denetim izi üzerinde birleştirir.
Arada kalan her şey — tedarikçi onayı, teklif toplama, teklif karşılaştırma, çok kademeli yönetici
onayı, sipariş, kısmi teslimat, üç yönlü fatura eşleştirme, bütçe taahhüdü — aynı zincirin halkasıdır
ve birbirine veri olarak bağlıdır.

## Çözdüğü problem

Satın alma, bir şirkette **en çok parça sistemde dağılmış** süreçtir. Tipik durum:

- Talepler e-posta ve Excel'de dolaşır, onay zinciri e-posta cevaplarından ibarettir
- Teklifler PDF olarak gelir, karşılaştırma elle bir tabloya yazılır
- Sipariş ERP'de, irsaliye depoda, fatura muhasebede — üçü hiç yan yana gelmez
- Bütçe aşımı **ödeme anında** fark edilir, talep anında değil
- "Bu siparişi kim onayladı" sorusunun cevabı kimsede yoktur

Sonuç: kontrolsüz harcama, yanlış tedarikçi seçimi, çift ödeme, geç ödeme cezası ve denetimde
açıklanamayan kayıtlar.

Bu sistem, zincirin her halkasını bir öncekine **veri olarak bağlar** ve her durum değişikliğini
denetlenebilir kılar.

## Kapsam

### Kapsam içi

| Alan | İçerik |
|---|---|
| **Organizasyon** | Şirket, şube, departman, masraf merkezi, pozisyon, çalışan hiyerarşisi |
| **Tedarikçi yönetimi** | Kayıt, onay iş akışı, kategori, belge takibi, banka hesapları, performans puanlama, yaşam döngüsü |
| **Ürün/hizmet kataloğu** | SKU, kategori ağacı, marka, birim, çoklu tedarikçi, fiyat listeleri |
| **Satın alma talebi** | Kalemler, ekler, bütçe kontrolü, tutar bazlı çok kademeli onay |
| **Teklif süreci** | RFQ oluşturma, çoklu tedarikçiye gönderim, teklif toplama, ağırlıklı karşılaştırma, tedarikçi seçimi |
| **Sipariş** | Sipariş oluşturma, onay, tedarikçiye gönderim, revizyon, kapatma |
| **Teslimat** | Mal kabul, kısmi teslimat, kalite kontrol, ret ve iade |
| **Fatura** | Tedarikçi faturası, 3-way matching, uyuşmazlık yönetimi |
| **Ödeme** | Ödeme planlama, çoklu fatura dağıtımı, ödeme onayı, vade takibi |
| **Bütçe** | Dönem, departman/masraf merkezi bütçesi, taahhüt-gerçekleşme takibi |
| **Yatay** | Bildirim, ek yönetimi, denetim kaydı, raporlama, dashboard, RBAC |

### Kapsam dışı

Bunlar bilinçli olarak dışarıda bırakıldı — sistemin sınırını netleştirmek için yazılıyor:

- **Stok ve depo yönetimi.** Sistem mal kabulü kaydeder, stok bakiyesi tutmaz. `Product` üzerindeki
  `MinimumStock`/`MaximumStock` alanları referans değerdir, canlı bakiye değil.
- **Muhasebe entegrasyonu.** Fatura kaydedilir ve eşleştirilir; yevmiye kaydı, KDV beyannamesi ve
  mizan dışarıdadır.
- **Gerçek banka entegrasyonu.** Ödeme kaydı tutulur, EFT/havale dosyası üretilmez.
- **Tedarikçi portalı.** Tedarikçiler teklifi sisteme kendileri girmez; satın alma uzmanı girer.
  (`Supplier User` rolü tasarımda vardır, [03](03-roller-ve-yetki.md)'te neden bugün uygulanamadığı
  açıklanır.)
- **Sözleşme yönetimi.** Sözleşme bir ek belge olarak tutulur; madde bazlı sözleşme yönetimi,
  yenileme ve ceza hesabı yoktur.
- **İhale ve e-ihale.** RFQ davetli teklif toplamadır; açık ihale, eksiltme ve elektronik imza yoktur.

## Temel akış

```
İhtiyaç
  │
  ├─► PurchaseRequest ──► [Bütçe kontrolü] ──► [Tutar bazlı onay zinciri]
  │                                                      │
  │                                                      ▼
  ├─► Rfq ──► RfqSupplier (N tedarikçi) ──► SupplierQuotation (N teklif)
  │                                                      │
  │                                          QuotationComparison
  │                                                      │
  │                                            [Tedarikçi seçimi]
  │                                                      ▼
  ├─► PurchaseOrder ──► [Onay] ──► Tedarikçiye gönderim
  │                                                      │
  ├─► GoodsReceipt (1..N, kısmi teslimat)  ◄─────────────┘
  │                                                      │
  ├─► SupplierInvoice ──► [3-way matching] ──► InvoiceException?
  │                                                      │
  └─► Payment ──► PaymentAllocation ──► [Vade takibi]
```

Her ok bir **durum geçişi** ve genellikle bir **denetim kaydı**dır. Kalın parantezli adımlar
([Bütçe kontrolü], [3-way matching] gibi) iş kuralı gerektirir ve bugünkü CoreLogic'te
**karşılanamaz** — ayrıntı [14-is-kurallari.md](14-is-kurallari.md).

## Ölçek varsayımları

Tasarım şu büyüklüklere göre yapıldı. Bunlar aynı zamanda platform stres testinin hedefleridir.

| Boyut | Varsayım | Platform üzerindeki etkisi |
|---|---|---|
| Kullanıcı | 200-500 (eşzamanlı ~50) | Sorun beklenmiyor |
| Departman | 15-40 | Sorun beklenmiyor |
| Tedarikçi | 500-3.000 | ⚠️ Grid'de arama yok → tedarikçi bulmak imkânsızlaşır (G-06) |
| Ürün (SKU) | 5.000-50.000 | ❌ Lookup picker sunucu araması yapıyor (çalışır), ama liste ekranı kullanılamaz (G-06) |
| Talep / yıl | 3.000-10.000 | ⚠️ `getall` sayfasız çağrıda sınırsız satır döner |
| Sipariş / yıl | 2.000-8.000 | ⚠️ Aynı |
| Fatura / yıl | 5.000-20.000 | ⚠️ Aynı |
| Denetim kaydı / yıl | 500.000+ | ❌ Audit ekranı istemcide sayfalıyor — bu hacimde çöker |
| Entity sayısı | 50 | Publish hattı için asıl stres testi |

## Başarı ölçütleri

Bu ürün için değil — **platform testi için**. Uygulamanın kendisi hedef değil, ölçüm aracıdır.

1. **50 entity yayınlanabiliyor mu?** Tek Roslyn derlemesinde, kabul edilebilir sürede, bellek
   sızdırmadan.
2. **Belge zinciri kurulabiliyor mu?** 7 hop uzunluğundaki PR→Ödeme zinciri, derinlik sınırlarına
   takılmadan.
3. **Tutar kademeli onay kod yazmadan kurulabiliyor mu?** Dört eşik, dört farklı onay zinciri.
4. **Demo senaryosu uçtan uca koşuyor mu?** 20 laptop alımı, kısmi teslimat ve fatura uyuşmazlığı
   dahil.
5. **Nerede kod yazmak zorunda kaldık?** Her zorunluluk bir platform boşluğudur ve numaralanır.

Beşinci ölçüt asıl çıktıdır. İlk dördü geçse bile beşincinin listesi uzunsa, platform "dynamic
application platform" değil "dynamic database platform"dur.

## Terminoloji

Doküman boyunca kullanılan, karışması muhtemel terimler:

| Terim | Anlam |
|---|---|
| **Model** | CoreLogic'te kullanıcının tanımladığı dinamik entity (`PublishedTable`) |
| **Kolon / üye** | Modelin alanı (`PublishedTableMember`) |
| **Yayınlama (publish)** | Metadata'dan C# üretip derleyip tabloyu açan işlem |
| **Alt model** | `ParentTableId` ile bağlı çocuk model (Başlık → Kalem) |
| **Lookup** | Başka bir modele FK veren kolon tipi; kullanıcıya arama kutusu çıkar |
| **İlişki** | `RelationshipDefinition` — EF navigation üreten yeni mekanizma |
| **Belge** | İş dünyası terimi: talep, RFQ, teklif, sipariş, irsaliye, fatura, ödeme |
| **Boşluk (G-nn)** | Platformda eksik olan ve bu uygulamayı engelleyen yetenek |
