import { Pipe, PipeTransform, inject } from '@angular/core';
import { ModelLabelService } from '../services/model-label.service';

/**
 * Model tablo adını etiketine çevirir; etiket yoksa adı aynen döner.
 * Impure: etiketler sinyalden okunur ve geç gelir (TranslatePipe ile aynı desen) —
 * pure olsaydı ilk çizimdeki tablo adı önbellekte takılı kalırdı.
 *
 * Kullanım: {{ workflow.modelName | modelLabel }}
 */
@Pipe({
  name: 'modelLabel',
  standalone: true,
  pure: false
})
export class ModelLabelPipe implements PipeTransform {
  private readonly modelLabels = inject(ModelLabelService);

  transform(typeName: string | null | undefined): string {
    return this.modelLabels.labelOf(typeName);
  }
}
