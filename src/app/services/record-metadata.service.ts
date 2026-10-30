import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, of } from 'rxjs';
import { map, shareReplay, catchError } from 'rxjs/operators';
import { PublishedModelService, PublishedModel, PublishedColumn } from './published-model.service';
import { PublishedColumnSchema } from './published-table.service';
import { ScreenLayoutService } from './screen-layout.service';
import { AuthService } from './auth.service';
import { FormLayout, ListLayout, ScreenViewType } from '../utils/screen-layout/screen-layout.model';
import { parseFormLayout, parseListLayout } from '../utils/screen-layout/screen-layout.parse';

/** Bir model tipinin form kurmak için gereken tüm meta verisi. */
export interface TypeMeta {
  typeName: string;
  /** Assembly'den okunan kolonlar (tip, nullable, enum/lookup hedefi, etiket). */
  columns: PublishedColumn[];
  /** Şemadan okunan doğrulama kuralları: kolon adı → regex/uzunluk/aralık. */
  rules: Map<string, PublishedColumnSchema>;
  /** Bu tipin doğrudan alt model adları. */
  childTypeNames: string[];
}

/**
 * RecordMetadataService — kayıt formları için model meta verisini tek yerden,
 * ÖNBELLEKLİ olarak sağlar.
 *
 * İç içe alt model pop-up'ı her seviyede kolon + kural + alt model listesi ister;
 * bu servis olmasa aynı istekler her seviyede tekrar atılırdı. Tüm akışlar
 * `shareReplay(1)` ile paylaşılır — aynı tip için ikinci bir HTTP isteği gitmez.
 *
 * Doğrulama kuralları (regex/minLength/maxLength/min/max) `/PublishedModel/schema`
 * ucundan gelir; backend `ValidateDynamicEntity` de AYNI şemayı okur, böylece
 * istemci ve sunucu doğrulaması birebir örtüşür. Admin'e özel `/Published/getTable`
 * KULLANILMAZ — admin olmayan kullanıcı orada 403 alıp /models'e atılıyordu.
 */
@Injectable({ providedIn: 'root' })
export class RecordMetadataService {
  private readonly publishedModel = inject(PublishedModelService);
  private readonly screenLayouts = inject(ScreenLayoutService);
  private readonly auth = inject(AuthService);

  /** typeName → kolonlar (tek bir /models yanıtından indekslenir; yanıtla birlikte yenilenir). */
  private columnsIndex?: { source: Observable<unknown>; index$: Observable<Map<string, PublishedColumn[]>> };
  private readonly rulesCache = new Map<string, Observable<Map<string, PublishedColumnSchema>>>();
  private readonly childCache = new Map<string, Observable<string[]>>();
  private readonly metaCache = new Map<string, Observable<TypeMeta>>();
  /**
   * `${typeName}|${viewType}` → yayındaki yerleşim (süreli önbellek, bkz. layout$). Sunucu tasarımı
   * kullanıcının ROLÜNE göre seçer; bu yüzden girdi oturum token'ına bağlıdır — çıkış yapıp başka
   * kullanıcıyla girilince öncekinin tasarımı gösterilmez.
   */
  private readonly layoutCache = new Map<string, { at: number; owner: string | null; layout$: Observable<FormLayout | ListLayout | null> }>();
  /** `${typeName}|${viewType}` → sunucunun seçtiği tasarımın kimliği (admin "Ekranı tasarla" ile aynısını açar). */
  private readonly layoutIds = new Map<string, number>();

  /** Model listesi geçersiz kılındı (bkz. PublishedModelService.invalidateModels). */
  readonly modelsInvalidated$ = this.publishedModel.modelsInvalidated$.asObservable();

  constructor() {
    // Model listesi değişince (yayın, şema düzenlemesi) ondan türeyen paketler de bayattır.
    this.publishedModel.modelsInvalidated$.subscribe(() => {
      this.metaCache.clear();
      this.childCache.clear();
      this.columnsIndex = undefined;
    });
  }

  /**
   * Kullanıcının görebildiği yayınlanmış modeller (admin olmayanda yalnız Read izinliler).
   * Okunamazsa boş liste — çağıranlar typeName'e düşer.
   */
  models$(): Observable<PublishedModel[]> {
    // Önbellek PublishedModelService'te (süreli, oturuma bağlı, şema değişince düşer).
    return this.publishedModel.getModels().pipe(
      map(res => res.success ? res.data ?? [] : []),
      catchError(() => of<PublishedModel[]>([]))
    );
  }

  /**
   * Tüm modellerin kolonları. `/PublishedModel/models` tek çağrıda hepsini döndürdüğü
   * için tip başına ayrı istek atılmaz.
   */
  private allColumns$(): Observable<Map<string, PublishedColumn[]>> {
    // Dizin, kaynağı olan /models yanıtı değişmedikçe yeniden kurulmaz.
    const source = this.publishedModel.getModels();
    if (this.columnsIndex?.source !== source) {
      this.columnsIndex = {
        source,
        index$: this.models$().pipe(
          map(models => new Map(models.map(m => [m.typeName, m.columns ?? []] as const))),
          shareReplay(1)
        )
      };
    }
    return this.columnsIndex.index$;
  }

  columns$(typeName: string): Observable<PublishedColumn[]> {
    return this.allColumns$().pipe(map(index => index.get(typeName) ?? []));
  }

  /** Doğrulama kuralları — kolon adı → kural. Şema okunamazsa boş harita (engelleme yok). */
  rules$(typeName: string): Observable<Map<string, PublishedColumnSchema>> {
    let cached = this.rulesCache.get(typeName);
    if (!cached) {
      cached = this.publishedModel.getSchema(typeName).pipe(
        map(res => {
          const map = new Map<string, PublishedColumnSchema>();
          if (res.success && res.data) {
            for (const c of res.data.columns ?? []) map.set(c.name, c);
          }
          return map;
        }),
        catchError(() => of(new Map<string, PublishedColumnSchema>())),
        shareReplay(1)
      );
      this.rulesCache.set(typeName, cached);
    }
    return cached;
  }

  /**
   * Bir tipin şema kurallarını önbellekten düşürür. Tasarımcı kolon kuralı (ör. otomatik
   * değer) kaydettikten sonra çağırır; aksi halde açık oturumdaki formlar eski kuralı
   * sayfa yenilenene kadar kullanmaya devam ederdi.
   */
  invalidate(typeName: string): void {
    this.rulesCache.delete(typeName);
    this.metaCache.delete(typeName);
  }

  /** Bu tipin doğrudan alt model adları. */
  childTypeNames$(typeName: string): Observable<string[]> {
    let cached = this.childCache.get(typeName);
    if (!cached) {
      cached = this.publishedModel.getChildModels(typeName).pipe(
        map(res => (res.success ? (res.data ?? []) : [])),
        catchError(() => of([] as string[])),
        shareReplay(1)
      );
      this.childCache.set(typeName, cached);
    }
    return cached;
  }

  /** Kolonlar + kurallar + alt model adları tek pakette. */
  meta$(typeName: string): Observable<TypeMeta> {
    let cached = this.metaCache.get(typeName);
    if (!cached) {
      cached = forkJoin({
        columns: this.columns$(typeName),
        rules: this.rules$(typeName),
        childTypeNames: this.childTypeNames$(typeName)
      }).pipe(
        map(({ columns, rules, childTypeNames }) => ({ typeName, columns, rules, childTypeNames })),
        shareReplay(1)
      );
      this.metaCache.set(typeName, cached);
    }
    return cached;
  }

  // ─── Ekran tasarımı (yayındaki yerleşim) ───────────────────────────────────

  /**
   * Yerleşim önbelleği süresi. Tasarım başka bir oturumda yayınlanabilir; sonsuz önbellek
   * kullanıcıyı sayfa yenileyene dek eski düzende tutardı. Aynı oturumdaki yayın ise
   * `invalidateLayout` ile anında düşürülür.
   */
  static readonly LAYOUT_TTL_MS = 5 * 60 * 1000;

  /** Modelin yayındaki form yerleşimi; yoksa (ya da okunamazsa) null → varsayılan görünüm. */
  formLayout$(typeName: string): Observable<FormLayout | null> {
    return this.layout$(typeName, 'form') as Observable<FormLayout | null>;
  }

  /** Modelin yayındaki liste yerleşimi; yoksa null → eski kolon görünürlüğü ayarı. */
  listLayout$(typeName: string): Observable<ListLayout | null> {
    return this.layout$(typeName, 'list') as Observable<ListLayout | null>;
  }

  /** Tasarımcı yayınladıktan / sıfırladıktan sonra çağırır — açık ekranlar yeni düzeni okusun. */
  invalidateLayout(typeName: string): void {
    for (const view of ['form', 'list']) {
      this.layoutCache.delete(`${typeName}|${view}`);
      this.layoutIds.delete(`${typeName}|${view}`);
    }
  }

  /** Son okunan yayındaki tasarımın kimliği; tasarım yoksa null. */
  publishedLayoutId(typeName: string, viewType: ScreenViewType): number | null {
    return this.layoutIds.get(`${typeName}|${viewType}`) ?? null;
  }

  private layout$(typeName: string, viewType: ScreenViewType): Observable<FormLayout | ListLayout | null> {
    const key = `${typeName}|${viewType}`;
    const now = Date.now();
    const owner = this.auth.sessionKey();
    const cached = this.layoutCache.get(key);
    if (cached && cached.owner === owner && now - cached.at < RecordMetadataService.LAYOUT_TTL_MS) return cached.layout$;

    const layout$ = this.screenLayouts.getPublished(typeName, viewType).pipe(
      map(res => {
        const dto = res.success ? res.data : null;
        if (dto?.layoutId) this.layoutIds.set(key, dto.layoutId);
        else this.layoutIds.delete(key);
        const json = dto?.layoutJson;
        return viewType === 'form' ? parseFormLayout(json) : parseListLayout(json);
      }),
      // Modül kurulu değil / ağ hatası: ekran varsayılan görünümle çalışır.
      catchError(() => of(null)),
      shareReplay(1)
    );
    this.layoutCache.set(key, { at: now, owner, layout$ });
    return layout$;
  }

  // NOT: Lookup dropdown önbelleği buradan KALDIRILDI.
  //
  // Eski `lookupOptions$` hedef tablonun TÜM satırlarını çekip bellekte tutuyordu
  // (Musteri: 12.025 satır / 5 MB). Artık seçenekler app-lookup-picker tarafından
  // 50'şer, sunucu taraflı aramayla çekiliyor; liste hücrelerindeki etiketler ise
  // LookupLabelService üzerinden toplu (?ids=) çözülüyor.
  //
  // Yan fayda: eski önbellek yalnız tablo adına göre anahtarlanıp displayColumn'u
  // yok sayıyordu — aynı tabloya farklı etiket kolonuyla bakan iki kolon birbirinin
  // etiketini gösteriyordu. LookupLabelService anahtarı (tablo|kolon) çiftidir.
}
