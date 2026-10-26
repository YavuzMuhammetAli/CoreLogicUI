import { PublishedColumn } from '../../services/published-model.service';
import { FileRef } from '../../utils/record-file';
import { cellValue, sanitizePayload } from './model-data.util';

describe('model-data.util — dosya gösterimi', () => {
  const ref: FileRef = { $file: true, kind: 'file', size: 10, url: 'PublishedModel/file?token=t' };
  const columns: PublishedColumn[] = [
    { columnName: 'Ad', dataType: 'string', isNullable: true },
    { columnName: 'Belge', dataType: 'file', isNullable: true }
  ];

  it('değişmeyen dosyayı payloaddan çıkarır (sunucu dokunmaz)', () => {
    const out = sanitizePayload(columns, { ID: 3, Ad: 'Masa', Belge: ref });
    expect('Belge' in out).toBeFalse();
    expect(out['Ad']).toBe('Masa');
  });

  it('yeni dosya ve silme gönderilir', () => {
    expect(sanitizePayload(columns, { Belge: 'AQID' })['Belge']).toBe('AQID');
    expect(sanitizePayload(columns, { Belge: '' })['Belge']).toBeNull();
  });

  it('hücrede dosya için simge yazar', () => {
    expect(cellValue({ belge: ref }, 'Belge')).toBe('📎');
  });
});
