import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DatabaseService } from '../../services/database.service';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { LanguageService } from '../../services/language.service';

@Component({
  selector: 'app-database-proccess',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './database-proccess.component.html',
  styleUrl: './database-proccess.component.scss'
})
export class DatabaseProccessComponent {
  /** İstek devam ediyor mu? */
  loading = signal(false);

  /** Sonuç mesajı ve tipi */
  message = signal<{ text: string; type: 'success' | 'error' | 'idle' }>({
    text: '',
    type: 'idle'
  });

  private readonly languageService = inject(LanguageService);

  constructor(private databaseService: DatabaseService) {}

  /** Veritabanını sıfırdan oluşturma isteği gönderir */
  createDatabase(): void {
    if (this.loading()) return;
    this.loading.set(true);
    this.message.set({ text: '', type: 'idle' });

    this.databaseService.createDatabase().subscribe({
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

  /** Dinamik tablo oluşturma isteği gönderir */
  createTable(): void {
    if (this.loading()) return;
    this.loading.set(true);
    this.message.set({ text: '', type: 'idle' });

    this.databaseService.createTable().subscribe({
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

  /** Veritabanı durumunu kontrol eder */
  checkDatabase(): void {
    if (this.loading()) return;
    this.loading.set(true);
    this.message.set({ text: '', type: 'idle' });

    this.databaseService.checkDatabase().subscribe({
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
