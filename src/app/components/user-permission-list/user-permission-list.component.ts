import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { PermissionAdminService } from '../../services/permission-admin.service';
import { ModelPermission } from '../../services/permission.service';
import { AppUser } from '../../models/appUser';

/** "İzinli model sayısı" sütununda gösterilen, izin sayısı zenginleştirilmiş kullanıcı satırı */
interface UserRow extends AppUser {
  permittedModelCount: number;
}

@Component({
  selector: 'app-user-permission-list',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './user-permission-list.component.html',
  styleUrls: ['./user-permission-list.component.scss']
})
export class UserPermissionListComponent implements OnInit {
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

    this.adminService.getUsers().subscribe({
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

        // Her kullanıcının izinli model sayısını ayrıca çek (en az bir izni olan modeller)
        forkJoin(
          users.map(user =>
            this.adminService.getUserPermissions(user.id).pipe(
              map(permsRes => this.countPermittedModels(permsRes.success ? permsRes.data : [])),
              catchError(() => of(0))
            )
          )
        ).subscribe(counts => {
          this.rows.set(users.map((user, i) => ({ ...user, permittedModelCount: counts[i] })));
          this.loading.set(false);
        });
      },
      error: () => {
        this.loadError.set('Kullanıcı listesi yüklenemedi.');
        this.loading.set(false);
      }
    });
  }

  private countPermittedModels(perms: ModelPermission[] | undefined): number {
    return (perms ?? []).filter(p =>
      p.canRead || p.canCreate || p.canUpdate || p.canDelete || p.canShowInNav || p.canOwnOnly
    ).length;
  }

  /** Kullanıcının tam adı */
  fullName(user: AppUser): string {
    return `${user.firstName} ${user.lastName}`.trim() || user.email;
  }
}
