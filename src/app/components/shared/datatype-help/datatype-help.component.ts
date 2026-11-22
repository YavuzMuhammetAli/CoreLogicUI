import '../../../i18n/lazy/datatype-help'; // the help.* dictionary loads with this chunk
import { ChangeDetectionStrategy, Component, computed, HostListener, inject, input, output, signal } from '@angular/core';
import { TranslatePipe } from '../../../pipes/translate.pipe';
import { LanguageService } from '../../../services/language.service';
import { HelpTopic, HelpTopicId, resolveHelpTopic } from './datatype-help.data';
import { REGEX_LAB_MAX_LENGTH, REGEX_PRESETS, REGEX_SYNTAX, RegexPreset } from './regex-presets';

/** Result of the live regex test. */
type RegexTestResult = 'idle' | 'match' | 'nomatch' | 'invalid';

/**
 * DatatypeHelpComponent — full-screen guide dialog for a data type, relationship type
 * or concept.
 *
 * Opened with the "i" button next to the "Veri Tipi" (Data Type) selector in the column popup and the
 * "İlişki Tipi" (Relationship Type) selector in the relationship popup; the "Nasıl çalışır?"
 * (How does it work?) button in the tab toolbars opens concept topics.
 *
 * For short, one-sentence hints `<app-help-hint>` is used instead.
 *
 * IMPORTANT: this dialog always opens ON TOP of an existing popup. That's why
 * the overlay z-index is 1100 (other dialogs use 1000) and when the ESC event is caught
 * `stopPropagation()` is called — otherwise a single ESC press would also close the
 * popup underneath (see the table-detail `onEscape()` chain).
 */
@Component({
    selector: 'app-datatype-help',
    imports: [TranslatePipe],
    templateUrl: './datatype-help.component.html',
    styleUrls: ['./datatype-help.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class DatatypeHelpComponent {
  private readonly languageService = inject(LanguageService);

  /** Whether the dialog is open. */
  open = input(false);

  /** Topic to show: a data type key, 'subModels'/'relationships' or 'rel:<Type>'. */
  topic = input.required<HelpTopicId>();

  closed = output<void>();

  /** When the user presses "Kullan" (Use) on a preset — the caller writes it to the form. */
  patternPicked = output<RegexPreset>();

  readonly presets = REGEX_PRESETS;
  readonly syntax = REGEX_SYNTAX;
  readonly maxLabLength = REGEX_LAB_MAX_LENGTH;

  /**
   * Constraint name patterns of the three FK mechanisms (written in the fkMechanisms diagram).
   * They can't be embedded in the template as plain text: the Angular compiler mistakes the curly
   * braces for an ICU message, so they are printed via interpolation.
   */
  readonly fkNames = {
    tree: 'FK_{tablo}_{üst}',
    lookup: 'FK_{tablo}_{kolon}',
    relationship: 'FK_{tablo}_{kolon}_Rel'
  };

  /** Content of the active topic; falls back to a general topic for an unknown key. */
  content = computed<HelpTopic>(() => resolveHelpTopic(this.topic()));

  // ─── Live regex test ──────────────────────────────────────────────────────

  testPattern = signal('');
  testValue = signal('');

  /**
   * Applies the pattern to the test value. Since the user's pattern runs in the browser,
   * the length limit (REGEX_LAB_MAX_LENGTH) is a crude but sufficient guard against
   * catastrophic backtracking; an invalid pattern is caught with try/catch.
   */
  testResult = computed<RegexTestResult>(() => {
    const pattern = this.testPattern().trim();
    const value = this.testValue();
    if (!pattern || !value) return 'idle';
    if (pattern.length > REGEX_LAB_MAX_LENGTH || value.length > REGEX_LAB_MAX_LENGTH) return 'invalid';

    try {
      return new RegExp(pattern).test(value) ? 'match' : 'nomatch';
    } catch {
      return 'invalid';
    }
  });

  onTestPatternInput(event: Event): void {
    this.testPattern.set((event.target as HTMLInputElement).value);
  }

  onTestValueInput(event: Event): void {
    this.testValue.set((event.target as HTMLInputElement).value);
  }

  /**
   * "Kullan" (Use) — reports the pattern to the calling form and also writes it into the
   * live test box, so the user immediately sees it working.
   */
  usePreset(preset: RegexPreset): void {
    this.testPattern.set(preset.pattern);
    this.testValue.set(preset.sampleOk);
    this.patternPicked.emit(preset);
  }

  /** Accessible label of the "Kullan" (Use) button — includes the pattern name. */
  useAria(preset: RegexPreset): string {
    return this.languageService.t('help.regex.useAria', {
      name: this.languageService.t(`help.regex.preset.${preset.key}`)
    });
  }

  // ─── Closing ────────────────────────────────────────────────────────────────

  close(): void {
    this.closed.emit();
  }

  onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.close();
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscape(event: Event): void {
    if (!this.open()) return;
    // The ESC handler of the popup underneath must not fire on the same press. Since both
    // handlers are on `document`, stopPropagation isn't enough —
    // only this stops the other listeners on the same target.
    event.stopImmediatePropagation();
    this.close();
  }
}
