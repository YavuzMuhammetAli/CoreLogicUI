import { FormControl, FormGroup } from '@angular/forms';
import {
  FILE_MAX_FILE_KB,
  IMAGE_MAX_FILE_KB,
  base64ByteLength,
  effectiveFileLimitKb,
  fileLimitMbValidator,
  fileAccept,
  fileSizeError,
  formatFileSize,
  isFileType,
  joinFileGroups,
  kbToMb,
  maxFileMbFor,
  parseFileGroups,
  maxFileSizeValidator,
  mbToKb
} from './file-size';

describe('file-size', () => {

  it('counts only image/file types as files', () => {
    expect(isFileType('image')).toBeTrue();
    expect(isFileType('file')).toBeTrue();
    expect(isFileType('string')).toBeFalse();
    expect(isFileType(null)).toBeFalse();
  });

  it('cap depends on type: image 50 MB, file 100 MB', () => {
    expect(maxFileMbFor('image')).toBe(50);
    expect(maxFileMbFor('file')).toBe(100);
  });

  describe('effectiveFileLimitKb', () => {
    it('returns the type cap when there is no limit', () => {
      expect(effectiveFileLimitKb('image', null)).toBe(IMAGE_MAX_FILE_KB);
      expect(effectiveFileLimitKb('file', 0)).toBe(FILE_MAX_FILE_KB);
    });

    it('lowers a limit above the cap to the type cap', () => {
      expect(effectiveFileLimitKb('image', FILE_MAX_FILE_KB)).toBe(IMAGE_MAX_FILE_KB);
      expect(effectiveFileLimitKb('file', FILE_MAX_FILE_KB * 2)).toBe(FILE_MAX_FILE_KB);
    });

    it('returns a valid limit as is', () => {
      expect(effectiveFileLimitKb('file', 512)).toBe(512);
    });
  });

  describe('fileLimitMbValidator', () => {
    // As in the app: the control is validated after being attached to the group (when value/type changes).
    const group = (dataType: string, mb: number | null) => {
      const g = new FormGroup({
        dataType: new FormControl(dataType),
        maxFileSizeMb: new FormControl(mb, fileLimitMbValidator)
      });
      g.get('maxFileSizeMb')!.updateValueAndValidity();
      return g;
    };

    it('rejects above 50 MB for an image and above 100 MB for a file', () => {
      expect(group('image', 60).get('maxFileSizeMb')!.hasError('fileLimitRange')).toBeTrue();
      expect(group('file', 60).get('maxFileSizeMb')!.valid).toBeTrue();
      expect(group('file', 120).get('maxFileSizeMb')!.hasError('fileLimitRange')).toBeTrue();
    });

    it('does not block an empty value or a value left over on a non-file type', () => {
      expect(group('image', null).get('maxFileSizeMb')!.valid).toBeTrue();
      expect(group('string', 500).get('maxFileSizeMb')!.valid).toBeTrue();
    });
  });

  describe('MB ↔ KB', () => {
    it('converts MB input to an integer KB', () => {
      expect(mbToKb(2)).toBe(2048);
      expect(mbToKb(0.5)).toBe(512);
      expect(mbToKb('1.5')).toBe(1536);
      expect(mbToKb(0.0001)).toBe(1);
    });

    it('returns null for empty or invalid input', () => {
      expect(mbToKb(null)).toBeNull();
      expect(mbToKb('')).toBeNull();
      expect(mbToKb(-1)).toBeNull();
      expect(mbToKb('abc')).toBeNull();
    });

    it('shows a KB value as MB with two decimals', () => {
      expect(kbToMb(2048)).toBe(2);
      expect(kbToMb(512)).toBe(0.5);
      expect(kbToMb(1000)).toBe(0.98);
      expect(kbToMb(null)).toBeNull();
    });
  });

  it('computes the actual byte length of base64 text', () => {
    expect(base64ByteLength(btoa('a'))).toBe(1);   // "YQ=="
    expect(base64ByteLength(btoa('ab'))).toBe(2);  // "YWI="
    expect(base64ByteLength(btoa('abc'))).toBe(3); // "YWJj"
    expect(base64ByteLength('')).toBe(0);
  });

  it('writes the size in readable form per language', () => {
    expect(formatFileSize(512 * 1024, 'tr')).toBe('512 KB');
    expect(formatFileSize(1.5 * 1024 * 1024, 'tr')).toBe('1,5 MB');
    expect(formatFileSize(1.5 * 1024 * 1024, 'en')).toBe('1.5 MB');
  });

  describe('fileSizeError', () => {
    const file = (bytes: number) => new File([new Uint8Array(bytes)], 'x.bin');

    it('returns an error for a file over the limit', () => {
      expect(fileSizeError(file(3 * 1024), 'file', 2, 'tr')).toEqual({
        key: 'model.detail.fieldMaxFileSize',
        params: { actual: '3 KB', limit: '2 KB' }
      });
    });

    it('accepts a file within the limit', () => {
      expect(fileSizeError(file(2 * 1024), 'file', 2, 'tr')).toBeNull();
    });
  });

  describe('allowed file types', () => {
    it('drops unknown groups and fixes the order', () => {
      expect(parseFileGroups('office|bilinmeyen| pdf ')).toEqual(['pdf', 'office']);
      expect(parseFileGroups(null)).toEqual([]);
      expect(joinFileGroups(['text', 'pdf'])).toBe('pdf|text');
    });

    it('an image column only allows picking formats the server accepts', () => {
      expect(fileAccept('image', null)).toContain('image/jpeg');
      expect(fileAccept('image', null)).not.toContain('image/svg');
      expect(fileAccept('image', null)).not.toContain('image/*');
    });

    it('the picker is unrestricted on a file column without restrictions', () => {
      expect(fileAccept('file', '')).toBeNull();
      expect(fileAccept('file', null)).toBeNull();
    });

    it('gives the extensions of the selected groups on a file column', () => {
      const accept = fileAccept('file', 'pdf|office')!;
      expect(accept).toContain('.pdf');
      expect(accept).toContain('.xlsx');
      expect(accept).not.toContain('.csv');
    });
  });

  describe('maxFileSizeValidator', () => {
    const b64OfBytes = (n: number) => btoa('x'.repeat(n));

    it('rejects a base64 value over the limit', () => {
      const ctrl = new FormControl(b64OfBytes(2048), maxFileSizeValidator('file', 1));
      expect(ctrl.errors).toEqual({ maxFileSize: { limitKb: 1, actualBytes: 2048 } });
    });

    it('accepts empty and within-limit values', () => {
      expect(new FormControl('', maxFileSizeValidator('file', 1)).errors).toBeNull();
      expect(new FormControl(b64OfBytes(1024), maxFileSizeValidator('file', 1)).errors).toBeNull();
    });
  });
});
