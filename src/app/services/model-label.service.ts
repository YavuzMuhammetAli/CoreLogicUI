import { Injectable, inject, signal, untracked } from '@angular/core';
import { RecordMetadataService } from './record-metadata.service';

/**
 * Model tablo adı (`SatinalmaTalebi`) → kullanıcının tanıdığı etiket ("Satınalma Talebi").
 *
 * Yalnız model ADI taşıyan ekranlar (akış listeleri, süreçler, görevler, rapor rozetleri)
 * için; model listesini zaten çeken ekranlar etiketi doğrudan `model.label`'dan okur.
 * Liste `RecordMetadataService.models$()` önbelleğinden gelir — ek HTTP isteği yok.
 *
 * Etiket yoksa, model silinmişse ya da kullanıcı modeli göremiyorsa (admin olmayanda
 * `/models` yalnız Read izinlileri döner) tablo adı gösterilir.
 */
@Injectable({ providedIn: 'root' })
export class ModelLabelService {
  private readonly metadata = inject(RecordMetadataService);

  private readonly labels = signal<ReadonlyMap<string, string>>(new Map());
  private requested = false;

  labelOf(typeName: string | null | undefined): string {
    if (!typeName) return '';
    this.ensureLoaded();
    return this.labels().get(typeName) ?? typeName;
  }

  private ensureLoaded(): void {
    if (this.requested) return;
    this.requested = true;

    // Şablon çalışırken çağrılır; önbellek doluysa abonelik SENKRON döner ve sinyal
    // yazımı şablon tüketicisinin içinde kalırdı (NG0600). untracked onu dışarı alır.
    untracked(() => {
      this.metadata.models$().subscribe(models => {
        const next = new Map<string, string>();
        for (const model of models) {
          const label = model.label?.trim();
          if (label) next.set(model.typeName, label);
        }
        this.labels.set(next);
      });
    });
  }
}
