import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslatePipe } from '../../../pipes/translate.pipe';
import { EntityGraph } from '../../../models/relationship.model';
import { layoutGraph } from './entity-graph.layout';

/**
 * Entity graph görselleştirmesi — elle yazılmış inline SVG.
 *
 * Neden kütüphane yok: projede graph çizen bir bağımlılık bulunmuyor
 * (ApexCharts yalnızca grafik/rapor içindir) ve tek bir yönlü katmanlı
 * diyagram için yeni bağımlılık eklemek gereksiz.
 *
 * Yerleşim hesabı bu sınıfta DEĞİL, entity-graph.layout.ts içindeki saf
 * layoutGraph() fonksiyonundadır — bkz. o dosyanın başlığı.
 */
@Component({
  selector: 'app-entity-graph',
  standalone: true,
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
  readonly isEmpty = computed(() => this.layout().nodes.length === 0);
}
