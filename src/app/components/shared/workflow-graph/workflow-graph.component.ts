import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { WorkflowGraph } from '../../../models/workflow.model';
import { layoutWorkflow } from './workflow-graph.layout';
import { TranslatePipe } from '../../../pipes/translate.pipe';

/**
 * Akış şeması — SALT OKUNUR inline SVG.
 *
 * entity-graph.component.ts ile birebir aynı yaklaşım: geometri saf bir fonksiyonda
 * (workflow-graph.layout.ts), bileşen yalnızca çizer. Tıklama, sürükleme, yakınlaştırma
 * ve seçim YOKTUR — sürükle-bırak tasarımcı Faz 5'e bırakıldı; projede diyagram
 * kütüphanesi bulunmadığı için tek yönlü bir şema uğruna bağımlılık eklenmedi.
 */
@Component({
  selector: 'app-workflow-graph',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './workflow-graph.component.html',
  styleUrl: './workflow-graph.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class WorkflowGraphComponent {
  graph = input<WorkflowGraph | null>(null);

  private readonly layout = computed(() => layoutWorkflow(this.graph()));

  readonly nodes = computed(() => this.layout().nodes);
  readonly edges = computed(() => this.layout().edges);
  readonly viewBox = computed(() => this.layout().viewBox);

  /**
   * SVG'nin doğal genişliği (viewBox'tan). Genişlik verilmezse SVG kabın %100'üne
   * küçülür: telefonda 13px'lik düğüm yazısı ~5px'e iner ve okunmaz. Doğal genişlikle
   * çizilen şema sığmazsa .graph-scroll içinde yatay kayar.
   */
  readonly naturalWidth = computed(() => Number(this.viewBox().split(/\s+/)[2]) || null);
  readonly isEmpty = computed(() => this.layout().nodes.length === 0);
}
