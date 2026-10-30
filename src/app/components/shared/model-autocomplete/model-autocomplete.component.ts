import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, input, model, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslatePipe } from '../../../pipes/translate.pipe';
import { closeOnOutsidePointer } from '../../../utils/outside-pointer';
import { IconComponent } from '../icon/icon.component';

/**
 * Model adı seçmek için basit, bağımlılıksız autocomplete (combobox).
 *
 * Projede hazır bir autocomplete YOK; bu component o boşluğu doldurur.
 * Kullanım: ilişki popup'ında hedef model seçimi — yalnızca YAYINLANMIŞ
 * modeller `options` olarak geçilir.
 *
 * A11y: role="combobox" + aria-expanded/aria-activedescendant, klavye ile
 * ↑/↓ gezinme, Enter ile seçme, Esc ile kapatma.
 */
@Component({
    selector: 'app-model-autocomplete',
    imports: [CommonModule, TranslatePipe, IconComponent],
    templateUrl: './model-autocomplete.component.html',
    styleUrls: ['./model-autocomplete.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ModelAutocompleteComponent {
  private readonly host = inject(ElementRef<HTMLElement>);

  /**
   * Örnek başına artan sayaç — DOM id'lerini benzersizleştirir.
   *
   * Sabit id kullanılamaz: aynı sayfada iki autocomplete olduğunda id'ler
   * çakışır ve aria-controls / aria-activedescendant yanlış elemana işaret
   * eder (ekran okuyucu başka bir listeyi okur).
   */
  private static instanceCount = 0;
  private readonly uid = `model-ac-${++ModelAutocompleteComponent.instanceCount}`;

  /** Açılır listenin DOM id'si (aria-controls tarafından kullanılır). */
  readonly listboxId = `${this.uid}-listbox`;

  /** Seçilebilir model adları (yalnızca yayınlanmış modeller verilmelidir). */
  options = input<string[]>([]);

  /** Girdi devre dışı mı. */
  disabled = input(false);

  /** Yer tutucu metin anahtarı çözülmüş hali. */
  placeholder = input('');

  /** Erişilebilirlik etiketi. */
  ariaLabel = input('');

  /** Geçersiz durumda kırmızı çerçeve (aria-invalid) gösterilsin mi. */
  invalid = input(false);

  /** Seçili model adı — iki yönlü bağlanır. */
  value = model<string>('');

  /** Kullanıcının yazdığı filtre metni. */
  readonly query = signal('');
  readonly isOpen = signal(false);
  readonly activeIndex = signal(-1);

  constructor() {
    // Dışarı dokununca listeyi kapat — dinleyici yalnız açıkken bağlı (bkz. utils/outside-pointer).
    closeOnOutsidePointer(this.isOpen, () => this.host.nativeElement, () => {
      this.isOpen.set(false);
      this.activeIndex.set(-1);
    });
  }

  /** Yazılan metne göre filtrelenmiş seçenekler. */
  readonly filtered = computed(() => {
    const term = this.query().trim().toLowerCase();
    const all = this.options();
    if (!term) return all;
    return all.filter(o => o.toLowerCase().includes(term));
  });

  /** Girdi kutusunda gösterilecek metin: açıkken filtre, kapalıyken seçili değer. */
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
          // Olay document'e ÇIKMAMALI: bu component ilişki popup'ının içinde
          // kullanılıyor ve popup'ın @HostListener('document:keydown.escape')
          // dinleyicisi tetiklenirse kullanıcı yalnız listeyi kapatmak isterken
          // doldurduğu tüm formu kaybeder. (Aynı tuzağın document seviyesindeki
          // karşılığı datatype-help'te stopImmediatePropagation ile çözülmüştü.)
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
