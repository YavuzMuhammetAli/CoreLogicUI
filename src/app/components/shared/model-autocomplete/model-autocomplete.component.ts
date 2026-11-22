import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, input, model, signal } from '@angular/core';

import { TranslatePipe } from '../../../pipes/translate.pipe';
import { closeOnOutsidePointer } from '../../../utils/outside-pointer';
import { IconComponent } from '../icon/icon.component';

/**
 * Simple, dependency-free autocomplete (combobox) for picking a model name.
 *
 * The project has NO ready-made autocomplete; this component fills that gap.
 * Usage: picking the target model in the relationship popup — only PUBLISHED
 * models are passed as `options`.
 *
 * A11y: role="combobox" + aria-expanded/aria-activedescendant, keyboard
 * ↑/↓ navigation, Enter to select, Esc to close.
 */
@Component({
    selector: 'app-model-autocomplete',
    imports: [TranslatePipe, IconComponent],
    templateUrl: './model-autocomplete.component.html',
    styleUrls: ['./model-autocomplete.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ModelAutocompleteComponent {
  private readonly host = inject(ElementRef<HTMLElement>);

  /**
   * Per-instance incrementing counter — makes DOM ids unique.
   *
   * A fixed id can't be used: with two autocompletes on the same page the ids
   * collide and aria-controls / aria-activedescendant point to the wrong element
   * (the screen reader reads a different list).
   */
  private static instanceCount = 0;
  private readonly uid = `model-ac-${++ModelAutocompleteComponent.instanceCount}`;

  /** DOM id of the dropdown list (used by aria-controls). */
  readonly listboxId = `${this.uid}-listbox`;

  /** Selectable model names (only published models should be passed). */
  options = input<string[]>([]);

  /** Whether the input is disabled. */
  disabled = input(false);

  /** Placeholder text (already resolved from its key). */
  placeholder = input('');

  /** Accessibility label. */
  ariaLabel = input('');

  /** Whether to show the red border (aria-invalid) in the invalid state. */
  invalid = input(false);

  /** Selected model name — two-way bound. */
  value = model<string>('');

  /** Filter text typed by the user. */
  readonly query = signal('');
  readonly isOpen = signal(false);
  readonly activeIndex = signal(-1);

  constructor() {
    // Close the list on an outside tap — the listener is attached only while open (see utils/outside-pointer).
    closeOnOutsidePointer(this.isOpen, () => this.host.nativeElement, () => {
      this.isOpen.set(false);
      this.activeIndex.set(-1);
    });
  }

  /** Options filtered by the typed text. */
  readonly filtered = computed(() => {
    const term = this.query().trim().toLowerCase();
    const all = this.options();
    if (!term) return all;
    return all.filter(o => o.toLowerCase().includes(term));
  });

  /** Text shown in the input box: the filter while open, the selected value while closed. */
  readonly displayText = computed(() => (this.isOpen() ? this.query() : this.value()));

  onFocus(): void {
    if (this.disabled()) return;
    this.query.set('');
    this.isOpen.set(true);
    this.activeIndex.set(-1);
  }

  onInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.query.set(input.value);
    this.isOpen.set(true);
    this.activeIndex.set(-1);
  }

  select(option: string): void {
    this.value.set(option);
    this.query.set('');
    this.isOpen.set(false);
    this.activeIndex.set(-1);
  }

  clear(): void {
    this.value.set('');
    this.query.set('');
    this.activeIndex.set(-1);
  }

  onKeydown(event: KeyboardEvent): void {
    if (this.disabled()) return;

    const list = this.filtered();

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.isOpen.set(true);
        this.activeIndex.update(i => (list.length === 0 ? -1 : (i + 1) % list.length));
        break;

      case 'ArrowUp':
        event.preventDefault();
        this.isOpen.set(true);
        this.activeIndex.update(i => (list.length === 0 ? -1 : (i <= 0 ? list.length - 1 : i - 1)));
        break;

      case 'Enter': {
        const index = this.activeIndex();
        if (this.isOpen() && index >= 0 && index < list.length) {
          event.preventDefault();
          this.select(list[index]);
        }
        break;
      }

      case 'Escape':
        if (this.isOpen()) {
          event.preventDefault();
          // The event MUST NOT reach document: this component is used inside the
          // relationship popup, and if the popup's @HostListener('document:keydown.escape')
          // listener fires, the user loses the whole form they filled in while only
          // wanting to close the list. (The document-level counterpart of the same
          // trap was solved in datatype-help with stopImmediatePropagation.)
          event.stopPropagation();
          this.isOpen.set(false);
          this.activeIndex.set(-1);
        }
        break;
    }
  }

  optionId(index: number): string {
    return `${this.uid}-option-${index}`;
  }

  get activeDescendantId(): string | null {
    const index = this.activeIndex();
    return index >= 0 ? this.optionId(index) : null;
  }
}
