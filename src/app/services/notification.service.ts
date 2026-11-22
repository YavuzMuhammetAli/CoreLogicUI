import { Injectable, signal } from '@angular/core';

export type NotificationType = 'warn' | 'success' | 'danger' | 'info';

export interface Notification {
  type: NotificationType;
  message: string;
}

/**
 * App-wide transient notification/banner management.
 *
 * A guard or any service can set a message;
 * LayoutComponent reads the signal and renders the banner.
 * There is no automatic clearing on route changes — it is cleared by
 * LayoutComponent's close button or on the next guard call.
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly _current = signal<Notification | null>(null);
  private _timer: ReturnType<typeof setTimeout> | null = null;

  /** Used in templates to read the active notification. */
  readonly current = this._current.asReadonly();

  /** Shows a warning notification; closes automatically after 5 s. */
  warn(message: string): void {
    this.show({ type: 'warn', message });
  }

  /** Shows a success notification; closes automatically after 5 s. */
  success(message: string): void {
    this.show({ type: 'success', message });
  }

  /** Closes the notification banner. */
  clear(): void {
    if (this._timer !== null) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    this._current.set(null);
  }

  private show(notification: Notification): void {
    // Cancel the previous timer if any (the countdown restarts when a new message arrives)
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
