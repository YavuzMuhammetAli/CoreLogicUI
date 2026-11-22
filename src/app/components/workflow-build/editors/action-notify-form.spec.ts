import { WorkflowStep } from '../../../models/workflow.model';
import { PublishedColumn } from '../../../services/published-model.service';
import { addSet, duplicateColumns, removeSet, setColumn, setMode, updateSet, writableColumns } from './action-form';
import {
  addRecipient, channelChecked, insertPlaceholder, placeholderNames, removeRecipient, toggleChannel, unknownPlaceholders
} from './notify-form';

const action: WorkflowStep = {
  key: 'yaz', type: 'action', name: 'Durumu yaz', next: 'son',
  sets: [{ column: 'Durum', mode: 'value', value: 'Onaylandı' }]
};

const notify: WorkflowStep = {
  key: 'haber', type: 'notify', name: 'Haber ver', next: 'son',
  notify: { recipients: [{ kind: 'creator' }], channels: [], subject: 'Konu', body: '' }
};

const column = (columnName: string, dataType: string): PublishedColumn => ({ columnName, dataType, isNullable: true });

describe('action-form', () => {
  it('image/file columns are not writable', () => {
    const names = writableColumns([column('Baslik', 'string'), column('Foto', 'image'), column('Ek', 'file')])
      .map(c => c.columnName);
    expect(names).toEqual(['Baslik']);
  });

  it('add/delete/update row returns a copy', () => {
    const added = addSet(action, 'Tutar');
    expect(added.sets!.length).toBe(2);
    expect(action.sets!.length).toBe(1);
    expect(updateSet(added, 1, { value: '10' }).sets![1].value).toBe('10');
    expect(removeSet(added, 0).sets!.map(s => s.column)).toEqual(['Tutar']);
  });

  it('changing the source resets the value; clear has no value', () => {
    expect(setMode(action, 0, 'formula').sets![0]).toEqual({ column: 'Durum', mode: 'formula', value: '' });
    expect(setMode(action, 0, 'clear').sets![0].value).toBeNull();
    expect(setMode(action, 0, 'value')).toBe(action);
  });

  it('changing the column resets a fixed value, keeps the formula', () => {
    expect(setColumn(action, 0, 'Not').sets![0].value).toBe('');
    const formula = updateSet(action, 0, { mode: 'formula', value: 'TODAY()' });
    expect(setColumn(formula, 0, 'Tarih').sets![0].value).toBe('TODAY()');
  });

  it('reports when the same column is written twice', () => {
    expect([...duplicateColumns(addSet(action, 'durum'))]).toEqual(['durum']);
    expect(duplicateColumns(action).size).toBe(0);
  });
});

describe('notify-form', () => {
  it('the same recipient is not added twice', () => {
    const withRole = addRecipient(notify, { kind: 'role', id: 3 });
    expect(withRole.notify!.recipients.length).toBe(2);
    expect(addRecipient(withRole, { kind: 'role', id: 3 })).toBe(withRole);
    expect(addRecipient(withRole, { kind: 'creator' })).toBe(withRole);
    expect(removeRecipient(withRole, 0).notify!.recipients).toEqual([{ kind: 'role', id: 3 }]);
  });

  it('channel: empty list means all, the last channel cannot be turned off', () => {
    expect(channelChecked(notify, 'email')).toBeTrue();
    const inappOnly = toggleChannel(notify, 'email', false);
    expect(inappOnly.notify!.channels).toEqual(['inapp']);
    expect(toggleChannel(inappOnly, 'inapp', false)).toBe(inappOnly);
    expect(toggleChannel(inappOnly, 'email', true).notify!.channels).toEqual([]);
  });

  it('unknown placeholders — record fields checked against the column list', () => {
    const text = '{{record.Baslik}} {{ record.yok }} {{link}} {{kayit}} {{record.Baslik}}';
    expect(unknownPlaceholders(text, ['Baslik'])).toEqual(['record.yok', 'kayit']);
    expect(unknownPlaceholders(text, [])).toEqual(['kayit']);
    expect(placeholderNames(['Baslik'])).toEqual(['record.Baslik', 'workflow.name', 'step.name', 'instance.id', 'link']);
  });

  it('the placeholder is inserted at the caret, the caret moves to its end', () => {
    expect(insertPlaceholder('Merhaba ', 'record.Ad', null)).toEqual({ text: 'Merhaba {{record.Ad}}', caret: 21 });
    expect(insertPlaceholder('ab', 'link', 1)).toEqual({ text: 'a{{link}}b', caret: 9 });
  });
});
