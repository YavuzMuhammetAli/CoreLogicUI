import { Injectable, signal } from '@angular/core';

export type NotificationType = 'warn' | 'success' | 'danger' | 'info';

export interface Notification {
  type: NotificationType;
  message: string;
}

/**
 * Uygulama genelinde geçici bildirim/banner yönetimi.
 *
 * Guard ya da herhangi bir servis mesaj set edebilir;
 * LayoutComponent signal'ı okuyarak banner render eder.
 * Rota geçişlerinde otomatik temizlenme yoktur — LayoutComponent'in
 * kullanıcı kapatma butonuyla ya da bir sonraki guard çağrısında temizlenir.
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly _current = signal<Notification | null>(null);
  private _timer: ReturnType<typeof setTimeout> | null = null;

  /** Aktif bildirimi okumak için şablonlarda kullanılır. */
  readonly current = this._current.asReadonly();

  /** Uyarı tipinde bildirim göster; 5 sn sonra otomatik kapanır. */
  warn(message: string): void {
    this.show({ type: 'warn', message });
  }

  /** Başarı tipinde bildirim göster; 5 sn sonra otomatik kapanır. */
  success(message: string): void {
    this.show({ type: 'success', message });
  }

  /** Bildirim banner'ını kapat. */
  clear(): void {
    if (this._timer !== null) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    this._current.set(null);
  }

  private show(notification: Notification): void {
    // Önceki timer varsa iptal et (yeni mesaj geldiğinde sayaç sıfırlanır)
    if (this._timer !== null) {
      clearTimeout(this._timer);
    }
    this._current.set(notification);
    this._timer = setTimeout(() => {
      this._current.set(null);
      this._timer = null;
    }, 5000);
  }
}
