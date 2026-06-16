import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DatabaseService } from '../../services/database.service';

@Component({
  selector: 'app-database-proccess',
  standalone: true,
  imports: [CommonModule],
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

  constructor(private databaseService: DatabaseService) {}

  /** Dinamik tablo oluşturma isteği gönderir */
  createTable(): void {
    if (this.loading()) return;
    this.loading.set(true);
    this.message.set({ text: '', type: 'idle' });

    this.databaseService.createTable().subscribe({
      next: res => {
        this.message.set({
          text: res.message ?? (res.success ? 'Tablo başarıyla oluşturuldu.' : 'İşlem başarısız.'),
          type: res.success ? 'success' : 'error'
        });
      },
      error: err => {
        this.message.set({
          text: err?.error?.message ?? err?.message ?? 'Tablo oluşturulurken bir hata oluştu.',
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
          text: res.message ?? (res.success ? 'Veritabanı bağlantısı başarılı.' : 'Veritabanı kontrolü başarısız.'),
          type: res.success ? 'success' : 'error'
        });
      },
      error: err => {
        this.message.set({
          text: err?.error?.message ?? err?.message ?? 'Veritabanı kontrol edilirken bir hata oluştu.',
          type: 'error'
        });
      },
      complete: () => this.loading.set(false)
    });
  }
}
