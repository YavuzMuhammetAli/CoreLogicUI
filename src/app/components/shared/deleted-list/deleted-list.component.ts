import { ChangeDetectionStrategy, Component, inject, input, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '../../../pipes/translate.pipe';
import { LanguageService } from '../../../services/language.service';
import { ConfirmDialogComponent } from '../confirm-dialog/confirm-dialog.component';
import { DeletedItem, DeletedListSource } from './deleted-list.model';
import { IconComponent } from '../icon/icon.component';

/**
 * "Silinenler" ekranlarının ortak gövdesi: listeleme, hata gösterimi, onaylı
 * geri yükleme ve başarıdan sonra satırın listeden düşürülmesi.
 *
 * NEDEN ORTAK: deleted-models / deleted-drafts / deleted-reports / deleted-dashboards
 * dört ayrı component olarak yazılmıştı ve toplam ~1160 satırın büyük kısmı birebir
 * aynıydı (iki SCSS dosyası karakterine kadar aynıydı). Bir düzeltme dört yerde
 * tekrarlanmak zorundaydı; pratikte biri unutuluyordu.
 *
 * Ekranlar artık yalnızca bir <see cref="DeletedListSource"/> sağlar.
 */
@Component({
    selector: 'app-deleted-list',
    imports: [RouterLink, TranslatePipe, ConfirmDialogComponent, IconComponent],
    templateUrl: './deleted-list.component.html',
    styleUrls: ['./deleted-list.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class DeletedListComponent implements OnInit {
  /** Başarılı geri yüklemeden sonra satırın listede kalma süresi (ms). */
  private static readonly RemoveAfterRestoreMs = 1500;

  private readonly languageService = inject(LanguageService);

  source = input.required<DeletedListSource>();

  readonly items = signal<DeletedItem[]>([]);
  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);

  /** Geri yükleme sürerken kilitlenen kaydın id'si; null ise işlem yok. */
  readonly restoringId = signal<number | null>(null);

  /** Onay bekleyen kayıt; null ise diyalog kapalı. */
  readonly pendingRestore = signal<DeletedItem | null>(null);

  /** Satır bazlı geri bildirim: id → { message, success }. */
  readonly feedback = signal<Record<number, { message: string; success: boolean }>>({});

  ngOnInit(): void {
    this.load();
  }

  /** Ekrana özel çeviri anahtarını tam hâline çevirir. */
  key(suffix: string): string {
    return `${this.source().i18nPrefix}.${suffix}`;
  }

  load(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.items.set([]);
    this.feedback.set({});

    this.source().load().subscribe({
      next: res => {
        this.loading.set(false);
        if (!res.success) {
          this.loadError.set(res.message ?? this.languageService.t(this.key('loadFailed')));
          return;
        }
        this.items.set(res.items);
      },
      error: err => {
        this.loading.set(false);
        this.loadError.set(
          err?.error?.message ?? this.languageService.t('deleted.serverConnectionError'));
      }
    });
  }

  askRestore(item: DeletedItem): void {
    if (this.restoringId() !== null) return;
    this.pendingRestore.set(item);
  }

  cancelRestore(): void {
    this.pendingRestore.set(null);
  }

  confirmRestore(): void {
    const item = this.pendingRestore();
    if (!item) return;

    this.pendingRestore.set(null);
    this.restoringId.set(item.id);
    this.setFeedback(item.id, null);

    this.source().restore(item).subscribe({
      next: res => {
        this.restoringId.set(null);
        this.setFeedback(item.id, {
          success: res.success,
          message: res.message ?? this.languageService.t(
            res.success ? this.key('restoreSuccess') : 'deleted.restoreFailed')
        });

        if (res.success) {
          // Kullanıcı başarı mesajını görebilsin diye satır kısa bir süre kalır.
          setTimeout(
            () => this.items.update(list => list.filter(i => i.id !== item.id)),
            DeletedListComponent.RemoveAfterRestoreMs);
        }
      },
      error: err => {
        this.restoringId.set(null);
        this.setFeedback(item.id, {
          success: false,
          message: err?.error?.message ?? this.languageService.t('deleted.restoreServerError')
        });
      }
    });
  }

  private setFeedback(id: number, value: { message: string; success: boolean } | null): void {
    this.feedback.update(current => {
      const next = { ...current };
      if (value) next[id] = value;
      else delete next[id];
      return next;
    });
  }
}
