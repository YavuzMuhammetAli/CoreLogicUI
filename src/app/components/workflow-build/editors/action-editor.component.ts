import { ChangeDetectionStrategy, Component, OnInit, computed, input, output, signal } from '@angular/core';
import { WorkflowSetField, WorkflowSetMode, WorkflowStep } from '../../../models/workflow.model';
import { PublishedColumn } from '../../../services/published-model.service';
import { TranslatePipe } from '../../../pipes/translate.pipe';
import { parseEnumValues } from '../../model-data/model-data.util';
import { StepTarget } from './condition-editor.component';
import { ExpressionCheck, ValueInputKind, checkExpression, valueInputKind } from './condition-form';
import { addSet, duplicateColumns, removeSet, setColumn, setMode, updateSet, writableColumns } from './action-form';
import { IconComponent } from '../../shared/icon/icon.component';

/**
 * Editor of the field update node: which field gets what (fixed
 * value, formula or clear) and the next step.
 *
 * Works on a COPY of the step; emits the new state on every change (see
 * condition-editor). A fixed value is taken with an input matching the column type — the server
 * expects ISO dates and dot decimals. Formulas use the auto-value language.
 */
@Component({
    selector: 'app-action-editor',
    imports: [TranslatePipe, IconComponent],
    templateUrl: './action-editor.component.html',
    styleUrl: './editors.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ActionEditorComponent implements OnInit {
  readonly step = input.required<WorkflowStep>();
  readonly columns = input<PublishedColumn[]>([]);
  readonly targets = input<StepTarget[]>([]);
  readonly stepKeys = input<string[]>([]);
  readonly readonly = input(false);

  readonly stepChange = output<WorkflowStep>();

  readonly modes: ReadonlyArray<{ value: WorkflowSetMode; labelKey: string }> = [
    { value: 'value', labelKey: 'workflow.action.modeValue' },
    { value: 'formula', labelKey: 'workflow.action.modeFormula' },
    { value: 'clear', labelKey: 'workflow.action.modeClear' }
  ];

  readonly draft = signal<WorkflowStep>({ key: '', type: 'action', name: '' });

  readonly sets = computed(() => this.draft().sets ?? []);
  readonly writable = computed(() => writableColumns(this.columns()));
  readonly duplicates = computed(() => duplicateColumns(this.draft()));

  private readonly columnNames = computed(() => this.columns().map(c => c.columnName));

  /** Per-row formula check (rows in formula mode). */
  readonly checks = computed<Array<ExpressionCheck | null>>(() =>
    this.sets().map(set => set.mode === 'formula'
      ? checkExpression(set.value ?? '', this.columnNames(), this.stepKeys())
      : null));

  ngOnInit(): void {
    this.draft.set(structuredClone(this.step()));
  }

  private apply(transform: (step: WorkflowStep) => WorkflowStep): void {
    if (this.readonly()) return;
    const next = transform(this.draft());
    this.draft.set(next);
    this.stepChange.emit(next);
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

  addSet(): void {
    const used = new Set(this.sets().map(s => s.column.toLowerCase()));
    const free = this.writable().find(c => !used.has(c.columnName.toLowerCase()));
    this.apply(step => addSet(step, free?.columnName ?? ''));
  }

  removeSet(index: number): void {
    this.apply(step => removeSet(step, index));
  }

  onColumn(index: number, event: Event): void {
    const column = (event.target as HTMLSelectElement | HTMLInputElement).value;
    this.apply(step => setColumn(step, index, column));
  }

  onMode(index: number, event: Event): void {
    const mode = (event.target as HTMLSelectElement).value as WorkflowSetMode;
    this.apply(step => setMode(step, index, mode));
  }

  onValue(index: number, event: Event): void {
    const value = (event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value;
    this.apply(step => updateSet(step, index, { value }));
  }

  // ── View helpers ──────────────────────────────────────────────────

  private column(name: string): PublishedColumn | undefined {
    return this.columns().find(c => c.columnName.toLowerCase() === name.toLowerCase());
  }

  inputKind(set: WorkflowSetField): ValueInputKind | 'enum' {
    const column = this.column(set.column);
    if (column?.dataType === 'enum' && parseEnumValues(column.enumValues).length > 0) return 'enum';
    return valueInputKind(column?.dataType);
  }

  enumOptions(set: WorkflowSetField): string[] {
    return parseEnumValues(this.column(set.column)?.enumValues);
  }

  isKnownColumn(name: string): boolean {
    return this.writable().some(c => c.columnName.toLowerCase() === name.toLowerCase());
  }

  isDuplicate(set: WorkflowSetField): boolean {
    return !!set.column && this.duplicates().has(set.column.toLowerCase());
  }

  columnLabel(column: PublishedColumn): string {
    return column.label && column.label !== column.columnName ? `${column.label} (${column.columnName})` : column.columnName;
  }

  modeOf(set: WorkflowSetField): WorkflowSetMode {
    return set.mode ?? 'value';
  }
}
