import { ChangeDetectionStrategy, Component, booleanAttribute, computed, input, numberAttribute } from '@angular/core';
import { ICONS, ICONS_FILLED, IconName } from './icons.generated';

/**
 * IconComponent — the ONLY icon source in the app (Material Symbols Outlined, inline SVG).
 *
 * SVG, not a font: only the icons in use go into the bundle, no font download/flicker, works
 * offline, colour comes from `currentColor`. Names are identical to https://fonts.google.com/icons.
 * New icon: add the name to `icons.manifest.json` → `npm run icons`. The name is checked at compile time
 * (`IconName`, strictTemplates) — a wrong name breaks the build.
 *
 * Usage:
 *   <button class="btn btn-primary"><app-icon name="add" size="16" />{{ 'common.add' | t }}</button>
 *   <app-icon name="dashboard" [filled]="rla.isActive" />        → the active menu item is drawn filled
 *   <app-icon name="warning" [label]="'…' | t" />               → a standalone icon that carries meaning
 *
 * Accessibility: without `label` the icon is decorative (`aria-hidden`); on an icon-only button write
 * the text into the button's `aria-label` + `title`, not the icon's.
 */
@Component({
  selector: 'app-icon',
  template: `
    <svg viewBox="0 -960 960 960" fill="currentColor" focusable="false"
         [attr.width]="size()" [attr.height]="size()">
      <path [attr.d]="d()" />
    </svg>
  `,
  styles: [':host { display: inline-flex; flex-shrink: 0; line-height: 0; } svg { display: block; }'],
  host: {
    '[attr.role]': 'label() ? "img" : null',
    '[attr.aria-label]': 'label() || null',
    '[attr.aria-hidden]': 'label() ? null : "true"'
  },
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class IconComponent {
  name = input.required<IconName>();
  /** Pixels; 14–16 in buttons, 18 in menus, 40 in empty states. */
  size = input(18, { transform: numberAttribute });
  /** Filled (FILL=1) variant; icons without a filled variant in the manifest stay outlined. */
  filled = input(false, { transform: booleanAttribute });
  /** If given, the icon is read with `role="img"`; otherwise it is hidden from screen readers. */
  label = input<string | null>(null);

  readonly d = computed(() => (this.filled() && ICONS_FILLED[this.name()]) || ICONS[this.name()]);
}
