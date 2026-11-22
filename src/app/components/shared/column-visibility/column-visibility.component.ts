import { ChangeDetectionStrategy, Component, ElementRef, EventEmitter, HostListener, Input, OnChanges, Output, ViewChild, signal } from '@angular/core';

import { TranslatePipe } from '../../../pipes/translate.pipe';
import { closeOnOutsidePointer } from '../../../utils/outside-pointer';
import { IconComponent } from '../icon/icon.component';

/** A single column listed in the popover */
export interface ColumnVisibilityItem {
  name: string;
  /** If true the checkbox is shown checked+disabled and cannot be hidden (e.g. a required form field) */
  required: boolean;
}

/**
 * Popover where the admin sets which columns are visible per model.
 * Follows the same outside-click/Esc behaviour as the profile dropdown pattern in layout.component.ts.
 *
 * Usage: the parent passes the currently EFFECTIVE visible column names via `visible` (all column
 * names if there is no setting). When Save is pressed, the selected column names (in schema order)
 * are emitted via `save`; the parent writes them to the backend.
 */
@Component({
    selector: 'app-column-visibility',
    imports: [TranslatePipe, IconComponent],
    templateUrl: './column-visibility.component.html',
    styleUrls: ['./column-visibility.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ColumnVisibilityComponent implements OnChanges {
  @Input() columns: ColumnVisibilityItem[] = [];
  @Input() visible: string[] = [];
  @Input() saving = false;

  @Output() save = new EventEmitter<string[]>();

  readonly open = signal(false);

  /** Draft selection inside the popover — not reflected outside until Save is pressed */
  draft = new Set<string>();

  @ViewChild('wrapRef') wrapRef?: ElementRef<HTMLElement>;

  constructor() {
    closeOnOutsidePointer(this.open, () => this.wrapRef?.nativeElement, () => this.open.set(false));
  }

  ngOnChanges(): void {
    // Updates from the parent must not overwrite the draft while the popover is open
    // (e.g. an input change after save); sync only while closed.
    if (!this.open()) {
      this.draft = new Set(this.visible);
    }
  }

  toggleOpen(): void {
    this.open.update(v => !v);
    if (this.open()) {
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

  /** Don't allow saving without at least one selected column — otherwise "no setting" and
   * "all columns explicitly hidden" become indistinguishable on the backend. */
  get canSave(): boolean {
    return this.draft.size > 0;
  }

  submit(): void {
    if (!this.canSave || this.saving) return;
    this.save.emit(this.columns.map(c => c.name).filter(n => this.draft.has(n)));
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.open.set(false);
  }
}
