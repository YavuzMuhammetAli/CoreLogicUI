import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslatePipe } from '../../../pipes/translate.pipe';
import { NODE_KINDS, NodeKind } from '../../../utils/workflow/workflow-node-types';
import { WORKFLOW_NODE_MIME } from '../../shared/workflow-canvas/workflow-canvas.component';
import { IconComponent } from '../../shared/icon/icon.component';

/**
 * Tasarımcı paleti — eklenebilecek düğüm türleri.
 *
 * İki yol: tuvale sürükleyip bırakmak (bırakılan yere konur) ya da tıklamak
 * (seçili adımın boş çıkışına bağlanır; seçim yoksa görünür alana konur).
 * Sürükleme native HTML5 sürükle-bırak ile yapılır — tuval yalnız masaüstünde
 * kullanıldığı için dokunmatik desteği gerekmiyor; tıklama yolu her yerde çalışır.
 */
@Component({
  selector: 'app-workflow-palette',
  standalone: true,
  imports: [TranslatePipe, IconComponent],
  templateUrl: './workflow-palette.component.html',
  styleUrl: './workflow-palette.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class WorkflowPaletteComponent {
  readonly disabled = input(false);
  /** Bu şirkette kullanılamayan türler (ör. Bekleme — migrasyon 022 yok). */
  readonly unavailable = input<ReadonlySet<NodeKind>>(new Set());

  readonly add = output<NodeKind>();

  /** Gruplar: insan adımları, akışı yönlendiren adımlar. */
  readonly groups = [
    { titleKey: 'workflow.palette.human', kinds: NODE_KINDS.filter(k => k.category === 'human') },
    { titleKey: 'workflow.palette.automation', kinds: NODE_KINDS.filter(k => k.category === 'automation') },
    { titleKey: 'workflow.palette.flow', kinds: NODE_KINDS.filter(k => k.category === 'flow') }
  ];

  isUnavailable(kind: NodeKind): boolean {
    return this.unavailable().has(kind);
  }

  onDragStart(event: DragEvent, kind: NodeKind): void {
    if (this.disabled() || this.isUnavailable(kind) || !event.dataTransfer) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.setData(WORKFLOW_NODE_MIME, kind);
    event.dataTransfer.effectAllowed = 'copy';
  }
}
