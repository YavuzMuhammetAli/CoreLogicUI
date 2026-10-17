import { ChangeDetectionStrategy, ChangeDetectorRef, Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';

import { PermissionAdminService, toActionInt } from '../../services/permission-admin.service';
import { PublishedModelService, PublishedModel } from '../../services/published-model.service';
import { AppUser } from '../../models/appUser';
import { ModelPermission } from '../../services/permission.service';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { LanguageService } from '../../services/language.service';
import { markDirty } from '../../utils/change-detection';
import { pageWindow } from '../../utils/pagination';

/** Düzenleme için kullanılan geçici izin satırı (role-detail ile aynı yapı) */
export interface PermissionRow {
  modelName:    string;
  canRead:      boolean;
  canCreate:    boolean;
  canUpdate:    boolean;
  canDelete:    boolean;
  /** Modelin kullanıcı sidebar navigasyonunda görünsün mü? */
  canShowInNav: boolean;
  /** Kullanıcı yalnızca kendi oluşturduğu kayıtları görebilir/değiştirebilir. */
  canOwnOnly:   boolean;
  /** Değiştirildi mi? Yalnızca değişen satırlar backend'e gönderilir */
  dirty: boolean;
}

@Component({
  selector: 'app-user-permission-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, TranslatePipe],
  templateUrl: './user-permission-detail.component.html',
  styleUrls: ['./user-permission-detail.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UserPermissionDetailComponent implements OnInit {
  /** OnPush: asenkron veri geldiğinde görünümü kirli işaretlemek için (bkz. markDirty). */
  private readonly cdr = inject(ChangeDetectorRef);

  private readonly route        = inject(ActivatedRoute);
  private readonly adminService = inject(PermissionAdminService);
  private readonly modelService = inject(PublishedModelService);
  private readonly languageService = inject(LanguageService);

  userId = 0;

  /* ── Kullanıcı ── */
  user        = signal<AppUser | null>(null);
  userLoading = signal(true);
  userError   = signal('');

  /* ── Admin toggle ── */
  adminSaving  = signal(false);
  adminMsg     = signal('');
  adminMsgType = signal<'success'|'danger'>('success');

  /* ── İzin matrisi ── */
  permRows    = signal<PermissionRow[]>([]);
  permLoading = signal(false);
  permError   = signal('');
  permMsg     = signal('');
  permMsgType = signal<'success'|'danger'>('success');

  /** İzin matrisinde detayı açılmış model satırı (liste → detay) */
  selectedPermRow = signal<PermissionRow | null>(null);
  permRowSaving   = signal(false);

  /* ── Model listesi: arama + sayfalama ── */
  modelSearchTerm  = signal('');
  modelPageIndex   = signal(1);
  readonly modelPageSize = 10;

  /** En az bir izni olan model sayısı */
  permittedModelCount = computed(() =>
    this.permRows().filter(r => this.permSummary(r).length > 0).length
  );

  /** Arama terimine göre filtrelenmiş model satırları */
  filteredPermRows = computed(() => {
    const term = this.modelSearchTerm().trim().toLowerCase();
    const rows = this.permRows();
    return term ? rows.filter(r => r.modelName.toLowerCase().includes(term)) : rows;
  });

  /** Toplam sayfa sayısı (en az 1) */
  modelTotalPages = computed(() =>
    Math.max(1, Math.ceil(this.filteredPermRows().length / this.modelPageSize))
  );

  /** Geçerli sayfadaki model satırları */
  pagedPermRows = computed(() => {
    const start = (this.modelPageIndex() - 1) * this.modelPageSize;
    return this.filteredPermRows().slice(start, start + this.modelPageSize);
  });

  /** Sayfa numarası butonları — en fazla 5'lik kayan pencere (ilk/son sayfa şablonda ayrıca) */
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

  /* ──────────────── Kullanıcı yükleme ──────────────── */

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

  /* ──────────────── İzin matrisi ──────────────── */

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

  /** Checkbox değişince satırı dirty olarak işaretle */
  markDirty(row: PermissionRow): void {
    row.dirty = true;
  }

  /** Model arama kutusu değişince filtreyi uygular ve ilk sayfaya döner */
  onModelSearchChange(term: string): void {
    this.modelSearchTerm.set(term);
    this.modelPageIndex.set(1);
  }

  /** Model listesi sayfasını değiştirir */
  goToModelPage(page: number): void {
    if (page < 1 || page > this.modelTotalPages()) return;
    this.modelPageIndex.set(page);
  }

  /** Model satırına tıklayınca izin detay panelini açar */
  selectModelPerm(row: PermissionRow): void {
    this.permMsg.set('');
    this.selectedPermRow.set(row);
  }

  /** İzin detay panelini kapatır, model listesine döner */
  clearModelPerm(): void {
    this.selectedPermRow.set(null);
  }

  /** Seçili modelin etkin izinlerini etiket listesi olarak döndürür (rozetler için) */
  permSummary(row: PermissionRow): string[] {
    const labels: string[] = [];
    if (row.canRead)      labels.push(this.languageService.t('permission.detail.summaryRead'));
    if (row.canCreate)    labels.push(this.languageService.t('permission.detail.summaryCreate'));
    if (row.canUpdate)    labels.push(this.languageService.t('permission.detail.summaryUpdate'));
    if (row.canDelete)    labels.push(this.languageService.t('permission.detail.summaryDelete'));
    if (row.canShowInNav) labels.push(this.languageService.t('permission.detail.summaryNav'));
    if (row.canOwnOnly)   labels.push(this.languageService.t('permission.detail.summaryOwn'));
    return labels;
  }

  /** İzin detay panelinden tek bir modelin izinlerini kaydeder */
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

  /** Kullanıcının tam adı */
  fullName(user: AppUser): string {
    return `${user.firstName} ${user.lastName}`.trim() || user.email;
  }
}
