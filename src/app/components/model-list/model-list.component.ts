import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';

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
    imports: [RouterLink, TranslatePipe, IconComponent, ModelIconComponent],
    templateUrl: './model-list.component.html',
    styleUrls: ['./model-list.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ModelListComponent implements OnInit {
  /** OnPush: to mark the view dirty when async data arrives (see markDirty). */
  private readonly cdr = inject(ChangeDetectorRef);

  private readonly languageService = inject(LanguageService);

  models: PublishedModel[] = [];
  loading = false;
  loadError: string | null = null;
  /** true when a regular user can access no table at all */
  noPermission = false;

  constructor(
    private publishedModel: PublishedModelService,
    private permissionService: PermissionService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.load();
  }

  /** The "Silinmiş Modeller" (Deleted models) button is shown only to admins. */
  get isAdmin(): boolean {
    return this.permissionService.isAdmin();
  }

  load(): void {
    this.loading = true;
    this.loadError = null;
    this.noPermission = false;

    // Load permissions and the model list together — so the signal is ready. Permissions were
    // already loaded at startup (APP_INITIALIZER): ensureLoaded fetches only if not loaded. It used to
    // be refetched on every /models visit, and since the signal was rewritten everything re-rendered.
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
          // Admin: show all model cards (existing behaviour)
          this.models = allModels;
        } else {
          // Regular user: doesn't show the "Modeller" (Models) list;
          // redirect straight to the first readable table
          const permitted = allModels.filter(m =>
            this.permissionService.can(m.typeName, 'read')
          );
          if (permitted.length > 0) {
            this.router.navigate(['/models', permitted[0].typeName], { replaceUrl: true });
          } else {
            // If there is no access at all, show the no-permission state
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
