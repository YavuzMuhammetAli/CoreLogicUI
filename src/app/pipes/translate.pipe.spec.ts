import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LanguageService } from '../services/language.service';
import { TranslatePipe } from './translate.pipe';

/**
 * Regression test of the OnPush + impure TranslatePipe interaction.
 *
 * WHY IT IS CRITICAL: the whole app was switched to OnPush. OnPush checks a component only on
 * an input reference, a template event, a signal it reads, or markForCheck().
 * A language change looks like none of these — but inside TranslatePipe.transform the
 * LanguageService.lang() signal is read, and since that read happens during template evaluation
 * it registers the component as a consumer of the signal. When the language changes
 * the component becomes dirty and the impure pipe runs again.
 *
 * This test verifies that chain is not broken. If it breaks: when the language button is pressed,
 * texts on screens STAY in the old language (a silent regression that is hard to notice).
 *
 * Making the pipe `pure: true` fails this test: a pure pipe gets stuck in its cache because the
 * input ('demo.key') does not change, and returns the old text.
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

  it('also works when switching back (en -> tr)', () => {
    language.toggle();
    fixture.detectChanges();
    language.toggle();
    fixture.detectChanges();

    expect(language.lang()).toBe('tr');
    expect(renderedText()).toBe('Modeller');
  });

  afterEach(() => localStorage.removeItem('lang'));
});
