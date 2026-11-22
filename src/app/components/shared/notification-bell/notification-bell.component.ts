import {
  ChangeDetectionStrategy, Component, ElementRef, HostListener, OnDestroy, OnInit,
  PLATFORM_ID, computed, inject, signal
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { UserNotificationService } from '../../../services/user-notification.service';
import { UserNotification } from '../../../models/userNotification';
import { LanguageService } from '../../../services/language.service';
import { TranslatePipe } from '../../../pipes/translate.pipe';
import { formatDate } from '../../../utils/locale-format';
import { tap } from 'rxjs';
import { startVisiblePoll, VisiblePoll } from '../../../utils/visible-poll';
import { IconComponent } from '../icon/icon.component';

/** Number of notifications shown in the dropdown list. */
const LIST_SIZE = 20;

/**
 * Topbar notification bell — unread badge + notification dropdown list.
 *
 * The project has no SignalR/WebSocket, so there's no real-time push: the badge is
 * refreshed periodically via `unreadCount` (same pattern as the task badge in the
 * layout), and the list is fetched only when the bell is opened.
 *
 * Errors are silently swallowed: on a tenant where the notification module (migration 018)
 * isn't installed the endpoint returns an error, and showing the user a warning every
 * 30 seconds would be pointless. In that case the bell stays without a badge.
 */
@Component({
    selector: 'app-notification-bell',
    imports: [RouterLink, TranslatePipe, IconComponent],
    templateUrl: './notification-bell.component.html',
    styleUrl: './notification-bell.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class NotificationBellComponent implements OnInit, OnDestroy {
  /** Badge refresh interval (ms) — same as the task badge. */
  private static readonly PollIntervalMs = 60_000;

  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly notificationService = inject(UserNotificationService);
  private readonly languageService = inject(LanguageService);

  readonly open = signal(false);
  readonly unreadCount = signal(0);
  readonly items = signal<UserNotification[]>([]);
  readonly loading = signal(false);
  readonly loadError = signal(false);

  /** Numbers above 9 are shown as "9+" on the badge — the icon is small. */
  readonly badgeText = computed(() => {
    const count = this.unreadCount();
    return count > 9 ? '9+' : String(count);
  });

  private poll?: VisiblePoll;

  ngOnInit(): void {
    // Setting up a timer on the server side would be pointless and a leak.
    if (!isPlatformBrowser(this.platformId)) return;

    // Not polled while the tab is hidden; refreshed immediately once visible (see utils/visible-poll).
    this.poll = startVisiblePoll(() => this.countRequest(), NotificationBellComponent.PollIntervalMs);
  }

  ngOnDestroy(): void {
    this.poll?.stop();
  }

  toggle(): void {
    const next = !this.open();
    this.open.set(next);
    if (next) this.loadList();
  }

  close(): void {
    this.open.set(false);
  }

  /** Closes on an outside click — checked only against the bell's own host. */
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) {
      this.close();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close();
  }

  onItemClick(item: UserNotification): void {
    this.close();
    if (!item.readAt) this.markRead(item);
    if (item.link) this.router.navigateByUrl(item.link);
  }

  markAllRead(): void {
    if (this.unreadCount() === 0) return;

    // Optimistic update: if the server rejects it, the next round corrects the badge.
    const now = new Date().toISOString();
    this.items.update(list => list.map(n => n.readAt ? n : { ...n, readAt: now }));
    this.unreadCount.set(0);

    this.notificationService.markAllRead().subscribe({
      error: () => this.refreshCount()
    });
  }

  message(item: UserNotification): string {
    const key = `notification.kind.${item.kind}`;
    const resolved = this.languageService.t(key, { name: item.title });
    // Unknown kind: t() returns the key itself — show the title instead of the raw key.
    return resolved === key
      ? this.languageService.t('notification.kind.default', { name: item.title })
      : resolved;
  }

  when(item: UserNotification): string {
    return formatDate(new Date(item.createdAt), this.languageService.lang());
  }

  /** Kind icon/colour class. */
  tone(item: UserNotification): 'info' | 'warn' | 'danger' | 'success' {
    switch (item.kind) {
      case 'TaskEscalated':     return 'warn';
      case 'TaskExpired':
      case 'WorkflowRejected':  return 'danger';
      case 'WorkflowCompleted': return 'success';
      default:                  return 'info';
    }
  }

  private markRead(item: UserNotification): void {
    const now = new Date().toISOString();
    this.items.update(list => list.map(n => n.id === item.id ? { ...n, readAt: now } : n));
    this.unreadCount.update(c => Math.max(0, c - 1));

    this.notificationService.markRead(item.id).subscribe({
      error: () => this.refreshCount()
    });
  }

  private refreshCount(): void {
    this.countRequest().subscribe({ error: () => { /* silent — see the class note */ } });
  }

  private countRequest() {
    return this.notificationService.unreadCount().pipe(
      tap(res => { if (res.success) this.unreadCount.set(res.data ?? 0); })
    );
  }

  private loadList(): void {
    this.loading.set(true);
    this.loadError.set(false);

    this.notificationService.my(LIST_SIZE).subscribe({
      next: res => {
        this.loading.set(false);
        if (res.success) {
          this.items.set(res.data ?? []);
          // The list is already at hand — sync the badge without waiting for the next round.
          this.refreshCount();
        } else {
          this.loadError.set(true);
        }
      },
      error: () => {
        this.loading.set(false);
        this.loadError.set(true);
      }
    });
  }
}
