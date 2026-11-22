import '../../../i18n/lazy/design'; // the design.* dictionary loads with this chunk
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Role } from '../../../models/role';
import { TranslatePipe } from '../../../pipes/translate.pipe';
import { IconComponent } from '../icon/icon.component';

/**
 * Role picker — the roles a design (screen variant, navigation) is assigned to. Roles come from the caller
 * (`RoleAdminService.getRoles`); the component makes no requests. Multi-select: toggle chips
 * that are easy to press on touch too (`aria-pressed`).
 */
@Component({
    selector: 'app-role-picker',
    imports: [TranslatePipe, RouterLink, IconComponent],
    template: `
    @if (roles().length === 0) {
      <p class="field-help">
        {{ 'design.roles.none' | t }}
        <a routerLink="/roles">{{ 'design.roles.manage' | t }}</a>
      </p>
    } @else {
      <div class="role-chips" role="group" [attr.aria-label]="label() || ('design.roles.label' | t)">
        @for (role of roles(); track role.id) {
          <button type="button" class="role-chip" [attr.aria-pressed]="isSelected(role.id)"
                  [disabled]="disabled()" (click)="toggle(role.id)">
            @if (isSelected(role.id)) { <app-icon name="check" size="14" /> }
            {{ role.name }}
          </button>
        }
      </div>
      @if (missing().length > 0) {
        <p class="field-help">{{ 'design.roles.missing' | t:{ count: missing().length } }}</p>
      }
    }
  `,
    styles: [`
    .role-chips { display: flex; flex-wrap: wrap; gap: var(--space-2); }
    .role-chip {
      display: inline-flex; align-items: center; gap: var(--space-1);
      min-height: 32px; padding: 0 var(--space-3);
      border: 1px solid var(--border); border-radius: 999px;
      background: var(--surface); color: var(--fg-2); font: inherit; font-size: var(--text-sm);
      cursor: pointer;
    }
    .role-chip:hover:not(:disabled) { border-color: var(--accent); }
    .role-chip[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: #fff; }
    .role-chip:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
    .role-chip:disabled { opacity: .6; cursor: default; }
  `],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class RolePickerComponent {
  roles = input<readonly Role[]>([]);
  selected = input<readonly number[]>([]);
  disabled = input(false);
  /** Accessible name of the group ("Roller" (Roles) if empty). */
  label = input('');

  selectedChange = output<number[]>();

  private readonly selectedSet = computed(() => new Set(this.selected()));
  /** Selected roles that no longer exist (deleted) — dropped on save. */
  readonly missing = computed(() => {
    const known = new Set(this.roles().map(r => r.id));
    return this.selected().filter(id => !known.has(id));
  });

  isSelected(id: number): boolean {
    return this.selectedSet().has(id);
  }

  toggle(id: number): void {
    const known = new Set(this.roles().map(r => r.id));
    const next = this.isSelected(id)
      ? this.selected().filter(x => x !== id)
      : [...this.selected(), id];
    this.selectedChange.emit(next.filter(x => known.has(x)));
  }
}

/** Maps role ids to names (deleted roles are skipped). */
export function roleNames(roles: readonly Role[], ids: readonly number[]): string[] {
  const byId = new Map(roles.map(r => [r.id, r.name]));
  return ids.map(id => byId.get(id)).filter((name): name is string => !!name);
}
