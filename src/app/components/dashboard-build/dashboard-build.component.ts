import { Component, OnInit } from '@angular/core';
import { FormArray, FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ReportService } from '../../services/report.service';
import { DashboardService } from '../../services/dashboard.service';
import { ReportDefinition } from '../../models/report.model';
import { DashboardWidget } from '../../models/dashboard.model';

/**
 * Dashboard tasarımcısı: ad ver, mevcut raporlardan widget olarak eklenecekleri seç.
 * Grid konumu (x/y/w/h) şimdilik otomatik (2 sütunlu akış) — drag&drop ileride.
 */
@Component({
  selector: 'app-dashboard-build',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './dashboard-build.component.html',
  styleUrls: ['./dashboard-build.component.scss']
})
export class DashboardBuildComponent implements OnInit {
  reports: ReportDefinition[] = [];
  loading = false;
  loadError: string | null = null;
  saving = false;
  submitError: string | null = null;

  form: FormGroup;

  constructor(
    private fb: FormBuilder,
    private reportService: ReportService,
    private dashboardService: DashboardService,
    private router: Router
  ) {
    this.form = this.fb.group({
      name: ['', Validators.required],
      reports: this.fb.array<FormControl<boolean>>([])
    });
  }

  ngOnInit(): void {
    this.loading = true;
    this.reportService.list().subscribe({
      next: res => {
        this.loading = false;
        if (res.success) {
          this.reports = res.data ?? [];
          this.form.setControl('reports', this.fb.array(this.reports.map(() => this.fb.control(false))));
        } else {
          this.loadError = res.message ?? 'Raporlar yüklenemedi.';
        }
      },
      error: (err: { error?: { message?: string } }) => {
        this.loading = false;
        this.loadError = err?.error?.message ?? 'Sunucu bağlantı hatası.';
      }
    });
  }

  get reportsArray(): FormArray {
    return this.form.get('reports') as FormArray;
  }

  onSubmit(): void {
    this.submitError = null;

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const selected = this.reports.filter((_, i) => this.reportsArray.at(i).value === true);
    if (selected.length === 0) {
      this.submitError = 'En az bir rapor seçilmelidir.';
      return;
    }

    const widgets: DashboardWidget[] = selected.map((r, i) => ({
      reportDefinitionId: r.id,
      chartType: r.chartType,
      x: (i % 2) * 6,
      y: Math.floor(i / 2) * 4,
      w: 6,
      h: 4
    }));

    this.saving = true;
    this.dashboardService.define({ name: this.form.value.name, widgets }).subscribe({
      next: res => {
        this.saving = false;
        if (res.success) {
          this.router.navigate(['/dashboard', res.data]);
        } else {
          this.submitError = res.message ?? 'Dashboard kaydedilemedi.';
        }
      },
      error: (err: { error?: { message?: string } }) => {
        this.saving = false;
        this.submitError = err?.error?.message ?? 'Sunucu bağlantı hatası.';
      }
    });
  }
}
