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

/** Açılır listede gösterilen bildirim sayısı. */
const LIST_SIZE = 20;

/**
 * Topbar bildirim zili — okunmamış rozeti + açılır bildirim listesi.
 *
 * Projede SignalR/WebSocket olmadığı için anlık itme yok: rozet belirli
 * aralıklarla `unreadCount` ile tazelenir (layout'taki görev rozetiyle aynı
 * desen), liste yalnızca zil açıldığında çekilir.
 *
 * Hatalar sessiz yutulur: bildirim modülü (migrasyon 018) kurulmamış bir
 * tenant'ta uç hata döner ve her 30 saniyede kullanıcıya uyarı göstermek
 * anlamsız olurdu. Zil bu durumda rozetsiz kalır.
 */
@Component({
    selector: 'app-notification-bell',
    imports: [RouterLink, TranslatePipe, IconComponent],
    templateUrl: './notification-bell.component.html',
    styleUrl: './notification-bell.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class NotificationBellComponent implements OnInit, OnDestroy {
  /** Rozet yenileme aralığı (ms) — görev rozetiyle aynı. */
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

  /** Rozette 9'dan büyük sayılar "9+" olarak gösterilir — ikon küçük. */
  readonly badgeText = computed(() => {
    const count = this.unreadCount();
    return count > 9 ? '9+' : String(count);
  });

  private poll?: VisiblePoll;

  ngOnInit(): void {
    // Sunucu tarafında zamanlayıcı kurmak anlamsız ve sızıntı olurdu.
    if (!isPlatformBrowser(this.platformId)) return;

    // Sekme gizliyken sorulmaz, görünür olunca hemen tazelenir (bkz. utils/visible-poll).
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

  /** Dışarı tıklanınca kapanır — kontrol yalnızca zilin kendi host'una karşı. */
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

    // İyimser güncelleme: sunucu reddederse bir sonraki tur rozeti düzeltir.
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
    // Bilinmeyen tür: t() anahtarın kendisini döner — ham anahtar yerine başlığı göster.
    return resolved === key
      ? this.languageService.t('notification.kind.default', { name: item.title })
      : resolved;
  }

  when(item: UserNotification): string {
    return formatDate(new Date(item.createdAt), this.languageService.lang());
  }

  /** Tür ikonu/renk sınıfı. */
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
    this.countRequest().subscribe({ error: () => { /* sessiz — sınıf notuna bak */ } });
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
          // Liste zaten elde — rozeti bir sonraki turu beklemeden eşitle.
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
