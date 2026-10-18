import { ChangeDetectionStrategy, Component, OnInit, input, output, signal } from '@angular/core';
import { WorkflowEndOutcome, WorkflowStep } from '../../../models/workflow.model';
import { TranslatePipe } from '../../../pipes/translate.pipe';

/** Bitiş düğümünün düzenlenen hali: adım + kayda yazılacak durum metni. */
export interface EndDraft {
  step: WorkflowStep;
  statusLabel: string;
}

/**
 * Bitiş düğümünün düzenleyicisi: ad, anahtar, sonuç (tamamlandı/reddedildi) ve
 * kayda yazılacak durum metni. Durum metni boşsa sonucun genel eşlemesi, o da
 * yoksa düğümün adı yazılır — kayıt süreç sonunda boş kalmaz.
 */
@Component({
  selector: 'app-end-editor',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './end-editor.component.html',
  styleUrl: './editors.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EndEditorComponent implements OnInit {
  readonly step = input.required<WorkflowStep>();
  readonly statusLabel = input('');
  readonly readonly = input(false);

  readonly draftChange = output<EndDraft>();

  readonly draft = signal<EndDraft>({ step: { key: '', type: 'end', name: '' }, statusLabel: '' });

  ngOnInit(): void {
    this.draft.set({ step: { ...this.step() }, statusLabel: this.statusLabel() });
  }

  private apply(patch: Partial<WorkflowStep>, statusLabel?: string): void {
    if (this.readonly()) return;
    const current = this.draft();
    const next = { step: { ...current.step, ...patch }, statusLabel: statusLabel ?? current.statusLabel };
    this.draft.set(next);
    this.draftChange.emit(next);
  }

  onName(event: Event): void {
    this.apply({ name: (event.target as HTMLInputElement).value });
  }

  onKey(event: Event): void {
    this.apply({ key: (event.target as HTMLInputElement).value.trim() });
  }

  onOutcome(event: Event): void {
    this.apply({ outcome: (event.target as HTMLSelectElement).value as WorkflowEndOutcome });
  }

  onStatusLabel(event: Event): void {
    this.apply({}, (event.target as HTMLInputElement).value);
  }
}
