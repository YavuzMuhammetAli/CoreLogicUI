import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, signal } from '@angular/core';

import { DatabaseService } from '../../services/database.service';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { LanguageService } from '../../services/language.service';
import { markDirty } from '../../utils/change-detection';
import { IconComponent } from '../shared/icon/icon.component';

@Component({
    selector: 'app-database-process',
    imports: [TranslatePipe, IconComponent],
    templateUrl: './database-process.component.html',
    styleUrl: './database-process.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class DatabaseProcessComponent {
  /** OnPush: to mark the view dirty when async data arrives (see markDirty). */
  private readonly cdr = inject(ChangeDetectorRef);

  /** Is a request in progress? */
  loading = signal(false);

  /** Result message and type */
  message = signal<{ text: string; type: 'success' | 'error' | 'idle' }>({
    text: '',
    type: 'idle'
  });

  private readonly languageService = inject(LanguageService);

  constructor(private databaseService: DatabaseService) {}

  /** Sends a request to create the database from scratch */
  createDatabase(): void {
    if (this.loading()) return;
    this.loading.set(true);
    this.message.set({ text: '', type: 'idle' });

    this.databaseService.createDatabase().pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.message.set({
          text: res.message ?? (res.success
            ? this.languageService.t('database.createDbSuccess')
            : this.languageService.t('database.operationFailed')),
          type: res.success ? 'success' : 'error'
        });
      },
      error: err => {
        this.message.set({
          text: err?.error?.message ?? err?.message ?? this.languageService.t('database.createDbError'),
          type: 'error'
        });
      },
      complete: () => this.loading.set(false)
    });
  }

  /** Sends a request to create the dynamic tables */
  createTable(): void {
    if (this.loading()) return;
    this.loading.set(true);
    this.message.set({ text: '', type: 'idle' });

    this.databaseService.createTable().pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.message.set({
          text: res.message ?? (res.success
            ? this.languageService.t('database.createTableSuccess')
            : this.languageService.t('database.operationFailed')),
          type: res.success ? 'success' : 'error'
        });
      },
      error: err => {
        this.message.set({
          text: err?.error?.message ?? err?.message ?? this.languageService.t('database.createTableError'),
          type: 'error'
        });
      },
      complete: () => this.loading.set(false)
    });
  }

  /** Checks the database status */
  checkDatabase(): void {
    if (this.loading()) return;
    this.loading.set(true);
    this.message.set({ text: '', type: 'idle' });

    this.databaseService.checkDatabase().pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.message.set({
          text: res.message ?? (res.success
            ? this.languageService.t('database.checkDbSuccess')
            : this.languageService.t('database.checkDbFailed')),
          type: res.success ? 'success' : 'error'
        });
      },
      error: err => {
        this.message.set({
          text: err?.error?.message ?? err?.message ?? this.languageService.t('database.checkDbError'),
          type: 'error'
        });
      },
      complete: () => this.loading.set(false)
    });
  }
}
