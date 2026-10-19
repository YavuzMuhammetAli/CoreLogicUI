import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { WorkflowInstanceService } from '../../services/workflow-task.service';
import {
  WorkflowChain, WorkflowEvent, WorkflowGraph, WorkflowInstance, WorkflowStepInfo, WorkflowTask, parseDefinition
} from '../../models/workflow.model';
import { LanguageService } from '../../services/language.service';
import { NotificationService } from '../../services/notification.service';
import { PermissionService } from '../../services/permission.service';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { ConfirmDialogComponent } from '../shared/confirm-dialog/confirm-dialog.component';
import { CanvasNodeMeta, WorkflowCanvasComponent } from '../shared/workflow-canvas/workflow-canvas.component';
import { WorkflowOverlay } from '../../utils/workflow/workflow-overlay';
import { buildRuntimeOverlay } from '../../utils/workflow/workflow-runtime.overlay';
import { nodeKindInfo, nodeKindOf, nodeTone } from '../../utils/workflow/workflow-node-types';
import { markDirty } from '../../utils/change-detection';
import { formatDate, formatDateTime } from '../../utils/locale-format';

/**
 * Süreç detayı — şema üstünde yol, zaman çizelgesi, görevler ve zincir doğrulama.
 *
 * Şema sürecin BAŞLADIĞI sürümün tanımından çizilir (sonradan yayınlanan
 * sürüm bu süreci etkilemez); geçilen adımlar ve oklar olay günlüğünden
 * boyanır. Olaydaki (incident) süreçte yönetici "Yeniden dene" (o adıma
 * geri alma = otomatik adımı yeniden koşturma) ya da "Adımı atla" der.
 *
 * Görevler adım anahtarına göre gruplanır: paralel adımda aynı StepKey altında
 * birden çok dal görevi bulunur ve düz bir liste "aynı adım iki kez açılmış" gibi
 * okunurdu.
 */
@Component({
  selector: 'app-workflow-instance',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslatePipe, ConfirmDialogComponent, WorkflowCanvasComponent],
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
  /** Adım anahtarına göre gruplanmış görevler — paralel dallar bir arada. */
  stepGroups: Array<{ stepKey: string; tasks: WorkflowTask[] }> = [];
  chain: WorkflowChain | null = null;

  loading = false;
  loadError: string | null = null;
  verifying = false;
  cancelling = false;
  pendingCancel = false;

  // ── Rollback ──────────────────────────────────────────────────────────────
  /** Tanımdaki adımlar — rollback hedefi seçimi için. */
  steps: WorkflowStepInfo[] = [];
  rollbackTarget = '';
  rollingBack = false;
  pendingRollback = false;

  // ── Şema ──────────────────────────────────────────────────────────────────
  /** Şema hesapları dil değişiminde de yenilensin diye signal. */
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

  // ── Olay (incident) ───────────────────────────────────────────────────────
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
   * Geri dönüş: yönetici akış listesine, diğerleri sürecin kaydına (yoksa
   * Görevlerim'e). Akış listesi adminGuard'lı — oraya yönlendirilen sıradan
   * kullanıcı /login'e atılırdı.
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

  /** Görev sırası korunur; grup sırası ilk görevin oluşma sırasıdır. */
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

  /** Rollback hedefleri instance'ın BAŞLADIĞI sürümün tanımından gelir. */
  private loadSteps(instanceId: number): void {
    this.instanceService.steps(instanceId).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        // Bitiş geri alma hedefi olamaz: o adıma girmek süreci hemen bitirirdi.
        if (res.success) this.steps = (res.data ?? []).filter(step => step.type !== 'end');
      },
      error: () => { this.steps = []; }
    });
  }

  /** ngModel yerine düz change: bu ekranda reactive form yok, FormsModule getirmeye değmez. */
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

  /** Olaydaki adımın görünen adı — yoksa anahtarı. */
  get incidentStepName(): string {
    const key = this.instance?.currentStepKey ?? '';
    const step = this.graph()?.steps.find(s => s.key.toLowerCase() === key.toLowerCase());
    return step?.name || key;
  }

  /**
   * Yeniden dene = olaydaki adıma geri alma: otomatik adım aynı transaction'da
   * yeniden koşar. Kayıt düzeltildiyse ilerler, hata sürüyorsa sunucu yeni
   * hatayı döner ve süreç olayda kalır. Onay istemez — geri alınacak bir
   * ilerleme yok (süreç zaten o adımda).
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

  // ── Görünüm yardımcıları ──────────────────────────────────────────────────

  /**
   * Düğüm kartlarının alt satırı: tasarımcıdaki atama özeti yerine sürecin o
   * adımdaki durumu (geçildi / bekliyor: kim / hata / ulaşılmadı).
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

  /** Bekleme adımının vadesi: o adımın son TimerScheduled olayından (yerel saatle). */
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

  /** Adımda bekleyen görevlerin atandığı rol/kişi — paralelde birden çok. */
  private waitingFor(tasks: WorkflowTask[], stepKey: string): string {
    const names = tasks
      .filter(task => task.status === 'Pending' && task.stepKey.toLowerCase() === stepKey)
      .map(task => task.assignedRoleName || (task.assignedUserId ? '#' + task.assignedUserId : ''))
      .filter(Boolean);
    return [...new Set(names)].join(', ');
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

  /** Paralel adım mı — aynı adımda birden çok dal görevi varsa. */
  isParallelGroup(group: { tasks: WorkflowTask[] }): boolean {
    return group.tasks.some(t => !!t.branchKey);
  }
}
