import { ChangeDetectionStrategy, Component, computed, effect, HostListener, input, output, signal } from '@angular/core';
import { ModelUsage } from '../../../services/model-usage.service';
import { TranslatePipe } from '../../../pipes/translate.pipe';

/**
 * Reusable confirmation modal. For a simple yes/no confirmation leave `usage` empty;
 * if `usage` is set (e.g. the report/dashboard usage list before deleting a model) the usage
 * list is shown first, "Yine de Sil" (Delete anyway) moves to the second stage, where final confirmation is asked.
 */
@Component({
    selector: 'app-confirm-dialog',
    imports: [TranslatePipe],
    templateUrl: './confirm-dialog.component.html',
    styleUrls: ['./confirm-dialog.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ConfirmDialogComponent {
  open = input(false);
  title = input('');
  message = input('');
  /** Model name shown in the usage list heading (e.g. "'İzinler' modeli kullanılıyor:" — the 'İzinler' model is in use:). */
  modelName = input('');
  usage = input<ModelUsage | null>(null);
  /** Locks the buttons while the operation (cascade delete) is running. */
  busy = input(false);
  /**
   * Stacking order of the overlay. The default (null) keeps the CSS value 1000; set it only
   * when this dialog opens ON TOP of another modal (e.g. the nested record pop-up
   * uses `1000 + depth * 10`, and the confirm box must go above that too).
   */
  zIndex = input<number | null>(null);
  /**
   * Text of the confirm button (translated). If empty, "Sil" (Delete) — the dialog was written
   * for delete confirmation; for other confirmations (e.g. "Kaydetmeden ayrıl" / Leave without saving) the button should say what it does.
   */
  confirmLabel = input('');

  confirmed = output<void>();
  cancelled = output<void>();

  /** 1: first confirmation (usage list shown if any), 2: second/final confirmation when there is usage. */
  private readonly step = signal<1 | 2>(1);

  readonly hasUsage = computed(() => {
    const u = this.usage();
    return !!u && !u.isEmpty;
  });

  readonly isFinalStep = computed(() => !this.hasUsage() || this.step() === 2);

  constructor() {
    // Go back to the first step every time the modal opens — the second stage from a previous opening must not leak.
    // In Angular 18 writing a signal inside an effect needs explicit permission; otherwise every opening
    // throws NG0600 (the dialog still opens, but the step isn't reset and the console gets noisy).
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
