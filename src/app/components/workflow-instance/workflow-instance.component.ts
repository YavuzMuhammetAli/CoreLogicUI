import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, computed, inject, signal } from '@angular/core';

import { ActivatedRoute, RouterLink } from '@angular/router';
import { WorkflowInstanceService } from '../../services/workflow-task.service';
import {
  WorkflowChain, WorkflowEvent, WorkflowGraph, WorkflowInstance, WorkflowStepInfo, WorkflowTask, parseDefinition
} from '../../models/workflow.model';
import { LanguageService } from '../../services/language.service';
import { NotificationService } from '../../services/notification.service';
import { PermissionService } from '../../services/permission.service';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { ModelLabelPipe } from '../../pipes/model-label.pipe';
import { ConfirmDialogComponent } from '../shared/confirm-dialog/confirm-dialog.component';
import { CanvasNodeMeta, WorkflowCanvasComponent } from '../shared/workflow-canvas/workflow-canvas.component';
import { WorkflowOverlay } from '../../utils/workflow/workflow-overlay';
import { buildRuntimeOverlay } from '../../utils/workflow/workflow-runtime.overlay';
import { nodeKindInfo, nodeKindOf, nodeTone } from '../../utils/workflow/workflow-node-types';
import { markDirty } from '../../utils/change-detection';
import { formatDate, formatDateTime } from '../../utils/locale-format';
import { IconComponent } from '../shared/icon/icon.component';

/**
 * Process detail — path on the diagram, timeline, tasks and chain verification.
 *
 * The diagram is drawn from the definition of the version the process STARTED with (a version
 * published later doesn't affect this process); passed steps and arrows are painted from the
 * event log. For a process in an incident, the admin says "Yeniden dene" (Retry: roll back to
 * that step = rerun the automatic step) or "Adımı atla" (Skip step).
 *
 * Tasks are grouped by step key: in a parallel step there are several branch tasks under the
 * same StepKey, and a flat list would read like "the same step was opened twice".
 */
@Component({
    selector: 'app-workflow-instance',
    imports: [RouterLink, TranslatePipe, ModelLabelPipe, ConfirmDialogComponent, WorkflowCanvasComponent, IconComponent],
    templateUrl: './workflow-instance.component.html',
    styleUrl: './workflow-instance.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class WorkflowInstanceComponent implements OnInit {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly route = inject(ActivatedRoute);
  private readonly instanceService = inject(WorkflowInstanceService);
  private readonly languageService = inject(LanguageService);
  private readonly notification = inject(NotificationService);
  private readonly permissionService = inject(PermissionService);

  instance: WorkflowInstance | null = null;
  /** Tasks grouped by step key — parallel branches kept together. */
  stepGroups: Array<{ stepKey: string; tasks: WorkflowTask[] }> = [];
  chain: WorkflowChain | null = null;

  loading = false;
  loadError: string | null = null;
  verifying = false;
  cancelling = false;
  pendingCancel = false;

  // ── Rollback ──────────────────────────────────────────────────────────────
  /** Steps in the definition — for choosing the rollback target. */
  steps: WorkflowStepInfo[] = [];
  rollbackTarget = '';
  rollingBack = false;
  pendingRollback = false;

  // ── Diagram ───────────────────────────────────────────────────────────────
  /** A signal so the diagram computations refresh on language change too. */
  private readonly loaded = signal<WorkflowInstance | null>(null);
  readonly graph = computed<WorkflowGraph | null>(() => parseDefinition(this.loaded()?.definitionJson));
  readonly overlay = computed<WorkflowOverlay | null>(() => {
    const instance = this.loaded();
    const graph = this.graph();
    return instance && graph ? buildRuntimeOverlay(graph, instance.timeline ?? [], instance) : null;
  });
  readonly nodeMeta = computed<Record<string, CanvasNodeMeta>>(() => {
    this.languageService.lang();
    const instance = this.loaded();
    const graph = this.graph();
    return instance && graph ? this.runtimeMeta(graph, instance, this.overlay()) : {};
  });

  // ── Incident ──────────────────────────────────────────────────────────────
  retrying = false;
  skipping = false;
  pendingSkip = false;

  get isAdmin(): boolean {
    return this.permissionService.isAdmin();
  }

  get canCancel(): boolean {
    return this.isAdmin && this.instance?.status === 'Running';
  }

  /**
   * Back navigation: admins go to the workflow list, others to the process's record (otherwise
   * to Görevlerim / My tasks). The workflow list is behind adminGuard — a regular user
   * redirected there would be sent to /login.
   */
  get backLink(): unknown[] {
    if (this.isAdmin) return ['/workflows'];
    return this.instance
      ? ['/models', this.instance.entityType, this.instance.entityId]
      : ['/tasks'];
  }

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!id) {
      this.loadError = this.languageService.t('workflow.instance.loadFailed');
      return;
    }
    this.load(id);
  }

  load(id: number): void {
    this.loading = true;
    this.loadError = null;

    this.instanceService.get(id).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.loading = false;
        if (!res.success || !res.data) {
          this.loadError = res.message ?? this.languageService.t('workflow.instance.loadFailed');
          return;
        }
        this.instance = res.data;
        this.loaded.set(res.data);
        this.stepGroups = this.groupByStep(res.data.tasks ?? []);
        if (this.isAdmin) this.loadSteps(id);
      },
      error: err => {
        this.loading = false;
        this.loadError = err?.error?.message ?? this.languageService.t('workflow.instance.serverError');
      }
    });
  }

  /** Task order is preserved; group order is the creation order of the first task. */
  private groupByStep(tasks: WorkflowTask[]): Array<{ stepKey: string; tasks: WorkflowTask[] }> {
    const groups = new Map<string, WorkflowTask[]>();
    for (const task of tasks) {
      const bucket = groups.get(task.stepKey) ?? [];
      bucket.push(task);
      groups.set(task.stepKey, bucket);
    }
    return [...groups.entries()].map(([stepKey, list]) => ({ stepKey, tasks: list }));
  }

  verifyChain(): void {
    if (!this.instance) return;
    this.verifying = true;

    this.instanceService.verifyChain(this.instance.id).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.verifying = false;
        this.chain = res.data ?? null;
      },
      error: err => {
        this.verifying = false;
        this.notification.warn(err?.error?.message ?? this.languageService.t('workflow.instance.serverError'));
      }
    });
  }

  /** Rollback targets come from the definition of the version the instance STARTED with. */
  private loadSteps(instanceId: number): void {
    this.instanceService.steps(instanceId).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        // End can't be a rollback target: entering that step would end the process immediately.
        if (res.success) this.steps = (res.data ?? []).filter(step => step.type !== 'end');
      },
      error: () => { this.steps = []; }
    });
  }

  /** Plain change instead of ngModel: no reactive forms on this screen, not worth pulling in FormsModule. */
  onRollbackTargetChange(event: Event): void {
    this.rollbackTarget = (event.target as HTMLSelectElement).value;
  }

  askRollback(): void {
    if (!this.rollbackTarget) return;
    this.pendingRollback = true;
  }

  cancelRollback(): void { this.pendingRollback = false; }

  confirmRollback(): void {
    const instance = this.instance;
    const target = this.rollbackTarget;
    this.pendingRollback = false;
    if (!instance || !target) return;

    this.rollingBack = true;
    this.instanceService.rollback(instance.id, target).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.rollingBack = false;
        if (res.success) {
          this.notification.success(res.message ?? '');
          this.rollbackTarget = '';
          this.load(instance.id);
        } else {
          this.notification.warn(res.message ?? '');
        }
      },
      error: err => {
        this.rollingBack = false;
        this.notification.warn(err?.error?.message ?? this.languageService.t('workflow.instance.serverError'));
      }
    });
  }

  get rollbackMessage(): string {
    return this.languageService.t('workflow.instance.rollbackConfirm', { step: this.rollbackTarget });
  }

  /** Display name of the step in the incident — otherwise its key. */
  get incidentStepName(): string {
    const key = this.instance?.currentStepKey ?? '';
    const step = this.graph()?.steps.find(s => s.key.toLowerCase() === key.toLowerCase());
    return step?.name || key;
  }

  /**
   * Retry = roll back to the step in the incident: the automatic step reruns in the same
   * transaction. If the record was fixed it moves on; if the error persists the server returns the new
   * error and the process stays in the incident. No confirmation needed — there is no
   * progress to undo (the process is already at that step).
   */
  retryIncident(): void {
    const instance = this.instance;
    if (!instance?.currentStepKey) return;

    this.retrying = true;
    this.instanceService.rollback(instance.id, instance.currentStepKey).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.retrying = false;
        if (res.success) this.notification.success(this.languageService.t('workflow.incident.retried'));
        else this.notification.warn(res.message ?? '');
        this.load(instance.id);
      },
      error: err => {
        this.retrying = false;
        this.notification.warn(err?.error?.message ?? this.languageService.t('workflow.instance.serverError'));
      }
    });
  }

  askSkip(): void { this.pendingSkip = true; }
  cancelSkip(): void { this.pendingSkip = false; }

  confirmSkip(): void {
    const instance = this.instance;
    this.pendingSkip = false;
    if (!instance) return;

    this.skipping = true;
    this.instanceService.skipStep(instance.id).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.skipping = false;
        if (res.success) this.notification.success(res.message || this.languageService.t('workflow.incident.skipped'));
        else this.notification.warn(res.message ?? '');
        this.load(instance.id);
      },
      error: err => {
        this.skipping = false;
        this.notification.warn(err?.error?.message ?? this.languageService.t('workflow.instance.serverError'));
      }
    });
  }

  get skipMessage(): string {
    return this.languageService.t('workflow.incident.skipConfirm', { step: this.incidentStepName });
  }

  askCancel(): void { this.pendingCancel = true; }
  cancelCancel(): void { this.pendingCancel = false; }

  confirmCancel(): void {
    const instance = this.instance;
    this.pendingCancel = false;
    if (!instance) return;

    this.cancelling = true;
    this.instanceService.cancel(instance.id).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.cancelling = false;
        if (res.success) {
          this.notification.success(res.message ?? '');
          this.load(instance.id);
        } else {
          this.notification.warn(res.message ?? '');
        }
      },
      error: err => {
        this.cancelling = false;
        this.notification.warn(err?.error?.message ?? this.languageService.t('workflow.instance.serverError'));
      }
    });
  }

  // ── View helpers ──────────────────────────────────────────────────────────

  /**
   * Bottom line of the node cards: instead of the designer's assignment summary, the process's
   * state at that step (passed / waiting: who / error / not reached).
   */
  private runtimeMeta(
    graph: WorkflowGraph, instance: WorkflowInstance, overlay: WorkflowOverlay | null
  ): Record<string, CanvasNodeMeta> {
    const t = (key: string, params?: Record<string, string | number>) => this.languageService.t(key, params);
    const meta: Record<string, CanvasNodeMeta> = {};

    for (const step of graph.steps) {
      const key = step.key.toLowerCase();
      const info = nodeKindInfo(nodeKindOf(step));
      const state = overlay?.nodes[key] ?? null;
      let summary: string;
      switch (state) {
        case 'current': {
          const until = step.type === 'timer' ? this.waitingUntil(instance, key) : null;
          const who = this.waitingFor(instance.tasks ?? [], key);
          summary = until ? t('workflow.runtime.waitingUntil', { date: until })
            : who ? t('workflow.runtime.waitingFor', { who })
            : t('workflow.runtime.waiting');
          break;
        }
        case 'failed':  summary = t('workflow.runtime.failed'); break;
        case 'visited': summary = t('workflow.runtime.passed'); break;
        case 'end':     summary = t('workflow.runtime.ended'); break;
        default:        summary = t('workflow.runtime.notReached');
      }
      meta[key] = {
        kindLabel: t(info.labelKey),
        tone: nodeTone(step),
        icon: info.icon,
        summary,
        errors: state === 'failed' ? 1 : 0,
        warnings: 0,
        issueTitle: state === 'failed' ? (instance.errorMessage ?? t('workflow.runtime.failed')) : ''
      };
    }
    return meta;
  }

  /** Due time of a wait step: from that step's last TimerScheduled event (in local time). */
  private waitingUntil(instance: WorkflowInstance, stepKey: string): string | null {
    const scheduled = [...(instance.timeline ?? [])].reverse()
      .find(event => event.eventType === 'TimerScheduled' && event.stepKey?.toLowerCase() === stepKey);
    if (!scheduled?.dataJson) return null;
    try {
      const fireAt = (JSON.parse(scheduled.dataJson) as { fireAt?: string }).fireAt;
      return fireAt ? formatDateTime(new Date(fireAt.endsWith('Z') ? fireAt : fireAt + 'Z'), this.languageService.lang()) : null;
    } catch {
      return null;
    }
  }

  /** Role/person the step's pending tasks are assigned to — several in a parallel step. */
  private waitingFor(tasks: WorkflowTask[], stepKey: string): string {
    const names = tasks
      .filter(task => task.status === 'Pending' && task.stepKey.toLowerCase() === stepKey)
      .map(task => this.assigneeOf(task))
      .filter(Boolean);
    return [...new Set(names)].join(', ');
  }

  /** Role or person the task is assigned to — the id if there is no name. */
  assigneeOf(task: WorkflowTask): string {
    if (task.assignedRoleName) return task.assignedRoleName;
    if (task.assignedUserId) return task.assignedUserName || '#' + task.assignedUserId;
    return '';
  }

  eventLabel(event: WorkflowEvent): string {
    return this.languageService.t('workflow.event.' + event.eventType);
  }

  when(value: string | null | undefined): string {
    return value ? formatDate(new Date(value), this.languageService.lang()) : '—';
  }

  statusClass(status: string): string {
    switch (status) {
      case 'Completed': return 'badge-success';
      case 'Rejected':
      case 'Failed':    return 'badge-danger';
      case 'Running':   return 'badge-warn';
      default:          return 'badge-meta';
    }
  }

  taskStatusClass(status: string): string {
    switch (status) {
      case 'Completed': return 'badge-success';
      case 'Rejected':
      case 'Expired':   return 'badge-danger';
      case 'Pending':   return 'badge-warn';
      default:          return 'badge-meta';
    }
  }

  /** Is it a parallel step — if the same step has several branch tasks. */
  isParallelGroup(group: { tasks: WorkflowTask[] }): boolean {
    return group.tasks.some(t => !!t.branchKey);
  }
}
