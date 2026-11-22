import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslatePipe } from '../../../pipes/translate.pipe';
import { NODE_KINDS, NodeKind } from '../../../utils/workflow/workflow-node-types';
import { WORKFLOW_NODE_MIME } from '../../shared/workflow-canvas/workflow-canvas.component';
import { IconComponent } from '../../shared/icon/icon.component';

/**
 * Designer palette — node types that can be added.
 *
 * Two ways: drag onto the canvas (placed where dropped) or click
 * (connected to the selected step's empty exit; with no selection, placed in the visible area).
 * Dragging uses native HTML5 drag-and-drop — the canvas is only used on desktop,
 * so touch support is not needed; the click path works everywhere.
 */
@Component({
    selector: 'app-workflow-palette',
    imports: [TranslatePipe, IconComponent],
    templateUrl: './workflow-palette.component.html',
    styleUrl: './workflow-palette.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class WorkflowPaletteComponent {
  readonly disabled = input(false);
  /** Types not available in this company (e.g. Wait — migration 022 missing). */
  readonly unavailable = input<ReadonlySet<NodeKind>>(new Set());

  readonly add = output<NodeKind>();

  /** Groups: human steps, steps that route the flow. */
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
