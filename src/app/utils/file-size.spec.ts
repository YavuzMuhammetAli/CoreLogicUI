import { FormControl, FormGroup } from '@angular/forms';
import {
  FILE_MAX_FILE_KB,
  IMAGE_MAX_FILE_KB,
  base64ByteLength,
  effectiveFileLimitKb,
  fileLimitMbValidator,
  fileSizeError,
  formatFileSize,
  isFileType,
  kbToMb,
  maxFileMbFor,
  maxFileSizeValidator,
  mbToKb
} from './file-size';

describe('file-size', () => {

  it('yalnız image/file tiplerini dosya sayar', () => {
    expect(isFileType('image')).toBeTrue();
    expect(isFileType('file')).toBeTrue();
    expect(isFileType('string')).toBeFalse();
    expect(isFileType(null)).toBeFalse();
  });

  it('tavan tipe göre: resim 50 MB, dosya 100 MB', () => {
    expect(maxFileMbFor('image')).toBe(50);
    expect(maxFileMbFor('file')).toBe(100);
  });

  describe('effectiveFileLimitKb', () => {
    it('sınır yoksa tipin tavanını döner', () => {
      expect(effectiveFileLimitKb('image', null)).toBe(IMAGE_MAX_FILE_KB);
      expect(effectiveFileLimitKb('file', 0)).toBe(FILE_MAX_FILE_KB);
    });

    it('tavandan büyük sınırı tipin tavanına indirir', () => {
      expect(effectiveFileLimitKb('image', FILE_MAX_FILE_KB)).toBe(IMAGE_MAX_FILE_KB);
      expect(effectiveFileLimitKb('file', FILE_MAX_FILE_KB * 2)).toBe(FILE_MAX_FILE_KB);
    });

    it('geçerli sınırı olduğu gibi döner', () => {
      expect(effectiveFileLimitKb('file', 512)).toBe(512);
    });
  });

  describe('fileLimitMbValidator', () => {
    // Uygulamadaki gibi: kontrol gruba bağlandıktan sonra (değer/tip değişince) doğrulanır.
    const group = (dataType: string, mb: number | null) => {
      const g = new FormGroup({
        dataType: new FormControl(dataType),
        maxFileSizeMb: new FormControl(mb, fileLimitMbValidator)
      });
      g.get('maxFileSizeMb')!.updateValueAndValidity();
      return g;
    };

    it('resimde 50 MB üstünü, dosyada 100 MB üstünü reddeder', () => {
      expect(group('image', 60).get('maxFileSizeMb')!.hasError('fileLimitRange')).toBeTrue();
      expect(group('file', 60).get('maxFileSizeMb')!.valid).toBeTrue();
      expect(group('file', 120).get('maxFileSizeMb')!.hasError('fileLimitRange')).toBeTrue();
    });

    it('boş değeri ve dosya dışı tipte kalmış değeri engellemez', () => {
      expect(group('image', null).get('maxFileSizeMb')!.valid).toBeTrue();
      expect(group('string', 500).get('maxFileSizeMb')!.valid).toBeTrue();
    });
  });

  describe('MB ↔ KB', () => {
    it('MB girişini KB tam sayısına çevirir', () => {
      expect(mbToKb(2)).toBe(2048);
      expect(mbToKb(0.5)).toBe(512);
      expect(mbToKb('1.5')).toBe(1536);
      expect(mbToKb(0.0001)).toBe(1);
    });

    it('boş ya da geçersiz girişte null döner', () => {
      expect(mbToKb(null)).toBeNull();
      expect(mbToKb('')).toBeNull();
      expect(mbToKb(-1)).toBeNull();
      expect(mbToKb('abc')).toBeNull();
    });

    it('KB değerini iki ondalıklı MB olarak gösterir', () => {
      expect(kbToMb(2048)).toBe(2);
      expect(kbToMb(512)).toBe(0.5);
      expect(kbToMb(1000)).toBe(0.98);
      expect(kbToMb(null)).toBeNull();
    });
  });

  it('base64 metnin gerçek bayt uzunluğunu hesaplar', () => {
    expect(base64ByteLength(btoa('a'))).toBe(1);   // "YQ=="
    expect(base64ByteLength(btoa('ab'))).toBe(2);  // "YWI="
    expect(base64ByteLength(btoa('abc'))).toBe(3); // "YWJj"
    expect(base64ByteLength('')).toBe(0);
  });

  it('boyutu dile göre okunur biçimde yazar', () => {
    expect(formatFileSize(512 * 1024, 'tr')).toBe('512 KB');
    expect(formatFileSize(1.5 * 1024 * 1024, 'tr')).toBe('1,5 MB');
    expect(formatFileSize(1.5 * 1024 * 1024, 'en')).toBe('1.5 MB');
  });

  describe('fileSizeError', () => {
    const file = (bytes: number) => new File([new Uint8Array(bytes)], 'x.bin');

    it('sınırı aşan dosyada hata döner', () => {
      expect(fileSizeError(file(3 * 1024), 'file', 2, 'tr')).toEqual({
        key: 'model.detail.fieldMaxFileSize',
        params: { actual: '3 KB', limit: '2 KB' }
      });
    });

    it('sınır içindeki dosyayı kabul eder', () => {
      expect(fileSizeError(file(2 * 1024), 'file', 2, 'tr')).toBeNull();
    });
  });

  describe('maxFileSizeValidator', () => {
    const b64OfBytes = (n: number) => btoa('x'.repeat(n));

    it('sınırı aşan base64 değeri reddeder', () => {
      const ctrl = new FormControl(b64OfBytes(2048), maxFileSizeValidator('file', 1));
      expect(ctrl.errors).toEqual({ maxFileSize: { limitKb: 1, actualBytes: 2048 } });
    });

    it('boş ve sınır içindeki değeri kabul eder', () => {
      expect(new FormControl('', maxFileSizeValidator('file', 1)).errors).toBeNull();
      expect(new FormControl(b64OfBytes(1024), maxFileSizeValidator('file', 1)).errors).toBeNull();
    });
  });
});
