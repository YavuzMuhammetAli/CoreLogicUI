import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { WorkflowInstanceService } from '../../services/workflow-task.service';
import { WorkflowService } from '../../services/workflow.service';
import { LanguageService } from '../../services/language.service';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { ModelLabelPipe } from '../../pipes/model-label.pipe';
import { WorkflowInstance, WorkflowInstanceStatus } from '../../models/workflow.model';
import { formatDate } from '../../utils/locale-format';
import { pageWindow } from '../../utils/pagination';

/** Akış filtresi seçeneği: kod + ad (sürümler aynı kodu paylaşır). */
interface CodeOption {
  code: string;
  name: string;
}

const STATUSES: ReadonlyArray<WorkflowInstanceStatus> = ['Running', 'Completed', 'Rejected', 'Cancelled', 'Failed'];

/**
 * Süreç listesi (admin) — tenant'taki tüm süreçler; durum, "yalnız hata
 * bekleyenler" (olay), akış ve model filtresiyle, en yeni önce, sayfalı.
 * Satır sürecin şemalı ekranına götürür.
 */
@Component({
  selector: 'app-workflow-instances',
  standalone: true,
  imports: [RouterLink, TranslatePipe, ModelLabelPipe],
  templateUrl: './workflow-instances.component.html',
  styleUrl: './workflow-instances.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class WorkflowInstancesComponent implements OnInit {
  private readonly instanceService = inject(WorkflowInstanceService);
  private readonly workflowService = inject(WorkflowService);
  private readonly languageService = inject(LanguageService);

  readonly statuses = STATUSES;
  readonly pageSizeOptions = [25, 50, 100];

  readonly status = signal<WorkflowInstanceStatus | ''>('');
  readonly incidentOnly = signal(false);
  readonly code = signal('');
  readonly model = signal('');

  readonly codes = signal<CodeOption[]>([]);
  readonly models = computed(() => [...new Set(this.definitionModels())].sort());
  private readonly definitionModels = signal<string[]>([]);

  readonly items = signal<WorkflowInstance[]>([]);
  readonly total = signal(0);
  readonly pageIndex = signal(1);
  readonly pageSize = signal(25);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));
  readonly visiblePages = computed(() => pageWindow(this.pageIndex(), this.totalPages()));

  ngOnInit(): void {
    this.workflowService.list().subscribe({
      next: res => {
        const definitions = res.data ?? [];
        const byCode = new Map<string, string>();
        for (const definition of definitions) byCode.set(definition.code, definition.name);
        this.codes.set([...byCode.entries()].map(([code, name]) => ({ code, name }))
          .sort((a, b) => a.name.localeCompare(b.name)));
        this.definitionModels.set(definitions.map(d => d.modelName).filter(Boolean));
      }
    });
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);

    this.instanceService.listPaged({
      status: this.status(),
      incident: this.incidentOnly(),
      code: this.code(),
      model: this.model(),
      page: this.pageIndex(),
      pageSize: this.pageSize()
    }).subscribe({
      next: res => {
        this.loading.set(false);
        if (!res.success || !res.data) {
          this.error.set(res.message || this.languageService.t('workflow.instance.loadFailed'));
          return;
        }
        this.items.set(res.data.items ?? []);
        this.total.set(res.data.total ?? 0);
      },
      error: err => {
        this.loading.set(false);
        this.error.set(err?.error?.message ?? this.languageService.t('workflow.instance.serverError'));
      }
    });
  }

  /** Filtre değişince ilk sayfaya dönülür. */
  private refilter(): void {
    this.pageIndex.set(1);
    this.load();
  }

  onStatus(event: Event): void {
    this.status.set((event.target as HTMLSelectElement).value as WorkflowInstanceStatus | '');
    this.refilter();
  }

  onIncident(event: Event): void {
    this.incidentOnly.set((event.target as HTMLInputElement).checked);
    this.refilter();
  }

  onCode(event: Event): void {
    this.code.set((event.target as HTMLSelectElement).value);
    this.refilter();
  }

  onModel(event: Event): void {
    this.model.set((event.target as HTMLSelectElement).value);
    this.refilter();
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages() || page === this.pageIndex()) return;
    this.pageIndex.set(page);
    this.load();
  }

  changePageSize(size: number): void {
    this.pageSize.set(size);
    this.refilter();
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
}
