import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PublishedColumn } from '../../../services/published-model.service';
import { PublishedColumnSchema } from '../../../services/published-table.service';
import { TranslatePipe } from '../../../pipes/translate.pipe';
import {
  FieldWidget, FormItem, FormLayout, FormSection, FormTab, LAYOUT_LIMITS, LayoutColumnFact, NoteTone
} from '../../../utils/screen-layout/screen-layout.model';
import { LayoutDesignerStore } from './layout-designer.store';
import {
  ItemPatch, SectionPatch, findItem, findSection, hideColumn, moveSectionBy, moveTabBy, patchItem, patchSection,
  removeItem, removeSection, removeTab, renameTab, setSpan
} from './form-layout.commands';

type Target =
  | { kind: 'item'; item: FormItem; section: FormSection; tab: FormTab }
  | { kind: 'section'; section: FormSection; tab: FormTab; index: number; count: number }
  | { kind: 'tab'; tab: FormTab; index: number; count: number };

/**
 * Ekran tasarımcısının sağ paneli — seçili öğenin, bölümün ya da sekmenin özellikleri.
 *
 * Yalnız SUNUMU değiştirir (genişlik, satır başı, gösterim biçimi, başlıklar). Alanın etiketi,
 * zorunluluğu ve kuralları şemanındır; burada salt-okunur gösterilir ve şema ekranına
 * bağlantı verilir — tasarımcıda ikinci bir kural kaynağı olsaydı istemci ile sunucu ayrışırdı.
 *
 * Metin girdilerinin değişiklikleri `inspector:{alan}:{kimlik}` sebebiyle gönderilir: aynı
 * alana yazılan harfler tek geri al adımında birleşir.
 */
@Component({
  selector: 'app-form-inspector',
  standalone: true,
  imports: [TranslatePipe, RouterLink],
  templateUrl: './form-inspector.component.html',
  styleUrls: ['./form-inspector.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FormInspectorComponent {
  readonly store = input.required<LayoutDesignerStore<FormLayout>>();
  readonly columns = input.required<readonly PublishedColumn[]>();
  readonly rules = input.required<ReadonlyMap<string, PublishedColumnSchema>>();
  readonly facts = input.required<readonly LayoutColumnFact[]>();
  readonly typeName = input.required<string>();

  readonly quickSpans = [3, 4, 6, 8, 12];
  readonly spanOptions = Array.from({ length: 12 }, (_, i) => i + 1);
  readonly limits = LAYOUT_LIMITS;

  readonly target = computed<Target | null>(() => {
    const doc = this.store().doc();
    const id = this.store().selection();
    if (!id) return null;
    const item = findItem(doc, id);
    if (item) return { kind: 'item', item: item.item, section: item.section, tab: item.tab };
    const section = findSection(doc, id);
    if (section) {
      return { kind: 'section', section: section.section, tab: section.tab, index: section.sectionIndex, count: section.tab.sections.length };
    }
    const index = doc.tabs.findIndex(t => t.id === id);
    return index >= 0 ? { kind: 'tab', tab: doc.tabs[index], index, count: doc.tabs.length } : null;
  });

  private readonly columnByName = computed(() => new Map(this.columns().map(c => [c.columnName, c])));
  private readonly mustStay = computed(() => new Set(this.facts().filter(f => f.mustStayVisible).map(f => f.name)));

  column(name: string): PublishedColumn | undefined {
    return this.columnByName().get(name);
  }

  label(name: string): string {
    return this.column(name)?.label?.trim() || name;
  }

  rule(name: string): PublishedColumnSchema | undefined {
    return this.rules().get(name);
  }

  mustStayVisible(name: string): boolean {
    return this.mustStay().has(name);
  }

  /** Bu kolonda seçilebilecek gösterim biçimi (yalnız metin ve enum'da var). */
  widgetChoice(name: string): 'string' | 'enum' | null {
    const type = this.column(name)?.dataType;
    return type === 'string' || type === 'enum' ? type : null;
  }

  // ─── Komutlar ──────────────────────────────────────────────────────────────

  private apply(reason: string, command: (doc: FormLayout) => FormLayout): void {
    this.store().dispatch(reason, command);
  }

  setSpan(item: FormItem, span: number): void {
    this.apply('', d => setSpan(d, item.id, span));
  }

  patch(item: FormItem, patch: ItemPatch, field = ''): void {
    this.apply(field ? `inspector:${field}:${item.id}` : '', d => patchItem(d, item.id, patch));
  }

  setWidget(item: FormItem, value: string): void {
    const widget = (value || null) as FieldWidget | null;
    this.apply('', d => patchItem(d, item.id, widget === 'multiline' ? { widget, rows: 3 } : { widget }));
  }

  setTone(item: FormItem, tone: string): void {
    this.apply('', d => patchItem(d, item.id, { tone: tone as NoteTone }));
  }

  remove(item: FormItem): void {
    this.apply('', d => removeItem(d, item.id));
    this.store().selection.set(null);
  }

  hide(item: FormItem): void {
    if (item.kind !== 'field') return;
    this.apply('', d => hideColumn(d, item.column));
    this.store().selection.set(null);
  }

  patchSection(section: FormSection, patch: SectionPatch, field = ''): void {
    this.apply(field ? `inspector:${field}:${section.id}` : '', d => patchSection(d, section.id, patch));
  }

  moveSection(section: FormSection, delta: -1 | 1): void {
    this.apply('', d => moveSectionBy(d, section.id, delta));
  }

  removeSection(section: FormSection): void {
    this.apply('', d => removeSection(d, section.id));
    this.store().selection.set(null);
  }

  renameTab(tab: FormTab, title: string): void {
    this.apply(`inspector:title:${tab.id}`, d => renameTab(d, tab.id, title));
  }

  moveTab(tab: FormTab, delta: -1 | 1): void {
    this.apply('', d => moveTabBy(d, tab.id, delta));
  }

  removeTab(tab: FormTab): void {
    this.apply('', d => removeTab(d, tab.id));
    this.store().selection.set(null);
  }

  value(event: Event): string {
    return (event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value;
  }

  checked(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }
}
