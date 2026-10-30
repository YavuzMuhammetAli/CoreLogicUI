import { ChangeDetectionStrategy, Component, booleanAttribute, effect, input, numberAttribute, signal } from '@angular/core';
import { IconComponent } from '../icon/icon.component';
import { peekModelIconPath, resolveModelIconPath } from './model-icon-catalog';

/**
 * ModelIconComponent — yayınlanmış modelin ikonu (PublishedTable.Icon, admin yayınlarken seçer).
 *
 * Ad katalogdan (model-icons.manifest.json) gelir; path'i kendi kategorisinin lazy parçasından
 * yüklenir. Ad boşsa, katalogda yoksa ya da parça henüz gelmediyse varsayılan `table` çizilir —
 * bugünkü görünüm, boş kutu yok.
 *
 * Kullanım:  <app-model-icon [icon]="model.icon" size="16" />
 *            <app-model-icon [icon]="t.icon" [filled]="rla.isActive" />   (filled yalnız varsayılan ikonda)
 */
@Component({
    selector: 'app-model-icon',
    imports: [IconComponent],
    template: `
    @if (path(); as d) {
      <svg viewBox="0 -960 960 960" fill="currentColor" focusable="false" aria-hidden="true"
           [attr.width]="size()" [attr.height]="size()">
        <path [attr.d]="d" />
      </svg>
    } @else {
      <app-icon name="table" [size]="size()" [filled]="filled()" />
    }
  `,
    styles: [':host { display: inline-flex; flex-shrink: 0; line-height: 0; } svg { display: block; }'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ModelIconComponent {
  icon = input<string | null | undefined>(null);
  size = input(18, { transform: numberAttribute });
  filled = input(false, { transform: booleanAttribute });

  readonly path = signal<string | null>(null);

  constructor() {
    effect(() => {
      const name = this.icon();
      const cached = peekModelIconPath(name);
      // Önbellekteyse senkron yaz; değilse varsayılan çizilir, parça gelince değişir.
      this.path.set(cached);
      if (cached || !name) return;
      resolveModelIconPath(name).then(d => {
        if (this.icon() === name) this.path.set(d);
      });
    }, { allowSignalWrites: true });
  }
}
