import {
  ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ParameterService } from '../../../services/parameter.service';
import { LanguageService } from '../../../services/language.service';
import { TranslatePipe } from '../../../pipes/translate.pipe';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog/confirm-dialog.component';
import { HelpHintComponent } from '../../shared/help-hint/help-hint.component';
import { BackupRestoreDialogComponent } from './backup-restore-dialog.component';
import { BackupHistoryItem, BackupSchedule, TenantRestore, isBackupActive } from '../../../models/parameter.model';
import { formatDate, formatNumber } from '../../../utils/locale-format';
import {
  CRON_FREQUENCIES,
  CronFrequency,
  CronSpec,
  HOUR_INTERVALS,
  buildCron,
  defaultCronSpec,
  detectTimeZone,
  isShortMonthRisk,
  isValidCron,
  nextOccurrences,
  parseCron
} from '../../../utils/cron-builder';
import { IconComponent } from '../../shared/icon/icon.component';

/** History polling interval while a backup is queued/running. */
const HISTORY_POLL_MS = 3000;

/** Which fields to show for the selected frequency — the template reads this. */
interface FieldVisibility {
  minute: boolean;
  time: boolean;
  hourInterval: boolean;
  dayInterval: boolean;
  dayOfWeek: boolean;
  dayOfMonth: boolean;
  raw: boolean;
}

/**
 * Backup tab — schedule builder, status summary and backup history.
 *
 * All scheduling logic lives in pure functions in `utils/cron-builder.ts`
 * and is tested there; here there is only form state and HTTP calls.
 */
@Component({
    selector: 'app-backup-settings-tab',
    imports: [CommonModule, FormsModule, TranslatePipe, ConfirmDialogComponent, HelpHintComponent, BackupRestoreDialogComponent, IconComponent],
    templateUrl: './backup-settings-tab.component.html',
    styleUrls: ['../parameters.shared.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class BackupSettingsTabComponent implements OnInit {
  private readonly parameterService = inject(ParameterService);
  private readonly languageService = inject(LanguageService);
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  /** After closing, a pending request's response must not start a new polling chain. */
  private destroyed = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.stopPolling();
    });
  }

  readonly frequencies = CRON_FREQUENCIES;
  readonly hourIntervals = HOUR_INTERVALS;
  /** 1-31 — the "day of month" picker. */
  readonly monthDays = Array.from({ length: 31 }, (_, i) => i + 1);
  /** 0 = Sunday … 6 = Saturday (same order as Date.getDay()). */
  readonly weekDays = [0, 1, 2, 3, 4, 5, 6];

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly running = signal(false);
  readonly loadError = signal('');
  readonly formError = signal('');
  readonly formSuccess = signal('');

  readonly enabled = signal(false);
  readonly retentionDays = signal(30);
  readonly timeZoneId = signal<string | null>(null);
  readonly spec = signal<CronSpec>(defaultCronSpec());

  readonly status = signal<BackupSchedule | null>(null);
  readonly history = signal<BackupHistoryItem[]>([]);

  readonly runConfirmOpen = signal(false);

  /** Backup for the restore dialog (confirm step) and a restore already running when the page opens. */
  readonly restoreTarget = signal<BackupHistoryItem | null>(null);
  readonly activeRestore = signal<TenantRestore | null>(null);
  /** Backup whose download link was requested — its button is locked. */
  readonly downloadingId = signal<number | null>(null);

  /** Whether a backup is queued or running — if so no new backup is requested and the history is polled. */
  readonly hasActiveBackup = computed(() => this.history().some(isBackupActive));

  /** Cron expression generated from the selection — this is the saved value. */
  readonly cronExpression = computed(() => buildCron(this.spec()));

  readonly cronValid = computed(() => isValidCron(this.cronExpression()));

  readonly shortMonthWarning = computed(() => isShortMonthRisk(this.spec()));

  readonly retentionValid = computed(() => {
    const days = this.retentionDays();
    return Number.isInteger(days) && days >= 0 && days <= 3650;
  });

  /** The next 5 runs — the user sees what will happen before saving. */
  readonly nextRuns = computed(() => {
    if (!this.cronValid()) return [];
    return nextOccurrences(this.cronExpression(), new Date(), 5)
      .map(date => this.formatDateTime(date));
  });

  readonly fields = computed<FieldVisibility>(() => {
    const frequency = this.spec().frequency;
    return {
      minute: frequency !== 'custom',
      time: ['daily', 'everyNDays', 'weekly', 'monthly'].includes(frequency),
      hourInterval: frequency === 'everyNHours',
      dayInterval: frequency === 'everyNDays',
      dayOfWeek: frequency === 'weekly',
      dayOfMonth: frequency === 'monthly',
      raw: frequency === 'custom'
    };
  });

  ngOnInit(): void {
    this.load();

    // If the page opened while a restore is running (reload, another tab) progress is shown directly.
    this.parameterService.getActiveRestore().subscribe({
      next: res => { if (res.success && res.data) this.activeRestore.set(res.data); },
      error: () => {}
    });
  }

  /**
   * Downloads the backup: a short-lived signed link is obtained from the server and the browser opens it directly.
   * The file can be gigabytes, so it is not loaded into memory as a blob.
   */
  download(item: BackupHistoryItem): void {
    this.downloadingId.set(item.id);
    this.formError.set('');
    this.parameterService.getBackupDownloadLink(item.id).subscribe({
      next: res => {
        this.downloadingId.set(null);
        if (!res.success || !res.data) {
          this.formError.set(res.message);
          return;
        }
        const anchor = document.createElement('a');
        anchor.href = this.parameterService.backupDownloadUrl(res.data);
        anchor.download = res.data.fileName;
        anchor.rel = 'noopener';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      },
      error: (err: { error?: { message?: string } }) => {
        this.downloadingId.set(null);
        this.formError.set(err?.error?.message ?? this.languageService.t('parameter.backup.downloadFailed'));
      }
    });
  }

  requestRestore(item: BackupHistoryItem): void {
    this.restoreTarget.set(item);
  }

  onRestoreDialogClosed(): void {
    this.restoreTarget.set(null);
    this.activeRestore.set(null);
    this.loadHistory();
  }

  /** Reason a backup cannot be restored (server's short code → text). */
  restoreBlockedText(item: BackupHistoryItem): string {
    return item.restoreBlockedReason
      ? this.languageService.t(`parameter.backup.restoreBlocked.${item.restoreBlockedReason}`)
      : '';
  }

  load(): void {
    this.loading.set(true);
    this.loadError.set('');

    this.parameterService.getBackupSchedule().subscribe({
      next: res => {
        if (!res.success) {
          this.loadError.set(res.message);
        } else {
          this.applySchedule(res.data);
        }
        this.loading.set(false);
        this.loadHistory();
      },
      error: () => {
        this.loadError.set(this.languageService.t('parameter.backup.loadFailed'));
        this.loading.set(false);
      }
    });
  }

  private applySchedule(schedule: BackupSchedule): void {
    this.status.set(schedule);
    this.enabled.set(schedule.enabled);
    this.retentionDays.set(schedule.retentionDays ?? 30);
    this.spec.set(parseCron(schedule.cronExpression));

    // For a never-saved schedule take the time zone from the browser — when the user
    // says "every day 03:00" they mean their own time, not UTC.
    this.timeZoneId.set(schedule.timeZoneId || detectTimeZone());
  }

  private loadHistory(): void {
    this.parameterService.getBackupHistory().subscribe({
      next: res => {
        this.history.set(res.success ? (res.data ?? []) : []);
        this.schedulePoll();
      },
      // If the history fails to load, the schedule form must still be usable.
      error: () => this.history.set([])
    });
  }

  /**
   * Since backups now run in the background, the screen tracks the result itself: while a queued/running
   * row remains the history is re-read every few seconds, and it stops when all are finished.
   */
  private schedulePoll(): void {
    this.stopPolling();
    if (this.destroyed || !this.hasActiveBackup()) return;
    this.pollTimer = setTimeout(() => {
      this.pollTimer = null;
      this.loadHistory();
    }, HISTORY_POLL_MS);
  }

  private stopPolling(): void {
    if (this.pollTimer !== null) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  onFrequencyChange(frequency: CronFrequency): void {
    const current = this.spec();
    // When switching to 'custom' the cron equivalent of the current selection is carried over so the user
    // does not have to write it from scratch.
    const raw = frequency === 'custom' ? buildCron(current) : current.raw;
    this.spec.set({ ...current, frequency, raw });
  }

  patchSpec(patch: Partial<CronSpec>): void {
    this.spec.set({ ...this.spec(), ...patch });
  }

  /** `<input type="time">` value ("HH:mm") — two-way conversion. */
  get timeValue(): string {
    const s = this.spec();
    return `${this.pad(s.hour)}:${this.pad(s.minute)}`;
  }

  onTimeChange(value: string): void {
    const [hour, minute] = value.split(':').map(Number);
    if (Number.isInteger(hour) && Number.isInteger(minute)) {
      this.patchSpec({ hour, minute });
    }
  }

  save(): void {
    this.formError.set('');
    this.formSuccess.set('');

    if (!this.cronValid()) {
      this.formError.set(this.languageService.t('parameter.backup.rawCronInvalid'));
      return;
    }
    if (!this.retentionValid()) {
      this.formError.set(this.languageService.t('parameter.backup.retentionInvalid'));
      return;
    }

    this.saving.set(true);
    this.parameterService.saveBackupSchedule({
      enabled: this.enabled(),
      cronExpression: this.cronExpression(),
      timeZoneId: this.timeZoneId(),
      retentionDays: this.retentionDays()
    }).subscribe({
      next: res => {
        if (res.success) {
          this.formSuccess.set(res.message);
          // After saving, read back the NextDueAt computed by the server —
          // so there is no gap between the preview and the actual due time.
          this.parameterService.getBackupSchedule().subscribe({
            next: fresh => { if (fresh.success) this.status.set(fresh.data); }
          });
        } else {
          this.formError.set(res.message);
        }
        this.saving.set(false);
      },
      error: () => {
        this.formError.set(this.languageService.t('parameter.backup.saveFailed'));
        this.saving.set(false);
      }
    });
  }

  requestRunNow(): void {
    this.runConfirmOpen.set(true);
  }

  cancelRunNow(): void {
    this.runConfirmOpen.set(false);
  }

  confirmRunNow(): void {
    this.running.set(true);
    this.formError.set('');
    this.formSuccess.set('');

    this.parameterService.runBackupNow().subscribe({
      next: res => {
        if (res.success) this.formSuccess.set(res.message);
        else this.formError.set(res.message);

        this.running.set(false);
        this.runConfirmOpen.set(false);
        this.loadHistory();
      },
      error: () => {
        this.formError.set(this.languageService.t('parameter.backup.runFailed'));
        this.running.set(false);
        this.runConfirmOpen.set(false);
      }
    });
  }

  // ── Display helpers ───────────────────────────────────────────────────────

  /** Formats an ISO date string for the active language; returns a dash if empty. */
  formatInstant(value: string | null | undefined): string {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : this.formatDateTime(date);
  }

  private formatDateTime(date: Date): string {
    const lang = this.languageService.lang();
    return `${formatDate(date, lang)} ${this.pad(date.getHours())}:${this.pad(date.getMinutes())}`;
  }

  /** Converts a byte value to a readable unit (backup files can reach the GB range). */
  formatSize(bytes: number): string {
    if (!bytes) return '—';

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
      value /= 1024;
      unit++;
    }

    const rounded = unit === 0 ? value : Math.round(value * 10) / 10;
    return `${formatNumber(rounded, this.languageService.lang())} ${units[unit]}`;
  }

  /** Unknown type/status codes are shown raw (no made-up keys). */
  typeLabel(type: string): string {
    const key = `parameter.backup.type.${type}`;
    const label = this.languageService.t(key);
    return label === key ? type : label;
  }

  statusLabel(status: string): string {
    const key = `parameter.backup.status.${status}`;
    const label = this.languageService.t(key);
    return label === key ? status : label;
  }

  statusBadgeClass(status: string): string {
    switch (status) {
      case 'Completed': return 'badge-success';
      case 'Failed': return 'badge-danger';
      case 'Running':
      case 'Queued': return 'badge-warn';
      default: return 'badge-meta';
    }
  }

  /** Writes the weekday in the active language — no need to keep separate translation keys. */
  weekDayLabel(day: number): string {
    // 2026-08-02 is a Sunday; adding days keeps the 0=Sunday order.
    const reference = new Date(2026, 7, 2 + day);
    return reference.toLocaleDateString(
      this.languageService.lang() === 'en' ? 'en-US' : 'tr-TR', { weekday: 'long' });
  }

  private pad(value: number): string {
    return String(value).padStart(2, '0');
  }
}
