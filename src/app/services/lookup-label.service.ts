import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { PublishedModelService } from './published-model.service';

/**
 * Turns lookup FK ids into labels in list/table cells.
 *
 * WHY A SEPARATE SERVICE: the dropdown is now lazy-loaded, so the FULL list of the target table
 * is not kept anywhere. To show labels in cells, the unique ids on the visible page are
 * collected and resolved with ONE `?ids=` request per column — the cost is bounded by the page
 * size. Its consumer is model-detail (the tables in the sub-model tabs); it is a service
 * so the cache outlives the component.
 *
 * The cache key is the `targetTable|labelColumn` pair: two columns that look at the same table
 * with different label columns cannot use each other's labels. (The removed
 * RecordMetadataService.lookupOptions$ keyed by table name only and could therefore
 * share the wrong label.)
 */
@Injectable({ providedIn: 'root' })
export class LookupLabelService {
  private readonly publishedModel = inject(PublishedModelService);

  /** `${target}|${displayColumn}` → (id → etiket) */
  private readonly cache = new Map<string, Map<number, string>>();

  private key(target: string, displayColumn?: string | null): string {
    return `${target}|${displayColumn ?? ''}`;
  }

  private bucket(target: string, displayColumn?: string | null): Map<number, string> {
    const k = this.key(target, displayColumn);
    let bucket = this.cache.get(k);
    if (!bucket) {
      bucket = new Map<number, string>();
      this.cache.set(k, bucket);
    }
    return bucket;
  }

  /**
   * Resolves the given ids that are NOT in the cache, in one request.
   * If all are already cached, no request is sent.
   */
  ensure(target: string, displayColumn: string | null | undefined, ids: number[]): Observable<void> {
    const bucket = this.bucket(target, displayColumn);

    const missing = [...new Set(ids)]
      .filter(id => Number.isFinite(id) && id > 0 && !bucket.has(id));

    if (missing.length === 0) return of(void 0);

    return this.publishedModel.lookupOptionsByIds(target, displayColumn, missing).pipe(
      tap(res => {
        if (!res.success) return;
        for (const opt of res.data?.items ?? []) bucket.set(opt.id, opt.label);
      }),
      map(() => void 0),
      catchError(() => of(void 0))
    );
  }

  /** Cached label; null if unresolved (the caller falls back to the raw id). */
  label(target: string, displayColumn: string | null | undefined, id: number): string | null {
    return this.bucket(target, displayColumn).get(id) ?? null;
  }

  /** Labels may go stale when a record is added/updated in the target table. */
  invalidate(target: string): void {
    for (const k of [...this.cache.keys()]) {
      if (k.startsWith(`${target}|`)) this.cache.delete(k);
    }
  }
}
