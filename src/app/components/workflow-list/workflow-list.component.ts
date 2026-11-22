import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';

import { Router, RouterLink } from '@angular/router';
import { WorkflowService } from '../../services/workflow.service';
import { WorkflowDefinition, WorkflowUsage } from '../../models/workflow.model';
import { freeCode, parsePackage } from '../../utils/workflow/workflow-package';
import { LanguageService } from '../../services/language.service';
import { NotificationService } from '../../services/notification.service';
import { PermissionService } from '../../services/permission.service';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { ModelLabelPipe } from '../../pipes/model-label.pipe';
import { ConfirmDialogComponent } from '../shared/confirm-dialog/confirm-dialog.component';
import { markDirty } from '../../utils/change-detection';
import { IconComponent } from '../shared/icon/icon.component';

/**
 * Workflow definition list.
 *
 * Same structure as report-list: .page-header + .data-table + empty-state.
 * Clicking a row opens the designer (a draft is edited, a published one is read-only);
 * New version and Export are there, the list keeps only inline quick actions.
 * The delete confirmation uses shared/confirm-dialog, not native confirm().
 */
@Component({
    selector: 'app-workflow-list',
    imports: [RouterLink, TranslatePipe, ModelLabelPipe, ConfirmDialogComponent, IconComponent],
    templateUrl: './workflow-list.component.html',
    styleUrl: './workflow-list.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class WorkflowListComponent implements OnInit {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly workflowService = inject(WorkflowService);
  private readonly languageService = inject(LanguageService);
  private readonly notification = inject(NotificationService);
  private readonly permissionService = inject(PermissionService);
  private readonly router = inject(Router);

  workflows: WorkflowDefinition[] = [];
  loading = false;
  loadError: string | null = null;

  /** Per-row action lock — so the same workflow isn't clicked twice. */
  busyId: number | null = null;

  /** Pending delete request that opens confirm-dialog. */
  pendingDelete: WorkflowDefinition | null = null;

  /** Plan quota — the strip isn't shown if it can't be read. */
  usage: WorkflowUsage | null = null;
  importing = false;

  get isAdmin(): boolean {
    return this.permissionService.isAdmin();
  }

  ngOnInit(): void {
    this.load();
    this.loadUsage();
  }

  private loadUsage(): void {
    this.workflowService.usage().pipe(markDirty(this.cdr)).subscribe({
      next: res => { this.usage = res.success ? res.data ?? null : null; },
      error: () => { this.usage = null; }
    });
  }

  /** "3 / 5", or just the usage if unlimited. */
  quotaText(used: number, limit: number | null | undefined): string {
    return limit == null ? String(used) : `${used} / ${limit}`;
  }

  // ── Pause / resume ────────────────────────────────────────────────────────

  /** Pauses or resumes the trigger of a published workflow; open processes aren't affected. */
  toggleEnabled(workflow: WorkflowDefinition): void {
    this.busyId = workflow.id;
    this.workflowService.setEnabled(workflow.id, !workflow.isEnabled).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.busyId = null;
        if (res.success) {
          this.notification.success(res.message ?? '');
          this.load();
        } else {
          this.notification.warn(res.message ?? this.languageService.t('workflow.list.loadFailed'));
        }
      },
      error: err => {
        this.busyId = null;
        this.notification.warn(err?.error?.message ?? this.languageService.t('workflow.list.serverError'));
      }
    });
  }

  // ── Import ────────────────────────────────────────────────────────────────

  /**
   * A package is always added as a new DRAFT; if the code collides it gets a suffix.
   * Role/person assignments may be invalid in the target company — the designer shows
   * them as issues.
   */
  onImportFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    file.text().then(text => {
      const parsed = parsePackage(text);
      if (!parsed.ok) {
        this.notification.warn(this.languageService.t(`workflow.package.error.${parsed.error}`));
        return;
      }

      const code = freeCode(parsed.workflow.code, this.allCodes);
      this.importing = true;
      this.cdr.markForCheck();
      this.workflowService.define({ ...parsed.workflow, code }).pipe(markDirty(this.cdr)).subscribe({
        next: res => {
          this.importing = false;
          if (res.success && res.data) {
            this.notification.success(this.languageService.t('workflow.package.imported', { code }));
            this.router.navigate(['/workflows', res.data, 'edit']);
          } else {
            this.notification.warn(res.message ?? this.languageService.t('workflow.package.error.fields'));
          }
        },
        error: err => {
          this.importing = false;
          this.notification.warn(err?.error?.message ?? this.languageService.t('workflow.list.serverError'));
        }
      });
    });
  }

  /** All codes including archived — so an imported workflow doesn't overwrite an existing code. */
  private allCodes: string[] = [];

  load(): void {
    this.loading = true;
    this.loadError = null;

    this.workflowService.list().pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.loading = false;
        if (res.success) {
          const all = res.data ?? [];

          // The highest publish number per Code, to show which version the draft will become
          // — computed BEFORE archived rows are hidden.
          this.allCodes = [...new Set(all.map(w => w.code))];
          this.maxVersionByCode = new Map();
          for (const w of all) {
            this.maxVersionByCode.set(w.code, Math.max(this.maxVersionByCode.get(w.code) ?? 0, w.version));
          }

          // Archived versions aren't kept in the list; it would grow with every publish.
          // History is on the /workflows/versions/:code screen.
          this.workflows = all.filter(w => w.status !== 'Archived');
        } else {
          this.loadError = res.message ?? this.languageService.t('workflow.list.loadFailed');
        }
      },
      error: err => {
        this.loading = false;
        this.loadError = err?.error?.message ?? this.languageService.t('workflow.list.serverError');
      }
    });
  }

  publish(workflow: WorkflowDefinition): void {
    this.busyId = workflow.id;

    this.workflowService.publish(workflow.id).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.busyId = null;
        if (res.success) {
          this.notification.success(res.message ?? this.languageService.t('workflow.list.publishSuccess'));
          this.load();
        } else {
          this.notification.warn(res.message ?? this.languageService.t('workflow.list.loadFailed'));
        }
      },
      error: err => {
        this.busyId = null;
        this.notification.warn(err?.error?.message ?? this.languageService.t('workflow.list.serverError'));
      }
    });
  }

  /** Highest publish number per Code (archived included). */
  private maxVersionByCode = new Map<string, number>();

  /** Version column: "v2" when published, "v3 taslak" (v3 draft) for a new version draft. */
  versionLabel(workflow: WorkflowDefinition): string {
    if (workflow.version > 0) return 'v' + workflow.version;

    const next = (this.maxVersionByCode.get(workflow.code) ?? 0) + 1;
    return this.languageService.t('workflow.list.draftVersion', { n: next });
  }

  askDelete(workflow: WorkflowDefinition): void {
    this.pendingDelete = workflow;
  }

  cancelDelete(): void {
    this.pendingDelete = null;
  }

  confirmDelete(): void {
    const target = this.pendingDelete;
    if (!target) return;

    this.busyId = target.id;
    this.pendingDelete = null;

    this.workflowService.delete(target.id).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.busyId = null;
        if (res.success) {
          this.notification.success(res.message ?? '');
          this.load();
        } else {
          this.notification.warn(res.message ?? this.languageService.t('workflow.list.loadFailed'));
        }
      },
      error: err => {
        this.busyId = null;
        this.notification.warn(err?.error?.message ?? this.languageService.t('workflow.list.serverError'));
      }
    });
  }

  /** Fills the {name} placeholder in the delete confirmation text. */
  get deleteMessage(): string {
    return this.languageService.t('workflow.list.deleteConfirm', { name: this.pendingDelete?.name ?? '' });
  }

  /** Color class of the status badge. */
  statusClass(status: string): string {
    switch (status) {
      case 'Published': return 'badge-success';
      case 'Draft':     return 'badge-warn';
      default:          return 'badge-meta';
    }
  }
}
