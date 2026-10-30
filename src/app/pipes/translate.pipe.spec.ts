import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LanguageService } from '../services/language.service';
import { TranslatePipe } from './translate.pipe';

/**
 * OnPush + impure TranslatePipe etkileşiminin regresyon testi.
 *
 * NEDEN KRİTİK: Uygulamanın tamamı OnPush'a geçirildi. OnPush bir component'i yalnızca
 * girdi referansı, şablon olayı, okuduğu bir signal ya da markForCheck() ile kontrol eder.
 * Dil değişimi bunların hiçbiri gibi görünür — ancak TranslatePipe.transform içinde
 * LanguageService.lang() signal'i okunur ve bu okuma şablon değerlendirmesi sırasında
 * gerçekleştiği için component'i signal'in tüketicisi olarak kaydeder. Dil değişince
 * component kirlenir ve impure pipe yeniden çalışır.
 *
 * Bu test o zincirin kopmadığını doğrular. Kırılırsa: dil butonuna basıldığında
 * ekranlardaki metinler eski dilde KALIR (sessiz, fark edilmesi güç bir regresyon).
 *
 * Pipe'ı `pure: true` yapmak bu testi düşürür: pure pipe girdi ('demo.key') değişmediği
 * için önbelleğe takılır ve eski metni döndürür.
 */
@Component({
    imports: [TranslatePipe],
    template: `<span data-testid="text">{{ 'layout.models' | t }}</span>`,
    changeDetection: ChangeDetectionStrategy.OnPush
})
class OnPushHostComponent {}

describe('TranslatePipe + OnPush', () => {
  let fixture: ComponentFixture<OnPushHostComponent>;
  let language: LanguageService;

  beforeEach(async () => {
    localStorage.removeItem('lang');
    await TestBed.configureTestingModule({ imports: [OnPushHostComponent] }).compileComponents();

    fixture = TestBed.createComponent(OnPushHostComponent);
    language = TestBed.inject(LanguageService);
    fixture.detectChanges();
  });

  function renderedText(): string {
    return (fixture.nativeElement as HTMLElement).querySelector('[data-testid="text"]')!.textContent!.trim();
  }

  it('varsayilan dilde (tr) metni cevirir', () => {
    expect(language.lang()).toBe('tr');
    expect(renderedText()).toBe('Modeller');
  });

  it('OnPush component dil degisiminde YENIDEN render eder', () => {
    const before = renderedText();

    language.toggle();          // tr -> en
    fixture.detectChanges();    // ApplicationRef.tick() esdegeri

    const after = renderedText();
    expect(language.lang()).toBe('en');
    expect(after).not.toBe(before);
    expect(after).toBe('Models');
  });

  it('geri donusta de calisir (en -> tr)', () => {
    language.toggle();
    fixture.detectChanges();
    language.toggle();
    fixture.detectChanges();

    expect(language.lang()).toBe('tr');
    expect(renderedText()).toBe('Modeller');
  });

  afterEach(() => localStorage.removeItem('lang'));
});
