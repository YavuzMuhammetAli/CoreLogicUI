import { ChangeDetectionStrategy, ChangeDetectorRef, Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { AuditLogService } from '../../services/audit-log.service';
import { AuditLog } from '../../models/auditLog';
import { LanguageService } from '../../services/language.service';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { markDirty } from '../../utils/change-detection';
import { pageWindow } from '../../utils/pagination';
import { IconComponent } from '../shared/icon/icon.component';

@Component({
    selector: 'app-audit-log',
    imports: [CommonModule, FormsModule, TranslatePipe, IconComponent],
    templateUrl: './audit-log.component.html',
    styleUrl: './audit-log.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class AuditLogComponent implements OnInit {
  /** OnPush: to mark the view dirty when async data arrives (see markDirty). */
  private readonly cdr = inject(ChangeDetectorRef);

  private auditLogService = inject(AuditLogService);
  private readonly languageService = inject(LanguageService);

  rows = signal<AuditLog[]>([]);
  loading = signal(true);
  loadError = signal('');

  /** ID of the expanded row (old/new values open); only one row is open at a time. */
  expandedId = signal<number | null>(null);

  // Filter fields — bound with ngModel, applied when the "Filtrele" (Filter) button is pressed
  entityNameFilter = '';
  fromDateFilter = '';
  toDateFilter = '';

  // Pagination is done ON THE SERVER. The backend used to return all records and slicing
  // happened on the client; once the audit table reached millions of rows the screen would not open.
  pageIndex = signal(1);
  pageSize = signal(20);
  readonly pageSizeOptions = [20, 50, 100];

  /** Total record count from the server (NOT the number of downloaded rows). */
  total = signal(0);
  totalPages = computed(() => Math.ceil(this.total() / this.pageSize()) || 1);

  /** The server already returns the page — no slicing on the client. */
  pagedRows = computed(() => this.rows());

  pageRangeStart = computed(() => this.total() === 0 ? 0 : (this.pageIndex() - 1) * this.pageSize() + 1);
  pageRangeEnd = computed(() => Math.min(this.pageIndex() * this.pageSize(), this.total()));

  /** Sliding window of at most 5 for page number buttons (page 1 and the last page are always shown). */
  visiblePages = computed(() => pageWindow(this.pageIndex(), this.totalPages()));

  ngOnInit(): void {
    this.load();
  }

  /** Returns to the first page when filters change. */
  load(): void {
    this.pageIndex.set(1);
    this.fetch();
  }

  /** Fetches data from the server with the current page/filters. */
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
    this.fetch();   // pagination is server-side — a new page must be requested
  }

  prevPage(): void { this.goToPage(this.pageIndex() - 1); }
  nextPage(): void { this.goToPage(this.pageIndex() + 1); }

  changePageSize(size: number): void {
    this.pageSize.set(size);
    this.pageIndex.set(1);
    this.fetch();
  }

  /** Badge color: Added=success, Modified=warn, Deleted=danger */
  badgeClass(action: string): string {
    switch (action) {
      case 'Added': return 'badge-success';
      case 'Modified': return 'badge-warn';
      case 'Deleted': return 'badge-danger';
      default: return 'badge-meta';
    }
  }

  /** Shows a JSON string in readable form; returns it as-is if invalid/empty. */
  formatJson(value: string | null): string {
    if (!value) return '—';
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
}
