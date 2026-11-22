import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import {
  ASSIGNMENT_MODE_OPTIONS,
  JOIN_MODE_OPTIONS,
  WorkflowAssignmentMode,
  WorkflowEndOutcome,
  WorkflowJoinMode,
  WorkflowRecipient,
  WorkflowSetField,
  WorkflowStep
} from '../../../models/workflow.model';
import { Role } from '../../../models/role';
import { AppUser } from '../../../models/appUser';
import { TranslatePipe } from '../../../pipes/translate.pipe';
import { LanguageService } from '../../../services/language.service';
import { ExitKind, ExitPort, caseKeyOf, exitsOf, sameKey } from '../../../utils/workflow/workflow-exits';
import { NodeKindInfo, nodeKindInfo, nodeKindOf } from '../../../utils/workflow/workflow-node-types';
import { SummaryLookup, assignmentText, recipientText, timerSummary } from '../../../utils/workflow/workflow-step-summary';
import { WorkflowDesignerStore } from './workflow-designer.store';
import { connect, findStep, labelStep, patchStep, renameStep } from './workflow-design.commands';
import { selectNodes } from './workflow-selection';
import { IssueRow } from './workflow-issues';
import {
  ExitRow, KeyProblem, exitRows, keyProblem, setAllowReject, setAssignee, setAssignmentMode,
  setDueHours, setJoinMode, setName
} from './inspector-form';
import { IconComponent } from '../../shared/icon/icon.component';

/** The selected edge as shown in the panel. */
interface EdgeView {
  step: WorkflowStep;
  port: ExitPort;
  kind: ExitKind;
  target: string;
}

/**
 * The designer's right-hand inspector panel — QUICK fields of the selected step.
 *
 * The panel edits the design document directly (the store is component-scoped, provided by the
 * design screen). Every field change is written through a pure transformation; consecutive writes
 * to the same field merge into a single undo step (`inspector:{field}:{step}`).
 * All settings (form fields, branches, SLA policy, button texts) are in the step
 * pop-up; the panel opens it via "Tüm ayarlar…" (All settings…). The panel is not shown on phones.
 */
@Component({
    selector: 'app-workflow-inspector',
    imports: [TranslatePipe, IconComponent],
    templateUrl: './workflow-inspector.component.html',
    styleUrl: './workflow-inspector.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class WorkflowInspectorComponent {
  private readonly languageService = inject(LanguageService);
  readonly store = inject(WorkflowDesignerStore);

  readonly roles = input<Role[]>([]);
  readonly users = input<AppUser[]>([]);
  /** Validation issues of the selected step. */
  readonly issues = input<IssueRow[]>([]);

  /** All settings (step pop-up). */
  readonly openSettings = output<string>();
  readonly makeStart = output<string>();
  readonly duplicate = output<void>();
  readonly remove = output<void>();
  /** Edit the flow's trigger (switches to the Trigger tab). */
  readonly openTrigger = output<void>();

  readonly assignmentModes = ASSIGNMENT_MODE_OPTIONS;
  readonly joinModes = JOIN_MODE_OPTIONS;

  readonly readonly = this.store.readonly;

  /** The step when a single step is selected; otherwise null. */
  readonly node = computed<WorkflowStep | null>(() => {
    const selection = this.store.selection();
    if (selection.edge || selection.nodes.length !== 1) return null;
    return findStep(this.store.doc(), selection.nodes[0]) ?? null;
  });

  readonly kind = computed<NodeKindInfo | null>(() => {
    const step = this.node();
    return step ? nodeKindInfo(nodeKindOf(step)) : null;
  });

  readonly isStart = computed(() => {
    const step = this.node();
    return !!step && sameKey(this.store.graph().startStep, step.key);
  });

  readonly statusLabel = computed(() => {
    const step = this.node();
    if (!step) return '';
    const map = this.store.graph().entityStatusMap;
    const key = Object.keys(map).find(k => sameKey(k, step.key));
    return key ? map[key] : '';
  });

  readonly exits = computed<ExitRow[]>(() => {
    const step = this.node();
    return step ? exitRows(step) : [];
  });

  readonly edge = computed<EdgeView | null>(() => {
    const ref = this.store.selection().edge;
    if (!ref) return null;
    const step = findStep(this.store.doc(), ref.from);
    const exit = step ? exitsOf(step).find(e => e.port === ref.port) : undefined;
    return step && exit
      ? { step, port: ref.port, kind: exit.kind, target: exit.target ?? '' }
      : null;
  });

  /** Flow summary shown when nothing is selected: trigger, condition count, enabled state, start. */
  readonly flow = computed(() => {
    const doc = this.store.doc();
    const start = doc.graph.steps.find(step => sameKey(step.key, doc.graph.startStep));
    return {
      trigger: doc.meta.triggerEvent,
      conditions: doc.conditions.length,
      enabled: doc.meta.isEnabled,
      start: start?.name || doc.graph.startStep || ''
    };
  });

  readonly multiCount = computed(() => {
    const selection = this.store.selection();
    return selection.edge ? 0 : selection.nodes.length;
  });

  /** Target pickers: steps (excluding the selected step), name + key. */
  readonly targets = computed(() => {
    const own = this.node()?.key ?? this.edge()?.step.key ?? '';
    return this.store.graph().steps
      .filter(step => !sameKey(step.key, own))
      .map(step => ({ key: step.key, label: step.name ? `${step.name} (${step.key})` : step.key }));
  });

  /** Branches of the parallel step: name + assignment summary (edited in the pop-up). */
  readonly branches = computed(() => {
    const step = this.node();
    if (step?.type !== 'parallel') return [];
    const lookup = this.lookup();
    return (step.branches ?? []).map(branch => ({
      key: branch.key,
      name: branch.name || branch.key,
      assignee: assignmentText(branch.assignment, lookup)
    }));
  });

  /** Problem of the last rejected key input; cleared when the step changes. */
  readonly keyError = signal<KeyProblem | null>(null);

  private readonly lookup = computed<SummaryLookup>(() => {
    this.languageService.lang();
    const roles = new Map(this.roles().map(role => [role.id, role.name]));
    const users = new Map(this.users().map(user => [user.id, `${user.firstName} ${user.lastName}`]));
    return {
      roleName: id => roles.get(id) ?? null,
      userName: id => users.get(id) ?? null,
      t: (key, params) => this.languageService.t(key, params)
    };
  });

  constructor() {
    effect(() => {
      this.node()?.key;
      untracked(() => this.keyError.set(null));
    });
  }

  // ── Fields ───────────────────────────────────────────────────────────────

  private apply(field: string, transform: (step: WorkflowStep) => WorkflowStep): void {
    const step = this.node();
    if (!step || this.readonly()) return;
    this.store.dispatch(`inspector:${field}:${step.key}`, doc => patchStep(doc, step.key, transform));
  }

  onName(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.apply('name', step => setName(step, value));
  }

  onAssignmentMode(event: Event): void {
    const mode = (event.target as HTMLSelectElement).value as WorkflowAssignmentMode;
    this.apply('mode', step => setAssignmentMode(step, mode));
  }

  onAssignee(event: Event): void {
    const id = Number((event.target as HTMLSelectElement).value) || null;
    this.apply('assignee', step => setAssignee(step, id));
  }

  onDueHours(event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    const hours = raw === '' ? null : Number(raw);
    this.apply('due', step => setDueHours(step, hours));
  }

  onAllowReject(event: Event): void {
    const allow = (event.target as HTMLInputElement).checked;
    this.apply('reject', step => setAllowReject(step, allow));
  }

  onJoinMode(event: Event): void {
    const mode = (event.target as HTMLSelectElement).value as WorkflowJoinMode;
    this.apply('join', step => setJoinMode(step, mode));
  }

  onOutcome(event: Event): void {
    const outcome = (event.target as HTMLSelectElement).value as WorkflowEndOutcome;
    this.apply('outcome', step => (step.outcome ?? 'completed') === outcome ? step : { ...step, outcome });
  }

  onStatusLabel(event: Event): void {
    const step = this.node();
    if (!step || this.readonly()) return;
    const value = (event.target as HTMLInputElement).value;
    this.store.dispatch(`inspector:label:${step.key}`, doc => labelStep(doc, step.key, value));
  }

  onExitTarget(port: ExitPort, event: Event): void {
    const step = this.node() ?? this.edge()?.step;
    if (!step || this.readonly()) return;
    const target = (event.target as HTMLSelectElement).value || null;
    this.store.dispatch('', doc => connect(doc, step.key, port, target));
  }

  /**
   * The key is applied on blur (or Enter) — renaming on every typed letter
   * would move connections and the selection on each keystroke. An invalid
   * key is not applied; the reason is shown below the field.
   */
  commitKey(event: Event): void {
    const step = this.node();
    if (!step || this.readonly()) return;

    const input = event.target as HTMLInputElement;
    const value = input.value.trim();
    if (value === step.key) {
      this.keyError.set(null);
      return;
    }

    const problem = keyProblem(value, this.store.graph().steps.map(s => s.key), step.key);
    this.keyError.set(problem);
    if (problem) return;

    this.store.dispatch('', doc => renameStep(doc, step.key, value));
    this.store.selection.set(selectNodes([value]));
  }

  // ── Labels ─────────────────────────────────────────────────────────────

  /**
   * Text of the exit: a task's positive exit is "Tamamlanınca" (When completed), an approval's "Onaylanınca" (When approved);
   * in a condition the case's label or "Hiçbiri eşleşmezse" (If none matches). The type is read from the step
   * that OWNS the exit — while an edge is selected there is no selected node.
   */
  exitLabel(step: WorkflowStep, port: ExitPort): string {
    const t = (key: string) => this.languageService.t(key);
    const caseKey = caseKeyOf(port);
    if (caseKey !== null) {
      const item = (step.cases ?? []).find(c => c.key === caseKey);
      return t('workflow.inspector.exit.case').replace('{label}', item?.label || caseKey);
    }
    if (port === 'approve' && nodeKindOf(step) === 'task') return t('workflow.inspector.exit.done');
    return t(`workflow.inspector.exit.${port}`);
  }

  /** Empty target option: terminal for approve/reject, "— Seçin —" (Select) on a condition path (missing connection). */
  terminalKey(kind: ExitKind): string {
    switch (kind) {
      case 'approve': return 'workflow.build.terminalCompleted';
      case 'reject':  return 'workflow.build.terminalRejected';
      default:        return 'workflow.inspector.choose';
    }
  }

  /** Wait summary ("2 gün", "Bitis tarihine kadar" — "2 days", "until Bitis"). */
  timerText(step: WorkflowStep): string {
    return timerSummary(step, {
      roleName: () => null,
      userName: () => null,
      t: (key, params) => this.languageService.t(key, params)
    });
  }

  /** Panel summary of a field update row: "= Onaylandı", "formül", "temizlenir" (value, formula, cleared). */
  setSummary(set: WorkflowSetField): string {
    switch (set.mode) {
      case 'clear':   return this.languageService.t('workflow.action.modeClear');
      case 'formula': return this.languageService.t('workflow.action.modeFormula');
      default:        return `= ${set.value ?? ''}`;
    }
  }

  /** Name of the notification recipient (from the role/user list). */
  recipientLabel(recipient: WorkflowRecipient): string {
    if (recipient.kind === 'stepAssignees') {
      const step = this.store.graph().steps.find(s => sameKey(s.key, recipient.stepKey));
      return this.languageService.t('workflow.recipient.stepAssigneesOf', { step: step?.name ?? recipient.stepKey ?? '—' });
    }
    const roles = new Map(this.roles().map(role => [role.id, role.name]));
    const users = new Map(this.users().map(user => [user.id, `${user.firstName} ${user.lastName}`]));
    return recipientText(recipient, {
      roleName: id => roles.get(id) ?? null,
      userName: id => users.get(id) ?? null,
      t: (key, params) => this.languageService.t(key, params)
    });
  }

  /** Panel summary of a condition case: row count or formula. */
  caseSummary(item: NonNullable<WorkflowStep['cases']>[number]): string {
    return item.expression != null
      ? this.languageService.t('workflow.case.summaryFormula')
      : this.languageService.t('workflow.case.summaryRows', { n: item.when.length });
  }

  isSelectedRole(id: number): boolean {
    const assignment = this.node()?.assignment;
    return assignment?.mode === 'role' && Number(assignment.roleId) === id;
  }

  isSelectedUser(id: number): boolean {
    const assignment = this.node()?.assignment;
    return assignment?.mode === 'user' && Number(assignment.userId) === id;
  }
}
