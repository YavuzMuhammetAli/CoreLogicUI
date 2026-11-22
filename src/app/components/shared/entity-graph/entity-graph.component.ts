import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslatePipe } from '../../../pipes/translate.pipe';
import { EntityGraph } from '../../../models/relationship.model';
import { layoutGraph } from './entity-graph.layout';

/**
 * Entity graph visualisation — hand-written inline SVG.
 *
 * Why no library: the project has no dependency that draws graphs
 * (ApexCharts is only for charts/reports) and adding a new dependency for a single
 * directed layered diagram is unnecessary.
 *
 * The layout computation is NOT in this class but in the pure layoutGraph()
 * function in entity-graph.layout.ts — see that file's header.
 */
@Component({
    selector: 'app-entity-graph',
    imports: [TranslatePipe],
    templateUrl: './entity-graph.component.html',
    styleUrls: ['./entity-graph.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class EntityGraphComponent {
  graph = input<EntityGraph | null>(null);

  private readonly layout = computed(() => layoutGraph(this.graph()));

  readonly nodes = computed(() => this.layout().nodes);
  readonly edges = computed(() => this.layout().edges);
  readonly viewBox = computed(() => this.layout().viewBox);

  /**
   * Natural width of the SVG (from the viewBox). Without a width the SVG shrinks to 100%
   * of its container: on a phone the 13px node text drops to ~5px and is unreadable. A diagram
   * drawn at natural width that doesn't fit scrolls horizontally inside .graph-scroll.
   */
  readonly naturalWidth = computed(() => Number(this.viewBox().split(/\s+/)[2]) || null);
  readonly isEmpty = computed(() => this.layout().nodes.length === 0);
}
