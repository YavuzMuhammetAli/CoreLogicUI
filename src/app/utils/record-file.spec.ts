import { environment } from '../../environments/environment';
import { asFileRef, fileRefUrl, isFileRef, FileRef } from './record-file';

describe('record-file', () => {
  const ref: FileRef = { $file: true, kind: 'image', size: 42, url: 'PublishedModel/file?token=abc' };

  it('sunucunun dosya gösterimini tanır', () => {
    expect(isFileRef(ref)).toBeTrue();
    expect(asFileRef(ref)).toBe(ref);
  });

  it('metin, null ve sıradan nesneleri dosya saymaz', () => {
    expect(isFileRef('iVBORw0KGgo=')).toBeFalse();
    expect(isFileRef(null)).toBeFalse();
    expect(isFileRef({ url: 'x' })).toBeFalse();
    expect(asFileRef(undefined)).toBeNull();
  });

  it('göreli adrese API kökünü ekler', () => {
    expect(fileRefUrl(ref)).toBe(`${environment.apiBaseUrl}/PublishedModel/file?token=abc`);
  });
});
