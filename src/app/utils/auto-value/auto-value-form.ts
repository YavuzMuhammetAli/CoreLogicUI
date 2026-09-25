import { FormGroup } from '@angular/forms';
import { Subscription } from 'rxjs';
import { AutoValuePlan, AutoValueRule, EMPTY_PLAN, computeAutoValues, AutoValuePhase } from './auto-value';
import { DateValue, clientNow } from './expression';

/**
 * Otomatik değer kurallarını bir kayıt formuna bağlar (model-detail üst formu ve
 * alt kayıt pop-up'ı ortak kullanır).
 *
 * - Salt okunur kural hedefleri `disable` edilir. Kaydeden taraf `getRawValue()`
 *   kullanmalıdır, yoksa bu alanlar payload'dan düşer.
 * - Hesaplanan değer `emitEvent: false` ile yazılır: kendi `valueChanges`
 *   dinleyicimizi yeniden tetikleyip döngü kurmaz.
 * - Form yeniden kurulduğunda eski bağ `stop()` ile bırakılıp yenisi kurulmalıdır.
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

  /** Salt okunurları kilitler, açılış kurallarını uygular ve değişiklikleri dinlemeye başlar. */
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

  /** Kaydetmeden hemen önce çağrılır. */
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

  /** Numarası kayıtta verilecek alan (SEQ) — "Kaydedince atanır" ipucu için. */
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
