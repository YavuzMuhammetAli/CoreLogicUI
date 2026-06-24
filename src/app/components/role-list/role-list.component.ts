import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { RoleAdminService } from '../../services/role-admin.service';
import { ModelPermission } from '../../services/permission.service';
import { Role } from '../../models/role';

/** "İzinli model sayısı" sütununda gösterilen, üye sayısı zenginleştirilmiş rol satırı */
interface RoleRow extends Role {
  permittedModelCount: number;
}

@Component({
  selector: 'app-role-list',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './role-list.component.html',
  styleUrls: ['./role-list.component.scss']
})
export class RoleListComponent implements OnInit {
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

    this.roleService.getRoles().subscribe({
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

        // Her rolün izinli model sayısını ayrıca çek (en az bir izni olan modeller)
        forkJoin(
          roles.map(role =>
            this.roleService.getRolePermissions(role.id).pipe(
              map(permsRes => this.countPermittedModels(permsRes.success ? permsRes.data : [])),
              catchError(() => of(0))
            )
          )
        ).subscribe(counts => {
          this.rows.set(roles.map((role, i) => ({ ...role, permittedModelCount: counts[i] })));
          this.loading.set(false);
        });
      },
      error: () => {
        this.loadError.set('Rol listesi yüklenemedi.');
        this.loading.set(false);
      }
    });
  }

  private countPermittedModels(perms: ModelPermission[] | undefined): number {
    return (perms ?? []).filter(p =>
      p.canRead || p.canCreate || p.canUpdate || p.canDelete || p.canShowInNav || p.canOwnOnly
    ).length;
  }

  deleteRole(row: RoleRow): void {
    if (!confirm(`'${row.name}' rolünü silmek istediğinize emin misiniz? Bu işlem rolün tüm üyelik ve izin kayıtlarını da kaldırır.`)) return;

    this.deletingId.set(row.id);
    this.roleService.deleteRole(row.id).subscribe({
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
        this.loadError.set('Rol silinemedi.');
      }
    });
  }
}
