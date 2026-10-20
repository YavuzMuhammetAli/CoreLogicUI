import { PublishedColumnSchema } from '../../services/published-table.service';
import { isColumnRequired, isServerFilledAutoValue, mustStayVisible } from './column-required';

function rule(partial: Partial<PublishedColumnSchema>): PublishedColumnSchema {
  return { name: 'Alan', dataType: 'string', isRequired: false, ...partial } as PublishedColumnSchema;
}

describe('column-required', () => {
  describe('isColumnRequired', () => {
    it('şema kuralı varsa isNullable yok sayılır — zorunlu metin kolonu isNullable=true gelir', () => {
      expect(isColumnRequired({ isNullable: true }, rule({ isRequired: true }))).toBeTrue();
      expect(isColumnRequired({ isNullable: false }, rule({ isRequired: false }))).toBeFalse();
    });

    it('kural henüz yüklenmediyse isNullable esas alınır', () => {
      expect(isColumnRequired({ isNullable: false }, undefined)).toBeTrue();
      expect(isColumnRequired({ isNullable: true }, undefined)).toBeFalse();
    });
  });

  describe('mustStayVisible', () => {
    it('zorunlu kolon gizlenemez', () => {
      expect(mustStayVisible({ isNullable: true }, rule({ isRequired: true }))).toBeTrue();
    });

    it('opsiyonel kolon gizlenebilir', () => {
      expect(mustStayVisible({ isNullable: true }, rule({ isRequired: false }))).toBeFalse();
    });

    it('sunucunun doldurduğu salt okunur otomatik değer zorunlu olsa da gizlenebilir', () => {
      const seq = rule({ isRequired: true, autoValueTrigger: 'create', autoValueExpression: "SEQ(3, 'x')" });
      const onSave = rule({ isRequired: true, autoValueTrigger: 'save', autoValueExpression: '[A] & [B]' });
      const readOnly = rule({ isRequired: true, autoValueTrigger: 'change', autoValueExpression: '[A]', isReadOnly: true });
      expect(mustStayVisible({ isNullable: true }, seq)).toBeFalse();
      expect(mustStayVisible({ isNullable: true }, onSave)).toBeFalse();
      expect(mustStayVisible({ isNullable: true }, readOnly)).toBeFalse();
    });

    it('kullanıcının değiştirebildiği otomatik değer zorunluysa görünür kalır', () => {
      const editable = rule({ isRequired: true, autoValueTrigger: 'create', autoValueExpression: 'TODAY()' });
      expect(mustStayVisible({ isNullable: true }, editable)).toBeTrue();
    });
  });

  describe('isServerFilledAutoValue', () => {
    it('formülsüz tetik otomatik değer sayılmaz', () => {
      expect(isServerFilledAutoValue(rule({ autoValueTrigger: 'save', autoValueExpression: '  ' }))).toBeFalse();
      expect(isServerFilledAutoValue(undefined)).toBeFalse();
    });

    it('SEQ büyük/küçük harf ve boşluktan bağımsız tanınır', () => {
      expect(isServerFilledAutoValue(rule({ autoValueTrigger: 'create', autoValueExpression: "'A-' & seq (4, 'k')" }))).toBeTrue();
      expect(isServerFilledAutoValue(rule({ autoValueTrigger: 'create', autoValueExpression: '[SEQUENCE]' }))).toBeFalse();
    });
  });
});
