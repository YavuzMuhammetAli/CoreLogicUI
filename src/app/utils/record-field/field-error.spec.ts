import { PublishedColumnSchema } from '../../services/published-table.service';
import { fieldErrorText, Translate } from './field-error';

/** Fake translation: returns the key and parameters in readable form. */
const t: Translate = (key, params) =>
  params ? `${key}(${Object.entries(params).map(([k, v]) => `${k}=${v}`).join(',')})` : key;

function rule(partial: Partial<PublishedColumnSchema>): PublishedColumnSchema {
  return { name: 'Alan', dataType: 'string', isRequired: false, ...partial } as PublishedColumnSchema;
}

describe('field-error', () => {
  it('returns null when there is no error', () => {
    expect(fieldErrorText(null, 'Ad', undefined, t, 'tr')).toBeNull();
  });

  it('required takes precedence over other errors', () => {
    expect(fieldErrorText({ required: true, pattern: true }, 'Ad', undefined, t, 'tr'))
      .toBe('model.detail.fieldRequired(label=Ad)');
  });

  it('prefers the schema regex message for a pattern error', () => {
    expect(fieldErrorText({ pattern: true }, 'Plaka', rule({ regexMessage: ' Büyük harf yazın ' }), t, 'tr'))
      .toBe('Büyük harf yazın');
    expect(fieldErrorText({ pattern: true }, 'Plaka', rule({ regexMessage: '  ' }), t, 'tr'))
      .toBe('model.detail.fieldPattern(label=Plaka)');
  });

  it('reads length and range limits from the rule', () => {
    expect(fieldErrorText({ maxlength: {} }, 'Ad', rule({ maxLength: 20 }), t, 'tr'))
      .toBe('model.detail.fieldMaxLength(label=Ad,max=20)');
    expect(fieldErrorText({ min: {} }, 'Yıl', rule({ min: 1990 }), t, 'tr'))
      .toBe('model.detail.fieldMin(label=Yıl,min=1990)');
  });

  it('writes the file size error with a readable size', () => {
    const text = fieldErrorText({ maxFileSize: { limitKb: 512, actualBytes: 2 * 1024 * 1024 } }, 'Belge', undefined, t, 'en');
    expect(text).toBe('model.detail.fieldMaxFileSize(label=Belge,actual=2 MB,limit=512 KB)');
  });

  it('produces no text for an unrecognized error', () => {
    expect(fieldErrorText({ özel: true }, 'Ad', undefined, t, 'tr')).toBeNull();
  });
});
