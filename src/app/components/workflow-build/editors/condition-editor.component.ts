import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { CASE_OPERATORS, VALUELESS_OPERATORS, WorkflowCase, WorkflowStep } from '../../../models/workflow.model';
import { PublishedColumn } from '../../../services/published-model.service';
import { LanguageService } from '../../../services/language.service';
import { TranslatePipe } from '../../../pipes/translate.pipe';
import {
  ExpressionCheck, ValueInputKind, addCase, addRow, checkExpression, moveCase, removeCase, removeRow,
  setFormulaMode, updateCase, updateRow, valueInputKind
} from './condition-form';
import { IconComponent } from '../../shared/icon/icon.component';

/** Hedef seçicideki adım. */
export interface StepTarget {
  key: string;
  label: string;
}

/**
 * Koşul (karar) düğümünün tam düzenleyicisi — adım pop-up'ında açılır.
 *
 * Adımın KOPYASIYLA çalışır; her değişiklikte yeni hali yayar, pop-up Kaydet'te
 * belgeye yazar (İptal hiçbir şey değiştirmez). Durumlar sırayla denenir — sıra
 * düğmeleri bu yüzden var. Formül modu otomatik değer dilini kullanır ve
 * yazarken istemcide denetlenir (sözdizimi, SEQ, bilinmeyen alan).
 */
@Component({
  selector: 'app-condition-editor',
  standalone: true,
  imports: [TranslatePipe, IconComponent],
  templateUrl: './condition-editor.component.html',
  styleUrl: './editors.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ConditionEditorComponent implements OnInit {
  private readonly languageService = inject(LanguageService);

  readonly step = input.required<WorkflowStep>();
  readonly columns = input<PublishedColumn[]>([]);
  /** Gidilebilecek adımlar (kendisi hariç). */
  readonly targets = input<StepTarget[]>([]);
  /** Tüm adım anahtarları — formülde "adim.alan" denetimi için. */
  readonly stepKeys = input<string[]>([]);
  readonly readonly = input(false);

  readonly stepChange = output<WorkflowStep>();

  readonly operators = CASE_OPERATORS;

  readonly draft = signal<WorkflowStep>({ key: '', type: 'condition', name: '' });

  readonly cases = computed(() => this.draft().cases ?? []);

  private readonly columnNames = computed(() => this.columns().map(c => c.columnName));

  /** Durum başına formül denetimi (formül modundakiler). */
  readonly checks = computed<Array<ExpressionCheck | null>>(() =>
    this.cases().map(c => c.expression == null
      ? null
      : checkExpression(c.expression, this.columnNames(), this.stepKeys())));

  ngOnInit(): void {
    this.draft.set(structuredClone(this.step()));
  }

  private apply(transform: (step: WorkflowStep) => WorkflowStep): void {
    if (this.readonly()) return;
    const next = transform(this.draft());
    this.draft.set(next);
    this.stepChange.emit(next);
  }

  // ── Genel ─────────────────────────────────────────────────────────────────

  onName(event: Event): void {
    const name = (event.target as HTMLInputElement).value;
    this.apply(step => ({ ...step, name }));
  }

  onKey(event: Event): void {
    const key = (event.target as HTMLInputElement).value.trim();
    this.apply(step => ({ ...step, key }));
  }

  onDefault(event: Event): void {
    const value = (event.target as HTMLSelectElement).value || null;
    this.apply(step => ({ ...step, defaultTo: value }));
  }

  // ── Durumlar ──────────────────────────────────────────────────────────────

  addCase(): void {
    this.apply(step => addCase(step, this.languageService.t('workflow.case.newLabel', { n: (step.cases ?? []).length + 1 })));
  }

  removeCase(index: number): void {
    this.apply(step => removeCase(step, index));
  }

  moveCase(index: number, delta: -1 | 1): void {
    this.apply(step => moveCase(step, index, delta));
  }

  onCaseLabel(index: number, event: Event): void {
    const label = (event.target as HTMLInputElement).value;
    this.apply(step => updateCase(step, index, { label }));
  }

  onCaseTarget(index: number, event: Event): void {
    const to = (event.target as HTMLSelectElement).value || null;
    this.apply(step => updateCase(step, index, { to }));
  }

  onMatch(index: number, event: Event): void {
    const match = (event.target as HTMLSelectElement).value as 'all' | 'any';
    this.apply(step => updateCase(step, index, { match }));
  }

  setFormula(index: number, formula: boolean): void {
    this.apply(step => setFormulaMode(step, index, formula));
  }

  onExpression(index: number, event: Event): void {
    const expression = (event.target as HTMLTextAreaElement).value;
    this.apply(step => updateCase(step, index, { expression }));
  }

  // ── Satırlar ──────────────────────────────────────────────────────────────

  addRow(caseIndex: number): void {
    this.apply(step => addRow(step, caseIndex, this.columns()[0]?.columnName ?? ''));
  }

  removeRow(caseIndex: number, rowIndex: number): void {
    this.apply(step => removeRow(step, caseIndex, rowIndex));
  }

  onRowField(caseIndex: number, rowIndex: number, event: Event): void {
    const field = (event.target as HTMLSelectElement | HTMLInputElement).value;
    this.apply(step => updateRow(step, caseIndex, rowIndex, { field }));
  }

  onRowOperator(caseIndex: number, rowIndex: number, event: Event): void {
    const operator = (event.target as HTMLSelectElement).value;
    this.apply(step => updateRow(step, caseIndex, rowIndex, {
      operator, value: VALUELESS_OPERATORS.has(operator) ? null : step.cases![caseIndex].when[rowIndex].value
    }));
  }

  onRowValue(caseIndex: number, rowIndex: number, event: Event): void {
    const value = (event.target as HTMLInputElement | HTMLSelectElement).value;
    this.apply(step => updateRow(step, caseIndex, rowIndex, { value }));
  }

  // ── Görünüm yardımcıları ──────────────────────────────────────────────────

  needsValue(operator: string | null | undefined): boolean {
    return !VALUELESS_OPERATORS.has(operator ?? '');
  }

  inputKind(field: string): ValueInputKind {
    const column = this.columns().find(c => c.columnName.toLowerCase() === field.toLowerCase());
    return valueInputKind(column?.dataType);
  }

  /** Kolon listesinde olmayan (önceki adımın alanı vb.) değer de seçicide kalsın. */
  isKnownColumn(field: string): boolean {
    return this.columns().some(c => c.columnName.toLowerCase() === field.toLowerCase());
  }

  columnLabel(column: PublishedColumn): string {
    return column.label && column.label !== column.columnName ? `${column.label} (${column.columnName})` : column.columnName;
  }

  isFormula(item: WorkflowCase): boolean {
    return item.expression != null;
  }
}
