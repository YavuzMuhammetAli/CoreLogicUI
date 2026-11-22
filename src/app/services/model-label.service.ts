import { Injectable, inject, signal, untracked } from '@angular/core';
import { RecordMetadataService } from './record-metadata.service';

/**
 * Model table name (`SatinalmaTalebi`) → the label the user recognizes ("Satınalma Talebi").
 *
 * Only for screens that carry just the model NAME (workflow lists, instances, tasks, report
 * badges); screens that already fetch the model list read the label directly from `model.label`.
 * The list comes from the `RecordMetadataService.models$()` cache — no extra HTTP request.
 *
 * If there is no label, the model was deleted or the user cannot see the model (for non-admins
 * `/models` returns only models with Read permission), the table name is shown.
 */
@Injectable({ providedIn: 'root' })
export class ModelLabelService {
  private readonly metadata = inject(RecordMetadataService);

  private readonly labels = signal<ReadonlyMap<string, string>>(new Map());
  private requested = false;

  constructor() {
    // The label may change (schema edit, new publish): it is reloaded on the next read.
    this.metadata.modelsInvalidated$?.subscribe(() => { this.requested = false; });
  }

  labelOf(typeName: string | null | undefined): string {
    if (!typeName) return '';
    this.ensureLoaded();
    return this.labels().get(typeName) ?? typeName;
  }

  private ensureLoaded(): void {
    if (this.requested) return;
    this.requested = true;

    // Called while the template runs; if the cache is filled the subscription returns SYNCHRONOUSLY and the
    // signal write would happen inside the template consumer (NG0600). untracked moves it outside.
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
