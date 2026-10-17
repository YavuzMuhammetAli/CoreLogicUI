import { ChangeDetectionStrategy, Component, ElementRef, input, OnDestroy, signal, viewChild } from '@angular/core';

/**
 * HelpHintComponent — form alanı etiketlerinin yanında duran küçük "i" baloncuğu.
 * Hover veya klavye focus'unda kısa bir tooltip açar; hazır bir tooltip kütüphanesi
 * kullanılmaz (bkz. model-detail'deki aynı görsel dil).
 *
 * Uzun anlatım gerektiren yerlerde bunun yerine `<app-datatype-help>` kılavuz
 * diyaloğu kullanılır — bu component yalnızca tek cümlelik ipuçları içindir.
 *
 * Kullanım:
 *   <label>MinLength <app-help-hint [text]="'help.rule.minLength' | t" /></label>
 *   <app-help-hint variant="formula" glyph="ƒx" [text]="rule.expression" [label]="…" />
 *     → otomatik değer formülü; dokunmatikte de okunabilsin diye title yerine bu kullanılır.
 *
 * KONUMLANDIRMA: Tooltip `position: fixed` ve koordinatları burada hesaplanır. Sebebi,
 * baloncuğun içinde durduğu kapsayıcıların onu kırpması:
 *   - `.panel { overflow: hidden }` (global)
 *   - `.dialog-panel { overflow-y: auto }` — CSS gereği `overflow-y` `visible` dışında bir
 *     değer alınca `overflow-x` de `auto`'ya döner, yani YATAYDA da kırpar.
 * `z-index` bunu çözmez (kırpma boyama sırasından bağımsızdır). `position: fixed` ise kırpan
 * atalar containing block oluşturmadığı için onlardan kaçar. Bu projede containing block'u
 * `.dialog-overlay`'ler oluşturur (`backdrop-filter` taşırlar); hepsi `position: fixed;
 * inset: 0` ve kenarlıksız olduğundan padding box'ları viewport'a eşittir ve
 * `getBoundingClientRect()` koordinatları doğrudan kullanılabilir.
 */
@Component({
  selector: 'app-help-hint',
  standalone: true,
  templateUrl: './help-hint.component.html',
  styleUrls: ['./help-hint.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HelpHintComponent implements OnDestroy {
  /** Tooltip metni — çağıran taraf zaten çevrilmiş metni geçer. */
  text = input.required<string>();

  /**
   * TERCİH edilen açılma yönü. Yer yoksa otomatik olarak diğer yöne döner; bu yüzden
   * çağıranın diyalog içinde `below` yazması artık zorunlu değil (yazılıysa da bozulmaz).
   */
  placement = input<'above' | 'below'>('above');

  /** Baloncukta görünen işaret ("i" ya da otomatik değer için "ƒx"). */
  glyph = input('i');

  /** `formula`: otomatik değer etiketi (ƒx) görünümü — kayıt formlarında formülü gösterir. */
  variant = input<'info' | 'formula'>('info');

  /** Ekran okuyucu etiketi; verilmezse tooltip metni okunur. */
  label = input<string | null>(null);

  private readonly bubble = viewChild.required<ElementRef<HTMLElement>>('bubble');
  private readonly tip = viewChild.required<ElementRef<HTMLElement>>('tip');

  readonly open = signal(false);
  readonly top = signal(0);
  readonly left = signal(0);
  /** Gerçekleşen yön — giriş animasyonunun hangi yöne kayacağını belirler. */
  readonly resolved = signal<'above' | 'below'>('above');

  /** Baloncuk ile tooltip arası boşluk ve viewport kenar payı. */
  private readonly GAP = 8;
  private readonly MARGIN = 8;

  /** Balonun kapalıdan açığa geçtiği an — dokunmatikte aynı dokunuşun olaylarını ayırt eder. */
  private shownAt = 0;

  show(): void {
    if (!this.open()) this.shownAt = performance.now();
    const anchor = this.bubble().nativeElement.getBoundingClientRect();
    // Tooltip `visibility: hidden` ile ölçülebilir durumda (display:none DEĞİL).
    const tip = this.tip().nativeElement.getBoundingClientRect();

    // Dikey: tercih edilen yönde yer yoksa diğerine dön.
    const fitsAbove = anchor.top - tip.height - this.GAP >= this.MARGIN;
    const fitsBelow = anchor.bottom + tip.height + this.GAP <= window.innerHeight - this.MARGIN;
    const below = this.placement() === 'below' ? (fitsBelow || !fitsAbove) : (!fitsAbove && fitsBelow);

    this.resolved.set(below ? 'below' : 'above');
    this.top.set(below ? anchor.bottom + this.GAP : anchor.top - tip.height - this.GAP);

    // Yatay: baloncuğa göre ortala, sonra viewport'a kelepçele — kenar sütunlarındaki
    // alanlarda balonun sol/sağ tarafının kesilmesini önleyen asıl hesap budur.
    const centered = anchor.left + anchor.width / 2 - tip.width / 2;
    const maxLeft = Math.max(this.MARGIN, window.innerWidth - tip.width - this.MARGIN);
    this.left.set(Math.min(Math.max(centered, this.MARGIN), maxLeft));

    this.open.set(true);
    this.bindViewportListeners();
  }

  hide(): void {
    this.open.set(false);
    this.unbindViewportListeners();
  }

  /**
   * Dokunmatikte hover yok: dokunuş önce (emüle edilen) mouseenter/focus ile balonu açar,
   * click hemen ardından gelir — o click balonu kapatmamalı. İkinci dokunuş kapatır.
   * Fareli cihazda hover zaten yönettiği için bir şey yapılmaz.
   */
  onTap(): void {
    if (!window.matchMedia('(pointer: coarse)').matches) return;
    if (!this.open()) this.show();
    else if (performance.now() - this.shownAt > 400) this.hide();
  }

  ngOnDestroy(): void {
    this.unbindViewportListeners();
  }

  // ─── Konumun bayatlamasını önleme ───────────────────────────────────────────
  // Konum açılış anında hesaplanır; kaydırma/yeniden boyutlandırma onu bayatlatır.
  // Yeniden hesaplamak yerine gizlemek yeterli — balon zaten hover ömürlü.

  private readonly onViewportChange = () => {
    // Dokunmatikte baloncuğa odaklanmak açık klavyeyi kapatır (resize) ve sayfayı
    // kaydırabilir — açılıştan hemen sonraki bu olaylar balonu kapatmasın.
    if (performance.now() - this.shownAt < 500) return;
    this.hide();
  };

  /**
   * `scroll` olayı BUBBLE ETMEZ: diyalog panelinin kendi kaydırması `document`'a ulaşmaz.
   * Bu yüzden dinleyici CAPTURE fazında bağlanır (`@HostListener` capture veremez) ve
   * yalnızca balon açıkken takılı kalır.
   */
  private bindViewportListeners(): void {
    document.addEventListener('scroll', this.onViewportChange, true);
    window.addEventListener('resize', this.onViewportChange);
  }

  private unbindViewportListeners(): void {
    document.removeEventListener('scroll', this.onViewportChange, true);
    window.removeEventListener('resize', this.onViewportChange);
  }
}
