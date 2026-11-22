import '../../../i18n/lazy/design'; // the design.* dictionary loads with this chunk
import {
  ChangeDetectionStrategy, Component, ElementRef, HostListener, computed, effect, input, output, signal, untracked, viewChild
} from '@angular/core';
import { Role } from '../../../models/role';
import { TranslatePipe } from '../../../pipes/translate.pipe';
import { RolePickerComponent } from '../role-picker/role-picker.component';

export interface DesignSettings {
  name: string;
  roleIds: number[];
}

/**
 * Design settings dialog — name + roles. Shared by screen design variant and navigation design
 * create/edit; design-specific extra options come through `ng-content`
 * (e.g. "Varsayılan" (Default), "Mevcut tasarımdan kopyala" (Copy from current design)).
 */
@Component({
    selector: 'app-design-settings-dialog',
    imports: [TranslatePipe, RolePickerComponent],
    template: `
    @if (open()) {
      <div class="dialog-overlay" (click)="cancel()">
        <form class="dialog-panel panel" role="dialog" aria-modal="true" [attr.aria-label]="title()"
              (click)="$event.stopPropagation()" (submit)="$event.preventDefault(); submit()">
          <div class="panel-head"><h3>{{ title() }}</h3></div>
          <div class="panel-body stack">
            <div class="field">
              <label for="design-name">{{ 'design.settings.name' | t }}</label>
              <input #nameInput id="design-name" class="input" maxlength="100" autocomplete="off"
                     [value]="nameValue()" (input)="nameValue.set($any($event.target).value)"
                     [attr.aria-invalid]="touched() && !nameValid()" aria-describedby="design-name-error" />
              @if (touched() && !nameValid()) {
                <span id="design-name-error" class="field-error" role="alert">{{ 'design.settings.nameRequired' | t }}</span>
              }
            </div>

            @if (showRoles()) {
              <div class="field">
                <span class="field-label" id="design-roles-label">{{ 'design.roles.label' | t }}</span>
                <app-role-picker [roles]="roles()" [selected]="roleValue()" (selectedChange)="roleValue.set($event)"
                                 [label]="'design.roles.label' | t" />
                @if (rolesHint()) { <span class="field-help">{{ rolesHint() }}</span> }
                @if (touched() && !rolesValid()) {
                  <span class="field-error" role="alert">{{ 'design.settings.rolesRequired' | t }}</span>
                }
              </div>
            }

            <ng-content />
          </div>
          <div class="panel-actions">
            <button type="button" class="btn btn-secondary" (click)="cancel()" [disabled]="busy()">{{ 'common.cancel' | t }}</button>
            <button type="submit" class="btn btn-primary" [disabled]="busy()">
              @if (busy()) { <span class="spinner" aria-hidden="true"></span> }
              {{ confirmLabel() || ('common.save' | t) }}
            </button>
          </div>
        </form>
      </div>
    }
  `,
    styleUrls: ['../confirm-dialog/confirm-dialog.component.scss'],
    styles: [`.field-label { font-weight: 600; font-size: var(--text-sm); color: var(--fg-2); }`],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class DesignSettingsDialogComponent {
  open = input(false);
  title = input('');
  name = input('');
  roleIds = input<readonly number[]>([]);
  roles = input<readonly Role[]>([]);
  /** Whether to show the role field (e.g. the default screen design has no roles). */
  showRoles = input(true);
  /** At least one role is required (role-specific screen design). */
  rolesRequired = input(false);
  /** Help text under the role field (translated). */
  rolesHint = input('');
  confirmLabel = input('');
  busy = input(false);

  confirmed = output<DesignSettings>();
  cancelled = output<void>();

  readonly nameValue = signal('');
  readonly roleValue = signal<number[]>([]);
  readonly touched = signal(false);
  readonly nameValid = computed(() => {
    const name = this.nameValue().trim();
    return name.length > 0 && name.length <= 100;
  });
  readonly rolesValid = computed(() => !this.showRoles() || !this.rolesRequired() || this.roleValue().length > 0);

  private readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');

  constructor() {
    // Start from the inputs on every opening; text left from a previous opening must not leak.
    effect(() => {
      if (!this.open()) return;
      untracked(() => {
        this.nameValue.set(this.name());
        this.roleValue.set([...this.roleIds()]);
        this.touched.set(false);
      });
      queueMicrotask(() => this.nameInput()?.nativeElement.focus());
    });
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.open() && !this.busy()) this.cancel();
  }

  submit(): void {
    if (this.busy()) return;
    this.touched.set(true);
    if (!this.nameValid() || !this.rolesValid()) return;
    this.confirmed.emit({ name: this.nameValue().trim(), roleIds: this.showRoles() ? this.roleValue() : [] });
  }

  cancel(): void {
    if (!this.busy()) this.cancelled.emit();
  }
}
