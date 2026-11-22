import { Pipe, PipeTransform, inject } from '@angular/core';
import { ModelLabelService } from '../services/model-label.service';

/**
 * Turns a model table name into its label; returns the name as is if there is no label.
 * Impure: labels are read from a signal and arrive late (same pattern as TranslatePipe) —
 * if it were pure, the table name from the first render would stay stuck in the cache.
 *
 * Usage: {{ workflow.modelName | modelLabel }}
 */
@Pipe({
  name: 'modelLabel',
  pure: false
})
export class ModelLabelPipe implements PipeTransform {
  private readonly modelLabels = inject(ModelLabelService);

  transform(typeName: string | null | undefined): string {
    return this.modelLabels.labelOf(typeName);
  }
}
