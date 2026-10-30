import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { PublishedModelService, PublishedModel } from '../../services/published-model.service';
import { PermissionService } from '../../services/permission.service';
import { LanguageService } from '../../services/language.service';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { markDirty } from '../../utils/change-detection';
import { IconComponent } from '../shared/icon/icon.component';
import { ModelIconComponent } from '../shared/model-icon/model-icon.component';

@Component({
    selector: 'app-model-list',
    imports: [CommonModule, RouterLink, TranslatePipe, IconComponent, ModelIconComponent],
    templateUrl: './model-list.component.html',
    styleUrls: ['./model-list.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ModelListComponent implements OnInit {
  /** OnPush: asenkron veri geldiğinde görünümü kirli işaretlemek için (bkz. markDirty). */
  private readonly cdr = inject(ChangeDetectorRef);

  private readonly languageService = inject(LanguageService);

  models: PublishedModel[] = [];
  loading = false;
  loadError: string | null = null;
  /** Normal kullanıcı hiçbir tabloya erişemediğinde true */
  noPermission = false;

  constructor(
    private publishedModel: PublishedModelService,
    private permissionService: PermissionService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.load();
  }

  /** "Silinmiş Modeller" butonu yalnızca admin'e gösterilir. */
  get isAdmin(): boolean {
    return this.permissionService.isAdmin();
  }

  load(): void {
    this.loading = true;
    this.loadError = null;
    this.noPermission = false;

    // Yetki ve model listesini birlikte yükle — signal'in hazır olması için. İzinler açılışta
    // (APP_INITIALIZER) zaten yüklendi: ensureLoaded yalnız yüklenmemişse ister. Eskiden her
    // /models ziyaretinde yeniden isteniyor ve sinyal yeniden yazıldığı için her şey yeniden çiziliyordu.
    forkJoin([
      this.permissionService.ensureLoaded(),
      this.publishedModel.getModels()
    ]).pipe(markDirty(this.cdr)).subscribe({
      next: ([, modelsRes]) => {
        this.loading = false;
        if (!modelsRes.success) {
          this.loadError = modelsRes.message ?? this.languageService.t('model.list.loadFailed');
          return;
        }
        const allModels = modelsRes.data ?? [];

        if (this.permissionService.isAdmin()) {
          // Admin: tüm model kartlarını göster (mevcut davranış)
          this.models = allModels;
        } else {
          // Normal kullanıcı: "Modeller" listesini göstermez;
          // okuma yetkili ilk tabloya doğrudan yönlendir
          const permitted = allModels.filter(m =>
            this.permissionService.can(m.typeName, 'read')
          );
          if (permitted.length > 0) {
            this.router.navigate(['/models', permitted[0].typeName], { replaceUrl: true });
          } else {
            // Hiç erişim yoksa boş-yetki durumunu göster
            this.noPermission = true;
          }
        }
      },
      error: err => {
        this.loading = false;
        this.loadError = err?.error?.message ?? this.languageService.t('model.list.serverError');
      }
    });
  }
}
