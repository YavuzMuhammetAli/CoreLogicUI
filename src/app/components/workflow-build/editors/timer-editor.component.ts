import { ChangeDetectionStrategy, Component, OnInit, computed, input, output, signal } from '@angular/core';
import {
  TIMER_MAX_DAYS, WorkflowStep, WorkflowTimerConfig, WorkflowTimerMode, WorkflowTimerUnit
} from '../../../models/workflow.model';
import { PublishedColumn } from '../../../services/published-model.service';
import { TranslatePipe } from '../../../pipes/translate.pipe';
import { StepTarget } from './condition-editor.component';

/** Süre birimlerinin dakika karşılığı — en fazla bekleme denetimi için. */
const UNIT_MINUTES: Record<WorkflowTimerUnit, number> = { minutes: 1, hours: 60, days: 1440 };

/**
 * Bekleme düğümünün düzenleyicisi: sabit süre ya da kayıttaki bir tarihe kadar
 * (± saat). Tarih İstanbul saatiyle okunur; yalnız tarih alanı gece yarısıdır.
 * Adımın KOPYASIYLA çalışır (bkz. condition-editor).
 */
@Component({
  selector: 'app-timer-editor',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './timer-editor.component.html',
  styleUrl: './editors.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TimerEditorComponent implements OnInit {
  readonly step = input.required<WorkflowStep>();
  readonly columns = input<PublishedColumn[]>([]);
  readonly targets = input<StepTarget[]>([]);
  readonly readonly = input(false);

  readonly stepChange = output<WorkflowStep>();

  readonly units: ReadonlyArray<WorkflowTimerUnit> = ['minutes', 'hours', 'days'];
  readonly maxDays = TIMER_MAX_DAYS;

  readonly draft = signal<WorkflowStep>({ key: '', type: 'timer', name: '' });
  readonly timer = computed<WorkflowTimerConfig>(() => this.draft().timer ?? { mode: 'duration', amount: 1, unit: 'days' });
  readonly mode = computed<WorkflowTimerMode>(() => this.timer().mode ?? 'duration');

  /** Tarih alanı seçicisi: yalnız tarih kolonları. */
  readonly dateColumns = computed(() =>
    this.columns().filter(c => c.dataType === 'datetime' || c.dataType === 'dateonly'));

  /** Süre geçersiz (≤ 0) ya da üst sınırı aşıyor. */
  readonly durationProblem = computed<'invalid' | 'tooLong' | null>(() => {
    const timer = this.timer();
    if (this.mode() !== 'duration') return null;
    const amount = Number(timer.amount ?? 0);
    if (!(amount > 0)) return 'invalid';
    return amount * UNIT_MINUTES[timer.unit ?? 'hours'] > TIMER_MAX_DAYS * 1440 ? 'tooLong' : null;
  });

  ngOnInit(): void {
    this.draft.set(structuredClone(this.step()));
  }

  private apply(transform: (step: WorkflowStep) => WorkflowStep): void {
    if (this.readonly()) return;
    const next = transform(this.draft());
    this.draft.set(next);
    this.stepChange.emit(next);
  }

  private patchTimer(patch: Partial<WorkflowTimerConfig>): void {
    this.apply(step => ({ ...step, timer: { ...this.timer(), ...patch } }));
  }

  onName(event: Event): void {
    const name = (event.target as HTMLInputElement).value;
    this.apply(step => ({ ...step, name }));
  }

  onKey(event: Event): void {
    const key = (event.target as HTMLInputElement).value.trim();
    this.apply(step => ({ ...step, key }));
  }

  onNext(event: Event): void {
    const next = (event.target as HTMLSelectElement).value || null;
    this.apply(step => ({ ...step, next }));
  }

  /** Mod değişince diğer modun alanları temizlenir — kayıtta yarım ayar kalmasın. */
  setMode(mode: WorkflowTimerMode): void {
    if (mode === this.mode()) return;
    this.apply(step => ({
      ...step,
      timer: mode === 'duration'
        ? { mode, amount: 1, unit: 'days' }
        : { mode, field: this.dateColumns()[0]?.columnName ?? null, offsetHours: 0, onMissing: 'continue' }
    }));
  }

  onAmount(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.patchTimer({ amount: value === '' ? null : Number(value) });
  }

  onUnit(event: Event): void {
    this.patchTimer({ unit: (event.target as HTMLSelectElement).value as WorkflowTimerUnit });
  }

  onField(event: Event): void {
    this.patchTimer({ field: (event.target as HTMLSelectElement).value || null });
  }

  onOffset(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.patchTimer({ offsetHours: value === '' ? 0 : Number(value) });
  }

  onMissing(event: Event): void {
    this.patchTimer({ onMissing: (event.target as HTMLSelectElement).value as 'continue' | 'incident' });
  }

  isKnownDateColumn(name: string | null | undefined): boolean {
    return this.dateColumns().some(c => c.columnName.toLowerCase() === (name ?? '').toLowerCase());
  }

  columnLabel(column: PublishedColumn): string {
    return column.label && column.label !== column.columnName ? `${column.label} (${column.columnName})` : column.columnName;
  }
}
