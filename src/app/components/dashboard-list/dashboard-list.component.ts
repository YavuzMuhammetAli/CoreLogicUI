import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DashboardService } from '../../services/dashboard.service';
import { DashboardDefinition } from '../../models/dashboard.model';
import { PermissionService } from '../../services/permission.service';
import { LanguageService } from '../../services/language.service';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { markDirty } from '../../utils/change-detection';

@Component({
  selector: 'app-dashboard-list',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  templateUrl: './dashboard-list.component.html',
  styleUrls: ['./dashboard-list.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardListComponent implements OnInit {
  /** OnPush: asenkron veri geldiğinde görünümü kirli işaretlemek için (bkz. markDirty). */
  private readonly cdr = inject(ChangeDetectorRef);

  private readonly languageService = inject(LanguageService);

  dashboards: DashboardDefinition[] = [];
  loading = false;
  loadError: string | null = null;

  constructor(
    private dashboardService: DashboardService,
    private permissionService: PermissionService
  ) {}

  ngOnInit(): void {
    this.load();
  }

  /** "Silinmiş Dashboard'lar" butonu yalnızca admin'e gösterilir. */
  get isAdmin(): boolean {
    return this.permissionService.isAdmin();
  }

  load(): void {
    this.loading = true;
    this.loadError = null;
    this.dashboardService.list().pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.loading = false;
        if (res.success) {
          this.dashboards = res.data ?? [];
        } else {
          this.loadError = res.message ?? this.languageService.t('dashboard.list.loadError');
        }
      },
      error: (err: { error?: { message?: string } }) => {
        this.loading = false;
        this.loadError = err?.error?.message ?? this.languageService.t('dashboard.list.serverError');
      }
    });
  }
}
