import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { WorkflowInstanceService } from '../../../services/workflow-task.service';
import { WorkflowService } from '../../../services/workflow.service';
import { WorkflowDefinition, WorkflowInstance } from '../../../models/workflow.model';
import { LanguageService } from '../../../services/language.service';
import { NotificationService } from '../../../services/notification.service';
import { TranslatePipe } from '../../../pipes/translate.pipe';
import { markDirty } from '../../../utils/change-detection';
import { formatDate } from '../../../utils/locale-format';

/**
 * Kayıt detayındaki "Süreç" paneli — akışı iş verisine bağlayan yer.
 *
 * Manuel başlatılabilen akışlar burada listelenir; otomatik tetiklenenler
 * (onCreate/onUpdate) buton olarak SUNULMAZ, çünkü onları elle başlatmak
 * çift süreç yaratma girişimidir ve sunucu zaten reddeder.
 *
 * Panel workflow modülü kurulu olmayan tenant'larda sessizce gizlenir: kayıt
 * ekranı her zaman çalışmalı, akış opsiyonel bir yetenek.
 */
@Component({
  selector: 'app-workflow-panel',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslatePipe],
  templateUrl: './workflow-panel.component.html',
  styleUrl: './workflow-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class WorkflowPanelComponent implements OnInit {
  readonly entityType = input.required<string>();
  readonly entityId = input.required<number>();

  private readonly cdr = inject(ChangeDetectorRef);
  private readonly instanceService = inject(WorkflowInstanceService);
  private readonly workflowService = inject(WorkflowService);
  private readonly languageService = inject(LanguageService);
  private readonly notification = inject(NotificationService);

  instances: WorkflowInstance[] = [];
  /** Bu model için elle başlatılabilir yayınlı akışlar. */
  manualWorkflows: WorkflowDefinition[] = [];

  loading = false;
  starting = false;
  /** Modül kurulu değil ya da yetki yok — panel hiç gösterilmez. */
  unavailable = false;

  ngOnInit(): void {
    this.load();
    this.loadManualWorkflows();
  }

  load(): void {
    this.loading = true;

    this.instanceService.forEntity(this.entityType(), this.entityId())
      .pipe(markDirty(this.cdr)).subscribe({
        next: res => {
          this.loading = false;
          if (res.success) {
            this.instances = res.data ?? [];
          } else {
            this.unavailable = true;
          }
        },
        error: () => {
          this.loading = false;
          this.unavailable = true;
        }
      });
  }

  /**
   * Elle başlatma seçenekleri. Liste ucu admin'e kapalı olduğu için normal
   * kullanıcıda hata döner — bu bir sorun değil, yalnızca buton gösterilmez.
   */
  private loadManualWorkflows(): void {
    this.workflowService.listCached().pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.manualWorkflows = (res.data ?? []).filter(w =>
          w.modelName === this.entityType() &&
          w.status === 'Published' &&
          w.isEnabled &&
          w.triggerEvent === 'manual');
      },
      error: () => { this.manualWorkflows = []; }
    });
  }

  get hasRunning(): boolean {
    return this.instances.some(i => i.status === 'Running');
  }

  start(code: string): void {
    this.starting = true;

    this.instanceService.start({
      entityType: this.entityType(),
      entityId: this.entityId(),
      code
    }).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.starting = false;
        if (res.success) {
          this.notification.success(this.languageService.t('workflow.panel.startSuccess'));
          this.load();
        } else {
          this.notification.warn(res.message ?? '');
        }
      },
      error: err => {
        this.starting = false;
        this.notification.warn(err?.error?.message ?? this.languageService.t('workflow.instance.serverError'));
      }
    });
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
