import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { PublishedModelService } from './published-model.service';

/**
 * Liste/tablo hücrelerinde lookup FK id'lerini etikete çevirir.
 *
 * NEDEN AYRI SERVİS: dropdown artık tembel yükleniyor, yani hedef tablonun TAM listesi
 * hiçbir yerde tutulmuyor. Hücrelerde etiket gösterebilmek için görünen sayfadaki
 * benzersiz id'ler toplanıp kolon başına TEK `?ids=` isteğiyle çözülür — maliyet sayfa
 * boyutuyla sınırlıdır. Aynı mantık hem model-detail hem model-children'da gerektiği
 * için burada tek yerde durur.
 *
 * Önbellek anahtarı `hedefTablo|etiketKolonu` çiftidir: aynı tabloya farklı etiket
 * kolonuyla bakan iki kolon birbirinin etiketini kullanamaz. (Kaldırılan
 * RecordMetadataService.lookupOptions$ yalnız tablo adına göre anahtarlıyor ve bu
 * yüzden yanlış etiket paylaşabiliyordu.)
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
   * Verilen id'lerden önbellekte OLMAYANLARI tek istekte çözer.
   * Hepsi zaten önbellekteyse hiç istek atmaz.
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

  /** Önbellekteki etiket; çözülmemişse null (çağıran ham id'ye düşer). */
  label(target: string, displayColumn: string | null | undefined, id: number): string | null {
    return this.bucket(target, displayColumn).get(id) ?? null;
  }

  /** Hedef tabloya kayıt eklendiğinde/güncellendiğinde etiketler bayatlayabilir. */
  invalidate(target: string): void {
    for (const k of [...this.cache.keys()]) {
      if (k.startsWith(`${target}|`)) this.cache.delete(k);
    }
  }
}
