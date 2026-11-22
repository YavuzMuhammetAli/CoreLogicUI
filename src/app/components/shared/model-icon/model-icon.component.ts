import { ChangeDetectionStrategy, Component, booleanAttribute, effect, input, numberAttribute, signal } from '@angular/core';
import { IconComponent } from '../icon/icon.component';
import { peekModelIconPath, resolveModelIconPath } from './model-icon-catalog';

/**
 * ModelIconComponent — the icon of a published model (PublishedTable.Icon, chosen by the admin when publishing).
 *
 * The name comes from the catalog (model-icons.manifest.json); its path is loaded from its category's
 * lazy chunk. If the name is empty, not in the catalog, or the chunk hasn't arrived yet, the default `table`
 * is drawn — the current look, never an empty box.
 *
 * Usage:     <app-model-icon [icon]="model.icon" size="16" />
 *            <app-model-icon [icon]="t.icon" [filled]="rla.isActive" />   (filled only applies to the default icon)
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
      // If cached, write synchronously; otherwise the default is drawn and swapped when the chunk arrives.
      this.path.set(cached);
      if (cached || !name) return;
      resolveModelIconPath(name).then(d => {
        if (this.icon() === name) this.path.set(d);
      });
    });
  }
}
