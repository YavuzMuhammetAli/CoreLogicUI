import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { WorkflowInstanceService } from '../../../services/workflow-task.service';
import { WorkflowInstance } from '../../../models/workflow.model';
import { LanguageService } from '../../../services/language.service';
import { TranslatePipe } from '../../../pipes/translate.pipe';
import { markDirty } from '../../../utils/change-detection';
import { formatDate } from '../../../utils/locale-format';

/**
 * Kayıt detayındaki "Süreç" paneli — akışı iş verisine bağlayan yer.
 *
 * Yalnızca süreç GEÇMİŞİNİ gösterir. Başlatma ve adım butonları kaydın
 * başlığında, Kaydet'in yanındadır (model-detail) — orada kayıt kaydedilip
 * aynı tıkta başlatılabiliyor ve sıradan kullanıcı da görebiliyor (buradaki
 * eski liste admin'e özel tanım ucuna dayanıyordu).
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

  /**
   * Kullanıcının görebildiği süreçler (en yeni önce) — kayıt başlığındaki "Akışı
   * görüntüle" düğmesi bunu dinler. Liste sunucuda süzülür (IWorkflowAccessPolicy);
   * modül yoksa ya da yetki yoksa boş gelir.
   */
  readonly instancesLoaded = output<WorkflowInstance[]>();
  /** Satırdaki "Şema" — o sürecin yalnız ilerlenen yolu diyalogda açılmalı. */
  readonly viewRequested = output<number>();

  private readonly cdr = inject(ChangeDetectorRef);
  private readonly instanceService = inject(WorkflowInstanceService);
  private readonly languageService = inject(LanguageService);

  instances: WorkflowInstance[] = [];

  loading = false;
  /** Modül kurulu değil ya da yetki yok — panel hiç gösterilmez. */
  unavailable = false;

  ngOnInit(): void {
    this.load();
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
          this.instancesLoaded.emit(this.instances);
        },
        error: () => {
          this.loading = false;
          this.unavailable = true;
          this.instancesLoaded.emit([]);
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
