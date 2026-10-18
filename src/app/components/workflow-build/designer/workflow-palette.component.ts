import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslatePipe } from '../../../pipes/translate.pipe';
import { NODE_KINDS, NodeKind } from '../../../utils/workflow/workflow-node-types';
import { WORKFLOW_NODE_MIME } from '../../shared/workflow-canvas/workflow-canvas.component';

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
  imports: [TranslatePipe],
  templateUrl: './workflow-palette.component.html',
  styleUrl: './workflow-palette.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class WorkflowPaletteComponent {
  readonly disabled = input(false);

  readonly add = output<NodeKind>();

  readonly kinds = NODE_KINDS;

  onDragStart(event: DragEvent, kind: NodeKind): void {
    if (this.disabled() || !event.dataTransfer) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.setData(WORKFLOW_NODE_MIME, kind);
    event.dataTransfer.effectAllowed = 'copy';
  }
}
