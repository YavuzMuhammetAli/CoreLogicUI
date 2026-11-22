import { FormGroup } from '@angular/forms';
import { Subscription } from 'rxjs';
import { AutoValuePlan, AutoValueRule, EMPTY_PLAN, computeAutoValues, AutoValuePhase } from './auto-value';
import { DateValue, clientNow } from './expression';

/**
 * Binds auto-value rules to a record form (shared by the model-detail top form and
 * the sub-record pop-up).
 *
 * - Read-only rule targets are `disable`d. The saving side must use `getRawValue()`,
 *   otherwise these fields drop out of the payload.
 * - The computed value is written with `emitEvent: false`: it does not re-trigger our own
 *   `valueChanges` listener and create a loop.
 * - When the form is rebuilt, release the old binding with `stop()` and create a new one.
 */
export class AutoValueFormBinding {
  private sub?: Subscription;
  private last: Record<string, unknown> = {};
  private readonly pendingColumns = new Set<string>();

  constructor(
    private readonly form: FormGroup,
    readonly plan: AutoValuePlan,
    private readonly isNew: boolean,
    private readonly now: () => DateValue = clientNow
  ) {}

  static none(form: FormGroup): AutoValueFormBinding {
    return new AutoValueFormBinding(form, EMPTY_PLAN, false);
  }

  /** Locks read-only fields, applies on-open rules and starts listening for changes. */
  start(): this {
    for (const rule of this.plan.rules) {
      if (rule.readOnly) this.form.get(rule.column)?.disable({ emitEvent: false });
    }
    this.run('open');
    this.last = this.form.getRawValue();

    if (this.plan.rules.some(r => r.trigger === 'change')) {
      this.sub = this.form.valueChanges.subscribe(() => this.onFormChanged());
    }
    return this;
  }

  stop(): void {
    this.sub?.unsubscribe();
    this.sub = undefined;
  }

  /** Called right before saving. */
  runSave(): void {
    this.run('save');
    this.last = this.form.getRawValue();
  }

  rule(column: string): AutoValueRule | undefined {
    return this.plan.byColumn.get(column);
  }

  isReadOnly(column: string): boolean {
    return !!this.plan.byColumn.get(column)?.readOnly;
  }

  /** A field whose number is assigned on save (SEQ) — for the "Kaydedince atanır" (assigned on save) hint. */
  isPending(column: string): boolean {
    return this.pendingColumns.has(column);
  }

  private onFormChanged(): void {
    const raw = this.form.getRawValue() as Record<string, unknown>;
    const changed: string[] = [];
    for (const key of Object.keys(raw)) {
      if (raw[key] !== this.last[key]) changed.push(key);
    }
    this.last = raw;
    if (changed.length > 0) this.run('change', changed);
  }

  private run(phase: AutoValuePhase, changed?: string[]): void {
    if (this.plan.rules.length === 0) return;
    const { patch, pending } = computeAutoValues(this.plan, this.form.getRawValue(), {
      phase, isNew: this.isNew, changed, now: this.now()
    });
    for (const col of pending) this.pendingColumns.add(col);
    for (const [col, value] of Object.entries(patch)) {
      this.form.get(col)?.setValue(value, { emitEvent: false });
    }
    if (Object.keys(patch).length > 0) this.last = this.form.getRawValue();
  }
}
