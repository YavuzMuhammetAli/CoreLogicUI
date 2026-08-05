import { ChangeDetectionStrategy, Component, ElementRef, EventEmitter, HostListener, Input, OnChanges, Output, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslatePipe } from '../../../pipes/translate.pipe';

/** Popover'da listelenecek tek bir kolon */
export interface ColumnVisibilityItem {
  name: string;
  /** true ise onay kutusu işaretli+pasif gösterilir, gizlenemez (örn. zorunlu form alanı) */
  required: boolean;
}

/**
 * Admin'in model bazında hangi kolonların görüneceğini ayarladığı açılır kutu.
 * layout.component.ts'teki profil dropdown deseniyle aynı dış-tıklama/Esc davranışını izler.
 *
 * Kullanım: parent, o anki ETKİN görünür kolon adlarını `visible` ile geçirir (ayar yoksa
 * tüm kolon adları). Kaydet'e basıldığında `save` ile seçili kolon adları (schema sırasıyla)
 * emit edilir; parent bunu backend'e yazar.
 */
@Component({
  selector: 'app-column-visibility',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './column-visibility.component.html',
  styleUrls: ['./column-visibility.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ColumnVisibilityComponent implements OnChanges {
  @Input() columns: ColumnVisibilityItem[] = [];
  @Input() visible: string[] = [];
  @Input() saving = false;

  @Output() save = new EventEmitter<string[]>();

  open = false;

  /** Popover içindeki taslak seçim — Kaydet'e basılana kadar dışa yansımaz */
  draft = new Set<string>();

  @ViewChild('wrapRef') wrapRef?: ElementRef<HTMLElement>;

  ngOnChanges(): void {
    // Popover açıkken parent'tan gelen güncellemeler taslağı ezmesin
    // (örn. kaydet sonrası input değişimi); sadece kapalıyken senkronla.
    if (!this.open) {
      this.draft = new Set(this.visible);
    }
  }

  toggleOpen(): void {
    this.open = !this.open;
    if (this.open) {
      this.draft = new Set(this.visible);
    }
  }

  isChecked(name: string): boolean {
    return this.draft.has(name);
  }

  toggle(col: ColumnVisibilityItem): void {
    if (col.required) return;
    if (this.draft.has(col.name)) {
      this.draft.delete(col.name);
    } else {
      this.draft.add(col.name);
    }
  }

  /** En az bir kolon seçili olmadan kaydetmeye izin verme — aksi halde "ayar yok" ile
   * "tüm kolonlar açıkça gizlendi" durumu backend'de ayırt edilemez hale gelir. */
  get canSave(): boolean {
    return this.draft.size > 0;
  }

  submit(): void {
    if (!this.canSave || this.saving) return;
    this.save.emit(this.columns.map(c => c.name).filter(n => this.draft.has(n)));
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.wrapRef?.nativeElement.contains(event.target as Node)) {
      this.open = false;
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.open = false;
  }
}
