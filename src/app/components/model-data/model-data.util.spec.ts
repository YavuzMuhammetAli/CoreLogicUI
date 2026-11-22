import { PublishedColumn } from '../../services/published-model.service';
import { FileRef } from '../../utils/record-file';
import { cellValue, sanitizePayload } from './model-data.util';

describe('model-data.util — file display', () => {
  const ref: FileRef = { $file: true, kind: 'file', size: 10, url: 'PublishedModel/file?token=t' };
  const columns: PublishedColumn[] = [
    { columnName: 'Ad', dataType: 'string', isNullable: true },
    { columnName: 'Belge', dataType: 'file', isNullable: true }
  ];

  it('removes an unchanged file from the payload (the server does not touch it)', () => {
    const out = sanitizePayload(columns, { ID: 3, Ad: 'Masa', Belge: ref });
    expect('Belge' in out).toBeFalse();
    expect(out['Ad']).toBe('Masa');
  });

  it('sends a new file and a deletion', () => {
    expect(sanitizePayload(columns, { Belge: 'AQID' })['Belge']).toBe('AQID');
    expect(sanitizePayload(columns, { Belge: '' })['Belge']).toBeNull();
  });

  it('writes an icon for a file in the cell', () => {
    expect(cellValue({ belge: ref }, 'Belge')).toBe('📎');
  });
});
