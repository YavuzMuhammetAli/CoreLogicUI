import {
  autoValueKey, metadataKey, normalizeColumnRules, requiredChangeAllowed, schemaMetadataKey, toMemberMetadataUpdate
} from './column-rules';

describe('normalizeColumnRules', () => {

  it('converts MB input to a KB limit on a file column', () => {
    const r = normalizeColumnRules({ dataType: 'image', maxFileSizeMb: 2 });
    expect(r.maxLength).toBe(2048);
    expect(r.maxFileSizeMb).toBe(2);
  });

  it('does not turn the character limit of a column changed from string to file into a file limit', () => {
    const r = normalizeColumnRules({ dataType: 'file', maxLength: 100, minLength: 3, regex: '^a' });
    expect(r.maxLength).toBeNull();
    expect(r.minLength).toBeNull();
    expect(r.regex).toBe('');
  });

  it('does not shift the stored KB value by rounding when MB did not change', () => {
    const r = normalizeColumnRules({ dataType: 'file', maxLength: 1000, maxFileSizeMb: 0.98 });
    expect(r.maxLength).toBe(1000);
  });

  it('removes the limit when the MB field is cleared', () => {
    const r = normalizeColumnRules({ dataType: 'image', maxLength: 2048, maxFileSizeMb: null });
    expect(r.maxLength).toBeNull();
  });

  it('keeps string rules and clears rules of other types', () => {
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

  it('a multi-line text column keeps length and regex rules', () => {
    const r = normalizeColumnRules({ dataType: 'text', minLength: 2, maxLength: 5000, regex: '^x', enumValues: 'A' });
    expect(r.minLength).toBe(2);
    expect(r.maxLength).toBe(5000);
    expect(r.regex).toBe('^x');
    expect(r.enumValues).toBe('');
  });

  it('keeps allowed types on a file column, drops enum values left over from a draft', () => {
    expect(normalizeColumnRules({ dataType: 'file', enumValues: 'office|pdf' }).enumValues).toBe('pdf|office');
    expect(normalizeColumnRules({ dataType: 'file', enumValues: 'Aktif|Pasif' }).enumValues).toBe('');
    expect(normalizeColumnRules({ dataType: 'image', enumValues: 'pdf' }).enumValues).toBe('');
  });

  it('only Min/Max remain for a numeric type', () => {
    const r = normalizeColumnRules({ dataType: 'int', min: 0, max: 10, maxLength: 20 });
    expect(r.min).toBe(0);
    expect(r.max).toBe(10);
    expect(r.maxLength).toBeNull();
  });

  describe('auto value', () => {
    it('clears the formula and read-only when there is no rule', () => {
      const r = normalizeColumnRules({ dataType: 'int', autoValueTrigger: '', autoValueExpression: '[A] + 1', isReadOnly: true });
      expect(r.autoValueExpression).toBe('');
      expect(r.isReadOnly).toBeFalse();
    });

    it('the rule is dropped on a file column', () => {
      const r = normalizeColumnRules({ dataType: 'image', autoValueTrigger: 'create', autoValueExpression: "'x'" });
      expect(r.autoValueTrigger).toBe('');
    });

    it('the save trigger and SEQ force read-only', () => {
      expect(normalizeColumnRules({ dataType: 'datetime', autoValueTrigger: 'save', autoValueExpression: 'NOW()', isReadOnly: false }).isReadOnly).toBeTrue();
      expect(normalizeColumnRules({ dataType: 'string', autoValueTrigger: 'create', autoValueExpression: 'SEQ(3)', isReadOnly: false }).isReadOnly).toBeTrue();
      expect(normalizeColumnRules({ dataType: 'string', autoValueTrigger: 'create', autoValueExpression: "'SEQ(3)'", isReadOnly: false }).isReadOnly).toBeFalse();
    });

    it('autoValueKey changes when the rule changes, empty when there is no rule', () => {
      expect(autoValueKey({ autoValueTrigger: '', autoValueExpression: 'x', isReadOnly: true })).toBe('');
      expect(autoValueKey({ autoValueTrigger: 'change', autoValueExpression: ' [A] ', isReadOnly: false }))
        .toBe('change|[A]|false');
    });
  });
});

/**
 * Metadata of a saved column. Regression guarded: the schema screen silently dropped type/rule
 * changes; now a change is written with a single request (updateMemberMetadata) and the "unchanged"
 * decision relies on an exact match between keys built from the saved schema and from the form.
 */
describe('column metadata', () => {
  const schemaColumn = {
    name: 'Unvan', dataType: 'string', isRequired: true, label: 'Ünvan', description: null,
    minLength: 2, maxLength: 100, min: null, max: null, regex: '^[A-Z]', regexMessage: null,
    enumValues: null, lookupTargetTable: null, lookupDisplayColumn: null
  };

  /** A column loaded from the schema into the form and passed through normalizeColumnRules. */
  function formColumn(overrides: Record<string, unknown> = {}) {
    return normalizeColumnRules({
      columnName: 'Unvan', dataType: 'string', isNullable: false, label: 'Ünvan ', description: '',
      minLength: 2, maxLength: 100, regex: '^[A-Z]', regexMessage: '', enumValues: '', lookupTargetTable: '',
      lookupDisplayColumn: '', ...overrides
    });
  }

  it('an unchanged column has the same key as the saved schema (empty text = null, trimming)', () => {
    expect(metadataKey(formColumn())).toBe(schemaMetadataKey(schemaColumn));
  });

  it('the key changes when required-ness or a rule changes', () => {
    const base = schemaMetadataKey(schemaColumn);
    expect(metadataKey(formColumn({ isNullable: true }))).not.toBe(base);
    expect(metadataKey(formColumn({ maxLength: 120 }))).not.toBe(base);
    expect(metadataKey(formColumn({ regex: '' }))).not.toBe(base);
  });

  it('compares enum values the same way as the server', () => {
    const stored = { ...schemaColumn, dataType: 'enum', enumValues: 'Aktif|Pasif', minLength: null, maxLength: null, regex: null };
    const edited = normalizeColumnRules({ columnName: 'Unvan', dataType: 'enum', isNullable: false, label: 'Ünvan', enumValues: ' Aktif | Pasif |Aktif' });
    expect(metadataKey(edited)).toBe(schemaMetadataKey(stored));
  });

  it('the request body does not send a rule that does not fit the type', () => {
    const body = toMemberMetadataUpdate('Musteri', normalizeColumnRules({
      columnName: 'Yas', dataType: 'int', isNullable: true, label: 'Yaş', min: 0, max: 120, maxLength: 5, regex: 'x'
    }));
    expect(body).toEqual(jasmine.objectContaining({
      typeName: 'Musteri', memberName: 'Yas', isRequired: false, min: 0, max: 120, maxLength: null, regex: null
    }));
  });

  it('on a published model only text/enum/file required-ness can change', () => {
    expect(requiredChangeAllowed('string', true)).toBeTrue();
    expect(requiredChangeAllowed('enum', true)).toBeTrue();
    expect(requiredChangeAllowed('image', true)).toBeTrue();
    expect(requiredChangeAllowed('int', true)).toBeFalse();
    expect(requiredChangeAllowed('lookup', true)).toBeFalse();
    expect(requiredChangeAllowed('datetime', false)).toBeTrue();
  });
});
