import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import {
  WorkflowDefinition, WorkflowGraph, WorkflowSimDecision, WorkflowSimulation
} from '../../../models/workflow.model';
import { PublishedColumn } from '../../../services/published-model.service';
import { WorkflowService } from '../../../services/workflow.service';
import { LanguageService } from '../../../services/language.service';
import { TranslatePipe } from '../../../pipes/translate.pipe';
import { caseKeyOf } from '../../../utils/workflow/workflow-exits';
import { nodeKindOf } from '../../../utils/workflow/workflow-node-types';
import { ValueInputKind, valueInputKind } from '../editors/condition-form';

/** Kararı sorulan insan adımı (paralelde her dal ayrı satır). */
interface DecisionRow {
  id: string;
  stepKey: string;
  branchKey: string | null;
  label: string;
  /** Görev (reddi kapalı) yalnız tamamlanabilir. */
  canReject: boolean;
}

/** Simülasyonda geçilen adımın ekran satırı. */
interface PathRow {
  seq: number;
  name: string;
  exit: string | null;
}

/**
 * Tasarımcıdaki "Simüle et" paneli. Akış (kaydedilmemiş taslak olabilir) bir
 * örnek kayıt — ya da var olan bir kaydın değerleri — ve insan adımı
 * kararlarıyla SUNUCUDA bellekte koşturulur; gerçek motorun fonksiyonları
 * kullanıldığı için görülen yol, yayından sonra izlenecek yoldur. Hiçbir şey
 * yazılmaz. Sonuç şemada boyanır (overlay).
 */
@Component({
  selector: 'app-workflow-simulate-panel',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './workflow-simulate-panel.component.html',
  styleUrl: './workflow-simulate-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class WorkflowSimulatePanelComponent {
  private readonly workflowService = inject(WorkflowService);
  private readonly languageService = inject(LanguageService);

  readonly graph = input.required<WorkflowGraph>();
  /** Kaydedilecek tanımın gövdesi (docToPayload). */
  readonly payload = input.required<Partial<WorkflowDefinition>>();
  readonly columns = input<PublishedColumn[]>([]);

  readonly simulated = output<WorkflowSimulation | null>();
  readonly closed = output<void>();

  readonly source = signal<'sample' | 'record'>('sample');
  readonly values = signal<Record<string, string | undefined>>({});
  readonly entityId = signal<string>('');
  readonly decisions = signal<Record<string, 'approve' | 'reject'>>({});

  readonly running = signal(false);
  readonly result = signal<WorkflowSimulation | null>(null);
  readonly error = signal<string | null>(null);

  readonly decisionRows = computed<DecisionRow[]>(() =>
    this.graph().steps.flatMap((step): DecisionRow[] => {
      if (step.type === 'parallel') {
        return (step.branches ?? []).map(branch => ({
          id: `${step.key}/${branch.key}`, stepKey: step.key, branchKey: branch.key,
          label: `${step.name || step.key} / ${branch.name || branch.key}`,
          canReject: branch.form?.allowReject !== false
        }));
      }
      if (step.type === 'condition' || step.type === 'end') return [];
      return [{
        id: step.key, stepKey: step.key, branchKey: null, label: step.name || step.key,
        canReject: nodeKindOf(step) !== 'task'
      }];
    }));

  readonly pathRows = computed<PathRow[]>(() => {
    const result = this.result();
    if (!result) return [];
    const steps = this.graph().steps;
    return result.path.map(entry => {
      const step = steps.find(s => s.key.toLowerCase() === entry.stepKey.toLowerCase());
      return { seq: entry.seq, name: step?.name || entry.stepKey, exit: this.exitText(step?.cases, entry.port) };
    });
  });

  inputKind(column: PublishedColumn): ValueInputKind {
    return valueInputKind(column.dataType);
  }

  columnLabel(column: PublishedColumn): string {
    return column.label || column.columnName;
  }

  setValue(column: string, event: Event): void {
    const target = event.target as HTMLInputElement | HTMLSelectElement;
    this.values.update(values => ({ ...values, [column]: target.value }));
  }

  setDecision(id: string, event: Event): void {
    const value = (event.target as HTMLSelectElement).value as 'approve' | 'reject';
    this.decisions.update(decisions => ({ ...decisions, [id]: value }));
  }

  decisionOf(id: string): 'approve' | 'reject' {
    return this.decisions()[id] ?? 'approve';
  }

  run(): void {
    this.running.set(true);
    this.error.set(null);

    const decisions: WorkflowSimDecision[] = this.decisionRows().map(row => ({
      stepKey: row.stepKey, branchKey: row.branchKey, decision: this.decisionOf(row.id)
    }));

    const useRecord = this.source() === 'record';
    this.workflowService.simulate({
      definition: this.payload(),
      record: useRecord ? undefined : this.sampleRecord(),
      entityId: useRecord ? Number(this.entityId()) || null : null,
      decisions
    }).subscribe({
      next: res => {
        this.running.set(false);
        if (!res.success || !res.data) {
          this.error.set(res.message || this.languageService.t('workflow.simulate.failed'));
          this.result.set(null);
          this.simulated.emit(null);
          return;
        }
        this.result.set(res.data);
        this.simulated.emit(res.data);
      },
      error: err => {
        this.running.set(false);
        this.error.set(err?.error?.message ?? this.languageService.t('workflow.build.serverError'));
      }
    });
  }

  clear(): void {
    this.result.set(null);
    this.error.set(null);
    this.simulated.emit(null);
  }

  /** Örnek kayıt: sayı kolonları sayı, mantıksal kolonlar bool, boşlar gönderilmez. */
  private sampleRecord(): Record<string, string | number | boolean | null> {
    const record: Record<string, string | number | boolean | null> = {};
    for (const column of this.columns()) {
      const raw = this.values()[column.columnName];
      if (raw == null || raw === '') continue;
      switch (valueInputKind(column.dataType)) {
        case 'number': {
          const n = Number(raw);
          if (Number.isFinite(n)) record[column.columnName] = n;
          break;
        }
        case 'boolean':
          record[column.columnName] = raw === 'true';
          break;
        default:
          record[column.columnName] = raw;
      }
    }
    return record;
  }

  private exitText(cases: Array<{ key: string; label?: string | null }> | undefined, port: string | null | undefined): string | null {
    if (!port) return null;
    const t = (key: string) => this.languageService.t(key);
    const caseKey = caseKeyOf(port);
    if (caseKey !== null) {
      const item = (cases ?? []).find(c => c.key === caseKey);
      return item?.label || caseKey;
    }
    return t(`workflow.inspector.exit.${port}`);
  }

  outcomeKey(outcome: string): string {
    return `workflow.simulate.outcome.${outcome}`;
  }
}
