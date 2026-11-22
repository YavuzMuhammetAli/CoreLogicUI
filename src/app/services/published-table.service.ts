import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { MonoTypeOperatorFunction, Observable, tap } from 'rxjs';
import { ResponseModel } from '../models/responseModel';
import { DataResponseModel } from '../models/dataResponseModel';
import { ListResponseModel } from '../models/responseModelList';
import { environment } from '../../environments/environment';
import { PublishedModelService } from './published-model.service';
import { AutoValueTrigger } from '../utils/auto-value/auto-value';
import { MemberMetadataUpdate } from '../utils/column-rules';

/** Represents a specific version of a model */
export interface ModelVersion {
  id: number;
  modelName: string;
  version: number;
  /** Backend int: 0=Draft, 1=Published, 2=Archived */
  status: 'Draft' | 'Published' | 'Archived' | 0 | 1 | 2;
  namespace: string;
  createdOn: string;
}

export interface PublishedTableDto {
  tableName: string;
  description: string;
  /** User-friendly model name ("Satış Pazarlama Formu"); tableName is derived from it. */
  label?: string | null;
  /** Model icon (Material Symbols name, catalog: shared/model-icon). Empty = default. */
  icon?: string | null;
  version: number;
  /** Parent model name for a sub-model. If omitted, it is saved as a root model. */
  parentTableName?: string;
}

/** Represents a single column record (read from the DB) */
export interface PublishedColumnSchema {
  name: string;
  // UI type name: string / int / long / short / byte / decimal / double / float / boolean /
  // datetime / dateonly / timeonly / guid / enum / lookup / image / file
  dataType: string;
  isRequired: boolean;
  // D3: dynamic validation rules — for the edit screen to fill its form
  minLength?: number | null;
  maxLength?: number | null;
  min?: number | null;
  max?: number | null;
  regex?: string | null;
  regexMessage?: string | null;
  // New type metadata: enum / lookup
  enumValues?: string | null;          // allowed values in 'A|B|C' form
  lookupTargetTable?: string | null;   // lookup target model name
  lookupDisplayColumn?: string | null; // target column shown in the lookup dropdown
  // UI metadata: user-friendly display
  label?: string | null;        // human-friendly label shown instead of columnName
  description?: string | null;  // description shown in the "i" bubble on the detail page
  // Auto value rule (see utils/auto-value) — no rule if trigger is null
  autoValueTrigger?: AutoValueTrigger | null;
  autoValueExpression?: string | null;
  isReadOnly?: boolean | null;
}

/** POST /Published/addMember — column metadata (sent as a query string). */
export interface AddMemberRequest {
  typeName: string;
  memberName: string;
  memberType: string;
  isRequired: boolean;
  minLength?: number | null;
  maxLength?: number | null;
  min?: number | null;
  max?: number | null;
  regex?: string | null;
  regexMessage?: string | null;
  enumValues?: string | null;
  lookupTargetTable?: string | null;
  lookupDisplayColumn?: string | null;
  label?: string | null;
  description?: string | null;
  autoValueTrigger?: AutoValueTrigger | null;
  autoValueExpression?: string | null;
  isReadOnly?: boolean | null;
}

/** Body of POST /Published/setMemberAutoValue. */
export interface SetMemberAutoValueRequest {
  typeName: string;
  memberName: string;
  trigger: AutoValueTrigger | null;
  expression: string | null;
  isReadOnly: boolean;
}

/** Table schema + columns — the GET /Published/getTable response */
export interface PublishedTableSchema {
  tableName: string;
  description: string;
  /** User-friendly model name. May be empty on old records — then tableName is shown. */
  label?: string | null;
  /** Model icon (migration 025). If empty, the default is drawn. */
  icon?: string | null;
  version: number;
  columns: PublishedColumnSchema[];
  /** Name of the parent model. null means it is a root model. */
  parentTableName?: string | null;
  /** Depth in the model tree. Root = 1, max = 4. */
  depth?: number;
}

/** A GET /Published/getAll row (the PublishedTable entity). */
export interface PublishedTableRow {
  id: number;
  tableName: string;
  description: string;
  label?: string | null;
  version: number;
  parentTableId: number | null;
  depth: number;
}

@Injectable({ providedIn: 'root' })
export class PublishedTableService {
  private readonly baseUrl = `${environment.apiBaseUrl}/Published`;

  constructor(private http: HttpClient, private publishedModels: PublishedModelService) {}

  /**
   * Every schema-changing call drops the model list cache (see PublishedModelService.getModels);
   * screens don't have to remember it. It also drops on a failed response — a harmless re-request.
   */
  private invalidatesModels<T>(): MonoTypeOperatorFunction<T> {
    return tap({ next: () => this.publishedModels.invalidateModels() });
  }

  /** Adds a new table metadata record. If parentTableName is given, it is saved as a sub-model. */
  addTable(table: PublishedTableDto): Observable<ResponseModel> {
    let params = new HttpParams();
    if (table.parentTableName) {
      params = params.set('parentTableName', table.parentTableName);
    }
    // parentTableName is not in the body entity; it is sent only as a query param
    const body = { tableName: table.tableName, description: table.description, label: table.label ?? null, icon: table.icon ?? null, version: table.version };
    return this.http.post<ResponseModel>(`${this.baseUrl}/addTable`, body, { params }).pipe(this.invalidatesModels());
  }

  /** Adds a column metadata record to the table (optional rule parameters are left out of the query string if null) */
  addMember(m: AddMemberRequest): Observable<ResponseModel> {
    let params = new HttpParams()
      .set('typeName', m.typeName)
      .set('memberName', m.memberName)
      .set('memberType', m.memberType)
      .set('isRequired', m.isRequired);

    if (m.minLength != null)           params = params.set('minLength', m.minLength);
    if (m.maxLength != null)           params = params.set('maxLength', m.maxLength);
    if (m.min != null)                 params = params.set('min', m.min);
    if (m.max != null)                 params = params.set('max', m.max);
    if (m.regex?.trim())               params = params.set('regex', m.regex);
    if (m.regexMessage?.trim())        params = params.set('regexMessage', m.regexMessage);
    if (m.enumValues?.trim())          params = params.set('enumValues', m.enumValues);
    if (m.lookupTargetTable?.trim())   params = params.set('lookupTargetTable', m.lookupTargetTable);
    if (m.lookupDisplayColumn?.trim()) params = params.set('lookupDisplayColumn', m.lookupDisplayColumn);
    if (m.label?.trim())               params = params.set('label', m.label);
    if (m.description?.trim())         params = params.set('description', m.description);
    if (m.autoValueTrigger && m.autoValueExpression?.trim()) {
      params = params
        .set('autoValueTrigger', m.autoValueTrigger)
        .set('autoValueExpression', m.autoValueExpression.trim());
    }
    if (m.isReadOnly)                  params = params.set('isReadOnly', true);

    return this.http.post<ResponseModel>(`${this.baseUrl}/addMember`, null, { params }).pipe(this.invalidatesModels());
  }

  /**
   * Compiles the saved model with Roslyn, creates the SQL table and publishes it.
   * The backend runs all steps (compile + migration) in a single endpoint.
   */
  publish(typeName: string): Observable<ResponseModel> {
    const params = new HttpParams().set('typeName', typeName);
    return this.http.post<ResponseModel>(`${this.baseUrl}/publish`, null, { params }).pipe(this.invalidatesModels());
  }

  /**
   * Reads the saved table schema (table + columns) from the DB.
   * Serves the "Veritabanından Oku" (Read from database) step of the model publish flow:
   *   Create model → Save → Read from database → Publish
   * Publishing must be done from the data this method returns;
   * the client form state must not be used.
   */
  getSchema(typeName: string): Observable<DataResponseModel<PublishedTableSchema>> {
    const params = new HttpParams().set('typeName', typeName);
    return this.http.get<DataResponseModel<PublishedTableSchema>>(
      `${this.baseUrl}/getTable`, { params }
    );
  }

  /**
   * Fetches all saved tables (draft + published).
   * D-FK: parentTableId/depth are used to build the main/sub-model tree client-side.
   */
  getAllTables(): Observable<ListResponseModel<PublishedTableRow>> {
    return this.http.get<ListResponseModel<PublishedTableRow>>(
      `${this.baseUrl}/getAll`
    );
  }

  /** Fetches the full version history of the given model */
  getVersions(modelName: string): Observable<ListResponseModel<ModelVersion>> {
    const params = new HttpParams().set('modelName', modelName);
    return this.http.get<ListResponseModel<ModelVersion>>(
      `${this.baseUrl}/versions`, { params }
    );
  }

  /** Rolls the given model back to the requested version */
  rollback(modelName: string, version: number): Observable<ResponseModel> {
    const params = new HttpParams()
      .set('modelName', modelName)
      .set('version', version);
    return this.http.post<ResponseModel>(`${this.baseUrl}/rollback`, null, { params }).pipe(this.invalidatesModels());
  }

  /**
   * Deactivates a column (soft-delete). The SQL column is not DROPped; the column only
   * disappears from the schema/generated type on the next publish, existing data stays in the DB.
   */
  removeMember(typeName: string, memberName: string): Observable<ResponseModel> {
    const params = new HttpParams()
      .set('typeName', typeName)
      .set('memberName', memberName);
    return this.http.post<ResponseModel>(`${this.baseUrl}/removeMember`, null, { params }).pipe(this.invalidatesModels());
  }

  /** Updates only the model label — table name, depth and parent do not change. */
  setTableLabel(typeName: string, label: string | null): Observable<ResponseModel> {
    let params = new HttpParams().set('typeName', typeName);
    if (label?.trim()) params = params.set('label', label.trim());
    return this.http.post<ResponseModel>(`${this.baseUrl}/setTableLabel`, null, { params }).pipe(this.invalidatesModels());
  }

  /**
   * Writes only the model icon (empty = default). No republish needed. The column comes with tenant
   * migration 025; if it is not installed the server returns an explicit error.
   */
  setTableIcon(typeName: string, icon: string | null): Observable<ResponseModel> {
    let params = new HttpParams().set('typeName', typeName);
    if (icon) params = params.set('icon', icon);
    return this.http.post<ResponseModel>(`${this.baseUrl}/setTableIcon`, null, { params }).pipe(this.invalidatesModels());
  }

  /**
   * Writes a saved column's metadata (label, description, required, rules, file size
   * limit, lookup display column) in one go — FULL replacement, an empty rule is removed.
   * Name/type do not change; no republish needed. The body is built with `toMemberMetadataUpdate`.
   */
  updateMemberMetadata(body: MemberMetadataUpdate): Observable<ResponseModel> {
    return this.http.post<ResponseModel>(`${this.baseUrl}/updateMemberMetadata`, body).pipe(this.invalidatesModels());
  }

  /**
   * Writes a saved column's auto value rule; if `trigger` is null the rule is removed.
   * The server parses the formula and checks the fields and cycles in the table. The column schema
   * does not change, no republish needed — the rule takes effect on the next save.
   */
  setMemberAutoValue(req: SetMemberAutoValueRequest): Observable<ResponseModel> {
    return this.http.post<ResponseModel>(`${this.baseUrl}/setMemberAutoValue`, req).pipe(this.invalidatesModels());
  }

  /**
   * Deactivates a model and all its sub-models (soft-delete). The SQL tables and
   * their records are not deleted; the model only disappears from the app (list/compiled type).
   */
  deleteModel(typeName: string): Observable<ResponseModel> {
    const params = new HttpParams().set('typeName', typeName);
    return this.http.post<ResponseModel>(`${this.baseUrl}/deleteModel`, null, { params }).pipe(this.invalidatesModels());
  }

  /**
   * Fetches models that were never published (drafts) and were deleted (deactivated).
   * The "Silinen Taslaklar" (Deleted drafts) page shows this list.
   */
  getDeletedDrafts(): Observable<ListResponseModel<{ id: number; tableName: string; description: string; version: number }>> {
    return this.http.get<ListResponseModel<{ id: number; tableName: string; description: string; version: number }>>(
      `${this.baseUrl}/deletedDrafts`
    );
  }

  /**
   * Restores a deleted (inactive) draft (Active=true). If the model was published before,
   * the backend rejects it — draft restore is only for models that were never published.
   */
  restoreDraft(typeName: string): Observable<ResponseModel> {
    const params = new HttpParams().set('typeName', typeName);
    return this.http.post<ResponseModel>(`${this.baseUrl}/restoreDraft`, null, { params }).pipe(this.invalidatesModels());
  }

  /**
   * Fetches models that were published at least once and then deleted (deactivated).
   * The "Silinmiş Modeller" (Deleted models) page shows this list.
   */
  getDeletedModels(): Observable<ListResponseModel<{ id: number; tableName: string; description: string; version: number }>> {
    return this.http.get<ListResponseModel<{ id: number; tableName: string; description: string; version: number }>>(
      `${this.baseUrl}/deletedModels`
    );
  }

  /**
   * Restores a deleted (inactive) model and its sub-models: the table tree +
   * ModelDefinition versions are activated, the compiled type is recompiled.
   */
  restoreModel(typeName: string): Observable<ResponseModel> {
    const params = new HttpParams().set('typeName', typeName);
    return this.http.post<ResponseModel>(`${this.baseUrl}/restoreModel`, null, { params }).pipe(this.invalidatesModels());
  }
}
