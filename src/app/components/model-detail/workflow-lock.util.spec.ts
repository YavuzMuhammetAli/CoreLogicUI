import { PublishedColumn } from '../../services/published-model.service';
import { RecordWorkflowState } from '../../models/workflow.model';
import { buildRecordValues, isEmptyValue, lockedColumns, missingRequired } from './workflow-lock.util';

const column = (columnName: string, dataType = 'string'): PublishedColumn =>
  ({ columnName, dataType, isNullable: true } as PublishedColumn);

const columns = [column('Baslik'), column('Tutar', 'decimal'), column('Onaylandi', 'boolean')];

const state = (patch: Partial<RecordWorkflowState>): RecordWorkflowState => ({
  isLocked: true,
  canBypass: false,
  lockedForMe: false,
  editableColumns: [],
  myTasks: [],
  startable: [],
  ...patch
});

describe('workflow-lock.util', () => {
  describe('lockedColumns', () => {
    it('durum yoksa ya da kilit yoksa hiçbir kolon kilitlenmez', () => {
      expect(lockedColumns(columns, null).size).toBe(0);
      expect(lockedColumns(columns, state({ isLocked: false })).size).toBe(0);
    });

    it('admin kilidi aşar', () => {
      expect(lockedColumns(columns, state({ canBypass: true })).size).toBe(0);
    });

    it('görevliye yalnız kendi kolonları açık kalır (harf duyarsız)', () => {
      const locked = lockedColumns(columns, state({ editableColumns: ['tutar'] }));
      expect([...locked].sort()).toEqual(['Baslik', 'Onaylandi']);
    });

    it('görevi olmayan kullanıcıda her şey kilitli', () => {
      expect(lockedColumns(columns, state({})).size).toBe(3);
    });
  });

  describe('missingRequired', () => {
    const fields = [
      { column: 'tutar', isRequired: true },
      { column: 'Baslik', isRequired: false },
      { column: 'Onaylandi', isRequired: true }
    ];

    it('boş zorunlu alanı formdaki gerçek adıyla döner; false dolu sayılır', () => {
      expect(missingRequired(fields, { Tutar: '', Onaylandi: false }, columns)).toEqual(['Tutar']);
    });

    it('dolu alanlarda boş liste', () => {
      expect(missingRequired(fields, { Tutar: 500, Onaylandi: true }, columns)).toEqual([]);
    });
  });

  it('isEmptyValue sunucu kuralıyla aynı', () => {
    expect(isEmptyValue(null)).toBeTrue();
    expect(isEmptyValue('  ')).toBeTrue();
    expect(isEmptyValue(0)).toBeFalse();
    expect(isEmptyValue(false)).toBeFalse();
  });

  describe('buildRecordValues', () => {
    it('yalnız istenen kolonları temizleyerek taşır', () => {
      const values = buildRecordValues(['TUTAR', 'Onaylandi'], { Baslik: 'x', Tutar: '', Onaylandi: '' }, columns);
      expect(values).toEqual({ Tutar: null, Onaylandi: null });
    });

    it('modelde olmayan kolonu göndermez', () => {
      expect(buildRecordValues(['Yok'], { Yok: 1 }, columns)).toEqual({});
    });
  });
});
