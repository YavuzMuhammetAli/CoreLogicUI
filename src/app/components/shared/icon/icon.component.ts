import { ChangeDetectionStrategy, Component, booleanAttribute, computed, input, numberAttribute } from '@angular/core';
import { ICONS, ICONS_FILLED, IconName } from './icons.generated';

/**
 * IconComponent — uygulamadaki TEK ikon kaynağı (Material Symbols Outlined, satır içi SVG).
 *
 * Font değil SVG: pakete yalnız kullanılan ikonlar girer, font indirme/titreme yok, çevrimdışı
 * çalışır, renk `currentColor`'dan gelir. Adlar https://fonts.google.com/icons ile birebir aynıdır.
 * Yeni ikon: adı `icons.manifest.json`'a ekle → `npm run icons`. Ad derlemede denetlenir
 * (`IconName`, strictTemplates) — yanlış ad build'i düşürür.
 *
 * Kullanım:
 *   <button class="btn btn-primary"><app-icon name="add" size="16" />{{ 'common.add' | t }}</button>
 *   <app-icon name="dashboard" [filled]="rla.isActive" />        → aktif menü öğesi dolu çizilir
 *   <app-icon name="warning" [label]="'…' | t" />               → anlam taşıyan tek başına ikon
 *
 * Erişilebilirlik: `label` yoksa ikon süstür (`aria-hidden`); yalnız ikonlu düğmede metni
 * düğmenin `aria-label` + `title`'ına yaz, ikona değil.
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
  /** Piksel; düğmede 14–16, menüde 18, boş durumda 40. */
  size = input(18, { transform: numberAttribute });
  /** Dolu (FILL=1) varyant; manifest'te dolu varyantı olmayan ikonda çizgisel kalır. */
  filled = input(false, { transform: booleanAttribute });
  /** Verilirse ikon `role="img"` ile okunur; verilmezse ekran okuyucudan gizlenir. */
  label = input<string | null>(null);

  readonly d = computed(() => (this.filled() && ICONS_FILLED[this.name()]) || ICONS[this.name()]);
}
