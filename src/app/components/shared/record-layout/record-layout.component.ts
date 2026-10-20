import {
  Component, DestroyRef, ElementRef, Injector, NgZone, afterNextRender, computed, effect, inject, input,
  signal, untracked
} from '@angular/core';
import { AbstractControl, FormGroup } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PublishedColumn } from '../../../services/published-model.service';
import { PublishedColumnSchema } from '../../../services/published-table.service';
import { TranslatePipe } from '../../../pipes/translate.pipe';
import { RecordFieldComponent } from '../record-field/record-field.component';
import { AutoValueFormBinding } from '../../../utils/auto-value/auto-value-form';
import { FormLayout } from '../../../utils/screen-layout/screen-layout.model';
import {
  FormRenderPlan, PlanItem, PlanSection, resolveFormLayout
} from '../../../utils/screen-layout/form-layout.resolve';
import { WidthTier, itemSpan, visibleAtTier, widthTier } from '../../../utils/screen-layout/form-layout.responsive';
import {
  firstInvalidLocation, invalidCountByTab, sectionsWithColumns, tabsWithColumns
} from '../../../utils/screen-layout/form-layout.invalid';

const NONE: ReadonlySet<string> = new Set();

/**
 * RecordLayoutComponent — bir kayıt formunun alanlarını yerleşime göre çizer.
 *
 * Yayınlanmış ekran tasarımı (`layout`) yoksa bugünkü görünüm aynen kalır: alanlar
 * `legacyColumns` sırasıyla otomatik dolan ızgarada. Varsa sekmeler, katlanır bölümler
 * ve 12 kolonluk ızgara çizilir; belgeyle şema arasındaki farkları (yeni/silinmiş kolon,
 * zorunlu ya da iş akışı adımı alanının gizlenmiş olması) `resolveFormLayout` kapatır.
 *
 * Form kontrolleri çağıranındır ve TÜM kolonları içerir; burada yalnız çizim yapılır.
 * Pasif sekme ve kapalı bölüm `@if` ile değil `hidden` ile gizlenir: alanlar canlı kalır
 * (lookup seçici her sekme geçişinde yeniden istek atmaz, seçilen dosya kaybolmaz).
 *
 * Genişlik kademesi ekranın değil bu bileşenin genişliğinden seçilir (ResizeObserver):
 * aynı form sayfada geniş, alt kayıt pop-up'ında daha dar çizilir.
 *
 * DEĞİŞİKLİK ALGILAMA `Default`: çağıranlar OnPush ve Kaydet'te `markAllAsTouched()` diyor;
 * sekme hata rozetleri ve alan hataları bunu girdiler değişmeden görmeli (bkz. record-field).
 */
@Component({
  selector: 'app-record-layout',
  standalone: true,
  imports: [RecordFieldComponent, TranslatePipe, RouterLink],
  templateUrl: './record-layout.component.html',
  styleUrls: ['./record-layout.component.scss']
})
export class RecordLayoutComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly zone = inject(NgZone);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);

  /** Kaydın formu — tüm kolonların kontrolleri. */
  readonly form = input.required<FormGroup>();
  /** Modelin tüm kolonları (şema sırası). */
  readonly columns = input.required<readonly PublishedColumn[]>();
  /** Şema kuralları (zorunluluk, regex mesajı …). */
  readonly rules = input<ReadonlyMap<string, PublishedColumnSchema>>(new Map());
  /** Yayınlanmış form yerleşimi; null → bugünkü varsayılan görünüm. */
  readonly layout = input<FormLayout | null>(null);
  /** Varsayılan görünümde çizilecek kolonlar (çağıranın "Kolonlar" ayarıyla süzdüğü). */
  readonly legacyColumns = input<readonly PublishedColumn[]>([]);
  /** Tasarımda gizli olsa da görünmesi gereken kolonlar (zorunlu, iş akışı adımı). */
  readonly forcedVisible = input<ReadonlySet<string>>(NONE);
  /** Hiç çizilmeyecek kolonlar (pop-up'ta FK, ID). */
  readonly excluded = input<ReadonlySet<string>>(NONE);
  /** Sırası gelen görevlinin alanları — vurgulanır, sekmesi açılışta seçilir. */
  readonly stepColumns = input<ReadonlySet<string>>(NONE);
  /** Ekrandaki benzersiz id öneki (iç içe pop-up'larda çakışmasın). */
  readonly idPrefix = input('field-');
  /** Forma bağlı otomatik değer kuralları (ƒx rozeti, "kaydedince atanır" ipucu). */
  readonly autoValues = input<AutoValueFormBinding | null>(null);
  /** Admin'e "tasarım güncel değil" uyarısındaki tasarımcı bağlantısı; null → uyarı yok. */
  readonly designLink = input<string[] | null>(null);
  /** Kademeyi ölçmek yerine sabitle (tasarımcının önizleme seçicisi). */
  readonly forceTier = input<WidthTier | null>(null);

  /**
   * Geçersiz olduğu hâlde tasarımda gizli kalan kolonlar — Kaydet'te görünür yapılır
   * (ör. eski kayıttaki değer sonradan eklenen regex'e uymuyor). Form yeniden kurulana dek kalır.
   */
  private readonly revealed = signal<ReadonlySet<string>>(NONE);

  readonly plan = computed<FormRenderPlan | null>(() => {
    const layout = this.layout();
    if (!layout) return null;
    const revealed = this.revealed();
    const forced = revealed.size === 0 ? this.forcedVisible() : new Set([...this.forcedVisible(), ...revealed]);
    return resolveFormLayout(layout, this.columns(), { forcedVisible: forced, excluded: this.excluded() });
  });

  private readonly measuredTier = signal<WidthTier>('wide');
  readonly tier = computed<WidthTier>(() => this.forceTier() ?? this.measuredTier());

  private readonly activeTab = signal<string | null>(null);
  readonly currentTabId = computed(() => {
    const plan = this.plan();
    if (!plan) return null;
    const active = this.activeTab();
    return plan.tabs.some(t => t.id === active) ? active : plan.tabs[0]?.id ?? null;
  });
  readonly showTabBar = computed(() => (this.plan()?.tabs.length ?? 0) > 1);

  /** Kullanıcının açıp kapattığı bölümler (kimlik → açık mı); yoksa tasarımdaki varsayılan. */
  private readonly sectionOpen = signal<ReadonlyMap<string, boolean>>(new Map());

  /** Kaydet denendi — sekme hata rozetleri ancak bundan sonra görünür. */
  private readonly submitted = signal(false);

  constructor() {
    afterNextRender(() => {
      const element = this.host.nativeElement;
      this.measuredTier.set(widthTier(element.clientWidth));
      // ResizeObserver zone.js tarafından yamalanmaz: kademe değişince bölgeye girilir.
      const observer = new ResizeObserver(entries => {
        const next = widthTier(entries[0]?.contentRect.width ?? element.clientWidth);
        if (next !== this.measuredTier()) this.zone.run(() => this.measuredTier.set(next));
      });
      observer.observe(element);
      this.destroyRef.onDestroy(() => observer.disconnect());
    });

    // Görevli kaydı açınca dolduracağı alanların sekmesi seçilir, bölümleri açılır.
    effect(() => {
      const plan = this.plan();
      const steps = this.stepColumns();
      if (!plan || steps.size === 0) return;
      untracked(() => this.revealColumns(plan, steps));
    }, { allowSignalWrites: true });

    // Form yeniden kurulunca önceki Kaydet denemesinin izi silinir.
    effect(() => {
      this.form();
      untracked(() => {
        this.submitted.set(false);
        if (this.revealed().size > 0) this.revealed.set(NONE);
      });
    }, { allowSignalWrites: true });
  }

  // ─── Şablon yardımcıları ────────────────────────────────────────────────────

  control(column: string): AbstractControl | null {
    return this.form().get(column);
  }

  isStep(column: string): boolean {
    return this.stepColumns().has(column);
  }

  isVisible(item: PlanItem): boolean {
    return visibleAtTier(item, this.tier());
  }

  /** CSS grid-column: genişlik kademeye göre, "yeni satır" ilk kolondan başlar. */
  gridColumn(item: PlanItem): string {
    if (item.kind === 'divider') return '1 / -1';
    const span = itemSpan(item, this.tier());
    return item.newRow ? `1 / span ${span}` : `span ${span}`;
  }

  isSectionOpen(section: PlanSection): boolean {
    if (!section.collapsible) return true;
    return this.sectionOpen().get(section.id) ?? !section.collapsed;
  }

  toggleSection(section: PlanSection): void {
    this.setSectionOpen(section.id, !this.isSectionOpen(section));
  }

  selectTab(tabId: string): void {
    this.activeTab.set(tabId);
  }

  /** WAI-ARIA sekme deseni: ok tuşları / Home / End sekmeler arasında gezer. */
  onTabKeydown(event: KeyboardEvent, index: number): void {
    const tabs = this.plan()?.tabs ?? [];
    if (tabs.length === 0) return;
    let next = -1;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    if (next < 0) return;
    event.preventDefault();
    this.activeTab.set(tabs[next].id);
    afterNextRender(() => this.focusById(this.idPrefix() + 'tab-' + tabs[next].id), { injector: this.injector });
  }

  /** Sekmedeki geçersiz alan sayısı — yalnız Kaydet denendikten sonra. */
  tabErrorCount(tabId: string): number {
    const plan = this.plan();
    if (!plan || !this.submitted()) return 0;
    return invalidCountByTab(plan, this.invalidColumns()).get(tabId) ?? 0;
  }

  // ─── Geçersiz alanı gösterme ────────────────────────────────────────────────

  /**
   * Kaydet geçersiz formda durduğunda çağrılır: ilk hatalı alanın sekmesine geçer, bölümünü
   * açar, alanı ortalayıp odaklar. Tasarımda gizli kalmış hatalı alanı görünür yapar.
   * Gösterecek alan yoksa false.
   */
  revealFirstInvalid(): boolean {
    this.submitted.set(true);
    const invalid = this.invalidColumns();
    if (invalid.size === 0) return false;

    let column: string | null = null;
    let plan = this.plan();
    if (plan) {
      const hiddenInvalid = [...invalid].filter(c => !plan!.location.has(c) && !this.excluded().has(c));
      if (hiddenInvalid.length > 0) {
        this.revealed.set(new Set([...this.revealed(), ...hiddenInvalid]));
        plan = this.plan();
      }
      const where = plan ? firstInvalidLocation(plan, invalid) : null;
      if (where) {
        this.activeTab.set(where.tabId);
        this.setSectionOpen(where.sectionId, true);
        column = where.column;
      }
    } else {
      column = this.legacyColumns().find(c => invalid.has(c.columnName))?.columnName ?? null;
    }

    if (!column) return false;
    const id = this.idPrefix() + column;
    afterNextRender(() => {
      const element = this.findById(id);
      element?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      element?.focus({ preventScroll: true });
    }, { injector: this.injector });
    return true;
  }

  /** Geçersiz (ve etkin) kontrollerin kolon adları. Disabled kontrol hiçbir zaman geçersiz sayılmaz. */
  private invalidColumns(): Set<string> {
    const out = new Set<string>();
    const controls = this.form().controls;
    for (const name of Object.keys(controls)) {
      if (controls[name].invalid) out.add(name);
    }
    return out;
  }

  private revealColumns(plan: FormRenderPlan, columns: ReadonlySet<string>): void {
    const tabs = tabsWithColumns(plan, columns);
    if (tabs.length > 0) this.activeTab.set(tabs[0]);
    for (const sectionId of sectionsWithColumns(plan, columns)) this.setSectionOpen(sectionId, true);
  }

  private setSectionOpen(sectionId: string, open: boolean): void {
    const next = new Map(this.sectionOpen());
    next.set(sectionId, open);
    this.sectionOpen.set(next);
  }

  private findById(id: string): HTMLElement | null {
    return this.host.nativeElement.querySelector<HTMLElement>('#' + CSS.escape(id));
  }

  private focusById(id: string): void {
    this.findById(id)?.focus();
  }
}
