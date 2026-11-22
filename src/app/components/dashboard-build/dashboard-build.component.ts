import { ChangeDetectionStrategy, ChangeDetectorRef, Component, computed, ElementRef, inject, OnInit, PLATFORM_ID, signal, ViewChild } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ReportService } from '../../services/report.service';
import { DashboardService } from '../../services/dashboard.service';
import { PermissionService } from '../../services/permission.service';
import { ChartType, ReportDefinition } from '../../models/report.model';
import { DashboardWidget } from '../../models/dashboard.model';
import { CHART_TYPE_META } from '../chart/chart-types';
import { LanguageService } from '../../services/language.service';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { ModelLabelPipe } from '../../pipes/model-label.pipe';
import { markDirty } from '../../utils/change-detection';
import { IconComponent } from '../shared/icon/icon.component';

/** Widget edited on the canvas — `reportName` is stripped on save (not in DashboardWidget). */
interface EditableWidget extends DashboardWidget {
  reportName: string;
}

const GRID_COLS = 12;
const DEFAULT_W = 6;
const DEFAULT_H = 4;
/** Pixel size of one `h` unit (gap included) — used in drag/resize calculations. */
const ROW_PITCH_PX = 56;

/**
 * Dashboard designer: name it, add widgets from existing reports, position/resize them
 * with drag-and-drop on a 12-column canvas, pick a chart type per widget.
 * Dragging uses no external library — implemented with native Pointer Events.
 */
@Component({
    selector: 'app-dashboard-build',
    imports: [ReactiveFormsModule, RouterLink, TranslatePipe, ModelLabelPipe, IconComponent],
    templateUrl: './dashboard-build.component.html',
    styleUrls: ['./dashboard-build.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardBuildComponent implements OnInit {
  /** OnPush: to mark the view dirty when async data arrives (see markDirty). */
  private readonly cdr = inject(ChangeDetectorRef);

  private readonly platformId = inject(PLATFORM_ID);
  private readonly fb = inject(FormBuilder);
  private readonly reportService = inject(ReportService);
  private readonly dashboardService = inject(DashboardService);
  private readonly router = inject(Router);
  private readonly languageService = inject(LanguageService);
  readonly permissionService = inject(PermissionService);

  @ViewChild('canvas') private canvasRef?: ElementRef<HTMLElement>;

  readonly chartTypes = CHART_TYPE_META;
  readonly gridCols = GRID_COLS;

  reports: ReportDefinition[] = [];
  readonly widgets = signal<EditableWidget[]>([]);

  /**
   * Display order on phones (row first, then column) — the dashboard screen stacks widgets
   * in this order on narrow screens. On narrow screens this list is shown instead of the
   * drag-and-drop canvas; the layout is edited on a wide screen.
   */
  readonly widgetsInOrder = computed(() =>
    [...this.widgets()].sort((a, b) => a.y - b.y || a.x - b.x));

  loading = false;
  loadError: string | null = null;
  saving = false;
  submitError: string | null = null;

  form: FormGroup = this.fb.group({
    name: ['', Validators.required],
    showInNav: [false]
  });

  private dragState: { id: number; startX: number; startY: number; originX: number; originY: number; colPitch: number } | null = null;
  private resizeState: { id: number; startX: number; startY: number; originW: number; originH: number; colPitch: number } | null = null;

  ngOnInit(): void {
    this.loading = true;
    this.reportService.list().pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.loading = false;
        if (res.success) {
          this.reports = res.data ?? [];
        } else {
          this.loadError = res.message ?? this.languageService.t('dashboard.build.loadReportsError');
        }
      },
      error: (err: { error?: { message?: string } }) => {
        this.loading = false;
        this.loadError = err?.error?.message ?? this.languageService.t('dashboard.build.serverError');
      }
    });
  }

  get f() {
    return this.form.controls;
  }

  isAdded(reportId: number): boolean {
    return this.widgets().some(w => w.reportDefinitionId === reportId);
  }

  toggleReport(report: ReportDefinition): void {
    if (this.isAdded(report.id)) {
      this.removeWidget(report.id);
      return;
    }

    const count = this.widgets().length;
    const widget: EditableWidget = {
      reportDefinitionId: report.id,
      reportName: report.name,
      chartType: report.chartType,
      x: (count % 2) * DEFAULT_W,
      y: Math.floor(count / 2) * DEFAULT_H,
      w: DEFAULT_W,
      h: DEFAULT_H
    };
    this.widgets.update(list => [...list, widget]);
  }

  removeWidget(reportDefinitionId: number): void {
    this.widgets.update(list => list.filter(w => w.reportDefinitionId !== reportDefinitionId));
  }

  setWidgetChartType(reportDefinitionId: number, chartType: ChartType): void {
    this.widgets.update(list =>
      list.map(w => (w.reportDefinitionId === reportDefinitionId ? { ...w, chartType } : w))
    );
  }

  private updateWidget(reportDefinitionId: number, patch: Partial<EditableWidget>): void {
    this.widgets.update(list =>
      list.map(w => (w.reportDefinitionId === reportDefinitionId ? { ...w, ...patch } : w))
    );
  }

  // ── Drag (move) ──────────────────────────────────────────────────────────

  onDragStart(ev: PointerEvent, widget: EditableWidget): void {
    if (!isPlatformBrowser(this.platformId) || !this.canvasRef) return;
    ev.preventDefault();
    const colPitch = this.canvasRef.nativeElement.clientWidth / GRID_COLS;
    this.dragState = {
      id: widget.reportDefinitionId,
      startX: ev.clientX,
      startY: ev.clientY,
      originX: widget.x,
      originY: widget.y,
      colPitch
    };
    document.addEventListener('pointermove', this.onDragMove);
    document.addEventListener('pointerup', this.onDragEnd);
  }

  private onDragMove = (ev: PointerEvent): void => {
    if (!this.dragState) return;
    const { id, startX, startY, originX, originY, colPitch } = this.dragState;
    const widget = this.widgets().find(w => w.reportDefinitionId === id);
    if (!widget) return;

    const dx = Math.round((ev.clientX - startX) / colPitch);
    const dy = Math.round((ev.clientY - startY) / ROW_PITCH_PX);
    const newX = Math.min(GRID_COLS - widget.w, Math.max(0, originX + dx));
    const newY = Math.max(0, originY + dy);
    this.updateWidget(id, { x: newX, y: newY });
  };

  private onDragEnd = (): void => {
    this.dragState = null;
    document.removeEventListener('pointermove', this.onDragMove);
    document.removeEventListener('pointerup', this.onDragEnd);
  };

  // ── Resize ───────────────────────────────────────────────────────────────

  onResizeStart(ev: PointerEvent, widget: EditableWidget): void {
    if (!isPlatformBrowser(this.platformId) || !this.canvasRef) return;
    ev.preventDefault();
    ev.stopPropagation();
    const colPitch = this.canvasRef.nativeElement.clientWidth / GRID_COLS;
    this.resizeState = {
      id: widget.reportDefinitionId,
      startX: ev.clientX,
      startY: ev.clientY,
      originW: widget.w,
      originH: widget.h,
      colPitch
    };
    document.addEventListener('pointermove', this.onResizeMove);
    document.addEventListener('pointerup', this.onResizeEnd);
  }

  private onResizeMove = (ev: PointerEvent): void => {
    if (!this.resizeState) return;
    const { id, startX, startY, originW, originH, colPitch } = this.resizeState;
    const widget = this.widgets().find(w => w.reportDefinitionId === id);
    if (!widget) return;

    const dw = Math.round((ev.clientX - startX) / colPitch);
    const dh = Math.round((ev.clientY - startY) / ROW_PITCH_PX);
    const newW = Math.min(GRID_COLS - widget.x, Math.max(2, originW + dw));
    const newH = Math.max(2, originH + dh);
    this.updateWidget(id, { w: newW, h: newH });
  };

  private onResizeEnd = (): void => {
    this.resizeState = null;
    document.removeEventListener('pointermove', this.onResizeMove);
    document.removeEventListener('pointerup', this.onResizeEnd);
  };

  // ── Save ─────────────────────────────────────────────────────────────────

  onSubmit(): void {
    this.submitError = null;

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    if (this.widgets().length === 0) {
      this.submitError = this.languageService.t('dashboard.build.atLeastOneReport');
      return;
    }

    const widgets: DashboardWidget[] = this.widgets().map(({ reportName, ...widget }) => widget);

    this.saving = true;
    this.dashboardService.define({
      name: this.form.value.name,
      widgets,
      // The backend applies this flag only for admins; if it comes from a regular user it is silently ignored.
      showInNav: this.permissionService.isAdmin() ? this.form.value.showInNav : false
    }).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.saving = false;
        if (res.success) {
          this.router.navigate(['/dashboard', res.data]);
        } else {
          this.submitError = res.message ?? this.languageService.t('dashboard.build.saveError');
        }
      },
      error: (err: { error?: { message?: string } }) => {
        this.saving = false;
        this.submitError = err?.error?.message ?? this.languageService.t('dashboard.build.serverError');
      }
    });
  }
}
