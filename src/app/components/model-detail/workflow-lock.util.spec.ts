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
    it('locks no column when there is no state or no lock', () => {
      expect(lockedColumns(columns, null).size).toBe(0);
      expect(lockedColumns(columns, state({ isLocked: false })).size).toBe(0);
    });

    it('admin bypasses the lock', () => {
      expect(lockedColumns(columns, state({ canBypass: true })).size).toBe(0);
    });

    it('the assignee keeps only their own columns open (case-insensitive)', () => {
      const locked = lockedColumns(columns, state({ editableColumns: ['tutar'] }));
      expect([...locked].sort()).toEqual(['Baslik', 'Onaylandi']);
    });

    it('everything is locked for a user without a task', () => {
      expect(lockedColumns(columns, state({})).size).toBe(3);
    });
  });

  describe('missingRequired', () => {
    const fields = [
      { column: 'tutar', isRequired: true },
      { column: 'Baslik', isRequired: false },
      { column: 'Onaylandi', isRequired: true }
    ];

    it('returns an empty required field by its real form name; false counts as filled', () => {
      expect(missingRequired(fields, { Tutar: '', Onaylandi: false }, columns)).toEqual(['Tutar']);
    });

    it('empty list when fields are filled', () => {
      expect(missingRequired(fields, { Tutar: 500, Onaylandi: true }, columns)).toEqual([]);
    });
  });

  it('isEmptyValue matches the server rule', () => {
    expect(isEmptyValue(null)).toBeTrue();
    expect(isEmptyValue('  ')).toBeTrue();
    expect(isEmptyValue(0)).toBeFalse();
    expect(isEmptyValue(false)).toBeFalse();
  });

  describe('buildRecordValues', () => {
    it('carries only the requested columns, sanitized', () => {
      const values = buildRecordValues(['TUTAR', 'Onaylandi'], { Baslik: 'x', Tutar: '', Onaylandi: '' }, columns);
      expect(values).toEqual({ Tutar: null, Onaylandi: null });
    });

    it('does not send a column that is not in the model', () => {
      expect(buildRecordValues(['Yok'], { Yok: 1 }, columns)).toEqual({});
    });
  });
});
