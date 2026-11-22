import { environment } from '../../environments/environment';
import { asFileRef, fileRefUrl, isFileRef, FileRef } from './record-file';

describe('record-file', () => {
  const ref: FileRef = { $file: true, kind: 'image', size: 42, url: 'PublishedModel/file?token=abc' };

  it('recognizes the server file representation', () => {
    expect(isFileRef(ref)).toBeTrue();
    expect(asFileRef(ref)).toBe(ref);
  });

  it('does not treat strings, null or plain objects as files', () => {
    expect(isFileRef('iVBORw0KGgo=')).toBeFalse();
    expect(isFileRef(null)).toBeFalse();
    expect(isFileRef({ url: 'x' })).toBeFalse();
    expect(asFileRef(undefined)).toBeNull();
  });

  it('prepends the API root to the relative address', () => {
    expect(fileRefUrl(ref)).toBe(`${environment.apiBaseUrl}/PublishedModel/file?token=abc`);
  });
});
