import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { Observable, Subject, shareReplay, tap } from 'rxjs';
import { ResponseModel } from '../models/responseModel';
import { ListResponseModel } from '../models/responseModelList';
import { DataResponseModel } from '../models/dataResponseModel';
import { environment } from '../../environments/environment';
import { SKIP_FORBIDDEN_REDIRECT } from '../interceptors/error.interceptor';
import { AuthService } from './auth.service';
import type { PublishedTableSchema } from './published-table.service';
import type { ListQueryParams } from '../utils/list-query';

/** Column metadata — matches the backend PublishedColumnInfo */
export interface PublishedColumn {
  columnName: string;
  // UI type keys: string / int / long / short / byte / decimal / double / float / boolean /
  // datetime / dateonly / timeonly / guid / enum / lookup / image / file
  dataType: string;
  isNullable: boolean;
  // New type metadata: enum / lookup (from the schema — not from reflection)
  enumValues?: string | null;
  lookupTargetTable?: string | null;
  lookupDisplayColumn?: string | null;
  /** Character limit for string; file size limit (KB) for image/file — see utils/file-size.ts */
  maxLength?: number | null;
  // UI metadata: user-friendly display (from the schema — not from reflection)
  label?: string | null;
  description?: string | null;
}

/** Model metadata — matches the backend PublishedModelInfo */
export interface PublishedModel {
  typeName: string;
  /** User-friendly model name (PublishedTable.Label). If empty, typeName is shown. */
  label?: string | null;
  /** Model icon (PublishedTable.Icon, Material Symbols name) — drawn by `<app-model-icon>`. */
  icon?: string | null;
  columns: PublishedColumn[];
}

/**
 * One option for a lookup column: the ID to store as the FK + the label to show.
 * Matches the backend LookupOptionDto.
 *
 * Defined here (not in record-metadata.service.ts) because the endpoint producing it is in this service;
 * record-metadata already imports this service, the reverse would be a circular dependency.
 */
export interface LookupOption {
  id: number;
  label: string;
}

/** Paged response data — matches the backend PagedResult */
export interface PagedData<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** Paged getAll response */
export interface PagedResponseModel<T> extends ResponseModel {
  data: PagedData<T>;
}

/**
 * A record to save with its whole subtree — the body of POST /PublishedModel/addTree.
 *
 * FK fields are NOT SENT HERE: after saving each node the server itself writes the real ID
 * returned by EF into the child's `{ParentType}Id` column. So the client does not have to
 * guess IDs (fetch the list and take max(ID)) — with concurrent users it is impossible
 * for child records to be attached to someone else's parent record.
 */
export interface DynamicTreeNodeDto {
  typeName: string;
  /** The client's temporary ID; savedIds/errors in the response come back under this key. */
  clientId: string;
  jsonData: Record<string, unknown>;
  /** If set, the node is NOT INSERTED, it only serves as the FK target of its children (append to an existing record). */
  existingId?: number | null;
  children: DynamicTreeNodeDto[];
}

/** addTree response. If there is an error NO record is created and all errors are returned at once. */
export interface TreeSaveResult {
  /** clientId → the real ID in the database */
  savedIds: Record<string, number>;
  /** clientId → validation error message */
  errors: Record<string, string>;
}

/**
 * Context for auxiliary requests: a 403 must not pull the user off the page. A user without read
 * permission on the lookup target or the sub-model sees the raw id / a form without rules and is not sent to /models.
 */
const AUXILIARY = () => new HttpContext().set(SKIP_FORBIDDEN_REDIRECT, true);

@Injectable({ providedIn: 'root' })
export class PublishedModelService {
  private readonly baseUrl = `${environment.apiBaseUrl}/PublishedModel`;

  /**
   * Model list cache lifetime. The list can change through another admin's publish; this session's
   * own schema changes drop it immediately via `invalidateModels()` (called by PublishedTableService).
   */
  static readonly MODELS_TTL_MS = 5 * 60 * 1000;

  private modelsCache: { at: number; owner: string | null; models$: Observable<ListResponseModel<PublishedModel>> } | null = null;

  /** The model list was invalidated — derived caches (RecordMetadataService) should drop too. */
  readonly modelsInvalidated$ = new Subject<void>();

  private readonly auth = inject(AuthService);

  constructor(private http: HttpClient) {}

  /**
   * Fetches all model types in the assembly and their column metadata — CACHED.
   *
   * The shell, model list, record/list screens, schema/report/workflow designers and permission screens
   * each requested it separately: a single page load 2-3 times, and on the server each one ran a
   * permission + schema query per model. Since the list is filtered by the user's permissions, the cache is
   * bound to the session: after logging out and in as another user it is requested again.
   */
  getModels(): Observable<ListResponseModel<PublishedModel>> {
    const now = Date.now();
    const owner = this.auth.sessionKey();
    const cached = this.modelsCache;
    if (cached && cached.owner === owner && now - cached.at < PublishedModelService.MODELS_TTL_MS) {
      return cached.models$;
    }

    const models$ = this.http.get<ListResponseModel<PublishedModel>>(`${this.baseUrl}/models`).pipe(
      // Don't keep a failed response or an error in the cache: the next call should retry.
      tap({
        next: res => { if (!res.success) this.dropCache(models$); },
        error: () => this.dropCache(models$)
      }),
      shareReplay(1)
    );
    this.modelsCache = { at: now, owner, models$ };
    return models$;
  }

  /** Drops the model list (and the caches derived from it) — called when the schema changes. */
  invalidateModels(): void {
    this.modelsCache = null;
    this.modelsInvalidated$.next();
  }

  private dropCache(models$: Observable<unknown>): void {
    if (this.modelsCache?.models$ === models$) this.modelsCache = null;
  }

  /** Fetches all records. If parentColumn + parentId are given, filters by FK. */
  getAll(typeName: string, parentColumn?: string, parentId?: number): Observable<ListResponseModel<Record<string, unknown>>> {
    let params = new HttpParams().set('typeName', typeName);
    if (parentColumn && parentId != null) {
      params = params.set('parentColumn', parentColumn).set('parentId', parentId);
    }
    return this.http.get<ListResponseModel<Record<string, unknown>>>(`${this.baseUrl}/getall`, { params });
  }

  /**
   * Paged + searchable {id, label} list for the lookup dropdown.
   *
   * The old path fetched ALL rows of the target table as full entities
   * (Musteri: 12,025 rows / 5 MB / ~3.9 s). This endpoint projects only two columns
   * and pages — 50 records of the same table ~2 KB.
   *
   * `search` is applied on the server as `contains`; paging continues on search results too.
   */
  lookupOptions(
    typeName: string,
    displayColumn: string | null | undefined,
    opts: { search?: string; page?: number; pageSize?: number } = {}
  ): Observable<PagedResponseModel<LookupOption>> {
    let params = new HttpParams()
      .set('typeName', typeName)
      .set('page', opts.page ?? 1)
      .set('pageSize', opts.pageSize ?? 50);

    if (displayColumn) params = params.set('displayColumn', displayColumn);
    if (opts.search)   params = params.set('search', opts.search);

    return this.http.get<PagedResponseModel<LookupOption>>(`${this.baseUrl}/lookupOptions`, { params, context: AUXILIARY() });
  }

  /**
   * Resolves the labels of specific FK ids in ONE request (search/paging are ignored).
   *
   * Required in two places:
   *  1) In the edit form the selected value may not be among the first 50 options — if its label
   *     is not resolved the user sees an empty box and the FK is silently erased on save.
   *  2) Turning FK ids into labels in list/table cells (one request per page).
   */
  lookupOptionsByIds(
    typeName: string,
    displayColumn: string | null | undefined,
    ids: number[]
  ): Observable<PagedResponseModel<LookupOption>> {
    let params = new HttpParams()
      .set('typeName', typeName)
      .set('ids', ids.join(','));

    if (displayColumn) params = params.set('displayColumn', displayColumn);

    return this.http.get<PagedResponseModel<LookupOption>>(`${this.baseUrl}/lookupOptions`, { params, context: AUXILIARY() });
  }

  /**
   * Fetches a paged record list. page + pageSize are sent to the backend; only the relevant
   * page is returned. Sub-model tabs keep using the parameterless getAll.
   * `query`: search, sort and filter (see utils/list-query).
   */
  getAllPaged(
    typeName: string,
    page: number,
    pageSize: number,
    parentColumn?: string,
    parentId?: number,
    query?: ListQueryParams
  ): Observable<PagedResponseModel<Record<string, unknown>>> {
    let params = new HttpParams()
      .set('typeName', typeName)
      .set('page', page)
      .set('pageSize', pageSize);
    if (parentColumn && parentId != null) {
      params = params.set('parentColumn', parentColumn).set('parentId', parentId);
    }
    if (query?.search) params = params.set('search', query.search);
    if (query?.sortBy) params = params.set('sortBy', query.sortBy).set('sortDir', query.sortDir ?? 'asc');
    if (query?.filters?.length) params = params.set('filters', JSON.stringify(query.filters));
    return this.http.get<PagedResponseModel<Record<string, unknown>>>(`${this.baseUrl}/getall`, { params });
  }

  /** Returns the direct sub-model names of the given parent model. */
  getChildModels(parentTypeName: string): Observable<ListResponseModel<string>> {
    const params = new HttpParams().set('parentTypeName', parentTypeName);
    return this.http.get<ListResponseModel<string>>(`${this.baseUrl}/children`, { params });
  }

  /**
   * Schema rules of the record form (validation, auto value, read-only) — Read permission on the
   * model is enough. Returns the SAME data as the admin-only /Published/getTable; record forms use this,
   * schema design screens (admin) use getTable.
   */
  getSchema(typeName: string): Observable<DataResponseModel<PublishedTableSchema>> {
    const params = new HttpParams().set('typeName', typeName);
    return this.http.get<DataResponseModel<PublishedTableSchema>>(
      `${this.baseUrl}/schema`, { params, context: AUXILIARY() }
    );
  }

  /** Fetches a single record */
  get(typeName: string, id: number): Observable<DataResponseModel<Record<string, unknown>>> {
    const params = new HttpParams().set('typeName', typeName).set('id', id);
    return this.http.get<DataResponseModel<Record<string, unknown>>>(`${this.baseUrl}/get`, { params });
  }

  /**
   * Adds a new record and returns the ID OF THE CREATED RECORD (`data`).
   * Without the ID the caller would have to send a separate query to find the record it added;
   * and with no unique constraint there would be no guarantee of finding the right record.
   */
  add(typeName: string, jsonData: Record<string, unknown>): Observable<DataResponseModel<number>> {
    return this.http.post<DataResponseModel<number>>(`${this.baseUrl}/add`, { typeName, jsonData });
  }

  /**
   * Sends a record tree (main record + child records + grandchildren) in ONE request.
   * The server writes all of them in ONE transaction: if even one field is invalid no
   * record is created and all errors are returned at once in `errors`.
   */
  addTree(root: DynamicTreeNodeDto): Observable<DataResponseModel<TreeSaveResult>> {
    return this.http.post<DataResponseModel<TreeSaveResult>>(`${this.baseUrl}/addTree`, root);
  }

  /** Updates a record */
  update(typeName: string, jsonData: Record<string, unknown>): Observable<ResponseModel> {
    return this.http.post<ResponseModel>(`${this.baseUrl}/update`, { typeName, jsonData });
  }

  /** Deletes a record */
  delete(typeName: string, id: number): Observable<ResponseModel> {
    const params = new HttpParams().set('typeName', typeName).set('id', id);
    return this.http.post<ResponseModel>(`${this.baseUrl}/delete`, null, { params });
  }
}
