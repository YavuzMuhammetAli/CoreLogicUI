import {
  autoValueKey, metadataKey, normalizeColumnRules, requiredChangeAllowed, schemaMetadataKey, toMemberMetadataUpdate
} from './column-rules';

describe('normalizeColumnRules', () => {

  it('dosya sütununda MB girişini KB sınırına çevirir', () => {
    const r = normalizeColumnRules({ dataType: 'image', maxFileSizeMb: 2 });
    expect(r.maxLength).toBe(2048);
    expect(r.maxFileSizeMb).toBe(2);
  });

  it('string\'ten dosyaya çevrilen sütunun karakter sınırını dosya sınırı yapmaz', () => {
    const r = normalizeColumnRules({ dataType: 'file', maxLength: 100, minLength: 3, regex: '^a' });
    expect(r.maxLength).toBeNull();
    expect(r.minLength).toBeNull();
    expect(r.regex).toBe('');
  });

  it('MB değişmediyse saklı KB değerini yuvarlama ile kaydırmaz', () => {
    const r = normalizeColumnRules({ dataType: 'file', maxLength: 1000, maxFileSizeMb: 0.98 });
    expect(r.maxLength).toBe(1000);
  });

  it('MB alanı boşaltılırsa sınırı kaldırır', () => {
    const r = normalizeColumnRules({ dataType: 'image', maxLength: 2048, maxFileSizeMb: null });
    expect(r.maxLength).toBeNull();
  });

  it('string kurallarını korur, başka tiplerin kurallarını temizler', () => {
    const r = normalizeColumnRules({
      dataType: 'string', minLength: 1, maxLength: 50, regex: '^x', min: 5, enumValues: 'A|B'
    });
    expect(r.minLength).toBe(1);
    expect(r.maxLength).toBe(50);
    expect(r.regex).toBe('^x');
    expect(r.min).toBeNull();
    expect(r.enumValues).toBe('');
    expect(r.maxFileSizeMb).toBeNull();
  });

  it('çok satırlı metin kolonu uzunluk ve regex kurallarını korur', () => {
    const r = normalizeColumnRules({ dataType: 'text', minLength: 2, maxLength: 5000, regex: '^x', enumValues: 'A' });
    expect(r.minLength).toBe(2);
    expect(r.maxLength).toBe(5000);
    expect(r.regex).toBe('^x');
    expect(r.enumValues).toBe('');
  });

  it('dosya kolonunda izinli türler korunur, taslaktan kalan enum değeri atılır', () => {
    expect(normalizeColumnRules({ dataType: 'file', enumValues: 'office|pdf' }).enumValues).toBe('pdf|office');
    expect(normalizeColumnRules({ dataType: 'file', enumValues: 'Aktif|Pasif' }).enumValues).toBe('');
    expect(normalizeColumnRules({ dataType: 'image', enumValues: 'pdf' }).enumValues).toBe('');
  });

  it('sayısal tipte yalnız Min/Max kalır', () => {
    const r = normalizeColumnRules({ dataType: 'int', min: 0, max: 10, maxLength: 20 });
    expect(r.min).toBe(0);
    expect(r.max).toBe(10);
    expect(r.maxLength).toBeNull();
  });

  describe('otomatik değer', () => {
    it('kural yoksa formül ve salt okunur temizlenir', () => {
      const r = normalizeColumnRules({ dataType: 'int', autoValueTrigger: '', autoValueExpression: '[A] + 1', isReadOnly: true });
      expect(r.autoValueExpression).toBe('');
      expect(r.isReadOnly).toBeFalse();
    });

    it('dosya sütununda kural düşer', () => {
      const r = normalizeColumnRules({ dataType: 'image', autoValueTrigger: 'create', autoValueExpression: "'x'" });
      expect(r.autoValueTrigger).toBe('');
    });

    it('save tetiği ve SEQ salt okunurluğu zorunlu kılar', () => {
      expect(normalizeColumnRules({ dataType: 'datetime', autoValueTrigger: 'save', autoValueExpression: 'NOW()', isReadOnly: false }).isReadOnly).toBeTrue();
      expect(normalizeColumnRules({ dataType: 'string', autoValueTrigger: 'create', autoValueExpression: 'SEQ(3)', isReadOnly: false }).isReadOnly).toBeTrue();
      expect(normalizeColumnRules({ dataType: 'string', autoValueTrigger: 'create', autoValueExpression: "'SEQ(3)'", isReadOnly: false }).isReadOnly).toBeFalse();
    });

    it('autoValueKey kuralı değişince değişir, kural yokken boştur', () => {
      expect(autoValueKey({ autoValueTrigger: '', autoValueExpression: 'x', isReadOnly: true })).toBe('');
      expect(autoValueKey({ autoValueTrigger: 'change', autoValueExpression: ' [A] ', isReadOnly: false }))
        .toBe('change|[A]|false');
    });
  });
});

/**
 * Kayıtlı kolonun meta verisi. Korunan hata: şema ekranı tip/kural değişikliğini sessizce
 * atıyordu; artık değişiklik tek istekle (updateMemberMetadata) yazılır ve "değişmedi"
 * kararı kayıtlı şema ile formdan üretilen anahtarların birebir eşleşmesine dayanır.
 */
describe('kolon meta verisi', () => {
  const schemaColumn = {
    name: 'Unvan', dataType: 'string', isRequired: true, label: 'Ünvan', description: null,
    minLength: 2, maxLength: 100, min: null, max: null, regex: '^[A-Z]', regexMessage: null,
    enumValues: null, lookupTargetTable: null, lookupDisplayColumn: null
  };

  /** Şemadan forma gelip normalizeColumnRules'tan geçmiş sütun. */
  function formColumn(overrides: Record<string, unknown> = {}) {
    return normalizeColumnRules({
      columnName: 'Unvan', dataType: 'string', isNullable: false, label: 'Ünvan ', description: '',
      minLength: 2, maxLength: 100, regex: '^[A-Z]', regexMessage: '', enumValues: '', lookupTargetTable: '',
      lookupDisplayColumn: '', ...overrides
    });
  }

  it('değişmeyen sütunun anahtarı kayıtlı şemanınkiyle aynıdır (boş metin = null, kırpma)', () => {
    expect(metadataKey(formColumn())).toBe(schemaMetadataKey(schemaColumn));
  });

  it('zorunluluk ya da kural değişince anahtar değişir', () => {
    const base = schemaMetadataKey(schemaColumn);
    expect(metadataKey(formColumn({ isNullable: true }))).not.toBe(base);
    expect(metadataKey(formColumn({ maxLength: 120 }))).not.toBe(base);
    expect(metadataKey(formColumn({ regex: '' }))).not.toBe(base);
  });

  it('enum değerleri sunucuyla aynı biçimde karşılaştırılır', () => {
    const stored = { ...schemaColumn, dataType: 'enum', enumValues: 'Aktif|Pasif', minLength: null, maxLength: null, regex: null };
    const edited = normalizeColumnRules({ columnName: 'Unvan', dataType: 'enum', isNullable: false, label: 'Ünvan', enumValues: ' Aktif | Pasif |Aktif' });
    expect(metadataKey(edited)).toBe(schemaMetadataKey(stored));
  });

  it('istek gövdesi tipe uymayan kuralı göndermez', () => {
    const body = toMemberMetadataUpdate('Musteri', normalizeColumnRules({
      columnName: 'Yas', dataType: 'int', isNullable: true, label: 'Yaş', min: 0, max: 120, maxLength: 5, regex: 'x'
    }));
    expect(body).toEqual(jasmine.objectContaining({
      typeName: 'Musteri', memberName: 'Yas', isRequired: false, min: 0, max: 120, maxLength: null, regex: null
    }));
  });

  it('yayınlanmış modelde yalnız metin/enum/dosya zorunluluğu değişebilir', () => {
    expect(requiredChangeAllowed('string', true)).toBeTrue();
    expect(requiredChangeAllowed('enum', true)).toBeTrue();
    expect(requiredChangeAllowed('image', true)).toBeTrue();
    expect(requiredChangeAllowed('int', true)).toBeFalse();
    expect(requiredChangeAllowed('lookup', true)).toBeFalse();
    expect(requiredChangeAllowed('datetime', false)).toBeTrue();
  });
});
