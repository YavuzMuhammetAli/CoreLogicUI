import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, of } from 'rxjs';
import { map, shareReplay, catchError } from 'rxjs/operators';
import { PublishedModelService, PublishedModel, PublishedColumn } from './published-model.service';
import { PublishedColumnSchema } from './published-table.service';
import { ScreenLayoutService } from './screen-layout.service';
import { AuthService } from './auth.service';
import { FormLayout, ListLayout, ScreenViewType } from '../utils/screen-layout/screen-layout.model';
import { parseFormLayout, parseListLayout } from '../utils/screen-layout/screen-layout.parse';

/** All the metadata of a model type needed to build a form. */
export interface TypeMeta {
  typeName: string;
  /** Assembly'den okunan kolonlar (tip, nullable, enum/lookup hedefi, etiket). */
  columns: PublishedColumn[];
  /** Validation rules read from the schema: column name → regex/length/range. */
  rules: Map<string, PublishedColumnSchema>;
  /** Direct sub-model names of this type. */
  childTypeNames: string[];
}

/**
 * RecordMetadataService — provides model metadata for record forms from a single place,
 * CACHED.
 *
 * The nested sub-model pop-up requests columns + rules + sub-model list at every level;
 * without this service the same requests would be repeated at every level. All streams
 * are shared with `shareReplay(1)` — no second HTTP request goes out for the same type.
 *
 * Validation rules (regex/minLength/maxLength/min/max) come from the `/PublishedModel/schema`
 * endpoint; the backend `ValidateDynamicEntity` reads the SAME schema, so client and server
 * validation match one to one. The admin-only `/Published/getTable` is
 * NOT USED — a non-admin user got a 403 there and was sent to /models.
 */
@Injectable({ providedIn: 'root' })
export class RecordMetadataService {
  private readonly publishedModel = inject(PublishedModelService);
  private readonly screenLayouts = inject(ScreenLayoutService);
  private readonly auth = inject(AuthService);

  /** typeName → columns (indexed from a single /models response; refreshed with the response). */
  private columnsIndex?: { source: Observable<unknown>; index$: Observable<Map<string, PublishedColumn[]>> };
  private readonly rulesCache = new Map<string, Observable<Map<string, PublishedColumnSchema>>>();
  private readonly childCache = new Map<string, Observable<string[]>>();
  private readonly metaCache = new Map<string, Observable<TypeMeta>>();
  /**
   * `${typeName}|${viewType}` → the published layout (time-limited cache, see layout$). The server picks
   * the design by the user's ROLE; so the entry is bound to the session token — after logging out and in
   * as another user, the previous user's design is not shown.
   */
  private readonly layoutCache = new Map<string, { at: number; owner: string | null; layout$: Observable<FormLayout | ListLayout | null> }>();
  /** `${typeName}|${viewType}` → ID of the design the server picked (admin "Ekranı tasarla" (Design screen) opens the same one). */
  private readonly layoutIds = new Map<string, number>();

  /** The model list was invalidated (see PublishedModelService.invalidateModels). */
  readonly modelsInvalidated$ = this.publishedModel.modelsInvalidated$.asObservable();

  constructor() {
    // When the model list changes (publish, schema edit), the bundles derived from it are stale too.
    this.publishedModel.modelsInvalidated$.subscribe(() => {
      this.metaCache.clear();
      this.childCache.clear();
      this.columnsIndex = undefined;
    });
  }

  /**
   * Published models the user can see (for non-admins only those with Read permission).
   * Empty list if unreadable — callers fall back to typeName.
   */
  models$(): Observable<PublishedModel[]> {
    // The cache is in PublishedModelService (time-limited, session-bound, dropped when the schema changes).
    return this.publishedModel.getModels().pipe(
      map(res => res.success ? res.data ?? [] : []),
      catchError(() => of<PublishedModel[]>([]))
    );
  }

  /**
   * Columns of all models. `/PublishedModel/models` returns them all in one call,
   * so no separate request is sent per type.
   */
  private allColumns$(): Observable<Map<string, PublishedColumn[]>> {
    // The index is not rebuilt unless its source, the /models response, changes.
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

  /** Validation rules — column name → rule. Empty map if the schema cannot be read (no blocking). */
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
   * Drops a type's schema rules from the cache. The designer calls it after saving a column rule
   * (e.g. auto value); otherwise forms in the open session would keep using the old rule
   * until the page is reloaded.
   */
  invalidate(typeName: string): void {
    this.rulesCache.delete(typeName);
    this.metaCache.delete(typeName);
  }

  /** Direct sub-model names of this type. */
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

  /** Columns + rules + sub-model names in one bundle. */
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

  // ─── Screen design (published layout) ─────────────────────────────────────

  /**
   * Layout cache lifetime. A design may be published in another session; an infinite cache
   * would keep the user on the old layout until a page reload. A publish in the same session is
   * dropped immediately with `invalidateLayout`.
   */
  static readonly LAYOUT_TTL_MS = 5 * 60 * 1000;

  /** The model's published form layout; null if none (or unreadable) → default view. */
  formLayout$(typeName: string): Observable<FormLayout | null> {
    return this.layout$(typeName, 'form') as Observable<FormLayout | null>;
  }

  /** The model's published list layout; null if none → the old column visibility setting. */
  listLayout$(typeName: string): Observable<ListLayout | null> {
    return this.layout$(typeName, 'list') as Observable<ListLayout | null>;
  }

  /** Called by the designer after publishing / resetting — so open screens read the new layout. */
  invalidateLayout(typeName: string): void {
    for (const view of ['form', 'list']) {
      this.layoutCache.delete(`${typeName}|${view}`);
      this.layoutIds.delete(`${typeName}|${view}`);
    }
  }

  /** ID of the last read published design; null if there is no design. */
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
      // Module not installed / network error: the screen runs with the default view.
      catchError(() => of(null)),
      shareReplay(1)
    );
    this.layoutCache.set(key, { at: now, owner, layout$ });
    return layout$;
  }

  // NOTE: The lookup dropdown cache was REMOVED from here.
  //
  // The old `lookupOptions$` fetched ALL rows of the target table and kept them in memory
  // (Musteri: 12,025 rows / 5 MB). Now options are fetched by app-lookup-picker
  // 50 at a time with server-side search; labels in list cells are resolved
  // in bulk (?ids=) through LookupLabelService.
  //
  // Side benefit: the old cache was keyed by table name only and ignored displayColumn
  // — two columns looking at the same table with different label columns showed each other's
  // labels. The LookupLabelService key is the (table|column) pair.
}
