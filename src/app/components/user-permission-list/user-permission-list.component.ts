import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { PermissionAdminService } from '../../services/permission-admin.service';
import { AppUser } from '../../models/appUser';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { LanguageService } from '../../services/language.service';
import { markDirty } from '../../utils/change-detection';

/** "İzinli model sayısı" sütununda gösterilen, izin sayısı zenginleştirilmiş kullanıcı satırı */
interface UserRow extends AppUser {
  permittedModelCount: number;
}

@Component({
  selector: 'app-user-permission-list',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslatePipe],
  templateUrl: './user-permission-list.component.html',
  styleUrls: ['./user-permission-list.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UserPermissionListComponent implements OnInit {
  /** OnPush: asenkron veri geldiğinde görünümü kirli işaretlemek için (bkz. markDirty). */
  private readonly cdr = inject(ChangeDetectorRef);

  private readonly languageService = inject(LanguageService);

  rows      = signal<UserRow[]>([]);
  loading   = signal(true);
  loadError = signal('');

  constructor(private adminService: PermissionAdminService) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.loadError.set('');

    this.adminService.getUsers().pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        if (!res.success) {
          this.rows.set([]);
          this.loadError.set(res.message);
          this.loading.set(false);
          return;
        }

        const users = res.data ?? [];
        if (users.length === 0) {
          this.rows.set([]);
          this.loading.set(false);
          return;
        }

        // İzinli model sayıları TEK istekte (eskiden kullanıcı başına ayrı forUser isteği).
        this.adminService.getPermittedModelCounts().pipe(
          map(countsRes => (countsRes.success ? countsRes.data ?? {} : {}) as Record<string, number>),
          catchError(() => of({} as Record<string, number>)),
          markDirty(this.cdr)
        ).subscribe(counts => {
          this.rows.set(users.map(user => ({ ...user, permittedModelCount: counts[String(user.id)] ?? 0 })));
          this.loading.set(false);
        });
      },
      error: () => {
        this.loadError.set(this.languageService.t('permission.list.loadError'));
        this.loading.set(false);
      }
    });
  }

  /** Kullanıcının tam adı */
  fullName(user: AppUser): string {
    return `${user.firstName} ${user.lastName}`.trim() || user.email;
  }
}
