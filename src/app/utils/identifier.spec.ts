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
    it('maps Turkish letters to their ASCII equivalents', () => {
      expect(transliterate('ığüşöçİĞÜŞÖÇ')).toBe('igusocIGUSOC');
    });

    it('strips diacritics from accented letters', () => {
      expect(transliterate('café naïve Å')).toBe('cafe naive A');
    });
  });

  describe('toIdentifier', () => {
    it('builds a PascalCase model name from a spaced Turkish label', () => {
      expect(toIdentifier('satış pazarlama formu', 'model')).toBe('SatisPazarlamaFormu');
    });

    it('builds a PascalCase field name from a column label', () => {
      expect(toIdentifier('Müşteri Adı', 'column')).toBe('MusteriAdi');
    });

    it('makes an all-uppercase label readable', () => {
      expect(toIdentifier('İŞ EMRİ', 'model')).toBe('IsEmri');
    });

    it('keeps acronyms in mixed-case text', () => {
      expect(toIdentifier('KDV tutarı', 'column')).toBe('KDVTutari');
    });

    it('treats punctuation as a separator', () => {
      expect(toIdentifier('sipariş-no / tarih.', 'column')).toBe('SiparisNoTarih');
    });

    it('prefixes a label starting with a digit', () => {
      expect(toIdentifier('2024 satışlar', 'model')).toBe('Model2024Satislar');
      expect(toIdentifier('1. adres', 'column')).toBe('Alan1Adres');
    });

    it('returns empty for a punctuation-only/empty label', () => {
      expect(toIdentifier('  ?!- ', 'model')).toBe('');
      expect(toIdentifier(null, 'column')).toBe('');
    });

    it('truncates to the upper limit', () => {
      expect(toIdentifier('a'.repeat(80), 'column').length).toBe(IDENTIFIER_MAX_LENGTH);
    });

    it('the generated name always matches the pattern', () => {
      for (const label of ['satış pazarlama formu', 'İŞ EMRİ', '2024 satışlar', 'ığüşöç', 'x']) {
        expect(identifierErrors(toIdentifier(label, 'model'), 'model')).toBeNull();
        expect(identifierErrors(toIdentifier(label, 'column'), 'column')).toBeNull();
      }
    });
  });

  describe('sanitizeIdentifierInput', () => {
    it('cleans spaces and Turkish letters immediately', () => {
      expect(sanitizeIdentifierInput('Satış Form', 'model')).toBe('SatisForm');
    });

    it('capitalizes the first letter of a model name, leaves a column name alone', () => {
      expect(sanitizeIdentifierInput('siparis', 'model')).toBe('Siparis');
      expect(sanitizeIdentifierInput('siparis_no', 'column')).toBe('siparis_no');
    });

    it('does not allow underscores in a model name', () => {
      expect(sanitizeIdentifierInput('Satis_Form', 'model')).toBe('SatisForm');
    });
  });

  describe('identifierErrors', () => {
    it('returns null for a valid name', () => {
      expect(identifierErrors('SatisFormu', 'model')).toBeNull();
      expect(identifierErrors('musteri_adi', 'column')).toBeNull();
    });

    it('leaves an empty name to required', () => {
      expect(identifierErrors('', 'model')).toBeNull();
    });

    it('rejects names outside the pattern', () => {
      expect(identifierErrors('satisFormu', 'model')).toEqual({ identifierPattern: true });
      expect(identifierErrors('2Adres', 'column')).toEqual({ identifierPattern: true });
      expect(identifierErrors('Satış', 'column')).toEqual({ identifierPattern: true });
    });

    it('rejects a name over the upper limit', () => {
      expect(identifierErrors('A'.repeat(51), 'model'))
        .toEqual({ identifierMaxLength: { max: IDENTIFIER_MAX_LENGTH } });
    });

    it('rejects a C# keyword', () => {
      expect(identifierErrors('class', 'column')).toEqual({ identifierKeyword: { name: 'class' } });
    });

    it('rejects system columns case-insensitively', () => {
      expect(identifierErrors('CreatedBy', 'column')).toEqual({ identifierReserved: { name: 'CreatedBy' } });
      expect(identifierErrors('id', 'column')).toEqual({ identifierReserved: { name: 'id' } });
    });

    it('rejects a system table name', () => {
      expect(identifierErrors('User', 'model')).toEqual({ identifierReserved: { name: 'User' } });
    });

    it('rejects a column name equal to the model name', () => {
      expect(identifierErrors('siparis', 'column', { modelName: 'Siparis' }))
        .toEqual({ identifierSameAsModel: { name: 'siparis' } });
    });

    it('rejects the parent FK column in a sub-model', () => {
      expect(identifierErrors('SiparisId', 'column', { parentName: 'Siparis' }))
        .toEqual({ identifierParentFk: { name: 'SiparisId' } });
    });

    it('rejects a colliding name case-insensitively', () => {
      expect(identifierErrors('musteriadi', 'column', { taken: ['MusteriAdi'] }))
        .toEqual({ identifierDuplicate: { name: 'musteriadi' } });
    });
  });

  describe('uniqueIdentifier', () => {
    it('appends a number on collision', () => {
      expect(uniqueIdentifier('MusteriAdi', 'column', { taken: ['MusteriAdi', 'MusteriAdi2'] }))
        .toBe('MusteriAdi3');
    });

    it('makes a reserved name valid', () => {
      expect(uniqueIdentifier('Active', 'column')).toBe('Active2');
      expect(uniqueIdentifier('User', 'model')).toBe('User2');
    });

    it('keeps the upper limit when adding a suffix', () => {
      const base = 'A'.repeat(IDENTIFIER_MAX_LENGTH);
      const result = uniqueIdentifier(base, 'model', { taken: [base] });
      expect(result.length).toBe(IDENTIFIER_MAX_LENGTH);
      expect(result.endsWith('2')).toBeTrue();
    });
  });

  describe('form tree', () => {
    const column = (name: string, label = '') => new FormGroup({
      columnName: new FormControl(name, [Validators.required, identifierValidator('column')]),
      label: new FormControl(label)
    });
    const model = (name: string, cols: FormGroup[], subs: FormGroup[] = []) => new FormGroup({
      entityName: new FormControl(name, [Validators.required, identifierValidator('model')]),
      columns: new FormArray(cols),
      subModels: new FormArray(subs)
    });

    it('finds a sibling column collision from the tree', () => {
      const root = model('Siparis', [column('Tutar'), column('tutar')]);
      revalidateIdentifiers(root);
      expect(root.get('columns.1.columnName')!.hasError('identifierDuplicate')).toBeTrue();
      expect(root.invalid).toBeTrue();
    });

    it('finds the parent FK column and a name collision in a sub-model from the tree', () => {
      const child = model('Siparis', [column('SiparisId')]);
      const root = model('Siparis', [column('Tutar')], [child]);
      revalidateIdentifiers(root);
      expect(child.get('entityName')!.hasError('identifierDuplicate')).toBeTrue();
      expect(child.get('columns.0.columnName')!.hasError('identifierParentFk')).toBeTrue();
    });

    it('merges extra context with the tree context', () => {
      const ctrl = new FormControl('Musteri', identifierValidator('model', () => ({ taken: ['Musteri'] })));
      expect(ctrl.hasError('identifierDuplicate')).toBeTrue();
    });

    it('maps the error key to an i18n key', () => {
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

    it('generates the name when the label changes and resolves collisions', () => {
      const { group } = setup();
      group.get('label')!.setValue('Müşteri Adı');
      expect(group.get('columnName')!.value).toBe('MusteriAdi2');
    });

    it('stops following the label once the name is edited manually', () => {
      const { group } = setup();
      group.get('label')!.setValue('Tutar');
      group.get('columnName')!.setValue('Fiyat');
      group.get('label')!.setValue('Toplam Tutar');
      expect(group.get('columnName')!.value).toBe('Fiyat');
    });

    it('resumes following when the name is cleared', () => {
      const { group } = setup();
      group.get('columnName')!.setValue('Fiyat');
      group.get('columnName')!.setValue('');
      group.get('label')!.setValue('Toplam Tutar');
      expect(group.get('columnName')!.value).toBe('ToplamTutar');
    });

    it('regenerate rebuilds a manually edited name from the label', () => {
      const { group, sync } = setup('Fiyat', 'Toplam Tutar');
      sync.regenerate();
      expect(group.get('columnName')!.value).toBe('ToplamTutar');
    });

    it('does not touch a locked (disabled) name', () => {
      const { group } = setup('Eski', 'Eski');
      group.get('columnName')!.disable();
      group.get('label')!.setValue('Yeni Etiket');
      expect(group.get('columnName')!.value).toBe('Eski');
    });

    it('keeps following an existing name generated from the label', () => {
      const { group } = setup('Tutar', 'Tutar');
      group.get('label')!.setValue('Net Tutar');
      expect(group.get('columnName')!.value).toBe('NetTutar');
    });
  });
});
