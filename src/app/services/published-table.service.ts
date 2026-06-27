import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ResponseModel } from '../models/responseModel';
import { DataResponseModel } from '../models/dataResponseModel';
import { ListResponseModel } from '../models/responseModelList';
import { environment } from '../../environments/environment';

/** Bir modelin belirli bir versiyonunu temsil eder */
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
  version: number;
  /** Alt model için parent model adı. Verilmezse kök model olarak kaydedilir. */
  parentTableName?: string;
}

/** Tek bir kolon kaydını temsil eder (DB'den okunan) */
export interface PublishedColumnSchema {
  name: string;
  dataType: string;     // UI tip adı: string / int / float / decimal / datetime / boolean
  isRequired: boolean;
  // D3: dinamik doğrulama kuralları — düzenleme ekranının formu doldurması için
  minLength?: number | null;
  maxLength?: number | null;
  min?: number | null;
  max?: number | null;
  regex?: string | null;
  regexMessage?: string | null;
}

/** Tablo şeması + kolonları — GET /Published/getTable dönüşü */
export interface PublishedTableSchema {
  tableName: string;
  description: string;
  version: number;
  columns: PublishedColumnSchema[];
  /** Üst (parent) modelin adı. null ise kök modeldir. */
  parentTableName?: string | null;
  /** Model ağacındaki derinlik. Kök = 1, maks = 4. */
  depth?: number;
}

@Injectable({ providedIn: 'root' })
export class PublishedTableService {
  private readonly baseUrl = `${environment.apiBaseUrl}/Published`;

  constructor(private http: HttpClient) {}

  /** Yeni tablo metadata kaydı ekler. parentTableName verilirse alt model olarak kaydedilir. */
  addTable(table: PublishedTableDto): Observable<ResponseModel> {
    let params = new HttpParams();
    if (table.parentTableName) {
      params = params.set('parentTableName', table.parentTableName);
    }
    // parentTableName body entity'sinde yok; yalnızca query param olarak gönderilir
    const body = { tableName: table.tableName, description: table.description, version: table.version };
    return this.http.post<ResponseModel>(`${this.baseUrl}/addTable`, body, { params });
  }

  /** Tabloya kolon metadata kaydı ekler (opsiyonel kural parametreleri null ise query string'e eklenmez) */
  addMember(
    typeName: string,
    memberName: string,
    memberType: string,
    isRequired: boolean,
    minLength?: number | null,
    maxLength?: number | null,
    min?: number | null,
    max?: number | null,
    regex?: string | null,
    regexMessage?: string | null
  ): Observable<ResponseModel> {
    let params = new HttpParams()
      .set('typeName', typeName)
      .set('memberName', memberName)
      .set('memberType', memberType)
      .set('isRequired', isRequired);

    if (minLength != null)    params = params.set('minLength', minLength);
    if (maxLength != null)    params = params.set('maxLength', maxLength);
    if (min != null)          params = params.set('min', min);
    if (max != null)          params = params.set('max', max);
    if (regex?.trim())        params = params.set('regex', regex);
    if (regexMessage?.trim()) params = params.set('regexMessage', regexMessage);

    return this.http.post<ResponseModel>(`${this.baseUrl}/addMember`, null, { params });
  }

  /**
   * Kaydedilen modeli Roslyn ile derler, SQL tablosunu oluşturur ve yayınlar.
   * Backend tüm adımları (derleme + migration) tek endpoint'te yürütür.
   */
  publish(typeName: string): Observable<ResponseModel> {
    const params = new HttpParams().set('typeName', typeName);
    return this.http.post<ResponseModel>(`${this.baseUrl}/publish`, null, { params });
  }

  /**
   * Kaydedilmiş tablo şemasını (tablo + kolonlar) DB'den okur.
   * Model yayınlama akışının "Veritabanından Oku" adımını karşılar:
   *   Model Oluştur → Kaydet → Veritabanından Oku → Yayınla
   * Yayınlama, bu metodun döndürdüğü veri üzerinden yapılmalıdır;
   * istemci form state'i kullanılmamalıdır.
   */
  getSchema(typeName: string): Observable<DataResponseModel<PublishedTableSchema>> {
    const params = new HttpParams().set('typeName', typeName);
    return this.http.get<DataResponseModel<PublishedTableSchema>>(
      `${this.baseUrl}/getTable`, { params }
    );
  }

  /**
   * Kayıtlı tüm tabloları (taslak + yayınlanmış) getirir.
   * D-FK: parentTableId/depth, ana/alt model ağacını client-side kurmak için kullanılır.
   */
  getAllTables(): Observable<ListResponseModel<{ id: number; tableName: string; description: string; version: number; parentTableId: number | null; depth: number }>> {
    return this.http.get<ListResponseModel<{ id: number; tableName: string; description: string; version: number; parentTableId: number | null; depth: number }>>(
      `${this.baseUrl}/getAll`
    );
  }

  /** Belirtilen model için tüm sürüm geçmişini getirir */
  getVersions(modelName: string): Observable<ListResponseModel<ModelVersion>> {
    const params = new HttpParams().set('modelName', modelName);
    return this.http.get<ListResponseModel<ModelVersion>>(
      `${this.baseUrl}/versions`, { params }
    );
  }

  /** Belirtilen modeli istenen versiyona geri alır */
  rollback(modelName: string, version: number): Observable<ResponseModel> {
    const params = new HttpParams()
      .set('modelName', modelName)
      .set('version', version);
    return this.http.post<ResponseModel>(`${this.baseUrl}/rollback`, null, { params });
  }

  /**
   * Bir kolonu pasif yapar (soft-delete). SQL kolonu DROP edilmez; kolon yalnızca
   * bir sonraki publish'te şemadan/üretilen tipten düşer, mevcut veri DB'de kalır.
   */
  removeMember(typeName: string, memberName: string): Observable<ResponseModel> {
    const params = new HttpParams()
      .set('typeName', typeName)
      .set('memberName', memberName);
    return this.http.post<ResponseModel>(`${this.baseUrl}/removeMember`, null, { params });
  }

  /**
   * Bir modeli ve tüm alt modellerini pasif yapar (soft-delete). SQL tabloları ve
   * içindeki kayıtlar silinmez; model yalnızca uygulamadan (liste/derlenmiş tip) kaybolur.
   */
  deleteModel(typeName: string): Observable<ResponseModel> {
    const params = new HttpParams().set('typeName', typeName);
    return this.http.post<ResponseModel>(`${this.baseUrl}/deleteModel`, null, { params });
  }

  /**
   * Hiç yayınlanmamış (taslak) olup silinmiş (pasiflenmiş) modelleri getirir.
   * "Silinen Taslaklar" sayfası bu listeyi gösterir.
   */
  getDeletedDrafts(): Observable<ListResponseModel<{ id: number; tableName: string; description: string; version: number }>> {
    return this.http.get<ListResponseModel<{ id: number; tableName: string; description: string; version: number }>>(
      `${this.baseUrl}/deletedDrafts`
    );
  }

  /**
   * Silinmiş (pasif) bir taslağı geri yükler (Active=true). Daha önce yayınlanmış bir
   * modelse backend reddeder — taslak geri yükleme yalnızca hiç yayınlanmamış modeller içindir.
   */
  restoreDraft(typeName: string): Observable<ResponseModel> {
    const params = new HttpParams().set('typeName', typeName);
    return this.http.post<ResponseModel>(`${this.baseUrl}/restoreDraft`, null, { params });
  }

  /**
   * Daha önce en az bir kez yayınlanmış olup silinmiş (pasiflenmiş) modelleri getirir.
   * "Silinmiş Modeller" sayfası bu listeyi gösterir.
   */
  getDeletedModels(): Observable<ListResponseModel<{ id: number; tableName: string; description: string; version: number }>> {
    return this.http.get<ListResponseModel<{ id: number; tableName: string; description: string; version: number }>>(
      `${this.baseUrl}/deletedModels`
    );
  }

  /**
   * Silinmiş (pasif) bir modeli ve alt modellerini geri yükler: tablo ağacı +
   * ModelDefinition sürümleri aktif edilir, derlenmiş tip yeniden derlenir.
   */
  restoreModel(typeName: string): Observable<ResponseModel> {
    const params = new HttpParams().set('typeName', typeName);
    return this.http.post<ResponseModel>(`${this.baseUrl}/restoreModel`, null, { params });
  }
}
