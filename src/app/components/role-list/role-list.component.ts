import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnInit, signal } from '@angular/core';

import { RouterLink } from '@angular/router';
import { of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { RoleAdminService } from '../../services/role-admin.service';
import { Role } from '../../models/role';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { LanguageService } from '../../services/language.service';
import { markDirty } from '../../utils/change-detection';
import { ConfirmDialogComponent } from '../shared/confirm-dialog/confirm-dialog.component';
import { IconComponent } from '../shared/icon/icon.component';

/** Role row enriched with the member count, shown in the "İzinli model sayısı" (Permitted model count) column */
interface RoleRow extends Role {
  permittedModelCount: number;
}

@Component({
    selector: 'app-role-list',
    imports: [RouterLink, TranslatePipe, ConfirmDialogComponent, IconComponent],
    templateUrl: './role-list.component.html',
    styleUrls: ['./role-list.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class RoleListComponent implements OnInit {
  /** OnPush: to mark the view dirty when async data arrives (see markDirty). */
  private readonly cdr = inject(ChangeDetectorRef);

  private readonly languageService = inject(LanguageService);

  rows        = signal<RoleRow[]>([]);
  loading     = signal(true);
  loadError   = signal('');
  deletingId  = signal<number | null>(null);

  constructor(private roleService: RoleAdminService) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.loadError.set('');

    this.roleService.getRoles().pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        if (!res.success) {
          this.rows.set([]);
          this.loadError.set(res.message);
          this.loading.set(false);
          return;
        }

        const roles = res.data ?? [];
        if (roles.length === 0) {
          this.rows.set([]);
          this.loading.set(false);
          return;
        }

        // Permitted model counts in a SINGLE request (previously a separate permissions request per role).
        this.roleService.getPermittedModelCounts().pipe(
          map(countsRes => (countsRes.success ? countsRes.data ?? {} : {}) as Record<string, number>),
          catchError(() => of({} as Record<string, number>)),
          markDirty(this.cdr)
        ).subscribe(counts => {
          this.rows.set(roles.map(role => ({ ...role, permittedModelCount: counts[String(role.id)] ?? 0 })));
          this.loading.set(false);
        });
      },
      error: () => {
        this.loadError.set(this.languageService.t('role.list.loadError'));
        this.loading.set(false);
      }
    });
  }

  /** Delete target awaiting confirmation; null means the dialog is closed. */
  readonly pendingDelete = signal<RoleRow | null>(null);

  askDeleteRole(row: RoleRow): void {
    this.pendingDelete.set(row);
  }

  cancelDeleteRole(): void {
    this.pendingDelete.set(null);
  }

  confirmDeleteRole(): void {
    const row = this.pendingDelete();
    if (!row) return;

    this.pendingDelete.set(null);
    this.deletingId.set(row.id);
    this.roleService.deleteRole(row.id).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.deletingId.set(null);
        if (res.success) {
          this.rows.set(this.rows().filter(r => r.id !== row.id));
        } else {
          this.loadError.set(res.message);
        }
      },
      error: () => {
        this.deletingId.set(null);
        this.loadError.set(this.languageService.t('role.list.deleteError'));
      }
    });
  }
}
