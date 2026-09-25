import { autoValueKey, normalizeColumnRules } from './column-rules';

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
