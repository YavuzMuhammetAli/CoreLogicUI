import {
  ChangeDetectionStrategy, Component, ElementRef, HostListener, Injector, PLATFORM_ID,
  afterNextRender, computed, effect, inject, input, output, signal, untracked, viewChild
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Subscription } from 'rxjs';
import { WorkflowInstanceService } from '../../../services/workflow-task.service';
import { WorkflowGraph, WorkflowInstance, parseDefinition } from '../../../models/workflow.model';
import { LanguageService } from '../../../services/language.service';
import { TranslatePipe } from '../../../pipes/translate.pipe';
import { CanvasNodeMeta, CanvasSelection, WorkflowCanvasComponent } from '../workflow-canvas/workflow-canvas.component';
import { WorkflowOverlay } from '../../../utils/workflow/workflow-overlay';
import { buildRuntimeOverlay } from '../../../utils/workflow/workflow-runtime.overlay';
import {
  StepEntry, StepHistory, buildStepHistory, lastDecision, waitingNames
} from '../../../utils/workflow/workflow-step-history';
import { nodeKindInfo, nodeKindOf, nodeTone } from '../../../utils/workflow/workflow-node-types';
import { formatDateTime } from '../../../utils/locale-format';
import { placeTooltip } from './tooltip-position';
import { IconComponent } from '../icon/icon.component';

/** İpucundaki bir satır — karar, bekleyen ya da otomatik adımın sonucu. */
interface TipLine {
  label: string;
  tone: 'success' | 'danger' | 'warn' | 'meta';
  who?: string;
  when?: string;
  branch?: string;
  people?: string[];
  more?: number;
  note?: string;
  comment?: string;
}

interface TipView {
  title: string;
  kind: string;
  state: string;
  stateTone: TipLine['tone'];
  lines: TipLine[];
}

/** Rol havuzunda en fazla bu kadar üye adı yazılır, gerisi "+N kişi". */
const MAX_PEOPLE = 8;

/**
 * "Akışı görüntüle" — kaydın sürecini YALNIZ ilerlediği yere kadar çizer.
 *
 * Simülasyon ve yöneticinin süreç ekranı tüm şemayı gösterip ulaşılmayanı
 * soluklaştırır; burada ulaşılmayan adım hiç çizilmez (`pathOnly`). Düğümün
 * üstüne gelince (dokunmatikte dokununca) kim onayladı / kimin onayı bekleniyor
 * kartı açılır. Adlar sunucudan gelir — sıradan kullanıcı /User ve /Role
 * uçlarını çağıramaz. Görme yetkisi sunucuda (IWorkflowAccessPolicy).
 */
@Component({
    selector: 'app-workflow-view-dialog',
    imports: [TranslatePipe, WorkflowCanvasComponent, IconComponent],
    templateUrl: './workflow-view-dialog.component.html',
    styleUrl: './workflow-view-dialog.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class WorkflowViewDialogComponent {
  /** Gösterilecek süreç; null → diyalog kapalı. */
  readonly instanceId = input<number | null>(null);
  readonly closed = output<void>();

  private readonly instanceService = inject(WorkflowInstanceService);
  private readonly languageService = inject(LanguageService);
  private readonly injector = inject(Injector);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly canvas = viewChild(WorkflowCanvasComponent);
  private readonly tipRef = viewChild<ElementRef<HTMLElement>>('tip');

  readonly instance = signal<WorkflowInstance | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  private request: Subscription | null = null;

  readonly graph = computed<WorkflowGraph | null>(() => parseDefinition(this.instance()?.definitionJson));
  readonly overlay = computed<WorkflowOverlay | null>(() => {
    const instance = this.instance();
    const graph = this.graph();
    return instance && graph ? buildRuntimeOverlay(graph, instance.timeline ?? [], instance) : null;
  });
  private readonly history = computed<Record<string, StepHistory>>(() => {
    const instance = this.instance();
    const graph = this.graph();
    const overlay = this.overlay();
    return instance && graph && overlay ? buildStepHistory(graph, instance, overlay) : {};
  });
  readonly nodeMeta = computed<Record<string, CanvasNodeMeta>>(() => {
    this.languageService.lang();
    return this.cardMeta(this.graph(), this.history());
  });

  // ── İpucu ─────────────────────────────────────────────────────────────────
  /** Fareyle üstünde durulan düğüm. */
  readonly hovered = signal<string | null>(null);
  /** Dokunuş / tıklamayla sabitlenen düğüm — fare ayrılınca da açık kalır. */
  readonly pinned = signal<string | null>(null);
  readonly selected = computed(() => { const key = this.pinned(); return key ? [key] : []; });
  private readonly tipKey = computed(() => this.hovered() ?? this.pinned());
  readonly tip = computed<TipView | null>(() => {
    this.languageService.lang();
    const key = this.tipKey()?.toLowerCase();
    const graph = this.graph();
    const history = key ? this.history()[key] : undefined;
    const step = key ? graph?.steps.find(s => s.key.toLowerCase() === key) : undefined;
    return history && step ? this.describe(history, nodeKindOf(step) === 'task', nodeKindInfo(nodeKindOf(step)).labelKey) : null;
  });
  /** null → ölçülüyor (görünmez çizilir, sonra yerine konur). */
  readonly tipPos = signal<{ top: number; left: number } | null>(null);

  constructor() {
    effect(() => {
      const id = this.instanceId();
      untracked(() => (id ? this.load(id) : this.reset()));
    }, { allowSignalWrites: true });

    // İpucu her değişimde önce görünmez çizilir, ölçülüp düğümün yanına konur.
    effect(() => {
      this.tip();
      untracked(() => {
        this.tipPos.set(null);
        if (this.isBrowser) afterNextRender(() => this.placeTip(), { injector: this.injector });
      });
    }, { allowSignalWrites: true });
  }

  private load(id: number): void {
    this.request?.unsubscribe();
    this.instance.set(null);
    this.error.set(null);
    this.hovered.set(null);
    this.pinned.set(null);
    this.loading.set(true);

    this.request = this.instanceService.get(id).subscribe({
      next: res => {
        this.loading.set(false);
        if (res.success && res.data) this.instance.set(res.data);
        else this.error.set(res.message || this.languageService.t('workflow.view.loadFailed'));
      },
      error: err => {
        this.loading.set(false);
        this.error.set(err?.error?.message || this.languageService.t('workflow.view.loadFailed'));
      }
    });
  }

  private reset(): void {
    this.request?.unsubscribe();
    this.request = null;
    this.instance.set(null);
    this.error.set(null);
    this.loading.set(false);
    this.hovered.set(null);
    this.pinned.set(null);
  }

  close(): void {
    this.closed.emit();
  }

  /** Esc önce sabitlenmiş ipucunu, sonra diyaloğu kapatır. */
  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.instanceId() === null) return;
    if (this.pinned()) this.pinned.set(null);
    else this.close();
  }

  onNodeHover(key: string | null): void {
    this.hovered.set(key);
  }

  /** Salt-okunur tuvalde dokunuş/tık seçimi = ipucunu sabitle; zemine dokunmak kapatır. */
  onSelection(selection: CanvasSelection): void {
    this.pinned.set(selection.nodes[0] ?? null);
  }

  /** Kaydırma/yakınlaştırma: ipucu düğümden kopmasın diye kapanır. */
  onCameraChange(): void {
    if (this.hovered() || this.pinned()) {
      this.hovered.set(null);
      this.pinned.set(null);
    }
  }

  private placeTip(): void {
    const key = this.tipKey();
    const anchor = key ? this.canvas()?.nodeScreenRect(key) : null;
    const element = this.tipRef()?.nativeElement;
    if (!anchor || !element) return;

    const size = element.getBoundingClientRect();
    const { top, left } = placeTooltip(anchor, size, { width: window.innerWidth, height: window.innerHeight });
    this.tipPos.set({ top, left });
  }

  // ── Görünüm ───────────────────────────────────────────────────────────────

  get startedLine(): string {
    const instance = this.instance();
    if (!instance) return '';
    const date = this.when(instance.startedAt);
    return instance.startedByName
      ? this.languageService.t('workflow.view.startedBy', { who: instance.startedByName, date })
      : this.languageService.t('workflow.view.startedAt', { date });
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

  /** Kart alt satırı: geçilen insan adımında son karar ve kim; bekleyende kim. */
  private cardMeta(graph: WorkflowGraph | null, history: Record<string, StepHistory>): Record<string, CanvasNodeMeta> {
    const t = (key: string, params?: Record<string, string | number>) => this.languageService.t(key, params);
    const meta: Record<string, CanvasNodeMeta> = {};

    for (const step of graph?.steps ?? []) {
      const key = step.key.toLowerCase();
      const item = history[key];
      if (!item) continue;

      const kind = nodeKindOf(step);
      const info = nodeKindInfo(kind);
      let summary: string;
      switch (item.state) {
        case 'current': {
          const who = waitingNames(item);
          const timer = item.entries.find(e => e.kind === 'timer');
          summary = timer?.kind === 'timer' && timer.until && !timer.firedAt
            ? t('workflow.runtime.waitingUntil', { date: this.when(timer.until) })
            : who.length ? t('workflow.runtime.waitingFor', { who: who.join(', ') })
            : t('workflow.runtime.waiting');
          break;
        }
        case 'visited': {
          const decision = lastDecision(item);
          summary = decision
            ? t('workflow.view.summaryDecision', {
                action: this.decisionLabel(decision.outcome, kind === 'task'),
                who: decision.by ?? t('workflow.view.bySystem')
              })
            : t('workflow.runtime.passed');
          break;
        }
        case 'failed': summary = t('workflow.runtime.failed'); break;
        default:       summary = t('workflow.runtime.ended');
      }

      meta[key] = {
        kindLabel: t(info.labelKey),
        tone: nodeTone(step),
        icon: info.icon,
        summary,
        errors: item.state === 'failed' ? 1 : 0,
        warnings: 0,
        issueTitle: item.state === 'failed' ? t('workflow.runtime.failed') : ''
      };
    }
    return meta;
  }

  private describe(history: StepHistory, isTask: boolean, kindLabelKey: string): TipView {
    const t = (key: string, params?: Record<string, string | number>) => this.languageService.t(key, params);
    const states: Record<string, [string, TipLine['tone']]> = {
      visited: ['workflow.runtime.passed', 'meta'],
      current: ['workflow.runtime.waiting', 'warn'],
      failed: ['workflow.runtime.failed', 'danger'],
      end: ['workflow.runtime.ended', 'success']
    };
    const [stateKey, stateTone] = states[history.state] ?? ['workflow.runtime.passed', 'meta'];

    return {
      title: history.name,
      kind: t(kindLabelKey),
      state: t(stateKey),
      stateTone,
      lines: history.entries.map(entry => this.lineOf(entry, isTask))
    };
  }

  private lineOf(entry: StepEntry, isTask: boolean): TipLine {
    const t = (key: string, params?: Record<string, string | number>) => this.languageService.t(key, params);

    switch (entry.kind) {
      case 'decision': {
        const tone: TipLine['tone'] = entry.outcome === 'approved' ? 'success'
          : entry.outcome === 'skipped' ? 'meta' : 'danger';
        return {
          label: this.decisionLabel(entry.outcome, isTask),
          tone,
          who: entry.by ?? t('workflow.view.bySystem'),
          when: entry.at ? this.when(entry.at) : undefined,
          branch: entry.branch ? t('workflow.view.branch', { branch: entry.branch }) : undefined,
          comment: entry.comment ?? undefined
        };
      }
      case 'waiting': {
        const people = entry.role ? entry.candidates.slice(0, MAX_PEOPLE) : [];
        const notes: string[] = [];
        if (entry.role && entry.candidates.length === 0) notes.push(t('workflow.view.noMembers'));
        if (entry.dueAt) notes.push(t('workflow.view.due', { date: this.when(entry.dueAt) }));
        if (entry.overdue) notes.push(t('workflow.view.overdue'));
        return {
          label: t(isTask ? 'workflow.view.waitingTask' : 'workflow.view.waitingOn'),
          tone: entry.overdue ? 'danger' : 'warn',
          who: entry.user ?? (entry.role ? t('workflow.view.waitingRole', { role: entry.role }) : undefined),
          branch: entry.branch ? t('workflow.view.branch', { branch: entry.branch }) : undefined,
          people,
          more: entry.role ? Math.max(0, entry.candidates.length - MAX_PEOPLE) : 0,
          note: notes.join(' · ') || undefined
        };
      }
      case 'condition':
        return {
          label: t('workflow.view.conditionTook', { label: entry.caseLabel ?? t('workflow.view.defaultPath') }),
          tone: 'meta', when: this.when(entry.at)
        };
      case 'fields':
        return {
          label: entry.columns.length
            ? t('workflow.view.fieldsUpdated', { columns: entry.columns.join(', ') })
            : t('workflow.view.fieldsNone'),
          tone: 'meta', when: this.when(entry.at)
        };
      case 'notified':
        return { label: t('workflow.view.notified'), tone: 'meta', when: this.when(entry.at) };
      case 'timer':
        return entry.firedAt
          ? { label: t('workflow.view.timerFired'), tone: 'meta', when: this.when(entry.firedAt) }
          : {
              label: entry.until ? t('workflow.runtime.waitingUntil', { date: this.when(entry.until) }) : t('workflow.runtime.waiting'),
              tone: 'warn'
            };
      case 'stepSkipped':
        return { label: t('workflow.view.stepSkipped'), tone: 'meta', when: this.when(entry.at) };
      case 'failed':
        return { label: t('workflow.runtime.failed'), tone: 'danger', note: entry.message ?? undefined };
      case 'ended':
        return {
          label: t(entry.outcome === 'rejected' ? 'workflow.view.endedRejected' : 'workflow.view.endedCompleted'),
          tone: entry.outcome === 'rejected' ? 'danger' : 'success',
          when: entry.at ? this.when(entry.at) : undefined
        };
    }
  }

  private decisionLabel(outcome: 'approved' | 'rejected' | 'skipped' | 'expired', isTask: boolean): string {
    const key = outcome === 'approved' ? (isTask ? 'workflow.view.completed' : 'workflow.view.approved')
      : `workflow.view.${outcome}`;
    return this.languageService.t(key);
  }

  /**
   * Sunucu zamanları UTC yazılır ama saat dilimi işareti olmadan döner (SQL
   * datetime2) — işaretsiz değer UTC sayılır, aksi halde saatler kayardı.
   */
  private when(value: string): string {
    const hasZone = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(value);
    return formatDateTime(new Date(hasZone ? value : value + 'Z'), this.languageService.lang());
  }
}
