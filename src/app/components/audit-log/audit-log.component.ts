import { ChangeDetectionStrategy, ChangeDetectorRef, Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { AuditLogService } from '../../services/audit-log.service';
import { AuditLog } from '../../models/auditLog';
import { LanguageService } from '../../services/language.service';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { markDirty } from '../../utils/change-detection';
import { pageWindow } from '../../utils/pagination';

@Component({
  selector: 'app-audit-log',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  templateUrl: './audit-log.component.html',
  styleUrl: './audit-log.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AuditLogComponent implements OnInit {
  /** OnPush: asenkron veri geldiğinde görünümü kirli işaretlemek için (bkz. markDirty). */
  private readonly cdr = inject(ChangeDetectorRef);

  private auditLogService = inject(AuditLogService);
  private readonly languageService = inject(LanguageService);

  rows = signal<AuditLog[]>([]);
  loading = signal(true);
  loadError = signal('');

  /** Genişletilmiş (eski/yeni değerleri açık) satırın ID'si; tek seferde bir satır açık olur. */
  expandedId = signal<number | null>(null);

  // Filtre alanları — ngModel ile bağlanır, "Filtrele" butonuna basınca uygulanır
  entityNameFilter = '';
  fromDateFilter = '';
  toDateFilter = '';

  // Sayfalama SUNUCUDA yapılır. Eskiden backend tüm kayıtları döndürüyor ve dilimleme
  // istemcide oluyordu; audit tablosu milyonlarca satıra ulaştığında ekran açılmıyordu.
  pageIndex = signal(1);
  pageSize = signal(20);
  readonly pageSizeOptions = [20, 50, 100];

  /** Sunucudan gelen toplam kayıt sayısı (indirilen satır sayısı DEĞİL). */
  total = signal(0);
  totalPages = computed(() => Math.ceil(this.total() / this.pageSize()) || 1);

  /** Sunucu zaten sayfayı döndürüyor — istemcide dilimleme yok. */
  pagedRows = computed(() => this.rows());

  pageRangeStart = computed(() => this.total() === 0 ? 0 : (this.pageIndex() - 1) * this.pageSize() + 1);
  pageRangeEnd = computed(() => Math.min(this.pageIndex() * this.pageSize(), this.total()));

  /** Sayfa numarası butonları için en fazla 5'lik kayan pencere (1 ve son sayfa her zaman gösterilir). */
  visiblePages = computed(() => pageWindow(this.pageIndex(), this.totalPages()));

  ngOnInit(): void {
    this.load();
  }

  /** Filtre değişiminde ilk sayfaya döner. */
  load(): void {
    this.pageIndex.set(1);
    this.fetch();
  }

  /** Mevcut sayfa/filtre ile sunucudan veri çeker. */
  private fetch(): void {
    this.loading.set(true);
    this.loadError.set('');
    this.expandedId.set(null);

    const from = this.fromDateFilter ? new Date(this.fromDateFilter) : null;
    const to = this.toDateFilter ? new Date(this.toDateFilter) : null;

    this.auditLogService
      .getFilteredPaged(this.pageIndex(), this.pageSize(), this.entityNameFilter.trim() || undefined, from, to)
      .pipe(markDirty(this.cdr))
      .subscribe({
        next: res => {
          if (!res.success) {
            this.rows.set([]);
            this.total.set(0);
            this.loadError.set(res.message);
          } else {
            this.rows.set(res.data?.items ?? []);
            this.total.set(res.data?.total ?? 0);
          }
          this.loading.set(false);
        },
        error: () => {
          this.loadError.set(this.languageService.t('audit.loadFailed'));
          this.loading.set(false);
        }
      });
  }

  clearFilters(): void {
    this.entityNameFilter = '';
    this.fromDateFilter = '';
    this.toDateFilter = '';
    this.load();
  }

  toggleExpanded(row: AuditLog): void {
    this.expandedId.set(this.expandedId() === row.id ? null : row.id);
  }

  goToPage(p: number): void {
    if (p < 1 || p > this.totalPages() || p === this.pageIndex()) return;
    this.pageIndex.set(p);
    this.fetch();   // sayfalama sunucuda — yeni sayfa istenmeli
  }

  prevPage(): void { this.goToPage(this.pageIndex() - 1); }
  nextPage(): void { this.goToPage(this.pageIndex() + 1); }

  changePageSize(size: number): void {
    this.pageSize.set(size);
    this.pageIndex.set(1);
    this.fetch();
  }

  /** Badge rengi: Added=success, Modified=warn, Deleted=danger */
  badgeClass(action: string): string {
    switch (action) {
      case 'Added': return 'badge-success';
      case 'Modified': return 'badge-warn';
      case 'Deleted': return 'badge-danger';
      default: return 'badge-meta';
    }
  }

  /** JSON string'i okunaklı biçimde gösterir; geçersiz/boşsa olduğu gibi döner. */
  formatJson(value: string | null): string {
    if (!value) return '—';
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
}
