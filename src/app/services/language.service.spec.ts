import { TestBed } from '@angular/core/testing';
import { LanguageService } from './language.service';
import { formatDate, formatNumber } from '../utils/locale-format';

/**
 * Language preference and translation lookup; language-aware formatting in locale-format.
 */
describe('LanguageService', () => {
  beforeEach(() => localStorage.removeItem('lang'));
  afterEach(() => localStorage.removeItem('lang'));

  function create(): LanguageService {
    TestBed.configureTestingModule({});
    return TestBed.inject(LanguageService);
  }

  it('starts as tr without a choice, reads a saved en choice', () => {
    expect(create().lang()).toBe('tr');

    TestBed.resetTestingModule();
    localStorage.setItem('lang', 'en');
    expect(create().lang()).toBe('en');
  });

  it('toggle switches the language, saves it and writes it to the document', () => {
    const service = create();
    service.toggle();
    expect(service.lang()).toBe('en');
    expect(localStorage.getItem('lang')).toBe('en');
    expect(document.documentElement.lang).toBe('en');

    service.toggle();
    expect(service.lang()).toBe('tr');
  });

  it('t() returns the active language and fills every occurrence of the placeholders', () => {
    const service = create();
    expect(service.t('permission.guard.action.delete')).toBe('silme');
    expect(service.t('permission.guard.denied', { model: 'Siparis', action: 'okuma' }))
      .toBe("'Siparis' modeli için okuma yetkiniz yok.");

    service.lang.set('en');
    expect(service.t('permission.guard.action.delete')).toBe('delete');
  });

  it('returns the key itself for an unknown key', () => {
    expect(create().t('olmayan.anahtar')).toBe('olmayan.anahtar');
  });
});

describe('locale-format', () => {
  it('formats numbers with the language\'s separators', () => {
    expect(formatNumber(1234.5, 'tr')).toBe('1.234,5');
    expect(formatNumber(1234.5, 'en')).toBe('1,234.5');
  });

  it('formats dates with the language\'s month names', () => {
    const date = new Date(2026, 7, 1);
    expect(formatDate(date, 'tr')).toContain('Ağu');
    expect(formatDate(date, 'en')).toContain('Aug');
  });
});
