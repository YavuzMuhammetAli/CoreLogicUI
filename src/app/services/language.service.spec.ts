import { TestBed } from '@angular/core/testing';
import { LanguageService } from './language.service';
import { formatDate, formatNumber } from '../utils/locale-format';

/**
 * Dil tercihi ve çeviri araması; locale-format'ın dile göre biçimlendirmesi.
 */
describe('LanguageService', () => {
  beforeEach(() => localStorage.removeItem('lang'));
  afterEach(() => localStorage.removeItem('lang'));

  function create(): LanguageService {
    TestBed.configureTestingModule({});
    return TestBed.inject(LanguageService);
  }

  it('seçim yoksa tr başlar, kayıtlı en seçimi okunur', () => {
    expect(create().lang()).toBe('tr');

    TestBed.resetTestingModule();
    localStorage.setItem('lang', 'en');
    expect(create().lang()).toBe('en');
  });

  it('toggle dili değiştirir, saklar ve belgeye yazar', () => {
    const service = create();
    service.toggle();
    expect(service.lang()).toBe('en');
    expect(localStorage.getItem('lang')).toBe('en');
    expect(document.documentElement.lang).toBe('en');

    service.toggle();
    expect(service.lang()).toBe('tr');
  });

  it('t() aktif dilde döner, yer tutucuların her geçişini doldurur', () => {
    const service = create();
    expect(service.t('permission.guard.action.delete')).toBe('silme');
    expect(service.t('permission.guard.denied', { model: 'Siparis', action: 'okuma' }))
      .toBe("'Siparis' modeli için okuma yetkiniz yok.");

    service.lang.set('en');
    expect(service.t('permission.guard.action.delete')).toBe('delete');
  });

  it('bilinmeyen anahtarda anahtarın kendisi döner', () => {
    expect(create().t('olmayan.anahtar')).toBe('olmayan.anahtar');
  });
});

describe('locale-format', () => {
  it('sayıyı dilin ayraçlarıyla biçimlendirir', () => {
    expect(formatNumber(1234.5, 'tr')).toBe('1.234,5');
    expect(formatNumber(1234.5, 'en')).toBe('1,234.5');
  });

  it('tarihi dilin ay adlarıyla biçimlendirir', () => {
    const date = new Date(2026, 7, 1);
    expect(formatDate(date, 'tr')).toContain('Ağu');
    expect(formatDate(date, 'en')).toContain('Aug');
  });
});
