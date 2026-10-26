import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, HostListener,
  OnDestroy, effect, forwardRef, inject, input, signal, viewChild
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { Subject, Subscription, debounceTime, distinctUntilChanged, switchMap } from 'rxjs';
import { LookupOption, PublishedModelService } from '../../../services/published-model.service';
import { LookupLabelService } from '../../../services/lookup-label.service';
import { TranslatePipe } from '../../../pipes/translate.pipe';
import { markDirty } from '../../../utils/change-detection';

/** Sayfa boyutu — açılışta ve her "daha fazla" isteğinde bu kadar kayıt gelir. */
const PAGE_SIZE = 50;

/** Yazma sonrası sunucuya gitmeden önce beklenen süre (ms). */
const SEARCH_DEBOUNCE = 300;

/** Aynı örneğin DOM id'lerini benzersizleştirmek için sayaç (aynı formda birden çok lookup olabilir). */
let instanceCounter = 0;

/**
 * Lookup (FK) seçim kutusu — tembel yüklemeli, sunucu taraflı aramalı combobox.
 *
 * NEDEN VAR: eski `<select>` hedef tablonun TÜM satırlarını yüklüyordu (Musteri: 12.025
 * satır / 5 MB / ~3,9 sn). Burada açılışta 50 kayıt gelir, liste dibine kaydırıldıkça
 * 50'şer eklenir, arama sunucuda yapılır ve arama sonucunda da aynı kaydırma sürer.
 *
 * KRİTİK — sessiz FK kaybı: kontrol değeri ham FK id'sidir ve seçili kayıt ilk 50 seçenek
 * arasında olmayabilir. `writeValue` bu yüzden etiketi ayrıca `?ids=` ile çözer. Aksi
 * hâlde kullanıcı boş bir kutu görür, forma dokunmadan kaydeder ve FK silinir.
 *
 * A11y: role="combobox" + aria-expanded/aria-controls/aria-activedescendant, listbox/option
 * rolleri, ↑/↓/Enter/Esc klavye desteği, aktif seçeneğin görünür alana kaydırılması.
 * (Desen `shared/model-autocomplete`'ten alındı; o component string listesi üzerine kurulu
 * olduğu ve DOM id'leri sabit olduğu için doğrudan kullanılamadı.)
 */
@Component({
  selector: 'app-lookup-picker',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './lookup-picker.component.html',
  styleUrls: ['./lookup-picker.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => LookupPickerComponent),
      multi: true
    }
  ]
})
export class LookupPickerComponent implements ControlValueAccessor, OnDestroy {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly publishedModel = inject(PublishedModelService);
  private readonly lookupLabels = inject(LookupLabelService);
  private readonly host = inject(ElementRef<HTMLElement>);

  /** Hedef model (lookupTargetTable). */
  readonly typeName = input.required<string>();
  /** Etiket kolonu (lookupDisplayColumn); boşsa sunucu ID'yi kullanır. */
  readonly displayColumn = input<string | null | undefined>(null);
  readonly placeholder = input('');
  readonly ariaLabel = input('');
  readonly invalid = input(false);
  readonly inputId = input<string>('');

  // ── Durum ────────────────────────────────────────────────────────────────
  readonly options = signal<LookupOption[]>([]);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly isOpen = signal(false);
  readonly activeIndex = signal(-1);
  readonly query = signal('');
  readonly disabled = signal(false);

  /** Seçili kaydın etiketi — ilk 50 arasında olmasa bile ayrıca çözülür. */
  readonly selectedLabel = signal<string | null>(null);

  private value: number | null = null;
  private page = 1;
  /** Bu arama terimi için ilk sayfa yüklendi mi (odaklanınca tekrar istek atmamak için). */
  private loadedForQuery: string | null = null;

  private readonly uid = ++instanceCounter;
  private readonly search$ = new Subject<string>();
  private readonly subs = new Subscription();
  private observer?: IntersectionObserver;

  private readonly sentinel = viewChild<ElementRef<HTMLElement>>('sentinel');
  private readonly inputEl = viewChild<ElementRef<HTMLInputElement>>('lkInput');

  /**
   * Açılan listenin viewport'a göre konumu. Liste `position: fixed` olduğu için
   * (kırpan `.panel`/`.dialog-panel` atalarından kurtulmak zorunda) koordinatlar
   * burada hesaplanıp inline stil olarak bağlanır.
   */
  readonly listPos = signal({ top: '0px', left: '0px', width: '0px', maxHeight: '260px' });

  /** Liste açıkken kaydırma/boyut değişiminde konumu tazeleyen dinleyici. */
  private readonly reposition = () => this.positionList();

  private onChange: (value: number | null) => void = () => {};
  private onTouched: () => void = () => {};

  constructor() {
    // Yazma → 300 ms bekle → aynı terimi tekrar sorma → önceki isteği iptal et.
    this.subs.add(
      this.search$.pipe(
        debounceTime(SEARCH_DEBOUNCE),
        distinctUntilChanged(),
        switchMap(term => {
          this.page = 1;
          this.loading.set(true);
          return this.publishedModel.lookupOptions(this.typeName(), this.displayColumn(), {
            search: term, page: 1, pageSize: PAGE_SIZE
          });
        }),
        markDirty(this.cdr)
      ).subscribe({
        next: res => {
          this.loading.set(false);
          if (!res.success) return;
          this.options.set(res.data?.items ?? []);
          this.total.set(res.data?.total ?? 0);
          this.activeIndex.set(-1);
          this.loadedForQuery = this.query();
        },
        error: () => this.loading.set(false)
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
    this.observer?.disconnect();
    // Liste açıkken component yok edilirse dinleyiciler sızmasın.
    window.removeEventListener('scroll', this.reposition, true);
    window.removeEventListener('resize', this.reposition);
    window.visualViewport?.removeEventListener('resize', this.reposition);
    window.visualViewport?.removeEventListener('scroll', this.reposition);
  }

  // ── ControlValueAccessor ─────────────────────────────────────────────────

  writeValue(value: unknown): void {
    const id = value === null || value === undefined || value === '' ? null : Number(value);
    this.value = Number.isFinite(id as number) ? (id as number) : null;

    if (this.value === null) {
      this.selectedLabel.set(null);
      this.cdr.markForCheck();
      return;
    }

    // Seçili kaydın etiketi ortak etiket önbelleğinden (LookupLabelService): alt tablolar aynı
    // hedefin etiketlerini zaten toplu çözer; form her yeniden kurulduğunda alan başına ayrı
    // istek atılıyordu. Önbellekte yoksa tek istekle çözülür.
    const selected = this.value;
    const target = this.typeName();
    const column = this.displayColumn();
    this.lookupLabels.ensure(target, column, [selected])
      .pipe(markDirty(this.cdr))
      .subscribe(() => {
        if (this.value !== selected) return;   // arada başka değer yazıldı
        // Etiket çözülemezse (silinmiş kayıt vb.) ham id gösterilir — değer KORUNUR.
        this.selectedLabel.set(this.lookupLabels.label(target, column, selected) ?? String(selected));
      });
  }

  registerOnChange(fn: (value: number | null) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(isDisabled: boolean): void { this.disabled.set(isDisabled); this.cdr.markForCheck(); }

  // ── Etkileşim ────────────────────────────────────────────────────────────

  /** Kutuda gösterilen metin: liste açıkken yazılan terim, kapalıyken seçili etiket. */
  displayText(): string {
    return this.isOpen() ? this.query() : (this.selectedLabel() ?? '');
  }

  open(): void {
    if (this.disabled() || this.isOpen()) return;
    this.isOpen.set(true);
    this.query.set('');
    this.activeIndex.set(-1);

    // Boş arama için ilk sayfa daha önce yüklendiyse tekrar isteme.
    if (this.loadedForQuery !== '') this.loadFirstPage('');

    // Konum yalnızca input'un rect'ine bağlı; liste henüz render edilmemiş olsa da
    // hesaplanabilir. Sentinel'e bağlanma ise render'ı beklemek zorunda — onu
    // aşağıdaki effect yürütür (bkz. sentinelEffect).
    this.positionList();

    // Sayfa ya da iç kaydırıcılardan biri kaydırılırsa liste input'tan kopmasın.
    // capture: true — iç scroll konteynerleri de yakalanır (scroll balonlanmaz).
    window.addEventListener('scroll', this.reposition, true);
    window.addEventListener('resize', this.reposition);
    // Mobilde klavye yalnız GÖRÜNEN alanı (visualViewport) küçültür; window resize gelmez.
    window.visualViewport?.addEventListener('resize', this.reposition);
    window.visualViewport?.addEventListener('scroll', this.reposition);
  }

  /**
   * Sonsuz kaydırma gözlemcisini sentinel DOM'a girince bağlar, çıkınca bırakır.
   *
   * viewChild bir signal olduğu için render tamamlandığında tetiklenir; eskiden
   * queueMicrotask kullanılıyordu ve o, change detection'dan ÖNCE koştuğu için
   * sentinel'i çoğu zaman bulamıyordu (liste ilk 50'de takılı kalırdı).
   * Sentinel yalnızca hasMore() iken render edilir; son sayfaya gelince gözlemci
   * kendiliğinden çözülür.
   */
  private readonly sentinelEffect = effect(() => {
    const el = this.sentinel()?.nativeElement;
    const open = this.isOpen();

    this.observer?.disconnect();
    if (!open || !el) return;

    this.observer = new IntersectionObserver(
      entries => { if (entries.some(e => e.isIntersecting)) this.loadMore(); },
      { root: el.parentElement, rootMargin: '120px' }   // dibe varmadan biraz önce tetikle
    );
    this.observer.observe(el);
  });

  close(): void {
    if (!this.isOpen()) return;
    this.isOpen.set(false);
    this.activeIndex.set(-1);
    this.observer?.disconnect();
    window.removeEventListener('scroll', this.reposition, true);
    window.removeEventListener('resize', this.reposition);
    window.visualViewport?.removeEventListener('resize', this.reposition);
    window.visualViewport?.removeEventListener('scroll', this.reposition);
    this.onTouched();
  }

  /**
   * Listeyi input'un hemen altına (yer yoksa üstüne) konumlandırır.
   *
   * Alta sığmıyorsa yukarı açılır; her iki durumda da yükseklik kalan boşluğa göre
   * kısılır, böylece liste hiçbir zaman ekran dışına taşmaz.
   *
   * Sınırlar `visualViewport`'tan alınır: mobilde klavye açılınca `innerHeight` değişmez,
   * yalnız görünen alan küçülür (ve iOS'ta kayar). innerHeight'a bakılsaydı liste
   * klavyenin arkasına açılırdı.
   */
  private positionList(): void {
    const input = this.inputEl()?.nativeElement;
    if (!input) return;

    const rect = input.getBoundingClientRect();
    const gap = 4;
    const margin = 8;                       // viewport kenarına bırakılan pay
    const preferred = 260;

    const vv = window.visualViewport;
    const viewTop = vv?.offsetTop ?? 0;
    const viewBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
    const spaceBelow = viewBottom - rect.bottom - gap - margin;
    const spaceAbove = rect.top - viewTop - gap - margin;

    // Altta makul yer yoksa ve üstte daha fazlası varsa yukarı aç.
    const openUp = spaceBelow < 160 && spaceAbove > spaceBelow;
    const available = openUp ? spaceAbove : spaceBelow;
    const maxHeight = Math.max(120, Math.min(preferred, available));

    this.listPos.set({
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      top: openUp ? `${rect.top - gap - maxHeight}px` : `${rect.bottom + gap}px`,
      maxHeight: `${maxHeight}px`
    });
  }

  onInput(event: Event): void {
    const term = (event.target as HTMLInputElement).value;
    this.query.set(term);
    this.isOpen.set(true);
    this.search$.next(term.trim());
  }

  select(option: LookupOption): void {
    this.value = option.id;
    this.selectedLabel.set(option.label);
    this.onChange(option.id);
    this.close();
  }

  clear(): void {
    this.value = null;
    this.selectedLabel.set(null);
    this.query.set('');
    this.onChange(null);
    this.cdr.markForCheck();
  }

  hasMore(): boolean {
    return this.options().length < this.total();
  }

  // ── Yükleme ──────────────────────────────────────────────────────────────

  private loadFirstPage(term: string): void {
    this.page = 1;
    this.loading.set(true);
    this.publishedModel
      .lookupOptions(this.typeName(), this.displayColumn(), { search: term, page: 1, pageSize: PAGE_SIZE })
      .pipe(markDirty(this.cdr))
      .subscribe({
        next: res => {
          this.loading.set(false);
          if (!res.success) return;
          this.options.set(res.data?.items ?? []);
          this.total.set(res.data?.total ?? 0);
          this.loadedForQuery = term;
        },
        error: () => this.loading.set(false)
      });
  }

  /** Sonraki sayfayı mevcut listenin SONUNA ekler. */
  loadMore(): void {
    if (this.loading() || !this.hasMore()) return;

    this.loading.set(true);
    const nextPage = this.page + 1;

    this.publishedModel
      .lookupOptions(this.typeName(), this.displayColumn(), {
        search: this.query().trim(), page: nextPage, pageSize: PAGE_SIZE
      })
      .pipe(markDirty(this.cdr))
      .subscribe({
        next: res => {
          this.loading.set(false);
          if (!res.success) return;
          this.page = nextPage;
          this.options.update(current => [...current, ...(res.data?.items ?? [])]);
          this.total.set(res.data?.total ?? 0);
        },
        error: () => this.loading.set(false)
      });
  }

  // ── Klavye ───────────────────────────────────────────────────────────────

  onKeydown(event: KeyboardEvent): void {
    if (this.disabled()) return;
    const list = this.options();

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!this.isOpen()) { this.open(); return; }
        this.activeIndex.update(i => (list.length === 0 ? -1 : (i + 1) % list.length));
        this.scrollActiveIntoView();
        // Sona yaklaşıldıysa bir sonraki sayfayı şimdiden iste (klavye ile de tembel yükleme).
        if (this.activeIndex() >= list.length - 5) this.loadMore();
        break;

      case 'ArrowUp':
        event.preventDefault();
        if (!this.isOpen()) { this.open(); return; }
        this.activeIndex.update(i => (list.length === 0 ? -1 : (i <= 0 ? list.length - 1 : i - 1)));
        this.scrollActiveIntoView();
        break;

      case 'Enter': {
        const index = this.activeIndex();
        if (this.isOpen() && index >= 0 && index < list.length) {
          event.preventDefault();
          this.select(list[index]);
        }
        break;
      }

      case 'Escape':
        if (this.isOpen()) { event.preventDefault(); this.close(); }
        break;

      case 'Tab':
        this.close();
        break;
    }
  }

  /** 50+ seçenekte 220px'lik listede aktif satır kolayca ekran dışına çıkar. */
  private scrollActiveIntoView(): void {
    const index = this.activeIndex();
    if (index < 0) return;
    queueMicrotask(() => {
      const el = this.host.nativeElement.querySelector(`#${this.optionId(index)}`) as HTMLElement | null;
      el?.scrollIntoView({ block: 'nearest' });
    });
  }

  /** pointerdown: iOS Safari boş alana dokunmada click üretmeyebilir, liste açık kalırdı. */
  @HostListener('document:pointerdown', ['$event'])
  onDocumentClick(event: PointerEvent): void {
    if (!this.isOpen()) return;
    if (!this.host.nativeElement.contains(event.target as Node)) this.close();
  }

  // ── DOM id'leri (örnek başına benzersiz) ─────────────────────────────────

  optionId(index: number): string { return `lk-${this.uid}-opt-${index}`; }
  get listboxId(): string { return `lk-${this.uid}-listbox`; }
  get activeDescendantId(): string | null {
    const index = this.activeIndex();
    return index >= 0 ? this.optionId(index) : null;
  }
}
