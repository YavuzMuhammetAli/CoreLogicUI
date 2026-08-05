import { ChangeDetectionStrategy, Component, computed, effect, HostListener, input, output, signal } from '@angular/core';
import { ModelUsage } from '../../../services/model-usage.service';
import { TranslatePipe } from '../../../pipes/translate.pipe';

/**
 * Tekrar kullanılabilir onay modalı. Basit bir evet/hayır onayı için `usage` boş bırakılır;
 * `usage` doluysa (örn. model silme öncesi rapor/dashboard kullanım listesi) önce kullanım
 * listesi gösterilir, "Yine de Sil" ile ikinci aşamaya geçilir ve orada son onay istenir.
 */
@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './confirm-dialog.component.html',
  styleUrls: ['./confirm-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ConfirmDialogComponent {
  open = input(false);
  title = input('');
  message = input('');
  /** Kullanım listesinin başlığında gösterilen model adı (örn. "'İzinler' modeli kullanılıyor:"). */
  modelName = input('');
  usage = input<ModelUsage | null>(null);
  /** İşlem (cascade silme) sürerken butonları kilitler. */
  busy = input(false);
  /**
   * Overlay'in yığın sırası. Varsayılan (null) CSS'teki 1000 değerini bırakır; yalnızca
   * bu diyalog başka bir modalın ÜSTÜNDE açılacaksa verilir (örn. iç içe kayıt pop-up'ı
   * `1000 + depth * 10` kullanıyor, onay kutusu bunun da üstüne çıkmalı).
   */
  zIndex = input<number | null>(null);

  confirmed = output<void>();
  cancelled = output<void>();

  /** 1: ilk onay (varsa kullanım listesi gösterilir), 2: kullanım varsa ikinci/son onay. */
  private readonly step = signal<1 | 2>(1);

  readonly hasUsage = computed(() => {
    const u = this.usage();
    return !!u && !u.isEmpty;
  });

  readonly isFinalStep = computed(() => !this.hasUsage() || this.step() === 2);

  constructor() {
    // Modal her açıldığında ilk adıma dön — önceki açılıştan kalan ikinci aşama sızmasın.
    effect(() => {
      if (this.open()) {
        this.step.set(1);
      }
    });
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.open() && !this.busy()) {
      this.onCancel();
    }
  }

  onConfirmClick(): void {
    if (this.busy()) return;
    if (this.hasUsage() && this.step() === 1) {
      this.step.set(2);
      return;
    }
    this.confirmed.emit();
  }

  onCancel(): void {
    if (this.busy()) return;
    this.cancelled.emit();
  }

  onBackdropClick(): void {
    this.onCancel();
  }
}
