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
  /** Kullanıcı dostu model adı ("Satış Pazarlama Formu"); tableName bundan türetilir. */
  label?: string | null;
  version: number;
  /** Alt model için parent model adı. Verilmezse kök model olarak kaydedilir. */
  parentTableName?: string;
}

/** Tek bir kolon kaydını temsil eder (DB'den okunan) */
export interface PublishedColumnSchema {
  name: string;
  // UI tip adı: string / int / long / short / byte / decimal / double / float / boolean /
  // datetime / dateonly / timeonly / guid / enum / lookup / image / file
  dataType: string;
  isRequired: boolean;
  // D3: dinamik doğrulama kuralları — düzenleme ekranının formu doldurması için
  minLength?: number | null;
  maxLength?: number | null;
  min?: number | null;
  max?: number | null;
  regex?: string | null;
  regexMessage?: string | null;
  // Yeni tip metadata'sı: enum / lookup
  enumValues?: string | null;          // 'A|B|C' biçiminde izinli değerler
  lookupTargetTable?: string | null;   // lookup hedef model adı
  lookupDisplayColumn?: string | null; // lookup dropdown'da gösterilecek hedef kolon
  // UI metadata: kullanıcı dostu gösterim
  label?: string | null;        // columnName yerine gösterilecek insan-dostu etiket
  description?: string | null;  // detay sayfasında "i" baloncuğunda gösterilecek açıklama
  // Otomatik değer kuralı (bkz. utils/auto-value) — trigger null ise kural yok
  autoValueTrigger?: AutoValueTrigger | null;
  autoValueExpression?: string | null;
  isReadOnly?: boolean | null;
}

/** POST /Published/addMember — kolon metadata'sı (query string olarak gider). */
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

/** POST /Published/setMemberAutoValue gövdesi. */
export interface SetMemberAutoValueRequest {
  typeName: string;
  memberName: string;
  trigger: AutoValueTrigger | null;
  expression: string | null;
  isReadOnly: boolean;
}

/** Tablo şeması + kolonları — GET /Published/getTable dönüşü */
export interface PublishedTableSchema {
  tableName: string;
  description: string;
  /** Kullanıcı dostu model adı. Eski kayıtlarda boş olabilir — o zaman tableName gösterilir. */
  label?: string | null;
  version: number;
  columns: PublishedColumnSchema[];
  /** Üst (parent) modelin adı. null ise kök modeldir. */
  parentTableName?: string | null;
  /** Model ağacındaki derinlik. Kök = 1, maks = 4. */
  depth?: number;
}

/** GET /Published/getAll satırı (PublishedTable entity'si). */
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
   * Şemayı değiştiren her çağrı model listesi önbelleğini düşürür (bkz. PublishedModelService.getModels);
   * ekranların bunu ayrıca hatırlaması gerekmez. Başarısız yanıtta da düşer — zararsız bir yeniden istek.
   */
  private invalidatesModels<T>(): MonoTypeOperatorFunction<T> {
    return tap({ next: () => this.publishedModels.invalidateModels() });
  }

  /** Yeni tablo metadata kaydı ekler. parentTableName verilirse alt model olarak kaydedilir. */
  addTable(table: PublishedTableDto): Observable<ResponseModel> {
    let params = new HttpParams();
    if (table.parentTableName) {
      params = params.set('parentTableName', table.parentTableName);
    }
    // parentTableName body entity'sinde yok; yalnızca query param olarak gönderilir
    const body = { tableName: table.tableName, description: table.description, label: table.label ?? null, version: table.version };
    return this.http.post<ResponseModel>(`${this.baseUrl}/addTable`, body, { params }).pipe(this.invalidatesModels());
  }

  /** Tabloya kolon metadata kaydı ekler (opsiyonel kural parametreleri null ise query string'e eklenmez) */
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
   * Kaydedilen modeli Roslyn ile derler, SQL tablosunu oluşturur ve yayınlar.
   * Backend tüm adımları (derleme + migration) tek endpoint'te yürütür.
   */
  publish(typeName: string): Observable<ResponseModel> {
    const params = new HttpParams().set('typeName', typeName);
    return this.http.post<ResponseModel>(`${this.baseUrl}/publish`, null, { params }).pipe(this.invalidatesModels());
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
  getAllTables(): Observable<ListResponseModel<PublishedTableRow>> {
    return this.http.get<ListResponseModel<PublishedTableRow>>(
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
    return this.http.post<ResponseModel>(`${this.baseUrl}/rollback`, null, { params }).pipe(this.invalidatesModels());
  }

  /**
   * Bir kolonu pasif yapar (soft-delete). SQL kolonu DROP edilmez; kolon yalnızca
   * bir sonraki publish'te şemadan/üretilen tipten düşer, mevcut veri DB'de kalır.
   */
  removeMember(typeName: string, memberName: string): Observable<ResponseModel> {
    const params = new HttpParams()
      .set('typeName', typeName)
      .set('memberName', memberName);
    return this.http.post<ResponseModel>(`${this.baseUrl}/removeMember`, null, { params }).pipe(this.invalidatesModels());
  }

  /** Yalnızca model etiketini günceller — tablo adı, derinlik ve parent değişmez. */
  setTableLabel(typeName: string, label: string | null): Observable<ResponseModel> {
    let params = new HttpParams().set('typeName', typeName);
    if (label?.trim()) params = params.set('label', label.trim());
    return this.http.post<ResponseModel>(`${this.baseUrl}/setTableLabel`, null, { params }).pipe(this.invalidatesModels());
  }

  /**
   * Kayıtlı bir kolonun meta verisini (etiket, açıklama, zorunluluk, kurallar, dosya boyutu
   * sınırı, lookup gösterim kolonu) topluca yazar — TAM değiştirme, boş kural kaldırılır.
   * Ad/tip değişmez; yeniden yayın gerekmez. Gövde `toMemberMetadataUpdate` ile kurulur.
   */
  updateMemberMetadata(body: MemberMetadataUpdate): Observable<ResponseModel> {
    return this.http.post<ResponseModel>(`${this.baseUrl}/updateMemberMetadata`, body).pipe(this.invalidatesModels());
  }

  /**
   * Kayıtlı bir kolonun otomatik değer kuralını yazar; `trigger` null ise kural kaldırılır.
   * Sunucu formülü ayrıştırır, alanları ve tablodaki döngüleri denetler. Kolon şeması
   * değişmez, yeniden yayın gerekmez — kural bir sonraki kayıtta devreye girer.
   */
  setMemberAutoValue(req: SetMemberAutoValueRequest): Observable<ResponseModel> {
    return this.http.post<ResponseModel>(`${this.baseUrl}/setMemberAutoValue`, req).pipe(this.invalidatesModels());
  }

  /**
   * Bir modeli ve tüm alt modellerini pasif yapar (soft-delete). SQL tabloları ve
   * içindeki kayıtlar silinmez; model yalnızca uygulamadan (liste/derlenmiş tip) kaybolur.
   */
  deleteModel(typeName: string): Observable<ResponseModel> {
    const params = new HttpParams().set('typeName', typeName);
    return this.http.post<ResponseModel>(`${this.baseUrl}/deleteModel`, null, { params }).pipe(this.invalidatesModels());
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
    return this.http.post<ResponseModel>(`${this.baseUrl}/restoreDraft`, null, { params }).pipe(this.invalidatesModels());
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
    return this.http.post<ResponseModel>(`${this.baseUrl}/restoreModel`, null, { params }).pipe(this.invalidatesModels());
  }
}
