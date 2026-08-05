import { Translations } from './translations.model';

/**
 * Veri tipi / kural yardım sistemi — sütun popup'ındaki "i" butonları,
 * alan etiketlerindeki ipucu baloncukları ve `<app-datatype-help>` kılavuz
 * diyaloğu (17 veri tipi, alt modeller, ilişkiler ve 5 ilişki tipi).
 *
 * Yapı için bkz. `components/shared/datatype-help/datatype-help.data.ts`.
 */
export const DATATYPE_HELP_I18N: Translations = {

  // ── Diyalog çerçevesi ──────────────────────────────────────────────────────
  'help.dialogAria':      { tr: 'Veri tipi kılavuzu', en: 'Data type guide' },
  'help.close':           { tr: 'Kapat', en: 'Close' },
  'help.openTypeHelp':    { tr: 'Bu veri tipi hakkında', en: 'About this data type' },
  'help.openRelHelp':     { tr: 'Bu ilişki tipi hakkında', en: 'About this relationship type' },
  'help.howItWorks':      { tr: 'Nasıl çalışır?', en: 'How does it work?' },
  'help.sectionSummary':  { tr: 'Ne işe yarar?', en: 'What is it for?' },
  'help.sectionUseCases': { tr: 'Tipik kullanım', en: 'Typical use' },
  'help.sectionDiagram':  { tr: 'Şema', en: 'Diagram' },
  'help.sectionRules':    { tr: 'Kural alanları', en: 'Rule fields' },
  'help.sectionSamples':  { tr: 'Örnekler', en: 'Examples' },
  'help.sectionNotes':    { tr: 'Dikkat', en: 'Caution' },
  'help.noRules':         { tr: 'Bu tip ek kural alanı almaz — yalnızca "Boş bırakılabilir" seçeneği geçerlidir.', en: 'This type takes no extra rule fields — only the "Nullable" option applies.' },
  'help.colValue':        { tr: 'Değer', en: 'Value' },
  'help.colVerdict':      { tr: 'Durum', en: 'Status' },
  'help.colNote':         { tr: 'Not', en: 'Note' },
  'help.valid':           { tr: 'Geçerli', en: 'Valid' },
  'help.invalid':         { tr: 'Geçersiz', en: 'Invalid' },

  'help.fallback.title':   { tr: 'Bu alan hakkında', en: 'About this field' },
  'help.fallback.summary': { tr: 'Bu tip için henüz ayrıntılı kılavuz yazılmadı. Alan etiketlerindeki "i" baloncuklarına bakabilirsiniz.', en: 'No detailed guide has been written for this type yet. See the "i" bubbles next to the field labels.' },

  // ══ VERİ TİPLERİ ═══════════════════════════════════════════════════════════

  // ── String ─────────────────────────────────────────────────────────────────
  'help.type.string.title':    { tr: 'String — metin', en: 'String — text' },
  'help.type.string.summary':  { tr: 'Serbest metin saklar: ad, açıklama, kod, e-posta, telefon. Uzunluk sınırı ve regex deseni ile hangi metinlerin kabul edileceğini siz belirlersiniz.', en: 'Stores free text: names, descriptions, codes, e-mail, phone. You decide which text is accepted via length limits and a regex pattern.' },
  'help.type.string.useCase1': { tr: 'Ürün adı, müşteri unvanı, adres gibi serbest metinler', en: 'Free text such as product name, customer title, address' },
  'help.type.string.useCase2': { tr: 'Belirli bir kalıba uyması gereken kodlar (plaka, TCKN, IBAN) — regex ile', en: 'Codes that must match a pattern (plate, national ID, IBAN) — via regex' },
  'help.type.string.useCase3': { tr: 'Başında sıfır olan sayılar (posta kodu, telefon) — sayısal tip bu sıfırları kaybeder', en: 'Numbers with leading zeros (postal code, phone) — numeric types lose those zeros' },
  'help.type.string.sample1':  { tr: 'Uzunluk ve desen kurallarına uyan normal bir metin', en: 'Ordinary text that satisfies the length and pattern rules' },
  'help.type.string.sample2':  { tr: 'E-posta regex\'i tanımlıysa reddedilir — alan adı eksik', en: 'Rejected if an e-mail regex is defined — the domain part is missing' },
  'help.type.string.sample3':  { tr: 'Yalnızca boşluk: MinLength kontrolünü geçebilir, bu yüzden regex ile de sınırlayın', en: 'Whitespace only: it can pass MinLength, so constrain it with a regex too' },
  'help.type.string.notes':    { tr: 'MaxLength boş bırakılırsa kolon çok geniş açılır ve indekslenemez. Metin arama/filtreleme yapacağınız kolonlarda mutlaka bir MaxLength verin.', en: 'If MaxLength is empty the column is created very wide and cannot be indexed. Always set a MaxLength on columns you will search or filter.' },

  // ── Int ────────────────────────────────────────────────────────────────────
  'help.type.int.title':    { tr: 'Int — tam sayı', en: 'Int — integer' },
  'help.type.int.summary':  { tr: 'Ondalıksız tam sayı. Aralık: -2.147.483.648 ile 2.147.483.647. Günlük sayımların neredeyse tamamı için doğru seçimdir.', en: 'Whole number without decimals. Range: -2,147,483,648 to 2,147,483,647. The right choice for nearly all everyday counts.' },
  'help.type.int.useCase1': { tr: 'Stok adedi, sipariş miktarı, puan, yaş', en: 'Stock quantity, order amount, score, age' },
  'help.type.int.useCase2': { tr: 'Sıra numarası, versiyon, tekrar sayısı', en: 'Sequence number, version, repeat count' },
  'help.type.int.sample1':  { tr: 'Aralık içinde geçerli bir değer', en: 'A valid value within range' },
  'help.type.int.sample2':  { tr: 'Int sınırını aşar — bu değer için Long kullanın', en: 'Exceeds the Int limit — use Long for this value' },
  'help.type.int.sample3':  { tr: 'Ondalık kabul etmez — Decimal veya Double kullanın', en: 'Decimals are not accepted — use Decimal or Double' },
  'help.type.int.notes':    { tr: 'Başında sıfır olan "sayılar" (0212, 03495) Int olarak saklanırsa sıfırlar kaybolur. Böyle alanlar için String + regex kullanın.', en: 'Values with leading zeros (0212, 03495) lose those zeros when stored as Int. Use String + regex for such fields.' },

  // ── Long ───────────────────────────────────────────────────────────────────
  'help.type.long.title':    { tr: 'Long — büyük tam sayı', en: 'Long — big integer' },
  'help.type.long.summary':  { tr: 'Int\'in sığmadığı çok büyük tam sayılar için. Aralık yaklaşık ±9,22 katrilyon (±9.223.372.036.854.775.807).', en: 'For very large whole numbers that do not fit in Int. Range roughly ±9.22 quintillion (±9,223,372,036,854,775,807).' },
  'help.type.long.useCase1': { tr: 'Dış sistemden gelen büyük kimlik numaraları', en: 'Large identifiers coming from external systems' },
  'help.type.long.useCase2': { tr: 'Bayt cinsinden dosya boyutu, milisaniye zaman damgası', en: 'File size in bytes, millisecond timestamps' },
  'help.type.long.sample1':  { tr: 'Long aralığında rahatça saklanır', en: 'Comfortably stored within the Long range' },
  'help.type.long.sample2':  { tr: 'Bilimsel gösterim kabul edilmez — düz rakam girilmeli', en: 'Scientific notation is not accepted — enter plain digits' },
  'help.type.long.sample3':  { tr: 'Ondalık kabul etmez — Decimal kullanın', en: 'Decimals are not accepted — use Decimal' },
  'help.type.long.notes':    { tr: 'Long, Int\'in iki katı yer kaplar. Değerleriniz 2 milyarı geçmiyorsa Int tercih edin.', en: 'Long takes twice the space of Int. Prefer Int if your values stay under 2 billion.' },

  // ── Short ──────────────────────────────────────────────────────────────────
  'help.type.short.title':    { tr: 'Short — küçük tam sayı', en: 'Short — small integer' },
  'help.type.short.summary':  { tr: 'Dar aralıklı tam sayı: -32.768 ile 32.767. Yerden tasarruf sağlar ama sınırı hızlı dolar.', en: 'Narrow-range integer: -32,768 to 32,767. Saves space but the limit fills up fast.' },
  'help.type.short.useCase1': { tr: 'Yıl, hafta numarası, küçük ölçekli sayaçlar', en: 'Year, week number, small-scale counters' },
  'help.type.short.useCase2': { tr: 'Sabit ve dar bir aralıkta kalacağı kesin olan değerler', en: 'Values that are certain to stay in a fixed, narrow range' },
  'help.type.short.sample1':  { tr: 'Aralık içinde geçerli', en: 'Valid within range' },
  'help.type.short.sample2':  { tr: 'Short sınırını (32.767) aşar', en: 'Exceeds the Short limit (32,767)' },
  'help.type.short.sample3':  { tr: 'Ondalık kabul etmez', en: 'Decimals are not accepted' },
  'help.type.short.notes':    { tr: 'Kazanılan yer modern veritabanlarında ihmal edilebilir; ileride büyüme ihtimali varsa Int seçin.', en: 'The space saved is negligible on modern databases; choose Int if the value might grow later.' },

  // ── Byte ───────────────────────────────────────────────────────────────────
  'help.type.byte.title':    { tr: 'Byte — 0-255 arası sayı', en: 'Byte — number 0-255' },
  'help.type.byte.summary':  { tr: 'Yalnızca 0 ile 255 arasında, negatif olmayan tam sayı saklar.', en: 'Stores a non-negative whole number between 0 and 255 only.' },
  'help.type.byte.useCase1': { tr: 'Yüzde değeri, yıldız/puan (1-5), küçük durum kodu', en: 'Percentage, star rating (1-5), small status code' },
  'help.type.byte.useCase2': { tr: 'Renk bileşeni, öncelik seviyesi', en: 'Colour component, priority level' },
  'help.type.byte.sample1':  { tr: '0-255 aralığında geçerli', en: 'Valid within the 0-255 range' },
  'help.type.byte.sample2':  { tr: '255 üstü kabul edilmez', en: 'Values above 255 are rejected' },
  'help.type.byte.sample3':  { tr: 'Ondalık kabul etmez', en: 'Decimals are not accepted' },
  'help.type.byte.notes':    { tr: 'Byte negatif değer alamaz. Eksi değer ihtimali varsa Short veya Int kullanın.', en: 'Byte cannot hold negative values. Use Short or Int if negatives are possible.' },

  // ── Decimal ────────────────────────────────────────────────────────────────
  'help.type.decimal.title':    { tr: 'Decimal — hassas ondalık', en: 'Decimal — precise decimal' },
  'help.type.decimal.summary':  { tr: 'Ondalık sayıları yuvarlama hatası olmadan saklar. Para, oran ve muhasebe değerleri için tek doğru tiptir.', en: 'Stores decimals without rounding error. The only correct type for money, rates and accounting values.' },
  'help.type.decimal.useCase1': { tr: 'Fiyat, tutar, KDV, indirim oranı', en: 'Price, amount, VAT, discount rate' },
  'help.type.decimal.useCase2': { tr: 'Toplamı tutması gereken her sayısal alan', en: 'Any numeric field whose totals must add up exactly' },
  'help.type.decimal.useCase3': { tr: 'Ağırlık, uzunluk gibi ölçüm değerleri', en: 'Measurements such as weight and length' },
  'help.type.decimal.sample1':  { tr: 'Kuruş hassasiyeti korunur', en: 'Cent-level precision is preserved' },
  'help.type.decimal.sample2':  { tr: 'Decimal\'de toplama tam olarak beklendiği gibi çıkar', en: 'With Decimal the sum comes out exactly as expected' },
  'help.type.decimal.sample3':  { tr: 'Binlik ayracı ve virgül kabul edilmez — ondalık ayracı nokta olmalı', en: 'Thousand separators and commas are not accepted — the decimal separator must be a dot' },
  'help.type.decimal.notes':    { tr: 'Para tutan bir alanı asla Double veya Float yapmayın; 0.1 + 0.2 işlemi bile hatalı sonuç verir.', en: 'Never use Double or Float for a money field; even 0.1 + 0.2 produces a wrong result.' },

  // ── Double ─────────────────────────────────────────────────────────────────
  'help.type.double.title':    { tr: 'Double — kayan noktalı sayı', en: 'Double — floating point number' },
  'help.type.double.summary':  { tr: 'Çok geniş aralıkta ondalık sayı saklar ama değeri yaklaşık tutar — küçük yuvarlama hataları oluşur.', en: 'Stores decimals over a very wide range but approximately — small rounding errors occur.' },
  'help.type.double.useCase1': { tr: 'Sıcaklık, koordinat, bilimsel ölçüm', en: 'Temperature, coordinates, scientific measurement' },
  'help.type.double.useCase2': { tr: 'Kesin toplam gerektirmeyen istatistik/ortalama değerleri', en: 'Statistics and averages that need no exact totals' },
  'help.type.double.sample1':  { tr: 'Ölçüm değeri olarak uygundur', en: 'Suitable as a measurement value' },
  'help.type.double.sample2':  { tr: 'Kayan nokta yuvarlama hatası — bu yüzden para için kullanılmaz', en: 'Floating point rounding error — this is why it is not used for money' },
  'help.type.double.sample3':  { tr: 'Fiyat gibi görünse de Decimal kullanılmalı', en: 'Looks like a price, but Decimal should be used' },
  'help.type.double.notes':    { tr: 'Double alanları eşitlik (=) ile karşılaştırmak güvenilir değildir; raporlarda aralık filtresi kullanın.', en: 'Comparing Double fields with equality (=) is unreliable; use range filters in reports.' },

  // ── Float ──────────────────────────────────────────────────────────────────
  'help.type.float.title':    { tr: 'Float — düşük hassasiyetli ondalık', en: 'Float — low precision decimal' },
  'help.type.float.summary':  { tr: 'Double\'ın yarısı kadar yer kaplayan, yaklaşık 7 anlamlı basamak tutabilen ondalık tip.', en: 'A decimal type taking half the space of Double, holding about 7 significant digits.' },
  'help.type.float.useCase1': { tr: 'Hassasiyeti önemsiz, çok sayıda kaydedilen sensör verisi', en: 'High-volume sensor data where precision does not matter' },
  'help.type.float.useCase2': { tr: 'Yaklaşık oran/katsayı değerleri', en: 'Approximate ratios and coefficients' },
  'help.type.float.sample1':  { tr: '7 basamak sınırı içinde sorunsuz', en: 'Fine within the 7-digit limit' },
  'help.type.float.sample2':  { tr: '7 anlamlı basamağı aşar — değer sessizce bozulur', en: 'Exceeds 7 significant digits — the value is silently corrupted' },
  'help.type.float.sample3':  { tr: 'Para değeri — Decimal kullanılmalı', en: 'A money value — Decimal should be used' },
  'help.type.float.notes':    { tr: 'Emin değilseniz Float yerine Double, para söz konusuysa Decimal seçin.', en: 'When in doubt choose Double over Float, and Decimal whenever money is involved.' },

  // ── Bool ───────────────────────────────────────────────────────────────────
  'help.type.boolean.title':    { tr: 'Bool — evet/hayır', en: 'Bool — yes/no' },
  'help.type.boolean.summary':  { tr: 'Yalnızca iki değer alır: doğru (true) veya yanlış (false). Formda onay kutusu olarak görünür.', en: 'Takes only two values: true or false. Rendered as a checkbox in the form.' },
  'help.type.boolean.useCase1': { tr: 'Aktif mi, onaylandı mı, arşivlendi mi', en: 'Is active, is approved, is archived' },
  'help.type.boolean.useCase2': { tr: 'Varsayılan seçim, öne çıkarma bayrağı', en: 'Default selection, featured flag' },
  'help.type.boolean.useCase3': { tr: 'E-posta bildirimi açık/kapalı gibi tercihler', en: 'Preferences such as e-mail notifications on/off' },
  'help.type.boolean.sample1':  { tr: 'Kabul edilen iki değer', en: 'The two accepted values' },
  'help.type.boolean.sample2':  { tr: '"Boş bırakılabilir" işaretliyse üçüncü bir durum doğar — onay kutusu belirsizleşir', en: 'If "Nullable" is checked a third state appears — the checkbox becomes ambiguous' },
  'help.type.boolean.sample3':  { tr: 'İkiden fazla durum gerekiyorsa Enum kullanın', en: 'If you need more than two states, use Enum' },
  'help.type.boolean.notes':    { tr: 'Bool alanlarda "Boş bırakılabilir" seçeneğini işaretlemeyin; üç durumlu bir onay kutusu kullanıcıyı yanıltır.', en: 'Do not check "Nullable" on Bool fields; a three-state checkbox confuses users.' },

  // ── DateTime ───────────────────────────────────────────────────────────────
  'help.type.datetime.title':    { tr: 'DateTime — tarih ve saat', en: 'DateTime — date and time' },
  'help.type.datetime.summary':  { tr: 'Tarihi ve saati birlikte saklar. Bir olayın tam olarak ne zaman gerçekleştiğini kaydetmek için kullanılır.', en: 'Stores date and time together. Used to record exactly when an event happened.' },
  'help.type.datetime.useCase1': { tr: 'Sipariş zamanı, giriş/çıkış kaydı, işlem anı', en: 'Order time, check-in/out record, transaction moment' },
  'help.type.datetime.useCase2': { tr: 'Randevu ve toplantı başlangıcı', en: 'Appointment and meeting start' },
  'help.type.datetime.useCase3': { tr: 'Son güncelleme zamanı', en: 'Last modification time' },
  'help.type.datetime.sample1':  { tr: 'ISO 8601 — tercih edilen giriş biçimi', en: 'ISO 8601 — the preferred input format' },
  'help.type.datetime.sample2':  { tr: 'Saat verilmezse gün başı (00:00) varsayılır', en: 'If no time is given, the start of day (00:00) is assumed' },
  'help.type.datetime.sample3':  { tr: 'Tarihsiz saat kabul edilmez — TimeOnly kullanın', en: 'A time without a date is not accepted — use TimeOnly' },
  'help.type.datetime.notes':    { tr: 'Saat bilgisine ihtiyacınız yoksa DateOnly seçin; aksi halde "01.08.2026" ile "01.08.2026 09:15" farklı kabul edilir ve tarih filtreleri şaşırır.', en: 'Choose DateOnly if you do not need the time; otherwise "01.08.2026" and "01.08.2026 09:15" differ and date filters go wrong.' },

  // ── DateOnly ───────────────────────────────────────────────────────────────
  'help.type.dateonly.title':    { tr: 'DateOnly — yalnızca tarih', en: 'DateOnly — date only' },
  'help.type.dateonly.summary':  { tr: 'Saat bilgisi olmadan yalnızca gün/ay/yıl saklar.', en: 'Stores day/month/year only, without any time part.' },
  'help.type.dateonly.useCase1': { tr: 'Doğum tarihi, fatura tarihi, son kullanma tarihi', en: 'Birth date, invoice date, expiry date' },
  'help.type.dateonly.useCase2': { tr: 'İzin başlangıç/bitiş günü', en: 'Leave start/end day' },
  'help.type.dateonly.useCase3': { tr: 'Sözleşme yürürlük tarihi', en: 'Contract effective date' },
  'help.type.dateonly.sample1':  { tr: 'Geçerli tarih', en: 'A valid date' },
  'help.type.dateonly.sample2':  { tr: 'Saat kısmı yok sayılır — bilgi kaybı olur', en: 'The time part is ignored — information is lost' },
  'help.type.dateonly.sample3':  { tr: 'Takvimde olmayan gün reddedilir', en: 'A day that does not exist in the calendar is rejected' },
  'help.type.dateonly.notes':    { tr: 'DateOnly saat dilimi taşımaz — bu, doğum tarihi gibi alanlarda istenen davranıştır.', en: 'DateOnly carries no time zone — which is exactly what you want for fields like birth dates.' },

  // ── TimeOnly ───────────────────────────────────────────────────────────────
  'help.type.timeonly.title':    { tr: 'TimeOnly — yalnızca saat', en: 'TimeOnly — time only' },
  'help.type.timeonly.summary':  { tr: 'Tarihten bağımsız olarak günün bir saatini saklar.', en: 'Stores a time of day independent of any date.' },
  'help.type.timeonly.useCase1': { tr: 'Mesai başlangıcı/bitişi, mağaza açılış saati', en: 'Shift start/end, store opening hour' },
  'help.type.timeonly.useCase2': { tr: 'Günlük hatırlatma saati', en: 'Daily reminder time' },
  'help.type.timeonly.sample1':  { tr: 'Saat:dakika biçimi geçerli', en: 'Hour:minute format is valid' },
  'help.type.timeonly.sample2':  { tr: 'Saniye de verilebilir', en: 'Seconds may also be supplied' },
  'help.type.timeonly.sample3':  { tr: '24 saat sınırı aşılamaz', en: 'The 24-hour limit cannot be exceeded' },
  'help.type.timeonly.notes':    { tr: 'Süre (örn. "2 saat 30 dakika") saklamak için TimeOnly kullanmayın; süreyi dakika cinsinden Int olarak tutun.', en: 'Do not use TimeOnly to store a duration (e.g. "2h 30m"); keep durations as Int in minutes.' },

  // ── Guid ───────────────────────────────────────────────────────────────────
  'help.type.guid.title':    { tr: 'Guid — benzersiz kimlik', en: 'Guid — unique identifier' },
  'help.type.guid.summary':  { tr: 'Dünya çapında tekrarlanmayacak 36 karakterlik bir kimlik değeri saklar.', en: 'Stores a 36-character identifier that will not repeat anywhere in the world.' },
  'help.type.guid.useCase1': { tr: 'Dış sistemlerle paylaşılan kayıt kimliği', en: 'Record identifier shared with external systems' },
  'help.type.guid.useCase2': { tr: 'Tahmin edilemez olması gereken bağlantı anahtarları', en: 'Link keys that must be unguessable' },
  'help.type.guid.useCase3': { tr: 'Çevrimdışı üretilip sonra senkronlanan kayıtlar', en: 'Records created offline and synchronised later' },
  'help.type.guid.sample1':  { tr: 'Standart Guid biçimi', en: 'Standard Guid format' },
  'help.type.guid.sample2':  { tr: 'Boş Guid — değer atanmamış demektir, kimlik olarak kullanmayın', en: 'Empty Guid — means no value was assigned; do not use it as an identity' },
  'help.type.guid.sample3':  { tr: 'Eksik/kısa değer kabul edilmez', en: 'A short or incomplete value is rejected' },
  'help.type.guid.notes':    { tr: 'Kaydın kendi birincil anahtarı zaten otomatik üretilir; Guid alanını yalnızca dış sistemle eşleşme gerektiğinde ekleyin.', en: 'The record already gets its own primary key automatically; add a Guid field only when you must match an external system.' },

  // ── Lookup ─────────────────────────────────────────────────────────────────
  'help.type.lookup.title':    { tr: 'Lookup — başka modelden seçim', en: 'Lookup — pick from another model' },
  'help.type.lookup.summary':  { tr: 'Bu sütunu başka bir modelin kaydına bağlar. Formda serbest metin yerine açılır liste görünür; veritabanında bir yabancı anahtar (FK) oluşur.', en: 'Links this column to a record of another model. The form shows a dropdown instead of free text, and a foreign key (FK) is created in the database.' },
  'help.type.lookup.useCase1': { tr: 'Ürünün kategorisi, siparişin müşterisi, kaydın şehri', en: 'A product\'s category, an order\'s customer, a record\'s city' },
  'help.type.lookup.useCase2': { tr: 'Sık değişen ama sonlu bir listeden seçim (Enum yerine)', en: 'Selection from a finite list that changes often (instead of Enum)' },
  'help.type.lookup.useCase3': { tr: 'Seçenek listesinin ayrı bir ekrandan yönetilmesi gerektiğinde', en: 'When the option list must be managed from its own screen' },
  'help.type.lookup.sample1':  { tr: 'Hedef model + kullanıcıya gösterilecek anlamlı kolon', en: 'Target model plus a meaningful column to show the user' },
  'help.type.lookup.sample2':  { tr: 'Gösterilecek kolon olarak ID seçilirse listede sayılar görünür', en: 'Choosing ID as the display column makes the list show bare numbers' },
  'help.type.lookup.sample3':  { tr: 'Gösterilecek kolon boş bırakılırsa liste anlamsız görünür', en: 'Leaving the display column empty makes the list unreadable' },
  'help.type.lookup.notes':    { tr: 'Lookup, "İlişkiler" sekmesindeki ilişkilerden bağımsız çalışır: FK adı kolonun kendi adıdır (FK_{tablo}_{kolon}). Karşı modelde ters bir liste (navigation) oluşturmaz — buna ihtiyacınız varsa ilişki tanımlayın.', en: 'Lookup works independently of the Relationships tab: the FK is named after the column itself (FK_{table}_{column}). It creates no reverse collection on the target model — define a relationship if you need one.' },

  // ── Enum ───────────────────────────────────────────────────────────────────
  'help.type.enum.title':    { tr: 'Enum — sabit seçenek listesi', en: 'Enum — fixed option list' },
  'help.type.enum.summary':  { tr: 'Önceden belirlediğiniz sabit seçeneklerden birini saklar. Seçenekler dikey çizgi ile ayrılarak yazılır.', en: 'Stores one of a fixed set of options you define up front. Options are written separated by a vertical bar.' },
  'help.type.enum.useCase1': { tr: 'Sipariş durumu: Beklemede | Onaylandi | Iptal', en: 'Order status: Pending | Approved | Cancelled' },
  'help.type.enum.useCase2': { tr: 'Öncelik: Dusuk | Orta | Yuksek', en: 'Priority: Low | Medium | High' },
  'help.type.enum.useCase3': { tr: 'Nadiren değişen, kod tarafında da anlamlı olan durumlar', en: 'States that rarely change and are meaningful in code as well' },
  'help.type.enum.sample1':  { tr: 'Doğru biçim — ayraç dikey çizgi, boşluk yok', en: 'Correct format — vertical bar separator, no spaces' },
  'help.type.enum.sample2':  { tr: 'Virgül ayracı kabul edilmez', en: 'Comma separators are not accepted' },
  'help.type.enum.sample3':  { tr: 'Türkçe karakter ve boşluk kullanmayın — seçenek adı kod adı olarak da üretilir', en: 'Avoid non-ASCII characters and spaces — the option name is also generated as a code identifier' },
  'help.type.enum.notes':    { tr: 'Seçenek listesi ileride sık değişecekse Enum yerine Lookup kullanın: Enum değiştirmek modelin yeniden derlenmesini gerektirir, Lookup listesi ise ekrandan yönetilir.', en: 'If the option list will change often, use Lookup instead of Enum: changing an Enum requires recompiling the model, while a Lookup list is managed from a screen.' },

  // ── Image ──────────────────────────────────────────────────────────────────
  'help.type.image.title':    { tr: 'Image — görsel', en: 'Image — picture' },
  'help.type.image.summary':  { tr: 'Bir görsel yüklenmesini sağlar. Görselin kendisi dosya olarak saklanır, kolonda dosyanın yolu tutulur.', en: 'Lets a picture be uploaded. The image itself is stored as a file; the column keeps the file path.' },
  'help.type.image.useCase1': { tr: 'Ürün fotoğrafı, profil resmi, logo', en: 'Product photo, profile picture, logo' },
  'help.type.image.useCase2': { tr: 'Kayıt listesinde küçük önizleme gösterilmesi gereken alanlar', en: 'Fields that need a thumbnail preview in the record list' },
  'help.type.image.sample1':  { tr: 'Desteklenen görsel biçimi', en: 'A supported image format' },
  'help.type.image.sample2':  { tr: 'Görsel olmayan dosya — bunun için File tipini kullanın', en: 'A non-image file — use the File type for this' },
  'help.type.image.sample3':  { tr: 'Çok büyük görseller listelerin yavaşlamasına yol açar', en: 'Very large images slow down list screens' },
  'help.type.image.notes':    { tr: 'Aynı görselin birden çok kayıtta kullanılması gerekiyorsa görselleri ayrı bir modelde tutup Lookup ile bağlayın.', en: 'If the same picture must be reused across records, keep images in a separate model and link them with Lookup.' },

  // ── File ───────────────────────────────────────────────────────────────────
  'help.type.file.title':    { tr: 'File — dosya eki', en: 'File — attachment' },
  'help.type.file.summary':  { tr: 'Herhangi bir dosyanın kayda eklenmesini sağlar. Kolonda dosyanın yolu saklanır.', en: 'Lets any file be attached to the record. The column stores the file path.' },
  'help.type.file.useCase1': { tr: 'Sözleşme, fatura PDF\'i, teknik doküman', en: 'Contract, invoice PDF, technical document' },
  'help.type.file.useCase2': { tr: 'Kayda iliştirilen tek bir ek belge', en: 'A single supporting document attached to the record' },
  'help.type.file.sample1':  { tr: 'Tipik bir belge eki', en: 'A typical document attachment' },
  'help.type.file.sample2':  { tr: 'Çalıştırılabilir dosyalar güvenlik nedeniyle önerilmez', en: 'Executable files are discouraged for security reasons' },
  'help.type.file.sample3':  { tr: 'Çok büyük dosyalar yükleme zaman aşımına yol açabilir', en: 'Very large files can cause upload timeouts' },
  'help.type.file.notes':    { tr: 'Bir kayda birden fazla dosya eklenecekse tek bir File kolonu yeterli değildir — dosyalar için bir alt model açın.', en: 'One File column is not enough when a record needs several attachments — create a sub-model for the files.' },

  // ══ KURAL ALANLARI ═════════════════════════════════════════════════════════

  'help.rule.minLength.label': { tr: 'MinLength — en az karakter', en: 'MinLength — minimum characters' },
  'help.rule.minLength.desc':  { tr: 'Metnin en az kaç karakter olacağını belirler. Boş bırakılırsa alt sınır uygulanmaz. Zorunlu bir alanın gerçekten dolu gelmesini garantilemek için 1 veya daha büyük bir değer verin.', en: 'Sets the minimum number of characters. Leave empty for no lower bound. Use 1 or more to guarantee a required field actually arrives filled.' },

  'help.rule.maxLength.label': { tr: 'MaxLength — en fazla karakter', en: 'MaxLength — maximum characters' },
  'help.rule.maxLength.desc':  { tr: 'Metnin en fazla kaç karakter olacağını belirler ve veritabanındaki kolon genişliğini bu değer belirler. Boş bırakılırsa kolon sınırsız açılır ve indekslenemez.', en: 'Sets the maximum number of characters and determines the column width in the database. Left empty, the column is created unbounded and cannot be indexed.' },

  'help.rule.regex.label': { tr: 'Regex Deseni', en: 'Regex Pattern' },
  'help.rule.regex.desc':  { tr: 'Metnin uyması gereken kalıbı tanımlar — e-posta, telefon, plaka gibi biçimleri zorunlu kılar. Aşağıdaki hazır desenlerden birini seçebilir veya kendi deseninizi canlı test kutusunda deneyebilirsiniz.', en: 'Defines the pattern the text must match — enforcing formats such as e-mail, phone or plate. Pick one of the ready-made patterns below or try your own in the live test box.' },

  'help.rule.regexMessage.label': { tr: 'Regex Mesajı', en: 'Regex Message' },
  'help.rule.regexMessage.desc':  { tr: 'Desen tutmadığında kullanıcıya gösterilecek hata metni. Boş bırakılırsa genel bir hata mesajı çıkar ve kullanıcı neyi yanlış yazdığını anlamaz — her zaman doldurun.', en: 'The error text shown when the pattern does not match. If left empty a generic error appears and the user cannot tell what went wrong — always fill it in.' },

  'help.rule.min.label': { tr: 'Min — en küçük değer', en: 'Min — minimum value' },
  'help.rule.min.desc':  { tr: 'Girilebilecek en küçük sayıyı belirler. Negatif değerlerin anlamsız olduğu alanlarda (adet, fiyat, yaş) 0 verin.', en: 'Sets the smallest number that can be entered. Use 0 for fields where negatives are meaningless (quantity, price, age).' },

  'help.rule.max.label': { tr: 'Max — en büyük değer', en: 'Max — maximum value' },
  'help.rule.max.desc':  { tr: 'Girilebilecek en büyük sayıyı belirler. Veri tipinin kendi sınırından (örn. Int için 2.147.483.647) daha büyük bir değer veremezsiniz.', en: 'Sets the largest number that can be entered. It cannot exceed the type\'s own limit (e.g. 2,147,483,647 for Int).' },

  'help.rule.enumValues.label': { tr: 'İzinli Değerler', en: 'Allowed Values' },
  'help.rule.enumValues.desc':  { tr: 'Seçenekleri dikey çizgi ile ayırarak yazın: Beklemede|Onaylandi|Iptal. Boşluk bırakmayın ve Türkçe karakter kullanmayın — bu adlar kod tarafında da üretilir.', en: 'Write the options separated by a vertical bar: Pending|Approved|Cancelled. Use no spaces and no non-ASCII characters — these names are generated in code as well.' },

  'help.rule.lookupTarget.label': { tr: 'Hedef Model', en: 'Target Model' },
  'help.rule.lookupTarget.desc':  { tr: 'Bu sütunun bağlanacağı model. Açılır listede yalnızca bu modelin kayıtları görünür ve veritabanında bu tabloya bir yabancı anahtar oluşur.', en: 'The model this column links to. The dropdown shows only that model\'s records, and a foreign key to that table is created in the database.' },

  'help.rule.lookupDisplayColumn.label': { tr: 'Gösterilecek Kolon', en: 'Display Column' },
  'help.rule.lookupDisplayColumn.desc':  { tr: 'Açılır listede kullanıcıya hangi kolonun görüneceği. Ad/unvan gibi anlamlı bir kolon seçin — ID seçerseniz kullanıcı yalnızca sayı görür.', en: 'Which column the user sees in the dropdown. Pick something meaningful like a name — choosing ID shows the user bare numbers.' },

  'help.rule.subModelName.label': { tr: 'Alt Model Adı', en: 'Sub-model Name' },
  'help.rule.subModelName.desc':  { tr: 'Büyük harfle başlayan, boşluksuz bir ad verin (OrderItem gibi). Bu ad hem sınıf hem tablo adı olarak kullanılır.', en: 'Give a capitalised, space-free name (such as OrderItem). It is used as both the class and the table name.' },

  'help.rule.subModelDepth.label': { tr: 'Derinlik Sınırı', en: 'Depth Limit' },
  'help.rule.subModelDepth.desc':  { tr: 'Alt model ağacı en fazla 4 seviye olabilir (kök = 1). Sınıra ulaşıldığında "Yeni Alt Model" butonu kilitlenir.', en: 'The sub-model tree can be at most 4 levels deep (root = 1). The "New Sub-model" button locks once the limit is reached.' },

  'help.rule.mechanismTree.label': { tr: '1. Alt model ağacı', en: '1. Sub-model tree' },
  'help.rule.mechanismTree.desc':  { tr: 'Alt Modeller sekmesinden kurulur. Alt kayıt üst kayda aittir ve üstün detay ekranında listelenir. FK adı: FK_{tablo}_{üstModel}.', en: 'Built from the Sub-models tab. The child belongs to the parent and is listed on the parent\'s detail screen. FK name: FK_{table}_{parent}.' },

  'help.rule.mechanismLookup.label': { tr: '2. Lookup kolonu', en: '2. Lookup column' },
  'help.rule.mechanismLookup.desc':  { tr: 'Sütun tipini "Lookup" seçerek kurulur. Tek yönlüdür: bu kayıt hedefi işaret eder, hedefte ters bir liste oluşmaz. FK adı: FK_{tablo}_{kolon}.', en: 'Built by choosing the "Lookup" column type. It is one-way: this record points at the target, and no reverse collection appears on the target. FK name: FK_{table}_{column}.' },

  'help.rule.mechanismRelationship.label': { tr: '3. İlişki (bu sekme)', en: '3. Relationship (this tab)' },
  'help.rule.mechanismRelationship.desc':  { tr: 'Çift yönlü navigation property üretir ve karşı modeli de yeniden derler. Çoka-çok ilişkiyi yalnızca bu mekanizma destekler. FK adı: FK_{tablo}_{kolon}_Rel.', en: 'Generates navigation properties on both sides and recompiles the target model too. Only this mechanism supports many-to-many. FK name: FK_{table}_{column}_Rel.' },

  // ══ İLİŞKİ ALANLARI ════════════════════════════════════════════════════════

  'help.relField.target.label': { tr: 'Hedef Model', en: 'Target Model' },
  'help.relField.target.desc':  { tr: 'İlişki kurulacak model. Yalnızca YAYINLANMIŞ modeller önerilir — taslak bir model hedef seçilemez.', en: 'The model to relate to. Only PUBLISHED models are suggested — a draft model cannot be a target.' },

  'help.relField.property.label': { tr: 'Property Adı', en: 'Property Name' },
  'help.relField.property.desc':  { tr: 'Bu modelde oluşacak navigation property\'nin adı. Tekil taraf için tekil (Customer), çoklu taraf için çoğul (Orders) ad verin.', en: 'The name of the navigation property created on this model. Use singular for the one side (Customer) and plural for the many side (Orders).' },

  'help.relField.inverse.label': { tr: 'Ters Property', en: 'Inverse Property' },
  'help.relField.inverse.desc':  { tr: 'Karşı modelde oluşacak property\'nin adı — böylece ilişki iki yönden de gezilebilir. OneToMany ve ManyToMany için zorunludur.', en: 'The property created on the target model, so the relationship can be traversed from both sides. Required for OneToMany and ManyToMany.' },

  'help.relField.foreignKey.label': { tr: 'FK Adı', en: 'FK Name' },
  'help.relField.foreignKey.desc':  { tr: 'Yabancı anahtar kolonunun adı. Boş bırakılırsa property adından türetilir (Customer → CustomerId). Constraint adı _Rel ile biter, böylece alt model ve lookup FK\'larıyla çakışmaz.', en: 'The foreign key column name. Left empty it is derived from the property name (Customer → CustomerId). The constraint name ends with _Rel so it never collides with sub-model or lookup FKs.' },

  'help.relField.joinTable.label': { tr: 'Join Tablo Adı', en: 'Join Table Name' },
  'help.relField.joinTable.desc':  { tr: 'Çoka-çok ilişkide iki tarafı bağlayan ara tablonun adı. Boş bırakılırsa iki model adının birleşiminden üretilir (ProductTag).', en: 'The name of the bridge table connecting both sides of a many-to-many relationship. Left empty it is generated from the two model names (ProductTag).' },

  'help.relField.required.label': { tr: 'Zorunlu', en: 'Required' },
  'help.relField.required.desc':  { tr: 'İşaretlenirse FK kolonu NOT NULL olur — ilişkisiz kayıt oluşturulamaz. İçinde kayıt bulunan bir tabloya zorunlu FK eklenemez; önce alanı doldurun veya opsiyonel bırakın.', en: 'When checked the FK column becomes NOT NULL — records cannot exist without the relation. A required FK cannot be added to a table that already has rows; fill the field first or leave it optional.' },

  'help.relField.cascade.label': { tr: 'Cascade Delete', en: 'Cascade Delete' },
  'help.relField.cascade.desc':  { tr: 'İşaretlenirse üst kayıt silindiğinde bağlı kayıtlar da silinir. Bunu yalnızca bağlı kaydın tek başına anlamsız olduğu durumlarda açın — aksi halde veri sessizce kaybolur.', en: 'When checked, deleting the parent deletes the related records too. Enable this only when the related record is meaningless on its own — otherwise data disappears silently.' },

  'help.relField.order.label': { tr: 'Sıra', en: 'Order' },
  'help.relField.order.desc':  { tr: 'Bu ilişkinin listedeki ve üretilen kodda görüneceği sıra. Yalnızca görsel düzeni etkiler.', en: 'Where this relationship appears in the list and in the generated code. Affects presentation only.' },

  'help.relField.displayName.label': { tr: 'Görünen Ad', en: 'Display Name' },
  'help.relField.displayName.desc':  { tr: 'İlişkinin ekranlarda gösterilecek insan-dostu adı. Boş bırakılırsa property adı kullanılır.', en: 'The human-friendly name shown on screens. Left empty, the property name is used.' },

  // ══ ALT MODELLER ═══════════════════════════════════════════════════════════

  'help.subModels.title':    { tr: 'Alt Modeller', en: 'Sub-models' },
  'help.subModels.summary':  { tr: 'Bir kayda ait satırları ayrı bir modelde tutar. Alt model kayıtları üst kaydın detay ekranında sekme olarak listelenir ve üst kayıt olmadan tek başına anlam taşımaz.', en: 'Keeps the rows belonging to a record in a separate model. Sub-model records are listed as a tab on the parent\'s detail screen and mean nothing on their own.' },
  'help.subModels.useCase1': { tr: 'Sipariş → Sipariş Kalemleri', en: 'Order → Order Items' },
  'help.subModels.useCase2': { tr: 'Fatura → Fatura Satırları', en: 'Invoice → Invoice Lines' },
  'help.subModels.useCase3': { tr: 'Kayıt → Ekler / Notlar', en: 'Record → Attachments / Notes' },
  'help.type.subModels.sample1': { tr: 'Klasik ana-detay yapısı — en yaygın kullanım', en: 'The classic master-detail structure — the most common use' },
  'help.type.subModels.sample2': { tr: 'Dört seviye sınırın tam kenarı; daha derini eklenemez', en: 'Exactly at the four-level limit; nothing deeper can be added' },
  'help.type.subModels.sample3': { tr: 'Derinlik sınırı aşılır — "Yeni Alt Model" butonu kilitlenir', en: 'Exceeds the depth limit — the "New Sub-model" button locks' },
  'help.subModels.notes':    { tr: 'Alt model, bağımsız olarak da kullanılacak bir varlıksa (örneğin Müşteri) alt model yapmayın — ayrı bir model yayınlayıp "İlişkiler" sekmesinden veya Lookup ile bağlayın.', en: 'Do not make something a sub-model if it is also used independently (a Customer, say) — publish it as its own model and link it from the Relationships tab or with Lookup.' },

  // ══ İLİŞKİLER (genel) ══════════════════════════════════════════════════════

  'help.relationships.title':    { tr: 'Model İlişkileri', en: 'Model Relationships' },
  'help.relationships.summary':  { tr: 'Bu model ile daha önce yayınlanmış modeller arasında bağ kurar. Yayınlandığında üretilen kodda navigation property\'ler, veritabanında yabancı anahtar ve gerekiyorsa ara tablo oluşur.', en: 'Links this model to previously published models. On publish, navigation properties appear in the generated code and a foreign key — plus a bridge table when needed — appears in the database.' },
  'help.relationships.useCase1': { tr: 'İki bağımsız modeli birbirine bağlamak (Müşteri ↔ Sipariş)', en: 'Linking two independent models (Customer ↔ Order)' },
  'help.relationships.useCase2': { tr: 'Çoka-çok bağ kurmak — bunu yalnızca ilişkiler destekler', en: 'Building a many-to-many link — only relationships support this' },
  'help.relationships.useCase3': { tr: 'Karşı modelde de gezilebilir bir liste (navigation) oluşturmak', en: 'Creating a navigable collection on the target model as well' },
  'help.type.relationships.sample1': { tr: 'Geçerli bir ilişki — karşı model de yeniden derlenir', en: 'A valid relationship — the target model is recompiled as well' },
  'help.type.relationships.sample2': { tr: 'Derinlik 3\'ü aşar (kök = 0) — yayınlama engellenir', en: 'Exceeds depth 3 (root = 0) — publishing is blocked' },
  'help.type.relationships.sample3': { tr: 'Döngüsel ilişki — yasaktır, doğrulama hata verir', en: 'A cyclic relationship — forbidden, validation fails' },
  'help.relationships.notes':    { tr: 'İlişki derinliği en fazla 3\'tür ve döngü kurulamaz (SelfReference hariç). Kaydetmeden önce doğrulama uyarılarını, oluşacak yapıyı görmek için de "Önizleme" düğmesini kullanın.', en: 'Relationship depth is capped at 3 and cycles are not allowed (except SelfReference). Check the validation warnings before saving, and use "Preview" to see the resulting structure.' },

  // ══ İLİŞKİ TİPLERİ ═════════════════════════════════════════════════════════

  'help.rel.oneToOne.title':    { tr: 'OneToOne — bire bir', en: 'OneToOne — one to one' },
  'help.rel.oneToOne.summary':  { tr: 'Her kayıt karşı modelden en fazla bir kayda bağlanır ve o kayıt da başkasına bağlanamaz. Yabancı anahtar bu modele düşer ve benzersiz (unique) olur.', en: 'Each record links to at most one record on the other side, and that record cannot be linked by anyone else. The foreign key lands on this model and is made unique.' },
  'help.rel.oneToOne.useCase1': { tr: 'Kullanıcı ↔ Profil detayı', en: 'User ↔ Profile detail' },
  'help.rel.oneToOne.useCase2': { tr: 'Sipariş ↔ Kargo takip kaydı', en: 'Order ↔ Shipment tracking record' },
  'help.type.relOneToOne.sample1': { tr: 'Ters property verilirse ilişki iki yönden de gezilebilir', en: 'With an inverse property the relationship is navigable from both sides' },
  'help.type.relOneToOne.sample2Value': { tr: 'User.Profile (ters property yok)', en: 'User.Profile (no inverse property)' },
  'help.type.relOneToOne.sample2': { tr: 'Ters property zorunlu değildir — tek yönlü de bırakılabilir', en: 'The inverse property is optional — one-way is allowed' },
  'help.type.relOneToOne.sample3Value': { tr: 'İki kayıt aynı profile bağlanır', en: 'Two records link to the same profile' },
  'help.type.relOneToOne.sample3': { tr: 'Benzersizlik kısıtı buna izin vermez', en: 'The uniqueness constraint does not allow this' },
  'help.rel.oneToOne.notes':    { tr: 'Alanların çoğu her zaman dolu olacaksa ayrı bir model yerine bu kolonları doğrudan aynı modele eklemek daha basittir.', en: 'If the fields will almost always be filled, adding those columns directly to the same model is simpler than a separate one.' },

  'help.rel.oneToMany.title':    { tr: 'OneToMany — bire çok', en: 'OneToMany — one to many' },
  'help.rel.oneToMany.summary':  { tr: 'Bu modelin bir kaydına karşı modelden birden çok kayıt bağlanır. Yabancı anahtar KARŞI modele düşer; bu modelde bir liste (koleksiyon) property\'si oluşur.', en: 'One record of this model holds many records of the target. The foreign key lands on the TARGET model; this model gets a collection property.' },
  'help.rel.oneToMany.useCase1': { tr: 'Müşteri → Siparişleri', en: 'Customer → their Orders' },
  'help.rel.oneToMany.useCase2': { tr: 'Kategori → Ürünleri', en: 'Category → its Products' },
  'help.rel.oneToMany.useCase3': { tr: 'Proje → Görevleri', en: 'Project → its Tasks' },
  'help.type.relOneToMany.sample1': { tr: 'Doğru kurulum: liste bu tarafta, FK karşı tarafta', en: 'Correct setup: the collection on this side, the FK on the other' },
  'help.type.relOneToMany.sample2Value': { tr: 'Customer.Orders (ters property boş)', en: 'Customer.Orders (inverse property empty)' },
  'help.type.relOneToMany.sample2': { tr: 'OneToMany\'de ters property zorunludur — boş bırakılamaz', en: 'The inverse property is required for OneToMany — it cannot be empty' },
  'help.type.relOneToMany.sample3Value': { tr: 'Dolu Order tablosuna Zorunlu FK', en: 'Required FK on a non-empty Order table' },
  'help.type.relOneToMany.sample3': { tr: 'Dolu bir tabloya NOT NULL FK eklenemez; önce alanı doldurun', en: 'A NOT NULL FK cannot be added to a populated table; fill the field first' },
  'help.rel.oneToMany.notes':    { tr: 'Karşı model bu ilişki yüzünden yeniden derlenir ve yeni bir FK kolonu kazanır. Bağlı kayıt tek başına anlamsızsa alt model yapısı daha uygun olabilir.', en: 'The target model is recompiled and gains a new FK column because of this relationship. If the related record is meaningless alone, a sub-model may fit better.' },

  'help.rel.manyToOne.title':    { tr: 'ManyToOne — çoka bir', en: 'ManyToOne — many to one' },
  'help.rel.manyToOne.summary':  { tr: 'OneToMany\'nin ters yönden bakılmış hali: bu modelin birden çok kaydı karşı modelin tek bir kaydına bağlanır. Yabancı anahtar BU modele düşer.', en: 'OneToMany seen from the other side: many records of this model point to a single record of the target. The foreign key lands on THIS model.' },
  'help.rel.manyToOne.useCase1': { tr: 'Sipariş → Müşterisi', en: 'Order → its Customer' },
  'help.rel.manyToOne.useCase2': { tr: 'Ürün → Kategorisi', en: 'Product → its Category' },
  'help.rel.manyToOne.useCase3': { tr: 'Görev → Atandığı kullanıcı', en: 'Task → its assigned user' },
  'help.type.relManyToOne.sample1': { tr: 'Bu modelde tekil bir navigation property oluşur', en: 'A single navigation property is created on this model' },
  'help.type.relManyToOne.sample2Value': { tr: 'FK adı: CustomerId', en: 'FK name: CustomerId' },
  'help.type.relManyToOne.sample2': { tr: 'FK adı boş bırakılırsa property adından böyle türetilir', en: 'Left empty, the FK name is derived from the property name like this' },
  'help.type.relManyToOne.sample3Value': { tr: 'Zorunlu + Cascade birlikte', en: 'Required + Cascade together' },
  'help.type.relManyToOne.sample3': { tr: 'Zorunlu + Cascade birlikte: hedef silinince bu kayıtlar da gider — çoğu zaman istenmez', en: 'Required + Cascade together: deleting the target removes these records too — usually not what you want' },
  'help.rel.manyToOne.notes':    { tr: 'Karşı modelde bir liste oluşmasına ihtiyacınız yoksa ve tek yönlü bir bağ yeterliyse "Lookup" kolon tipi daha hafif bir çözümdür.', en: 'If you do not need a collection on the target and a one-way link is enough, the "Lookup" column type is a lighter solution.' },

  'help.rel.manyToMany.title':    { tr: 'ManyToMany — çoka çok', en: 'ManyToMany — many to many' },
  'help.rel.manyToMany.summary':  { tr: 'Her iki tarafta da birden çok kayıt birbirine bağlanabilir. Bağlantıları tutmak için otomatik olarak bir ara (join) tablo oluşturulur; kolonlarda FK bulunmaz.', en: 'Many records on both sides can link to each other. A bridge (join) table is created automatically to hold the links; neither model gets an FK column.' },
  'help.rel.manyToMany.useCase1': { tr: 'Ürün ↔ Etiketler', en: 'Product ↔ Tags' },
  'help.rel.manyToMany.useCase2': { tr: 'Öğrenci ↔ Dersler', en: 'Student ↔ Courses' },
  'help.rel.manyToMany.useCase3': { tr: 'Kullanıcı ↔ Roller', en: 'User ↔ Roles' },
  'help.type.relManyToMany.sample1': { tr: 'İki tarafta da liste property\'si oluşur; ters property zorunludur', en: 'Both sides get a collection property; the inverse property is required' },
  'help.type.relManyToMany.sample2Value': { tr: 'Join tablo: ProductTag', en: 'Join table: ProductTag' },
  'help.type.relManyToMany.sample2': { tr: 'Join tablo adı boş bırakılırsa iki model adından türetilir', en: 'Left empty, the join table name is derived from the two model names' },
  'help.type.relManyToMany.sample3Value': { tr: 'Join tabloya ek kolon', en: 'Extra column on the join table' },
  'help.type.relManyToMany.sample3': { tr: 'Ara tabloya ek alan (tarih, adet) eklenemez — böyle bir ihtiyaç varsa aradaki bağı ayrı bir model yapın', en: 'Extra fields (date, quantity) cannot be added to the bridge table — model the link itself as its own model if you need them' },
  'help.rel.manyToMany.notes':    { tr: 'İlişkinin kendisi hakkında bilgi saklamanız gerekiyorsa (ne zaman eklendi, kaç adet) çoka-çok yerine iki adet bire-çok ilişki ve arada bir model kullanın.', en: 'If you must store information about the link itself (when it was added, how many), use two one-to-many relationships with a model in between instead of many-to-many.' },

  'help.rel.selfReference.title':    { tr: 'SelfReference — kendine referans', en: 'SelfReference — self reference' },
  'help.rel.selfReference.summary':  { tr: 'Model kendi kendine bağlanır; ağaç yapısı kurmak için kullanılır. Döngü kontrolünde beyaz listededir, bu yüzden diğer ilişkilerin aksine izin verilir.', en: 'The model links to itself, forming a tree. It is whitelisted in the cycle check, so unlike other relationships it is permitted.' },
  'help.rel.selfReference.useCase1': { tr: 'Kategori → Üst kategori (çok seviyeli kategori ağacı)', en: 'Category → parent category (multi-level category tree)' },
  'help.rel.selfReference.useCase2': { tr: 'Çalışan → Yöneticisi', en: 'Employee → their manager' },
  'help.rel.selfReference.useCase3': { tr: 'Yorum → Yanıtladığı yorum', en: 'Comment → the comment it replies to' },
  'help.type.relSelfReference.sample1': { tr: 'Aynı modele işaret eden tekil property', en: 'A single property pointing at the same model' },
  'help.type.relSelfReference.sample2Value': { tr: 'Kök kayıt: ParentCategoryId = NULL', en: 'Root record: ParentCategoryId = NULL' },
  'help.type.relSelfReference.sample2': { tr: 'Ağacın kökü — üstü olmadığı için FK boş kalmalı', en: 'The root of the tree — it has no parent, so the FK must stay empty' },
  'help.type.relSelfReference.sample3Value': { tr: 'Zorunlu ParentCategoryId', en: 'Required ParentCategoryId' },
  'help.type.relSelfReference.sample3': { tr: 'Zorunlu yapılırsa kök kayıt hiç oluşturulamaz', en: 'Making it required means no root record can ever be created' },
  'help.rel.selfReference.notes':    { tr: 'Bu ilişkide "Zorunlu" seçeneğini işaretlemeyin: ağacın kökünde üst kayıt bulunmaz, NOT NULL kısıtı ilk kaydın oluşturulmasını engeller.', en: 'Do not check "Required" on this relationship: the root of the tree has no parent, and a NOT NULL constraint prevents the very first record from being created.' },

  // ══ REGEX LABORATUVARI ═════════════════════════════════════════════════════

  'help.regex.title':      { tr: 'Regex kılavuzu', en: 'Regex guide' },
  'help.regex.intro':      { tr: 'Regex, metnin uyması gereken kalıbı tanımlar. Aşağıdaki hazır desenlerden birini "Kullan" ile alana yazabilir, kendi deseninizi de canlı test kutusunda deneyebilirsiniz.', en: 'A regex defines the pattern text must match. Apply one of the ready-made patterns below with "Use", or try your own in the live test box.' },
  'help.regex.presets':    { tr: 'Hazır desenler', en: 'Ready-made patterns' },
  'help.regex.colName':    { tr: 'Kullanım', en: 'Purpose' },
  'help.regex.colPattern': { tr: 'Desen', en: 'Pattern' },
  'help.regex.colSamples': { tr: 'Örnek', en: 'Example' },
  'help.regex.colOk':      { tr: 'Uyar', en: 'Matches' },
  'help.regex.colFail':    { tr: 'Uymaz', en: 'Fails' },
  'help.regex.use':        { tr: 'Kullan', en: 'Use' },
  'help.regex.useAria':    { tr: '{name} desenini alana yaz', en: 'Apply the {name} pattern to the field' },
  'help.regex.lab':        { tr: 'Canlı test', en: 'Live test' },
  'help.regex.labPattern': { tr: 'Desen', en: 'Pattern' },
  'help.regex.labValue':   { tr: 'Test edilecek değer', en: 'Value to test' },
  'help.regex.labHint':    { tr: 'Buradaki test yalnızca denemek içindir; forma yalnızca "Kullan" ile veya desen alanını elle doldurarak yazarsınız.', en: 'This test is for experimenting only; the form is filled either via "Use" or by typing into the pattern field yourself.' },
  'help.regex.match':      { tr: 'Eşleşiyor', en: 'Matches' },
  'help.regex.noMatch':    { tr: 'Eşleşmiyor', en: 'Does not match' },
  'help.regex.badPattern': { tr: 'Geçersiz desen', en: 'Invalid pattern' },
  'help.regex.idle':       { tr: 'Desen ve değer girin', en: 'Enter a pattern and a value' },
  'help.regex.syntax':     { tr: 'Sözdizimi', en: 'Syntax' },
  'help.regex.colToken':   { tr: 'İfade', en: 'Token' },
  'help.regex.colMeaning': { tr: 'Anlamı', en: 'Meaning' },

  // Hazır desen adları
  'help.regex.preset.email':         { tr: 'E-posta adresi', en: 'E-mail address' },
  'help.regex.preset.mobilePhone':   { tr: 'Cep telefonu (05XXXXXXXXX)', en: 'Mobile phone (05XXXXXXXXX)' },
  'help.regex.preset.landlinePhone': { tr: 'Sabit telefon (0XXXXXXXXXX)', en: 'Landline (0XXXXXXXXXX)' },
  'help.regex.preset.tckn':          { tr: 'TC Kimlik No (11 hane)', en: 'National ID (11 digits)' },
  'help.regex.preset.taxNumber':     { tr: 'Vergi No (10 hane)', en: 'Tax number (10 digits)' },
  'help.regex.preset.iban':          { tr: 'IBAN (TR)', en: 'IBAN (TR)' },
  'help.regex.preset.plate':         { tr: 'Araç plakası', en: 'Vehicle plate' },
  'help.regex.preset.postalCode':    { tr: 'Posta kodu (5 hane)', en: 'Postal code (5 digits)' },
  'help.regex.preset.url':           { tr: 'Web adresi (http/https)', en: 'Web address (http/https)' },
  'help.regex.preset.slug':          { tr: 'URL parçası (slug)', en: 'URL slug' },
  'help.regex.preset.lettersOnly':   { tr: 'Yalnızca harf ve boşluk', en: 'Letters and spaces only' },
  'help.regex.preset.startsUpper':   { tr: 'Büyük harfle başlar', en: 'Starts with a capital letter' },
  'help.regex.preset.dateDmy':       { tr: 'Tarih (gg.aa.yyyy)', en: 'Date (dd.mm.yyyy)' },
  'help.regex.preset.positiveInt':   { tr: 'Pozitif tam sayı (başında sıfır yok)', en: 'Positive integer (no leading zero)' },
  'help.regex.preset.productCode':   { tr: 'Ürün kodu (ABC-001234)', en: 'Product code (ABC-001234)' },
  'help.regex.preset.noWhitespace':  { tr: 'Boşluk içermez', en: 'Contains no whitespace' },

  // Hazır desenlerin hazır hata mesajları (regexMessage alanına yazılır)
  'help.regex.presetMsg.email':         { tr: 'Geçerli bir e-posta adresi girin (örn. ali@ornek.com).', en: 'Enter a valid e-mail address (e.g. ali@example.com).' },
  'help.regex.presetMsg.mobilePhone':   { tr: 'Cep telefonu 05 ile başlamalı ve 11 haneli olmalıdır.', en: 'The mobile number must start with 05 and be 11 digits long.' },
  'help.regex.presetMsg.landlinePhone': { tr: 'Sabit telefon 0 ile başlamalı ve 11 haneli olmalıdır.', en: 'The landline number must start with 0 and be 11 digits long.' },
  'help.regex.presetMsg.tckn':          { tr: 'TC Kimlik No 11 haneli olmalı ve sıfırla başlamamalıdır.', en: 'The national ID must be 11 digits and cannot start with zero.' },
  'help.regex.presetMsg.taxNumber':     { tr: 'Vergi No 10 haneli olmalıdır.', en: 'The tax number must be 10 digits.' },
  'help.regex.presetMsg.iban':          { tr: 'IBAN "TR" ile başlamalı ve toplam 26 karakter olmalıdır.', en: 'The IBAN must start with "TR" and be 26 characters in total.' },
  'help.regex.presetMsg.plate':         { tr: 'Plakayı boşluksuz ve büyük harfle yazın (örn. 34ABC123).', en: 'Enter the plate without spaces, in capitals (e.g. 34ABC123).' },
  'help.regex.presetMsg.postalCode':    { tr: 'Posta kodu 5 haneli olmalıdır.', en: 'The postal code must be 5 digits.' },
  'help.regex.presetMsg.url':           { tr: 'Adres http:// veya https:// ile başlamalıdır.', en: 'The address must start with http:// or https://.' },
  'help.regex.presetMsg.slug':          { tr: 'Yalnızca küçük harf, rakam ve tire kullanın (örn. yeni-urun-2026).', en: 'Use only lowercase letters, digits and hyphens (e.g. new-product-2026).' },
  'help.regex.presetMsg.lettersOnly':   { tr: 'Bu alanda yalnızca harf ve boşluk kullanılabilir.', en: 'Only letters and spaces are allowed in this field.' },
  'help.regex.presetMsg.startsUpper':   { tr: 'Değer büyük harfle başlamalıdır.', en: 'The value must start with a capital letter.' },
  'help.regex.presetMsg.dateDmy':       { tr: 'Tarihi gg.aa.yyyy biçiminde girin (örn. 01.08.2026).', en: 'Enter the date as dd.mm.yyyy (e.g. 01.08.2026).' },
  'help.regex.presetMsg.positiveInt':   { tr: 'Sıfırdan büyük bir tam sayı girin; başında sıfır olamaz.', en: 'Enter a whole number greater than zero, without leading zeros.' },
  'help.regex.presetMsg.productCode':   { tr: 'Ürün kodu ABC-001234 biçiminde olmalıdır.', en: 'The product code must look like ABC-001234.' },
  'help.regex.presetMsg.noWhitespace':  { tr: 'Bu alan boşluk içeremez.', en: 'This field cannot contain whitespace.' },

  // Sözdizimi tablosu
  'help.regex.syntax.caret':     { tr: 'Metnin başlangıcı', en: 'Start of the text' },
  'help.regex.syntax.dollar':    { tr: 'Metnin sonu', en: 'End of the text' },
  'help.regex.syntax.dot':       { tr: 'Herhangi bir tek karakter', en: 'Any single character' },
  'help.regex.syntax.digit':     { tr: 'Bir rakam (0-9)', en: 'A digit (0-9)' },
  'help.regex.syntax.nonDigit':  { tr: 'Rakam olmayan bir karakter', en: 'A non-digit character' },
  'help.regex.syntax.word':      { tr: 'Harf, rakam veya alt çizgi', en: 'A letter, digit or underscore' },
  'help.regex.syntax.space':     { tr: 'Boşluk karakteri', en: 'A whitespace character' },
  'help.regex.syntax.nonSpace':  { tr: 'Boşluk olmayan karakter', en: 'A non-whitespace character' },
  'help.regex.syntax.set':       { tr: 'Parantez içindeki karakterlerden biri', en: 'One of the characters in the brackets' },
  'help.regex.syntax.negSet':    { tr: 'Parantez içindekiler DIŞINDA bir karakter', en: 'Any character EXCEPT those in the brackets' },
  'help.regex.syntax.range':     { tr: 'Verilen aralıktan bir karakter', en: 'A character from the given range' },
  'help.regex.syntax.plus':      { tr: 'Öncesindekinden bir veya daha fazla', en: 'One or more of the preceding' },
  'help.regex.syntax.star':      { tr: 'Öncesindekinden sıfır veya daha fazla', en: 'Zero or more of the preceding' },
  'help.regex.syntax.question':  { tr: 'Öncesindeki isteğe bağlı (0 veya 1)', en: 'The preceding is optional (0 or 1)' },
  'help.regex.syntax.exactly':   { tr: 'Tam olarak 3 tekrar', en: 'Exactly 3 repetitions' },
  'help.regex.syntax.between':   { tr: '2 ile 5 arası tekrar', en: 'Between 2 and 5 repetitions' },
  'help.regex.syntax.atLeast':   { tr: 'En az 2 tekrar', en: 'At least 2 repetitions' },
  'help.regex.syntax.alternate': { tr: 'a veya b', en: 'Either a or b' },
  'help.regex.syntax.group':     { tr: 'Gruplama — tekrar ve seçenekleri bir arada tutar', en: 'Grouping — keeps repetitions and alternatives together' },
  'help.regex.syntax.escape':    { tr: 'Özel karakterin kendisi (nokta, artı vb.)', en: 'The literal special character (dot, plus, etc.)' },

  // ══ ALAN İPUÇLARI (küçük "i" baloncukları) ═════════════════════════════════

  'help.hint.columnName':          { tr: 'Veritabanındaki kolon adı. Harfle başlamalı, boşluk ve Türkçe karakter içermemeli (StokAdedi gibi). Kaydedildikten sonra değiştirilmesi zordur.', en: 'The column name in the database. Must start with a letter and contain no spaces or non-ASCII characters (like StockCount). Hard to change once saved.' },
  'help.hint.label':               { tr: 'Ekranlarda kolon adı yerine gösterilecek insan-dostu başlık ("Stok Adedi"). Boş bırakılırsa kolon adı gösterilir.', en: 'A human-friendly heading shown instead of the column name ("Stock Count"). If empty, the column name is shown.' },
  'help.hint.description':         { tr: 'Kayıt detay sayfasında bu alanın yanındaki "i" baloncuğunda kullanıcıya gösterilecek açıklama.', en: 'A description shown to the user in the "i" bubble next to this field on the record detail page.' },
  'help.hint.dataType':            { tr: 'Kolonun saklayacağı veri türü. Seçime göre aşağıda o tipe özel kural alanları açılır. Ayrıntı için yanındaki "i" düğmesine basın.', en: 'The kind of data the column stores. The rule fields below change with your choice. Press the "i" button beside it for details.' },
  'help.hint.nullable':            { tr: 'İşaretliyse alan boş bırakılabilir (NULL). İşaretini kaldırmak alanı zorunlu yapar — içinde kayıt olan bir tabloda bu değişiklik hata verebilir.', en: 'When checked the field may be left empty (NULL). Unchecking makes it required — which can fail on a table that already has rows.' },
  'help.hint.minLength':           { tr: 'En az kaç karakter girilebileceği. Boş bırakılırsa alt sınır yoktur.', en: 'The minimum number of characters. No lower bound if left empty.' },
  'help.hint.maxLength':           { tr: 'En fazla kaç karakter girilebileceği; kolonun veritabanındaki genişliğini de bu belirler. Mutlaka doldurun.', en: 'The maximum number of characters; it also sets the column width in the database. Always fill this in.' },
  'help.hint.regex':               { tr: 'Metnin uyması gereken kalıp (e-posta, telefon, plaka...). Hazır desenler ve canlı test için tip yanındaki "i" düğmesine basın.', en: 'The pattern the text must match (e-mail, phone, plate...). Press the "i" button beside the type for ready-made patterns and a live test.' },
  'help.hint.regexMessage':        { tr: 'Desen tutmadığında kullanıcıya gösterilecek hata metni. Boş bırakmayın.', en: 'The error text shown when the pattern does not match. Do not leave it empty.' },
  'help.hint.min':                 { tr: 'Girilebilecek en küçük sayı. Negatif değer anlamsızsa 0 verin.', en: 'The smallest number that can be entered. Use 0 when negatives are meaningless.' },
  'help.hint.max':                 { tr: 'Girilebilecek en büyük sayı. Veri tipinin kendi sınırını aşamaz.', en: 'The largest number that can be entered. It cannot exceed the type\'s own limit.' },
  'help.hint.enumValues':          { tr: 'Seçenekleri dikey çizgiyle ayırın: Beklemede|Onaylandi|Iptal. Boşluk ve Türkçe karakter kullanmayın.', en: 'Separate options with a vertical bar: Pending|Approved|Cancelled. Use no spaces or non-ASCII characters.' },
  'help.hint.lookupTarget':        { tr: 'Bu kolonun bağlanacağı model. Formda bu modelin kayıtları açılır liste olarak görünür.', en: 'The model this column links to. Its records appear as a dropdown in the form.' },
  'help.hint.lookupDisplayColumn': { tr: 'Açılır listede kullanıcıya görünecek kolon. Ad gibi anlamlı bir kolon seçin, ID seçmeyin.', en: 'The column the user sees in the dropdown. Pick something meaningful like a name, not ID.' },

  'help.hint.relType':        { tr: 'İlişkinin kardinalitesi. Yabancı anahtarın hangi tarafa düşeceğini ve ara tablo oluşup oluşmayacağını bu seçim belirler.', en: 'The cardinality of the relationship. It decides which side gets the foreign key and whether a bridge table is created.' },
  'help.hint.relTarget':      { tr: 'İlişki kurulacak model. Yalnızca yayınlanmış modeller seçilebilir.', en: 'The model to relate to. Only published models can be selected.' },
  'help.hint.relProperty':    { tr: 'Bu modelde oluşacak navigation property adı. Çoklu tarafta çoğul ad verin (Orders).', en: 'The navigation property created on this model. Use a plural name on the many side (Orders).' },
  'help.hint.relInverse':     { tr: 'Karşı modelde oluşacak property adı. OneToMany ve ManyToMany için zorunludur.', en: 'The property created on the target model. Required for OneToMany and ManyToMany.' },
  'help.hint.relForeignKey':  { tr: 'Yabancı anahtar kolonunun adı. Boş bırakılırsa property adından türetilir (Customer → CustomerId).', en: 'The foreign key column name. Derived from the property name if left empty (Customer → CustomerId).' },
  'help.hint.relJoinTable':   { tr: 'Çoka-çok ilişkide oluşacak ara tablonun adı. Boş bırakılırsa iki model adından üretilir.', en: 'The bridge table created for a many-to-many relationship. Generated from the two model names if left empty.' },
  'help.hint.relOrder':       { tr: 'İlişkinin listede ve üretilen kodda görüneceği sıra. Yalnızca görsel düzeni etkiler.', en: 'Where the relationship appears in the list and generated code. Presentation only.' },
  'help.hint.relDisplayName': { tr: 'Ekranlarda gösterilecek insan-dostu ad. Boş bırakılırsa property adı kullanılır.', en: 'The human-friendly name shown on screens. The property name is used if left empty.' },
  'help.hint.relRequired':    { tr: 'FK kolonunu NOT NULL yapar. İçinde kayıt bulunan bir tabloya zorunlu FK eklenemez.', en: 'Makes the FK column NOT NULL. A required FK cannot be added to a table that already has rows.' },
  'help.hint.relCascade':     { tr: 'Üst kayıt silindiğinde bağlı kayıtları da siler. Yalnızca bağlı kayıt tek başına anlamsızsa açın.', en: 'Deletes related records when the parent is deleted. Enable only when the related record is meaningless alone.' },

  'help.hint.subModelTab':     { tr: 'Alt modeller bu kayda ait satırları tutar (Sipariş → Sipariş Kalemleri) ve üst kaydın detay ekranında listelenir.', en: 'Sub-models hold rows belonging to this record (Order → Order Items) and are listed on the parent\'s detail screen.' },
  'help.hint.relationshipTab': { tr: 'İlişkiler bu modeli daha önce yayınlanmış başka modellere bağlar ve iki tarafta da navigation property üretir.', en: 'Relationships link this model to other published models and create navigation properties on both sides.' }
};
