import {
  ChangeDetectionStrategy, Component, ElementRef, computed, effect, input, output, signal, untracked, viewChild
} from '@angular/core';
import { TranslatePipe } from '../../../pipes/translate.pipe';
import { IconComponent } from '../icon/icon.component';
import { ModelIconComponent } from './model-icon.component';
import { loadAllModelIconPaths } from './model-icon-catalog';
import { MODEL_ICON_CATEGORIES, ModelIconCategory } from './model-icons.generated';

/**
 * Model ikonu seçici — kategorili, aranabilir ızgara (Material Symbols kataloğu).
 *
 * İki kip:
 *  - `publish`: Yayınla'ya basınca açılır; onay düğmesi "Yayınla" — ikon seçmek opsiyoneldir.
 *  - `select` : şema ekranı başlığındaki ikon düğmesi; onay düğmesi "Seç".
 * Onay `confirmed`'e seçili adı (varsayılan için null) yayar; kaydetmek çağıranın işidir.
 *
 * Kullanım:
 *   <app-model-icon-picker [open]="pickerOpen()" mode="publish" [current]="icon()" [busy]="publishing"
 *     (confirmed)="onIconConfirmed($event)" (cancelled)="pickerOpen.set(false)" />
 */
@Component({
    selector: 'app-model-icon-picker',
    imports: [TranslatePipe, IconComponent, ModelIconComponent],
    templateUrl: './model-icon-picker.component.html',
    styleUrl: './model-icon-picker.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ModelIconPickerComponent {
  open = input(false);
  mode = input<'publish' | 'select'>('select');
  /** Modelin kayıtlı ikonu — açılışta seçili gelir. */
  current = input<string | null | undefined>(null);
  busy = input(false);

  confirmed = output<string | null>();
  cancelled = output<void>();

  readonly selected = signal<string | null>(null);
  readonly query = signal('');
  readonly paths = signal<Readonly<Record<string, string>> | null>(null);
  readonly loadError = signal(false);

  private readonly searchBox = viewChild<ElementRef<HTMLInputElement>>('searchBox');

  /** Aramaya uyan kategoriler (boş kategori gizlenir). Ad, "_"siz ad ve TR anahtar kelimede arar. */
  readonly visible = computed<ModelIconCategory[]>(() => {
    const q = this.query().trim().toLocaleLowerCase('tr');
    if (!q) return MODEL_ICON_CATEGORIES as ModelIconCategory[];
    return MODEL_ICON_CATEGORIES
      .map(c => ({
        key: c.key,
        icons: c.icons.filter(i =>
          i.name.includes(q) || i.name.replace(/_/g, ' ').includes(q) || i.keywords.toLocaleLowerCase('tr').includes(q))
      }))
      .filter(c => c.icons.length > 0);
  });

  constructor() {
    // Her açılışta: seçimi kayıtlı ikona eşitle, aramayı temizle, kataloğu yükle, aramaya odaklan.
    effect(() => {
      if (!this.open()) return;
      untracked(() => {
        this.selected.set(this.current() || null);
        this.query.set('');
        this.loadError.set(false);
        if (!this.paths()) {
          loadAllModelIconPaths().then(p => this.paths.set(p), () => this.loadError.set(true));
        }
        setTimeout(() => this.searchBox()?.nativeElement.focus());
      });
    }, { allowSignalWrites: true });
  }

  select(name: string | null): void {
    this.selected.set(name);
  }

  confirm(): void {
    if (!this.busy()) this.confirmed.emit(this.selected());
  }

  cancel(): void {
    if (!this.busy()) this.cancelled.emit();
  }

  onSearch(value: string): void {
    this.query.set(value);
  }

  /** Izgarada ok tuşlarıyla gezinme: ←/→ sıradaki hücre, ↑/↓ aynı ızgarada bir satır. */
  onCellKey(event: KeyboardEvent): void {
    const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
    if (!keys.includes(event.key)) return;
    const cell = event.target as HTMLElement;
    const panel = cell.closest('.dialog-panel');
    if (!panel) return;
    event.preventDefault();

    const all = Array.from(panel.querySelectorAll<HTMLElement>('.picker-cell'));
    const index = all.indexOf(cell);
    let next = index;
    if (event.key === 'ArrowLeft') next = index - 1;
    else if (event.key === 'ArrowRight') next = index + 1;
    else {
      const grid = cell.parentElement!;
      const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length || 1;
      next = index + (event.key === 'ArrowDown' ? cols : -cols);
    }
    all[Math.max(0, Math.min(all.length - 1, next))]?.focus();
  }
}
