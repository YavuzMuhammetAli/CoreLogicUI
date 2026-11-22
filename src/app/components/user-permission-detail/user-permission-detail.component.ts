import { ChangeDetectionStrategy, ChangeDetectorRef, Component, computed, inject, OnInit, signal } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';

import { PermissionAdminService, toActionInt } from '../../services/permission-admin.service';
import { PublishedModelService, PublishedModel } from '../../services/published-model.service';
import { AppUser } from '../../models/appUser';
import { ModelPermission } from '../../services/permission.service';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { HelpHintComponent } from '../shared/help-hint/help-hint.component';
import { LanguageService } from '../../services/language.service';
import { markDirty } from '../../utils/change-detection';
import { pageWindow } from '../../utils/pagination';
import { IconComponent } from '../shared/icon/icon.component';

/** Temporary permission row used for editing (same structure as role-detail) */
export interface PermissionRow {
  modelName:    string;
  canRead:      boolean;
  canCreate:    boolean;
  canUpdate:    boolean;
  canDelete:    boolean;
  /** Should the model appear in the user's sidebar navigation? */
  canShowInNav: boolean;
  /** The user can see/modify only the records they created. */
  canOwnOnly:   boolean;
  /** Can they see the record's workflow (path taken + who approved / is pending)? */
  canViewWorkflow: boolean;
  /** Was it changed? Only changed rows are sent to the backend */
  dirty: boolean;
}

@Component({
    selector: 'app-user-permission-detail',
    imports: [FormsModule, RouterLink, TranslatePipe, HelpHintComponent, IconComponent],
    templateUrl: './user-permission-detail.component.html',
    styleUrls: ['./user-permission-detail.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class UserPermissionDetailComponent implements OnInit {
  /** OnPush: to mark the view dirty when async data arrives (see markDirty). */
  private readonly cdr = inject(ChangeDetectorRef);

  private readonly route        = inject(ActivatedRoute);
  private readonly adminService = inject(PermissionAdminService);
  private readonly modelService = inject(PublishedModelService);
  private readonly languageService = inject(LanguageService);

  userId = 0;

  /* ── User ── */
  user        = signal<AppUser | null>(null);
  userLoading = signal(true);
  userError   = signal('');

  /* ── Admin toggle ── */
  adminSaving  = signal(false);
  adminMsg     = signal('');
  adminMsgType = signal<'success'|'danger'>('success');

  /* ── Permission matrix ── */
  permRows    = signal<PermissionRow[]>([]);
  permLoading = signal(false);
  permError   = signal('');
  permMsg     = signal('');
  permMsgType = signal<'success'|'danger'>('success');

  /** Model row whose detail is open in the permission matrix (list → detail) */
  selectedPermRow = signal<PermissionRow | null>(null);
  permRowSaving   = signal(false);

  /* ── Model list: search + pagination ── */
  modelSearchTerm  = signal('');
  modelPageIndex   = signal(1);
  readonly modelPageSize = 10;

  /** Number of models with at least one permission */
  permittedModelCount = computed(() =>
    this.permRows().filter(r => this.permSummary(r).length > 0).length
  );

  /** Model rows filtered by the search term */
  filteredPermRows = computed(() => {
    const term = this.modelSearchTerm().trim().toLowerCase();
    const rows = this.permRows();
    return term ? rows.filter(r => r.modelName.toLowerCase().includes(term)) : rows;
  });

  /** Total page count (at least 1) */
  modelTotalPages = computed(() =>
    Math.max(1, Math.ceil(this.filteredPermRows().length / this.modelPageSize))
  );

  /** Model rows on the current page */
  pagedPermRows = computed(() => {
    const start = (this.modelPageIndex() - 1) * this.modelPageSize;
    return this.filteredPermRows().slice(start, start + this.modelPageSize);
  });

  /** Page number buttons — sliding window of at most 5 (first/last page handled separately in the template) */
  modelPages = computed(() => pageWindow(this.modelPageIndex(), this.modelTotalPages()));

  modelRangeStart = computed(() =>
    this.filteredPermRows().length === 0 ? 0 : (this.modelPageIndex() - 1) * this.modelPageSize + 1
  );

  modelRangeEnd = computed(() =>
    Math.min(this.modelPageIndex() * this.modelPageSize, this.filteredPermRows().length)
  );

  ngOnInit(): void {
    this.userId = Number(this.route.snapshot.paramMap.get('id'));
    this.loadUser();
  }

  /* ──────────────── User loading ──────────────── */

  private loadUser(): void {
    this.userLoading.set(true);
    this.userError.set('');

    this.adminService.getUsers().pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        if (!res.success) {
          this.userError.set(res.message);
          this.userLoading.set(false);
          return;
        }
        const found = (res.data ?? []).find(u => u.id === this.userId);
        if (!found) {
          this.userError.set(this.languageService.t('permission.detail.notFound'));
          this.userLoading.set(false);
          return;
        }
        this.user.set(found);
        this.userLoading.set(false);
        this.loadUserPermissions(found.id);
      },
      error: () => {
        this.userError.set(this.languageService.t('permission.detail.loadError'));
        this.userLoading.set(false);
      }
    });
  }

  /* ──────────────── Admin toggle ──────────────── */

  toggleAdmin(makeAdmin: boolean): void {
    const user = this.user();
    if (!user) return;

    this.adminSaving.set(true);
    this.adminMsg.set('');

    this.adminService.setAdmin(user.id, makeAdmin).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.adminMsg.set(res.message);
        this.adminMsgType.set(res.success ? 'success' : 'danger');
        if (res.success) {
          this.user.set({ ...user, isAdmin: makeAdmin });
          this.selectedPermRow.set(null);
        }
        this.adminSaving.set(false);
      },
      error: () => {
        this.adminMsg.set(this.languageService.t('permission.detail.adminUpdateError'));
        this.adminMsgType.set('danger');
        this.adminSaving.set(false);
      }
    });
  }

  /* ──────────────── Permission matrix ──────────────── */

  private loadUserPermissions(userId: number): void {
    this.permLoading.set(true);
    this.permError.set('');
    this.permRows.set([]);
    this.modelSearchTerm.set('');
    this.modelPageIndex.set(1);

    forkJoin([
      this.modelService.getModels(),
      this.adminService.getUserPermissions(userId)
    ]).pipe(markDirty(this.cdr)).subscribe({
      next: ([modelsRes, permsRes]) => {
        const allModels: PublishedModel[] = modelsRes.success ? (modelsRes.data ?? []) : [];
        const existing: ModelPermission[] = permsRes.success ? (permsRes.data ?? []) : [];

        const rows: PermissionRow[] = allModels.map(m => {
          const p = existing.find(e => e.modelName.toLowerCase() === m.typeName.toLowerCase());
          return {
            modelName:    m.typeName,
            canRead:      p?.canRead      ?? false,
            canCreate:    p?.canCreate    ?? false,
            canUpdate:    p?.canUpdate    ?? false,
            canDelete:    p?.canDelete    ?? false,
            canShowInNav: p?.canShowInNav ?? false,
            canOwnOnly:   p?.canOwnOnly   ?? false,
            canViewWorkflow: p?.canViewWorkflow ?? false,
            dirty: false
          };
        });
        this.permRows.set(rows);
        this.permLoading.set(false);
      },
      error: () => {
        this.permError.set(this.languageService.t('permission.detail.permissionsLoadError'));
        this.permLoading.set(false);
      }
    });
  }

  /** Mark the row dirty when a checkbox changes */
  markDirty(row: PermissionRow): void {
    row.dirty = true;
  }

  /** Applies the filter and returns to the first page when the model search box changes */
  onModelSearchChange(term: string): void {
    this.modelSearchTerm.set(term);
    this.modelPageIndex.set(1);
  }

  /** Changes the model list page */
  goToModelPage(page: number): void {
    if (page < 1 || page > this.modelTotalPages()) return;
    this.modelPageIndex.set(page);
  }

  /** Opens the permission detail panel when a model row is clicked */
  selectModelPerm(row: PermissionRow): void {
    this.permMsg.set('');
    this.selectedPermRow.set(row);
  }

  /** Closes the permission detail panel, returns to the model list */
  clearModelPerm(): void {
    this.selectedPermRow.set(null);
  }

  /** Returns the selected model's active permissions as a list of labels (for badges) */
  permSummary(row: PermissionRow): string[] {
    const labels: string[] = [];
    if (row.canRead)      labels.push(this.languageService.t('permission.detail.summaryRead'));
    if (row.canCreate)    labels.push(this.languageService.t('permission.detail.summaryCreate'));
    if (row.canUpdate)    labels.push(this.languageService.t('permission.detail.summaryUpdate'));
    if (row.canDelete)    labels.push(this.languageService.t('permission.detail.summaryDelete'));
    if (row.canShowInNav) labels.push(this.languageService.t('permission.detail.summaryNav'));
    if (row.canOwnOnly)   labels.push(this.languageService.t('permission.detail.summaryOwn'));
    if (row.canViewWorkflow) labels.push(this.languageService.t('permission.detail.summaryWorkflow'));
    return labels;
  }

  /** Saves a single model's permissions from the permission detail panel */
  saveModelPerm(row: PermissionRow): void {
    const user = this.user();
    if (!user) return;

    this.permRowSaving.set(true);
    this.permMsg.set('');

    this.adminService.setPermission(user.id, row.modelName, toActionInt(row)).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        if (res.success) {
          row.dirty = false;
          this.permMsg.set(this.languageService.t('permission.detail.permissionsSaved'));
          this.permMsgType.set('success');
        } else {
          this.permMsg.set(res.message);
          this.permMsgType.set('danger');
        }
        this.permRowSaving.set(false);
      },
      error: () => {
        this.permMsg.set(this.languageService.t('permission.detail.permissionsSaveError', { modelName: row.modelName }));
        this.permMsgType.set('danger');
        this.permRowSaving.set(false);
      }
    });
  }

  /** The user's full name */
  fullName(user: AppUser): string {
    return `${user.firstName} ${user.lastName}`.trim() || user.email;
  }
}
