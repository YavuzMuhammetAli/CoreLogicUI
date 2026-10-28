import { ChangeDetectionStrategy, ChangeDetectorRef, Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';

import { RoleAdminService } from '../../services/role-admin.service';
import { PermissionAdminService, toActionInt } from '../../services/permission-admin.service';
import { PublishedModelService, PublishedModel } from '../../services/published-model.service';
import { DashboardService } from '../../services/dashboard.service';
import { Role } from '../../models/role';
import { AppUser } from '../../models/appUser';
import { DashboardDefinition } from '../../models/dashboard.model';
import { ModelPermission } from '../../services/permission.service';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { LanguageService } from '../../services/language.service';
import { markDirty } from '../../utils/change-detection';
import { pageWindow } from '../../utils/pagination';
import { ConfirmDialogComponent } from '../shared/confirm-dialog/confirm-dialog.component';
import { HelpHintComponent } from '../shared/help-hint/help-hint.component';
import { IconComponent } from '../shared/icon/icon.component';

/** Açılış sayfası dropdown'unda gösterilen sabit hedefler key'i — etiketler LanguageService.t() ile çözülür */
const FIXED_LANDING_PAGE_KEYS: { value: string; labelKey: string }[] = [
  { value: '/models', labelKey: 'role.detail.landingModels' },
  { value: '/reports', labelKey: 'role.detail.landingReports' },
  { value: '/dashboard', labelKey: 'role.detail.landingDashboardList' }
];

/** Düzenleme için kullanılan geçici izin satırı (user-permission-detail ile aynı yapı) */
export interface RolePermissionRow {
  modelName:    string;
  canRead:      boolean;
  canCreate:    boolean;
  canUpdate:    boolean;
  canDelete:    boolean;
  /** Modelin kullanıcı sidebar navigasyonunda görünsün mü? */
  canShowInNav: boolean;
  /** Rol üyesi yalnızca kendi oluşturduğu kayıtları görebilir/değiştirebilir. */
  canOwnOnly:   boolean;
  /** Rol üyesi kayıttaki iş akışını (ilerlenen yol + kim onayladı/bekliyor) görebilir mi? */
  canViewWorkflow: boolean;
  /** Değiştirildi mi? Yalnızca değişen satırlar backend'e gönderilir */
  dirty: boolean;
}

@Component({
  selector: 'app-role-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, TranslatePipe, ConfirmDialogComponent, HelpHintComponent, IconComponent],
  templateUrl: './role-detail.component.html',
  styleUrls: ['./role-detail.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RoleDetailComponent implements OnInit {
  /** OnPush: asenkron veri geldiğinde görünümü kirli işaretlemek için (bkz. markDirty). */
  private readonly cdr = inject(ChangeDetectorRef);

  private readonly route        = inject(ActivatedRoute);
  private readonly router       = inject(Router);
  private readonly roleService  = inject(RoleAdminService);
  private readonly adminService = inject(PermissionAdminService);
  private readonly modelService = inject(PublishedModelService);
  private readonly dashboardService = inject(DashboardService);
  private readonly languageService  = inject(LanguageService);

  /** Açılış sayfası dropdown'unda gösterilen sabit hedefler — aktif dile göre çözülmüş etiketler */
  private get fixedLandingPagesResolved(): { value: string; label: string }[] {
    return FIXED_LANDING_PAGE_KEYS.map(p => ({ value: p.value, label: this.languageService.t(p.labelKey) }));
  }

  /** /roles/new sayfasında mı, yoksa mevcut bir rolün düzenleme sayfasında mıyız? */
  isNew = false;
  roleId = 0;

  /* ── Rol ── */
  role        = signal<Role | null>(null);
  roleLoading = signal(true);
  roleError   = signal('');

  /* ── Yeni rol oluşturma (isNew modu) ── */
  newRoleName       = '';
  creatingRole      = signal(false);
  createRoleMsg     = signal('');
  createRoleMsgType = signal<'success'|'danger'>('success');

  /* ── Detay sekmeleri ── */
  activeTab = signal<'users' | 'models'>('users');

  /** İzin matrisinde detayı açılmış model satırı (Models sekmesi master→detay) */
  selectedPermRow = signal<RolePermissionRow | null>(null);
  permRowSaving   = signal(false);

  /* ── Model listesi: arama + sayfalama ── */
  modelSearchTerm  = signal('');
  modelPageIndex   = signal(1);
  readonly modelPageSize = 10;

  /* ── Rol adı düzenleme ── */
  roleNameEdit  = '';
  renameSaving  = signal(false);
  renameMsg     = signal('');
  renameMsgType = signal<'success'|'danger'>('success');

  /* ── Açılış sayfası düzenleme ── */
  landingPageOptions   = signal<{ value: string; label: string }[]>(this.fixedLandingPagesResolved);
  landingPageEdit       = '';
  landingPageSaving     = signal(false);
  landingPageMsg        = signal('');
  landingPageMsgType    = signal<'success'|'danger'>('success');

  /* ── Rol silme ── */
  deleteSaving = signal(false);
  deleteMsg    = signal('');

  /* ── İzin matrisi ── */
  permRows    = signal<RolePermissionRow[]>([]);
  permLoading = signal(false);
  permError   = signal('');
  permMsg     = signal('');
  permMsgType = signal<'success'|'danger'>('success');

  /* ── Üyeler ── */
  members        = signal<AppUser[]>([]);
  membersLoading  = signal(false);
  membersError    = signal('');
  removingUserId  = signal<number | null>(null);

  /* ── Üye ekleme ── */
  allUsers        = signal<AppUser[]>([]);
  userIdToAdd: number | null = null;
  addMemberSaving = signal(false);
  addMemberMsg    = signal('');

  /** Henüz role üye olmayan kullanıcılar — "Kullanıcı Ekle" seçicisinde gösterilir */
  candidateUsers = computed(() => {
    const memberIds = new Set(this.members().map(m => m.id));
    return this.allUsers().filter(u => !memberIds.has(u.id));
  });

  /** En az bir izni olan model sayısı — "İzin Verilen Modeller" sekme rozeti */
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
    this.isNew = this.route.snapshot.data['mode'] === 'new';

    if (this.isNew) {
      this.roleLoading.set(false);
      return;
    }

    this.roleId = Number(this.route.snapshot.paramMap.get('id'));
    this.loadAllUsers();
    this.loadRole();
    this.loadLandingPageOptions();
  }

  /** Açılış sayfası dropdown'unu sabit sayfalar + mevcut dashboard'larla doldurur. */
  private loadLandingPageOptions(): void {
    this.dashboardService.list().pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        const dashboards: DashboardDefinition[] = res.success ? (res.data ?? []) : [];
        const dashboardOptions = dashboards.map(d => ({ value: `/dashboard/${d.id}`, label: this.languageService.t('role.detail.landingDashboardOption', { name: d.name }) }));
        this.landingPageOptions.set([...this.fixedLandingPagesResolved, ...dashboardOptions]);
      },
      error: () => { /* sessizce atla — yalnızca sabit sayfalar gösterilir */ }
    });
  }

  /* ──────────────── Yeni rol oluşturma ──────────────── */

  createRole(): void {
    const name = this.newRoleName.trim();
    if (!name) {
      this.createRoleMsg.set(this.languageService.t('role.detail.nameEmpty'));
      this.createRoleMsgType.set('danger');
      return;
    }

    this.creatingRole.set(true);
    this.createRoleMsg.set('');

    this.roleService.createRole(name).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.creatingRole.set(false);
        if (!res.success) {
          this.createRoleMsg.set(res.message);
          this.createRoleMsgType.set('danger');
          return;
        }
        // Backend yeni rolün id'sini döndürmüyor — listeyi çekip ada göre bul
        this.roleService.getRoles().pipe(markDirty(this.cdr)).subscribe({
          next: rolesRes => {
            const found = (rolesRes.data ?? []).find(r => r.name === name);
            if (found) {
              this.router.navigate(['/roles', found.id]);
            } else {
              this.router.navigate(['/roles']);
            }
          },
          error: () => this.router.navigate(['/roles'])
        });
      },
      error: () => {
        this.createRoleMsg.set(this.languageService.t('role.detail.createError'));
        this.createRoleMsgType.set('danger');
        this.creatingRole.set(false);
      }
    });
  }

  /* ──────────────── Rol yükleme (edit modu) ──────────────── */

  private loadRole(): void {
    this.roleLoading.set(true);
    this.roleError.set('');

    this.roleService.getRoles().pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        if (!res.success) {
          this.roleError.set(res.message);
          this.roleLoading.set(false);
          return;
        }
        const found = (res.data ?? []).find(r => r.id === this.roleId);
        if (!found) {
          this.roleError.set(this.languageService.t('role.detail.notFound'));
          this.roleLoading.set(false);
          return;
        }
        this.role.set(found);
        this.roleNameEdit = found.name;
        this.landingPageEdit = found.defaultLandingPage ?? '';
        this.roleLoading.set(false);
        this.loadRolePermissions(found.id);
        this.loadRoleMembers(found.id);
      },
      error: () => {
        this.roleError.set(this.languageService.t('role.detail.loadError'));
        this.roleLoading.set(false);
      }
    });
  }

  private loadAllUsers(): void {
    this.adminService.getUsers().pipe(markDirty(this.cdr)).subscribe({
      next: res => this.allUsers.set(res.success ? (res.data ?? []) : []),
      error: () => {}
    });
  }

  /** Detay panelindeki sekmeyi değiştirir (Kullanıcılar / İzin Verilen Modeller) */
  setTab(tab: 'users' | 'models'): void {
    this.activeTab.set(tab);
  }

  /* ──────────────── Rol adı düzenleme ──────────────── */

  renameRole(): void {
    const role = this.role();
    const name = this.roleNameEdit.trim();
    if (!role) return;
    if (!name) {
      this.renameMsg.set(this.languageService.t('role.detail.nameEmpty'));
      this.renameMsgType.set('danger');
      return;
    }

    this.renameSaving.set(true);
    this.renameMsg.set('');

    this.roleService.renameRole(role.id, name).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.renameMsg.set(res.message);
        this.renameMsgType.set(res.success ? 'success' : 'danger');
        if (res.success) {
          this.role.set({ ...role, name });
        }
        this.renameSaving.set(false);
      },
      error: () => {
        this.renameMsg.set(this.languageService.t('role.detail.renameError'));
        this.renameMsgType.set('danger');
        this.renameSaving.set(false);
      }
    });
  }

  /* ──────────────── Açılış sayfası ──────────────── */

  saveLandingPage(): void {
    const role = this.role();
    if (!role) return;

    this.landingPageSaving.set(true);
    this.landingPageMsg.set('');

    this.roleService.setLandingPage(role.id, this.landingPageEdit || null).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.landingPageMsg.set(res.message);
        this.landingPageMsgType.set(res.success ? 'success' : 'danger');
        if (res.success) {
          this.role.set({ ...role, defaultLandingPage: this.landingPageEdit || null });
        }
        this.landingPageSaving.set(false);
      },
      error: () => {
        this.landingPageMsg.set(this.languageService.t('role.detail.landingPageError'));
        this.landingPageMsgType.set('danger');
        this.landingPageSaving.set(false);
      }
    });
  }

  /* ──────────────── Rol silme ──────────────── */

  /** Onay diyaloğu açık mı — silme geri alınamaz, doğrudan DELETE atılmaz. */
  readonly deleteConfirmOpen = signal(false);

  askDeleteRole(): void {
    if (this.role()) this.deleteConfirmOpen.set(true);
  }

  cancelDeleteRole(): void {
    this.deleteConfirmOpen.set(false);
  }

  confirmDeleteRole(): void {
    const role = this.role();
    if (!role) return;

    this.deleteConfirmOpen.set(false);
    this.deleteSaving.set(true);
    this.deleteMsg.set('');

    this.roleService.deleteRole(role.id).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        if (res.success) {
          this.router.navigate(['/roles']);
        } else {
          this.deleteMsg.set(res.message);
          this.deleteSaving.set(false);
        }
      },
      error: () => {
        this.deleteMsg.set(this.languageService.t('role.detail.deleteError'));
        this.deleteSaving.set(false);
      }
    });
  }

  /* ──────────────── İzin matrisi ──────────────── */

  private loadRolePermissions(roleId: number): void {
    this.permLoading.set(true);
    this.permError.set('');
    this.permRows.set([]);
    this.modelSearchTerm.set('');
    this.modelPageIndex.set(1);

    forkJoin([
      this.modelService.getModels(),
      this.roleService.getRolePermissions(roleId)
    ]).pipe(markDirty(this.cdr)).subscribe({
      next: ([modelsRes, permsRes]) => {
        const allModels: PublishedModel[] = modelsRes.success ? (modelsRes.data ?? []) : [];
        const existing: ModelPermission[] = permsRes.success ? (permsRes.data ?? []) : [];

        const rows: RolePermissionRow[] = allModels.map(m => {
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
        this.permError.set(this.languageService.t('role.detail.permissionsLoadError'));
        this.permLoading.set(false);
      }
    });
  }

  /** Checkbox değişince satırı dirty olarak işaretle */
  markDirty(row: RolePermissionRow): void {
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
  selectModelPerm(row: RolePermissionRow): void {
    this.permMsg.set('');
    this.selectedPermRow.set(row);
  }

  /** İzin detay panelini kapatır, model listesine döner */
  clearModelPerm(): void {
    this.selectedPermRow.set(null);
  }

  /** Seçili modelin etkin izinlerini etiket listesi olarak döndürür (rozetler için) */
  permSummary(row: RolePermissionRow): string[] {
    const labels: string[] = [];
    if (row.canRead)      labels.push(this.languageService.t('role.detail.summaryRead'));
    if (row.canCreate)    labels.push(this.languageService.t('role.detail.summaryCreate'));
    if (row.canUpdate)    labels.push(this.languageService.t('role.detail.summaryUpdate'));
    if (row.canDelete)    labels.push(this.languageService.t('role.detail.summaryDelete'));
    if (row.canShowInNav) labels.push(this.languageService.t('role.detail.summaryNav'));
    if (row.canOwnOnly)   labels.push(this.languageService.t('role.detail.summaryOwn'));
    if (row.canViewWorkflow) labels.push(this.languageService.t('role.detail.summaryWorkflow'));
    return labels;
  }

  /** İzin detay panelinden tek bir modelin izinlerini kaydeder */
  saveModelPerm(row: RolePermissionRow): void {
    const role = this.role();
    if (!role) return;

    this.permRowSaving.set(true);
    this.permMsg.set('');

    this.roleService.setRolePermission(role.id, row.modelName, toActionInt(row)).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        if (res.success) {
          row.dirty = false;
          this.permMsg.set(this.languageService.t('role.detail.permissionsSaved'));
          this.permMsgType.set('success');
        } else {
          this.permMsg.set(res.message);
          this.permMsgType.set('danger');
        }
        this.permRowSaving.set(false);
      },
      error: () => {
        this.permMsg.set(this.languageService.t('role.detail.permissionsSaveError', { modelName: row.modelName }));
        this.permMsgType.set('danger');
        this.permRowSaving.set(false);
      }
    });
  }

  /* ──────────────── Üyeler ──────────────── */

  private loadRoleMembers(roleId: number): void {
    this.membersLoading.set(true);
    this.membersError.set('');
    this.roleService.getRoleMembers(roleId).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.members.set(res.success ? (res.data ?? []) : []);
        if (!res.success) this.membersError.set(res.message);
        this.membersLoading.set(false);
      },
      error: () => {
        this.membersError.set(this.languageService.t('role.detail.membersLoadError'));
        this.membersLoading.set(false);
      }
    });
  }

  addMember(): void {
    const role = this.role();
    if (!role || !this.userIdToAdd) return;

    this.addMemberSaving.set(true);
    this.addMemberMsg.set('');

    this.roleService.addUserToRole(role.id, this.userIdToAdd).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        if (res.success) {
          this.userIdToAdd = null;
          this.loadRoleMembers(role.id);
          this.role.set({ ...role, userCount: role.userCount + 1 });
        } else {
          this.addMemberMsg.set(res.message);
        }
        this.addMemberSaving.set(false);
      },
      error: () => {
        this.addMemberMsg.set(this.languageService.t('role.detail.addMemberError'));
        this.addMemberSaving.set(false);
      }
    });
  }

  removeMember(user: AppUser): void {
    const role = this.role();
    if (!role) return;

    this.removingUserId.set(user.id);

    this.roleService.removeUserFromRole(role.id, user.id).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        if (res.success) {
          this.members.set(this.members().filter(m => m.id !== user.id));
          this.role.set({ ...role, userCount: Math.max(0, role.userCount - 1) });
        } else {
          this.membersError.set(res.message);
        }
        this.removingUserId.set(null);
      },
      error: () => {
        this.membersError.set(this.languageService.t('role.detail.removeMemberError'));
        this.removingUserId.set(null);
      }
    });
  }

  /** Kullanıcının tam adı */
  fullName(user: AppUser): string {
    return `${user.firstName} ${user.lastName}`.trim() || user.email;
  }
}
