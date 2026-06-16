import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin, concatMap, from, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { PermissionAdminService, toActionInt } from '../../services/permission-admin.service';
import { PublishedModelService, PublishedModel } from '../../services/published-model.service';
import { AppUser } from '../../models/appUser';
import { ModelPermission } from '../../services/permission.service';

/** Düzenleme için kullanılan geçici izin satırı (orijinalden kopyalanır) */
export interface PermissionRow {
  modelName: string;
  canRead:   boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  /** Değiştirildi mi? Yalnızca değişen satırlar backend'e gönderilir */
  dirty: boolean;
}

@Component({
  selector: 'app-user-permissions',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './user-permissions.component.html',
  styleUrls: ['./user-permissions.component.scss']
})
export class UserPermissionsComponent implements OnInit {
  private readonly adminService  = inject(PermissionAdminService);
  private readonly modelService  = inject(PublishedModelService);

  /* ── Kullanıcı listesi ── */
  users          = signal<AppUser[]>([]);
  usersLoading   = signal(true);
  usersError     = signal('');

  /* ── Seçili kullanıcı ── */
  selectedUser   = signal<AppUser | null>(null);

  /* ── İzin matrisi ── */
  permRows       = signal<PermissionRow[]>([]);
  permLoading    = signal(false);
  permError      = signal('');

  /* ── Admin toggle ── */
  adminSaving    = signal(false);
  adminMsg       = signal('');
  adminMsgType   = signal<'success'|'danger'>('success');

  /* ── İzin kaydet ── */
  permSaving     = signal(false);
  permMsg        = signal('');
  permMsgType    = signal<'success'|'danger'>('success');

  ngOnInit(): void {
    this.loadUsers();
  }

  /* ──────────────── Kullanıcı listesi ──────────────── */

  loadUsers(): void {
    this.usersLoading.set(true);
    this.usersError.set('');
    this.adminService.getUsers().subscribe({
      next: res => {
        this.users.set(res.success ? (res.data ?? []) : []);
        if (!res.success) this.usersError.set(res.message);
        this.usersLoading.set(false);
      },
      error: () => {
        this.usersError.set('Kullanıcı listesi yüklenemedi.');
        this.usersLoading.set(false);
      }
    });
  }

  /* ──────────────── Kullanıcı seçimi ──────────────── */

  selectUser(user: AppUser): void {
    this.selectedUser.set(user);
    this.permMsg.set('');
    this.adminMsg.set('');
    this.loadUserPermissions(user.id);
  }

  /* ──────────────── İzin matrisi ──────────────── */

  private loadUserPermissions(userId: number): void {
    this.permLoading.set(true);
    this.permError.set('');
    this.permRows.set([]);

    forkJoin([
      this.modelService.getModels(),
      this.adminService.getUserPermissions(userId)
    ]).subscribe({
      next: ([modelsRes, permsRes]) => {
        const allModels: PublishedModel[] = modelsRes.success ? (modelsRes.data ?? []) : [];
        const existing: ModelPermission[] = permsRes.success ? (permsRes.data ?? []) : [];

        // Her model için bir satır: mevcut izin varsa doldur, yoksa sıfırla
        const rows: PermissionRow[] = allModels.map(m => {
          const p = existing.find(e => e.modelName.toLowerCase() === m.typeName.toLowerCase());
          return {
            modelName: m.typeName,
            canRead:   p?.canRead   ?? false,
            canCreate: p?.canCreate ?? false,
            canUpdate: p?.canUpdate ?? false,
            canDelete: p?.canDelete ?? false,
            dirty: false
          };
        });
        this.permRows.set(rows);
        this.permLoading.set(false);
      },
      error: () => {
        this.permError.set('İzin bilgileri yüklenemedi.');
        this.permLoading.set(false);
      }
    });
  }

  /** Checkbox değişince satırı dirty olarak işaretle */
  markDirty(row: PermissionRow): void {
    row.dirty = true;
  }

  /* ──────────────── İzin kaydet ──────────────── */

  savePermissions(): void {
    const user = this.selectedUser();
    if (!user) return;

    const dirtyRows = this.permRows().filter(r => r.dirty);
    if (dirtyRows.length === 0) {
      this.permMsg.set('Değişiklik yok.');
      this.permMsgType.set('success');
      return;
    }

    this.permSaving.set(true);
    this.permMsg.set('');

    // Değişen her satır için sıralı POST /Permission/set (concatMap)
    from(dirtyRows).pipe(
      concatMap(row =>
        this.adminService.setPermission(user.id, row.modelName, toActionInt(row)).pipe(
          catchError(() => of({ success: false, message: `${row.modelName} güncellenemedi.` }))
        )
      )
    ).subscribe({
      next: () => {},
      error: () => {
        this.permMsg.set('Bir hata oluştu.');
        this.permMsgType.set('danger');
        this.permSaving.set(false);
      },
      complete: () => {
        // dirty bayraklarını temizle
        const updated = this.permRows().map(r => ({ ...r, dirty: false }));
        this.permRows.set(updated);
        this.permMsg.set('İzinler kaydedildi.');
        this.permMsgType.set('success');
        this.permSaving.set(false);
      }
    });
  }

  /* ──────────────── Admin toggle ──────────────── */

  toggleAdmin(makeAdmin: boolean): void {
    const user = this.selectedUser();
    if (!user) return;

    this.adminSaving.set(true);
    this.adminMsg.set('');

    this.adminService.setAdmin(user.id, makeAdmin).subscribe({
      next: res => {
        this.adminMsg.set(res.message);
        this.adminMsgType.set(res.success ? 'success' : 'danger');
        if (res.success) {
          // Kullanıcı listesini ve seçili kullanıcıyı güncelle
          const updated: AppUser = { ...user, isAdmin: makeAdmin };
          this.selectedUser.set(updated);
          const list = this.users().map(u => u.id === user.id ? updated : u);
          this.users.set(list);
        }
        this.adminSaving.set(false);
      },
      error: () => {
        this.adminMsg.set('Admin rolü güncellenemedi.');
        this.adminMsgType.set('danger');
        this.adminSaving.set(false);
      }
    });
  }

  /** Kullanıcının tam adı */
  fullName(user: AppUser): string {
    return `${user.firstName} ${user.lastName}`.trim() || user.email;
  }

  /** Seçili kullanıcı admin mi? İzin matrisi devre dışı bırakmak için */
  get selectedIsAdmin(): boolean {
    return this.selectedUser()?.isAdmin ?? false;
  }
}
