import { FormArray, FormControl, FormGroup, Validators } from '@angular/forms';
import {
  IDENTIFIER_MAX_LENGTH,
  LabelNameSync,
  identifierErrorMessage,
  identifierErrors,
  identifierValidator,
  revalidateIdentifiers,
  sanitizeIdentifierInput,
  toIdentifier,
  transliterate,
  uniqueIdentifier
} from './identifier';

describe('identifier', () => {

  describe('transliterate', () => {
    it('Türkçe harfleri ASCII karşılığına çevirir', () => {
      expect(transliterate('ığüşöçİĞÜŞÖÇ')).toBe('igusocIGUSOC');
    });

    it('aksanlı harflerin işaretini atar', () => {
      expect(transliterate('café naïve Å')).toBe('cafe naive A');
    });
  });

  describe('toIdentifier', () => {
    it('boşluklu Türkçe etiketten PascalCase model adı üretir', () => {
      expect(toIdentifier('satış pazarlama formu', 'model')).toBe('SatisPazarlamaFormu');
    });

    it('kolon etiketinden PascalCase alan adı üretir', () => {
      expect(toIdentifier('Müşteri Adı', 'column')).toBe('MusteriAdi');
    });

    it('tamamı büyük harfli etiketi okunur hale getirir', () => {
      expect(toIdentifier('İŞ EMRİ', 'model')).toBe('IsEmri');
    });

    it('karışık yazımda kısaltmayı korur', () => {
      expect(toIdentifier('KDV tutarı', 'column')).toBe('KDVTutari');
    });

    it('noktalamayı ayraç sayar', () => {
      expect(toIdentifier('sipariş-no / tarih.', 'column')).toBe('SiparisNoTarih');
    });

    it('rakamla başlayan etikete ön ek koyar', () => {
      expect(toIdentifier('2024 satışlar', 'model')).toBe('Model2024Satislar');
      expect(toIdentifier('1. adres', 'column')).toBe('Alan1Adres');
    });

    it('yalnız noktalama/boş etikette boş döner', () => {
      expect(toIdentifier('  ?!- ', 'model')).toBe('');
      expect(toIdentifier(null, 'column')).toBe('');
    });

    it('üst sınıra kırpar', () => {
      expect(toIdentifier('a'.repeat(80), 'column').length).toBe(IDENTIFIER_MAX_LENGTH);
    });

    it('ürettiği ad her zaman desene uyar', () => {
      for (const label of ['satış pazarlama formu', 'İŞ EMRİ', '2024 satışlar', 'ığüşöç', 'x']) {
        expect(identifierErrors(toIdentifier(label, 'model'), 'model')).toBeNull();
        expect(identifierErrors(toIdentifier(label, 'column'), 'column')).toBeNull();
      }
    });
  });

  describe('sanitizeIdentifierInput', () => {
    it('boşluk ve Türkçe harfleri anında temizler', () => {
      expect(sanitizeIdentifierInput('Satış Form', 'model')).toBe('SatisForm');
    });

    it('model adının ilk harfini büyütür, kolon adına dokunmaz', () => {
      expect(sanitizeIdentifierInput('siparis', 'model')).toBe('Siparis');
      expect(sanitizeIdentifierInput('siparis_no', 'column')).toBe('siparis_no');
    });

    it('model adında alt çizgiye izin vermez', () => {
      expect(sanitizeIdentifierInput('Satis_Form', 'model')).toBe('SatisForm');
    });
  });

  describe('identifierErrors', () => {
    it('geçerli adda null döner', () => {
      expect(identifierErrors('SatisFormu', 'model')).toBeNull();
      expect(identifierErrors('musteri_adi', 'column')).toBeNull();
    });

    it('boş adı required\'a bırakır', () => {
      expect(identifierErrors('', 'model')).toBeNull();
    });

    it('desen dışını reddeder', () => {
      expect(identifierErrors('satisFormu', 'model')).toEqual({ identifierPattern: true });
      expect(identifierErrors('2Adres', 'column')).toEqual({ identifierPattern: true });
      expect(identifierErrors('Satış', 'column')).toEqual({ identifierPattern: true });
    });

    it('üst sınırı aşan adı reddeder', () => {
      expect(identifierErrors('A'.repeat(51), 'model'))
        .toEqual({ identifierMaxLength: { max: IDENTIFIER_MAX_LENGTH } });
    });

    it('C# anahtar kelimesini reddeder', () => {
      expect(identifierErrors('class', 'column')).toEqual({ identifierKeyword: { name: 'class' } });
    });

    it('sistem kolonlarını büyük/küçük harf duyarsız reddeder', () => {
      expect(identifierErrors('CreatedBy', 'column')).toEqual({ identifierReserved: { name: 'CreatedBy' } });
      expect(identifierErrors('id', 'column')).toEqual({ identifierReserved: { name: 'id' } });
    });

    it('sistem tablosu adını reddeder', () => {
      expect(identifierErrors('User', 'model')).toEqual({ identifierReserved: { name: 'User' } });
    });

    it('model adıyla aynı kolon adını reddeder', () => {
      expect(identifierErrors('siparis', 'column', { modelName: 'Siparis' }))
        .toEqual({ identifierSameAsModel: { name: 'siparis' } });
    });

    it('alt modelde üst FK kolonunu reddeder', () => {
      expect(identifierErrors('SiparisId', 'column', { parentName: 'Siparis' }))
        .toEqual({ identifierParentFk: { name: 'SiparisId' } });
    });

    it('çakışan adı büyük/küçük harf duyarsız reddeder', () => {
      expect(identifierErrors('musteriadi', 'column', { taken: ['MusteriAdi'] }))
        .toEqual({ identifierDuplicate: { name: 'musteriadi' } });
    });
  });

  describe('uniqueIdentifier', () => {
    it('çakışmada sayı ekler', () => {
      expect(uniqueIdentifier('MusteriAdi', 'column', { taken: ['MusteriAdi', 'MusteriAdi2'] }))
        .toBe('MusteriAdi3');
    });

    it('rezerve adı geçerli hale getirir', () => {
      expect(uniqueIdentifier('Active', 'column')).toBe('Active2');
      expect(uniqueIdentifier('User', 'model')).toBe('User2');
    });

    it('sonek eklerken üst sınırı korur', () => {
      const base = 'A'.repeat(IDENTIFIER_MAX_LENGTH);
      const result = uniqueIdentifier(base, 'model', { taken: [base] });
      expect(result.length).toBe(IDENTIFIER_MAX_LENGTH);
      expect(result.endsWith('2')).toBeTrue();
    });
  });

  describe('form ağacı', () => {
    const column = (name: string, label = '') => new FormGroup({
      columnName: new FormControl(name, [Validators.required, identifierValidator('column')]),
      label: new FormControl(label)
    });
    const model = (name: string, cols: FormGroup[], subs: FormGroup[] = []) => new FormGroup({
      entityName: new FormControl(name, [Validators.required, identifierValidator('model')]),
      columns: new FormArray(cols),
      subModels: new FormArray(subs)
    });

    it('kardeş kolon çakışmasını ağaçtan bulur', () => {
      const root = model('Siparis', [column('Tutar'), column('tutar')]);
      revalidateIdentifiers(root);
      expect(root.get('columns.1.columnName')!.hasError('identifierDuplicate')).toBeTrue();
      expect(root.invalid).toBeTrue();
    });

    it('alt modelde üst FK kolonunu ve ad çakışmasını ağaçtan bulur', () => {
      const child = model('Siparis', [column('SiparisId')]);
      const root = model('Siparis', [column('Tutar')], [child]);
      revalidateIdentifiers(root);
      expect(child.get('entityName')!.hasError('identifierDuplicate')).toBeTrue();
      expect(child.get('columns.0.columnName')!.hasError('identifierParentFk')).toBeTrue();
    });

    it('ek bağlamı ağaç bağlamıyla birleştirir', () => {
      const ctrl = new FormControl('Musteri', identifierValidator('model', () => ({ taken: ['Musteri'] })));
      expect(ctrl.hasError('identifierDuplicate')).toBeTrue();
    });

    it('hata anahtarını i18n anahtarına çevirir', () => {
      const ctrl = new FormControl('CreatedOn', identifierValidator('column'));
      expect(identifierErrorMessage(ctrl)).toEqual({
        key: 'identifier.error.reserved', params: { name: 'CreatedOn' }
      });
      expect(identifierErrorMessage(new FormControl('', Validators.required)))
        .toEqual({ key: 'identifier.error.required', params: {} });
    });
  });

  describe('LabelNameSync', () => {
    const setup = (name = '', label = '') => {
      const group = new FormGroup({ label: new FormControl(label), columnName: new FormControl(name) });
      const sync = new LabelNameSync(group.get('label')!, group.get('columnName')!, 'column',
        () => ({ taken: ['MusteriAdi'] }));
      return { group, sync };
    };

    it('etiket değişince adı üretir ve çakışmayı çözer', () => {
      const { group } = setup();
      group.get('label')!.setValue('Müşteri Adı');
      expect(group.get('columnName')!.value).toBe('MusteriAdi2');
    });

    it('ad elle değiştirildiyse etiketi takip etmez', () => {
      const { group } = setup();
      group.get('label')!.setValue('Tutar');
      group.get('columnName')!.setValue('Fiyat');
      group.get('label')!.setValue('Toplam Tutar');
      expect(group.get('columnName')!.value).toBe('Fiyat');
    });

    it('ad silinince takibe geri döner', () => {
      const { group } = setup();
      group.get('columnName')!.setValue('Fiyat');
      group.get('columnName')!.setValue('');
      group.get('label')!.setValue('Toplam Tutar');
      expect(group.get('columnName')!.value).toBe('ToplamTutar');
    });

    it('regenerate elle değiştirilmiş adı etiketten yeniden üretir', () => {
      const { group, sync } = setup('Fiyat', 'Toplam Tutar');
      sync.regenerate();
      expect(group.get('columnName')!.value).toBe('ToplamTutar');
    });

    it('kilitli (disabled) ada dokunmaz', () => {
      const { group } = setup('Eski', 'Eski');
      group.get('columnName')!.disable();
      group.get('label')!.setValue('Yeni Etiket');
      expect(group.get('columnName')!.value).toBe('Eski');
    });

    it('etiketten üretilmiş mevcut adı takip etmeye devam eder', () => {
      const { group } = setup('Tutar', 'Tutar');
      group.get('label')!.setValue('Net Tutar');
      expect(group.get('columnName')!.value).toBe('NetTutar');
    });
  });
});
